import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  computed,
  signal,
  Input,
  OnChanges,
  SimpleChanges,
  output,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  MusicManagerService,
  FxSlot,
} from "../../services/music-manager.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import {
  PluginStoreService,
  DspPluginManifest,
  DspPluginParam,
} from "../../services/plugin-store.service";
import { AutomationService } from "../automation.service";
import { EffectPresetService } from "../effects/effect-preset.service";
import {
  WasmInsertPreset,
  WasmInsertPresetService,
} from "../effects/wasm-insert-preset.service";
import { NotificationService } from "../../services/notification.service";
import { KnobComponent } from "../shared/knob/knob.component";

import {
  FALLBACK_SPEC,
  FX_PARAM_SPECS,
  FxParamSpec,
} from "../effects/fx-param-specs";

export { FX_PARAM_SPECS };
export type { FxParamSpec };


@Component({
  selector: "app-effects-rack-ui",
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: "./effects-rack-ui.component.html",
  styleUrls: ["./effects-rack-ui.component.css", "../shared/platform-ux.css"],
})
export class EffectsRackUiComponent implements OnChanges, AfterViewInit {
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private pluginStore = inject(PluginStoreService);
  private automation = inject(AutomationService);
  private notify = inject(NotificationService);
  readonly effectPresets = inject(EffectPresetService);
  readonly wasmPresets = inject(WasmInsertPresetService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() focusSlot: number | null = null;
  @Input() focusPluginId: string | null = null;
  readonly focusConsumed = output<void>();

  selectedTrack = this.musicManager.selectedTrack;
  activeSlot = signal(1);

  ngOnChanges(changes: SimpleChanges): void {
    const slot = Number(changes["focusSlot"]?.currentValue);
    if (Number.isInteger(slot) && slot > 0) this.activeSlot.set(slot);
  }

  ngAfterViewInit(): void {
    if (this.focusSlot == null && !this.focusPluginId) return;
    let target: HTMLElement | null = null;
    if (this.focusSlot != null) {
      target = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-fx-slot-index="${this.focusSlot}"]`,
      );
    } else {
      target =
        Array.from(
          this.host.nativeElement.querySelectorAll<HTMLElement>(
            "[data-plugin-id]",
          ),
        ).find(
          (element) =>
            element.getAttribute("data-plugin-id") === this.focusPluginId,
        ) ?? null;
    }
    target?.scrollIntoView?.({ block: "nearest" });
    target?.focus?.();
    this.focusConsumed.emit();
  }

  /** Sprint B1 Phase 2 — WASM plugin catalog for live inserts. */
  wasmCatalog: DspPluginManifest[] = this.pluginStore.catalog;

  /** The selected track's live WASM insert chain (plugin ids). */
  trackPluginIds = computed(() => {
    const track = this.selectedTrack();
    return track?.pluginIds ?? [];
  });

  /** Live plugins that are installed but bypassed on the selected track. */
  trackBypassedPluginIds = computed(
    () => new Set(this.selectedTrack()?.bypassedPluginIds ?? []),
  );

  /** Whole-chain A/B override; leaves the individual choices untouched. */
  insertsBypassed = computed(
    () => this.selectedTrack()?.insertsBypassed === true,
  );

  hasPlugin(id: string): boolean {
    return this.trackPluginIds().includes(id);
  }

  isPluginBypassed(id: string): boolean {
    return this.insertsBypassed() || this.trackBypassedPluginIds().has(id);
  }

  isSlotEnabled(slot: { enabled?: boolean }): boolean {
    return !this.insertsBypassed() && slot.enabled !== false;
  }

  togglePluginInsert(manifest: DspPluginManifest): void {
    const track = this.selectedTrack();
    if (!track) return;
    const current = this.trackPluginIds();
    const adding = !current.includes(manifest.id);
    if (adding && !this.canAddEffect(track.id)) {
      this.showEffectBudget();
      return;
    }
    const next = adding
      ? [...current, manifest.id]
      : current.filter((x) => x !== manifest.id);
    this.musicManager.setTrackPlugins(track.id, next);
  }

  // Sprint B1 Phase 3 — master-bus live insert wiring. The audio engine holds
  // the canonical masterPluginIds signal; we render chips from it and install
  // a closure that resolves kernels through the plugin store.
  masterPluginIds = computed(() => this.audioEngine.masterPluginIds());

  hasMasterPlugin(id: string): boolean {
    return this.masterPluginIds().includes(id);
  }

  toggleMasterPlugin(manifest: DspPluginManifest): void {
    const current = this.masterPluginIds();
    const next = current.includes(manifest.id)
      ? current.filter((x) => x !== manifest.id)
      : [...current, manifest.id];
    this.installMasterChain(next);
  }

  /**
   * Splice/Un-splice the master-bus live chain. The engine polls this provider
   * and hands the slots to the plugin-chain worklet, which resolves each kernel
   * by name on the audio thread — so the provider may read the plugin store
   * (params, which modules finished loading) without blocking an audio callback.
   *
   * Uses the width-preserving splice point (installMasterPluginInsertAfterWidth)
   * so the M/S master-width stage stays in the signal path.
   */
  installMasterChain(ids: string[]): void {
    this.audioEngine.installMasterPluginInsertAfterWidth(ids, (pluginIds) =>
      pluginIds.map((id) => this.pluginStore.liveInsertSlot(id)),
    );
    this.pluginStore.preload(ids);
  }

  /** True per-slot peaks published by the plugin-chain worklet. */
  private meterLevels = computed<
    Record<string, Array<{ id: string; peak: number }>>
  >(() => {
    const levels = (this.audioEngine as { pluginMeterLevels?: () => Record<string, Array<{ id: string; peak: number }>> })
      .pluginMeterLevels;
    return typeof levels === "function" ? levels() : {};
  });

  /** Perceptual 0–100 meter height for one slot in a track/master chain. */
  meterPercent(chainKey: string, pluginId: string): number {
    const entry = (this.meterLevels()[chainKey] ?? []).find(
      (level) => level.id === pluginId,
    );
    if (!entry || !Number.isFinite(entry.peak)) return 0;
    const peak = Math.max(0, Math.min(1, entry.peak));
    return Math.round(Math.sqrt(peak) * 100);
  }

  pluginManifest(pluginId: string): DspPluginManifest | null {
    return this.pluginStore.manifestFor(pluginId);
  }

  pluginParams(pluginId: string): DspPluginParam[] {
    return this.pluginManifest(pluginId)?.params ?? [];
  }

  pluginValue(pluginId: string, param: DspPluginParam): number {
    const value = this.pluginStore.valuesFor(pluginId)[param.id];
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : param.default;
  }

  /**
   * One knob writes the shared plugin store; the engine's 200 ms chain poll
   * pushes it to the audio thread. Moving it while AUTO is armed and the
   * transport runs records a `plugin:<id>:<param>` keyframe.
   */
  setPluginParam(
    pluginId: string,
    param: DspPluginParam,
    value: number,
  ): void {
    this.pluginStore.setParam(pluginId, param.id, value);
    const track = this.selectedTrack();
    if (track) {
      this.automation.captureWrite(
        track.id,
        `plugin:${pluginId}:${param.id}`,
        value,
        { interpolation: "linear", min: param.min, max: param.max, smoothing: this.automation.writeSmoothing() },
      );
    }
  }

  /** Create the lane the curve editor and transport will read. */
  automatePluginParam(pluginId: string, param: DspPluginParam): void {
    const track = this.selectedTrack();
    if (!track) return;
    this.automation.ensureLane(
      track.id,
      `plugin:${pluginId}:${param.id}`,
      {
        interpolation: "linear",
        min: param.min,
        max: param.max,
      },
    );
  }

  fxSlots = computed(() => {
    const track = this.selectedTrack();
    return track?.fxSlots || [];
  });

  /** Returns the currently selected effect slot for parameter display */
  activeFxSlot = computed(() => {
    const slots = this.fxSlots();
    const idx = this.activeSlot() - 1;
    return idx >= 0 && idx < slots.length ? slots[idx] : null;
  });

  toggleFx(slotId: string) {
    const track = this.selectedTrack();
    if (!track) return;
    const target = this.fxSlots().find((slot) => slot.id === slotId);
    if (target?.enabled === false && !this.canAddEffect(track.id)) {
      this.showEffectBudget();
      return;
    }
    // Undoable through the manager rather than a raw signal write.
    this.musicManager.toggleFxSlot(track.id, slotId);
  }

  // ── Macro FX slot management ─────────────────────────────────────
  /** Types offered by the Add Effect menu. */
  readonly fxTypes: string[] = [
    "Reverb",
    "Delay",
    "Compressor",
    "EQ",
    "Saturation",
    "Chorus",
    "Filter",
    "Limiter",
  ];

  /** Add Effect fly-out state. */
  addMenuOpen = signal(false);

  toggleAddMenu(event?: Event): void {
    event?.stopPropagation();
    this.addMenuOpen.update((v) => !v);
  }

  /**
   * Append a macro FX slot and focus it. Previously the Add Effect button had
   * no handler at all, so a rack that shipped with one Reverb slot could never
   * gain a second effect.
   */
  addFxSlot(type: string): void {
    const track = this.selectedTrack();
    if (!track) return;
    if (!this.canAddEffect(track.id)) {
      this.showEffectBudget();
      this.addMenuOpen.set(false);
      return;
    }
    const id = this.musicManager.addFxSlot(track.id, type);
    this.addMenuOpen.set(false);
    if (!id) return;
    const slots = this.fxSlots();
    const index = slots.findIndex((s) => s.id === id);
    this.activeSlot.set(index >= 0 ? index + 1 : slots.length + 1);
  }

  /** Remove the slot at the given 1-based position. */
  removeFxSlot(index: number, event?: Event): void {
    event?.stopPropagation();
    const track = this.selectedTrack();
    const slot = this.fxSlots()[index];
    if (!track || !slot) return;
    this.musicManager.removeFxSlot(track.id, slot.id);
    // Keep the selection inside the shortened list instead of pointing past it.
    const remaining = this.fxSlots().length;
    this.activeSlot.set(Math.max(1, Math.min(index + 1, remaining)));
  }

  /** Parameter spec list for a slot type (never empty). */
  paramSpecs(type: string | undefined): FxParamSpec[] {
    return FX_PARAM_SPECS[type ?? ""] ?? FALLBACK_SPEC;
  }

  /** Current value of a slot parameter, falling back to the spec default. */
  paramValue(slot: FxSlot | null, spec: FxParamSpec): number {
    const raw = slot?.params?.[spec.id];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : spec.default;
  }

  // ── Per-insert preset browser ────────────────────────────────────
  presetName = signal("");
  selectedPresetId = signal("");

  presetsForSlot(type: string | undefined) {
    return this.effectPresets.presetsFor(type);
  }

  selectSlot(index: number): void {
    this.activeSlot.set(index);
    this.selectedPresetId.set("");
  }

  saveActivePreset(): void {
    const slot = this.activeFxSlot();
    const name = this.presetName().trim();
    if (!slot || !name) return;
    const preset = this.effectPresets.save(name, slot.type, slot.params);
    if (!preset) return;
    this.selectedPresetId.set(preset.id);
    this.presetName.set("");
    this.notify.show(`Saved ${slot.type} preset “${preset.name}”.`, "success");
  }

  applySelectedPreset(): void {
    const track = this.selectedTrack();
    const slot = this.activeFxSlot();
    const preset = this.presetsForSlot(slot?.type).find(
      (candidate) => candidate.id === this.selectedPresetId(),
    );
    if (!track || !slot || !preset) return;
    this.musicManager.applyFxSlotPreset(track.id, slot.id, preset.params);
    this.notify.show(`Recalled “${preset.name}”.`, "info");
  }

  deleteSelectedPreset(): void {
    const preset = this.presetsForSlot(this.activeFxSlot()?.type).find(
      (candidate) => candidate.id === this.selectedPresetId(),
    );
    if (!preset) return;
    this.effectPresets.remove(preset.id);
    this.selectedPresetId.set("");
    this.notify.show(`Deleted preset “${preset.name}”.`, "info");
  }

  // ── WASM insert presets ──────────────────────────────────────────
  private pluginPresetSelections = signal<Record<string, string>>({});
  private pluginPresetNames = signal<Record<string, string>>({});

  pluginPresets(pluginId: string): WasmInsertPreset[] {
    return this.wasmPresets.presetsFor(pluginId);
  }

  pluginPresetSelection(key: string): string {
    return this.pluginPresetSelections()[key] ?? "";
  }

  selectPluginPreset(key: string, presetId: string): void {
    this.pluginPresetSelections.update((all) => ({ ...all, [key]: presetId }));
  }

  pluginPresetNameValue(key: string): string {
    return this.pluginPresetNames()[key] ?? "";
  }

  setPluginPresetNameValue(key: string, name: string): void {
    this.pluginPresetNames.update((all) => ({ ...all, [key]: name }));
  }

  private findPluginPreset(
    pluginId: string,
    key: string,
  ): WasmInsertPreset | null {
    const presetId = this.pluginPresetSelection(key);
    if (!presetId) return null;
    return (
      this.wasmPresets
        .presetsFor(pluginId)
        .find((preset) => preset.id === presetId) ?? null
    );
  }

  isFactoryPluginPreset(pluginId: string, key: string): boolean {
    return this.findPluginPreset(pluginId, key)?.factory === true;
  }

  applyPluginPreset(pluginId: string, key: string): void {
    const preset = this.findPluginPreset(pluginId, key);
    const manifest = this.pluginStore.manifestFor(pluginId);
    if (!preset || !manifest) return;
    const allowed = new Set(manifest.params.map((param) => param.id));
    for (const [paramId, value] of Object.entries(preset.params)) {
      if (!allowed.has(paramId) || !Number.isFinite(value)) continue;
      this.pluginStore.setParam(pluginId, paramId, value);
    }
    this.notify.show(`Recalled “${preset.name}”.`, "info");
  }

  savePluginPreset(pluginId: string, key: string): void {
    const name = this.pluginPresetNameValue(key).trim();
    if (!name) return;
    const preset = this.wasmPresets.save(
      name,
      pluginId,
      this.pluginStore.valuesFor(pluginId),
    );
    if (!preset) return;
    this.pluginPresetSelections.update((all) => ({
      ...all,
      [key]: preset.id,
    }));
    this.pluginPresetNames.update((all) => ({ ...all, [key]: "" }));
    this.notify.show(`Saved “${preset.name}”.`, "success");
  }

  deletePluginPreset(pluginId: string, key: string): void {
    const preset = this.findPluginPreset(pluginId, key);
    if (!preset || preset.factory) return;
    this.wasmPresets.remove(preset.id);
    this.pluginPresetSelections.update((all) => ({ ...all, [key]: "" }));
    this.notify.show(`Deleted “${preset.name}”.`, "info");
  }

  /** Persist a knob move onto the slot (coalesced in history). */
  setFxParam(slotId: string | undefined, paramId: string, value: number): void {
    const track = this.selectedTrack();
    if (!track || !slotId) return;
    this.musicManager.setFxSlotParam(track.id, slotId, paramId, value);
  }

  /** Reset every parameter of the active slot to its spec defaults. */
  resetFxParams(): void {
    const track = this.selectedTrack();
    const slot = this.activeFxSlot();
    if (!track || !slot) return;
    for (const spec of this.paramSpecs(slot.type)) {
      this.musicManager.setFxSlotParam(
        track.id,
        slot.id,
        spec.id,
        spec.default,
      );
    }
  }

  /**
   * Map a macro slot type onto a live WASM insert, so a slot the artist dialed
   * in can actually reach the audio path. Returns the manifest id or null when
   * no kernel corresponds to the type.
   */
  private liveManifestFor(type: string | undefined): string | null {
    switch ((type ?? "").toLowerCase()) {
      case "compressor":
        return "smuve.dynamics.v2";
      case "eq":
        return "smuve.eq.mastering.v2";
      case "reverb":
        return "smuve.reverb.v2";
      case "saturation":
        return "smuve.saturation.v2";
      default:
        return null;
    }
  }

  /** True when the active slot has a corresponding live WASM kernel. */
  canSendToLiveChain = computed(
    () => this.liveManifestFor(this.activeFxSlot()?.type) !== null,
  );

  /**
   * Wet percentage shown on the slot's mix bar. Falls back to 50% for slot
   * types that carry no wet parameter rather than showing a fixed 50 that
   * contradicted whatever the knobs said.
   */
  mixPercentFor(slot: FxSlot | null): number {
    if (!slot) return 50;
    const spec = this.paramSpecs(slot.type).find((s) => s.id === "wet");
    if (!spec) return 50;
    const raw = slot.params?.[spec.id];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return spec.default;
    const pct = ((raw - spec.min) / (spec.max - spec.min)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  /**
   * Explicit, user-triggered bridge from the macro chain to the audible chain.
   * Macro slots are the AI-mix/automation model and are not spliced into the
   * audio graph by themselves, so this installs the matching WASM insert when
   * the artist asks for it.
   */
  sendActiveToLiveChain(): void {
    const track = this.selectedTrack();
    const slot = this.activeFxSlot();
    if (!track || !slot) return;
    const manifestId = this.liveManifestFor(slot.type);
    if (!manifestId) return;
    const current = this.trackPluginIds();
    if (current.includes(manifestId)) return;
    if (!this.canAddEffect(track.id)) {
      this.showEffectBudget();
      return;
    }
    this.musicManager.setTrackPlugins(track.id, [...current, manifestId]);
  }

  private canAddEffect(trackId: string): boolean {
    const canAdd = (this.musicManager as any).canAddEffect;
    return typeof canAdd === 'function' ? canAdd.call(this.musicManager, trackId) : true;
  }

  private showEffectBudget(): void {
    const limit = (this.musicManager as any).effectLimit;
    const value = typeof limit === 'function' ? limit.call(this.musicManager) : null;
    this.notify.show(
      value
        ? `This device supports ${value} active effects per track. Bypass one first.`
        : 'The active-effect budget for this track is full. Bypass one first.',
      'warning',
    );
  }
}
