import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";

import {
  MusicManagerService,
  type TrackModel,
} from "../../services/music-manager.service";
import {
  PluginStoreService,
  type DspPluginManifest,
} from "../../services/plugin-store.service";
import { HapticService } from "../../services/haptic.service";
import { LoggingService } from "../../services/logging.service";

/**
 * Contextual Inspector — the right-hand track channel strip for the Arrangement
 * view (Logic Pro / Cubasis placement: the thing you tweak most sits next to the
 * thing it affects).
 *
 * Why it exists: before this panel, changing one track's level meant leaving the
 * arrangement for the Mixer and losing your place in the timeline. Everything
 * here writes through MusicManagerService, so the change lands on the live audio
 * graph, in the undo stack, and in the project bundle exactly as it would from
 * the Mixer — this is a second *view* of one track, never a second source of
 * truth.
 *
 * It is deliberately not a mixer: no meters, no sends matrix, no plugin editors.
 * Those live in the Mixer, which stays one tap away in the mobile drawer.
 */
@Component({
  selector: "app-inspector",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./inspector.component.html",
  styleUrls: ["./inspector.component.css", "../shared/platform-ux.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorComponent {
  private readonly musicManager = inject(MusicManagerService);
  private readonly haptic = inject(HapticService);
  private readonly logger = inject(LoggingService);
  private readonly pluginStore = inject(PluginStoreService);

  /** Collapsed state is owned by the shell so the toggle survives view changes. */
  collapsed = input<boolean>(false);
  toggleCollapsed = output<void>();
  /** Ask the shell to jump to the full effects rack for this track. */
  openEffectsRack = output<string>();

  readonly track = this.musicManager.selectedTrack;
  readonly trackCount = computed(() => this.musicManager.tracks().length);

  /** -100…100 for the range input; the service divides by 100 itself. */
  get panPercent(): number {
    return Math.round((this.track()?.pan ?? 0) * 100);
  }

  /** 0…150 in dB-ish "gain units" — the same scale the Mixer faders use. */
  get volumePercent(): number {
    return Math.round((this.track()?.gain ?? 0.8) * 100);
  }

  get sendAPercent(): number {
    return Math.round((this.track()?.sendA ?? 0) * 100);
  }

  get sendBPercent(): number {
    return Math.round((this.track()?.sendB ?? 0) * 100);
  }

  /** "C" at dead centre, otherwise an L/R offset — a text cue, not just a dot. */
  get panLabel(): string {
    const pan = this.track()?.pan ?? 0;
    if (Math.abs(pan) < 0.02) return "C";
    return `${pan < 0 ? "L" : "R"}${Math.abs(Math.round(pan * 100))}`;
  }

  /** Linear gain → dB, with -inf floored so the readout never says NaN. */
  get gainLabel(): string {
    const gain = this.track()?.gain ?? 0.8;
    if (gain <= 0.001) return "−∞";
    return `${(20 * Math.log10(gain)).toFixed(1)} dB`;
  }

  onVolume(value: string | number) {
    const track = this.track();
    if (!track) return;
    this.musicManager.updateVolume(track.id, Number(value) / 100);
    this.haptic.light();
  }

  onPan(value: string | number) {
    const track = this.track();
    if (!track) return;
    this.musicManager.updateTrackPan(track.id, Number(value));
    this.haptic.light();
  }

  onSend(which: "A" | "B", value: string | number) {
    const track = this.track();
    if (!track) return;
    this.musicManager.updateSend(track.id, which, Number(value) / 100);
    this.haptic.light();
  }

  onStereoWidth(value: string | number) {
    const track = this.track();
    if (!track) return;
    this.musicManager.updateStereoWidth(track.id, Number(value));
    this.haptic.light();
  }

  toggleMute() {
    const track = this.track();
    if (!track) return;
    this.musicManager.toggleMute(track.id);
    this.haptic.medium();
  }

  toggleSolo() {
    const track = this.track();
    if (!track) return;
    this.musicManager.toggleSolo(track.id);
    this.haptic.medium();
  }

  togglePhase() {
    const track = this.track();
    if (!track) return;
    this.musicManager.togglePhase(track.id);
    this.haptic.medium();
  }

  // ── WASM plugin chain (the "plugin inspector" half of the panel) ────
  // The rack edits slots; this shows which sandboxed plugins are actually on
  // the channel and lets one be added or pulled without leaving the
  // arrangement. Writes go through the same `setTrackPlugins` path the rack
  // uses, so the audio graph and the undo stack stay in step.

  readonly pluginCatalog: DspPluginManifest[] = this.pluginStore.catalog;
  pluginPickerOpen = signal(false);

  readonly trackPluginIds = computed<string[]>(
    () => this.track()?.pluginIds ?? [],
  );

  /** Catalog entries not already on this track — the add menu's options. */
  readonly availablePlugins = computed(() => {
    const onTrack = new Set(this.trackPluginIds());
    return this.pluginCatalog.filter((plugin) => !onTrack.has(plugin.id));
  });

  pluginName(id: string): string {
    return (
      this.pluginCatalog.find((plugin) => plugin.id === id)?.name ??
      id.replace(/^smuve\./, "")
    );
  }

  togglePluginPicker() {
    this.pluginPickerOpen.update((open) => !open);
    this.haptic.light();
  }

  addPlugin(plugin: DspPluginManifest) {
    const track = this.track();
    if (!track || this.trackPluginIds().includes(plugin.id)) return;
    this.musicManager.setTrackPlugins(track.id, [
      ...this.trackPluginIds(),
      plugin.id,
    ]);
    this.pluginPickerOpen.set(false);
    this.haptic.medium();
    this.logger.info(`Inspector: inserted ${plugin.id} on ${track.name}`);
  }

  removePlugin(id: string) {
    const track = this.track();
    if (!track) return;
    this.musicManager.setTrackPlugins(
      track.id,
      this.trackPluginIds().filter((pluginId) => pluginId !== id),
    );
    this.haptic.medium();
  }

  pluginTrackId(_index: number, id: string): string {
    return id;
  }

  pluginManifestTrack(_index: number, plugin: DspPluginManifest): string {
    return plugin.id;
  }

  toggleFx(slotId: string) {
    const track = this.track();
    if (!track) return;
    this.musicManager.toggleFxSlot(track.id, slotId);
    this.haptic.light();
  }

  removeFx(slotId: string) {
    const track = this.track();
    if (!track) return;
    this.musicManager.removeFxSlot(track.id, slotId);
    this.haptic.medium();
  }

  openRack() {
    const track = this.track();
    if (!track) return;
    this.logger.info(`Inspector: opening FX rack for ${track.name}`);
    this.openEffectsRack.emit(track.id);
    this.haptic.light();
  }

  /** Stable identity for ngFor trackBy so slot toggles do not rebuild the list. */
  fxTrackId(_index: number, slot: { id: string }): string {
    return slot.id;
  }

  /** Small helper for the template's type badge. */
  typeLabel(track: TrackModel): string {
    return track.type === "audio"
      ? "AUDIO"
      : track.type === "drum"
        ? "DRUM"
        : track.type === "bus"
          ? "BUS"
          : "MIDI";
  }
}
