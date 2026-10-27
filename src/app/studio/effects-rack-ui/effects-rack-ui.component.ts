import { Component, inject, computed, signal } from "@angular/core";
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
} from "../../services/plugin-store.service";
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
export class EffectsRackUiComponent {
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private pluginStore = inject(PluginStoreService);

  selectedTrack = this.musicManager.selectedTrack;
  activeSlot = signal(1);

  /** Sprint B1 Phase 2 — WASM plugin catalog for live inserts. */
  wasmCatalog: DspPluginManifest[] = this.pluginStore.catalog;

  /** The selected track's live WASM insert chain (plugin ids). */
  trackPluginIds = computed(() => {
    const track = this.selectedTrack();
    return track?.pluginIds ?? [];
  });

  hasPlugin(id: string): boolean {
    return this.trackPluginIds().includes(id);
  }

  togglePluginInsert(manifest: DspPluginManifest): void {
    const track = this.selectedTrack();
    if (!track) return;
    const current = this.trackPluginIds();
    const next = current.includes(manifest.id)
      ? current.filter((x) => x !== manifest.id)
      : [...current, manifest.id];
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
    this.musicManager.setTrackPlugins(track.id, [...current, manifestId]);
  }
}
