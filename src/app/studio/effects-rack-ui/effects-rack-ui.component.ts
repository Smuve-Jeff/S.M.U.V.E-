import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService, FxSlot } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PluginStoreService, DspPluginManifest } from '../../services/plugin-store.service';
import { KnobComponent } from '../shared/knob/knob.component';

/** One editable parameter of a macro FX slot. */
export interface FxParamSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  default: number;
}

/**
 * Parameter surface per macro effect type. The rack used to render a separate
 * hand-written knob grid per type with the values hard-coded (`[value]="60"`)
 * and no change handler, so every knob in the panel was decorative: turning one
 * changed nothing and nothing was persisted. Driving the grid from these specs
 * makes each knob read and write `slot.params`, which survives slot selection,
 * undo/redo and project save/load.
 */
export const FX_PARAM_SPECS: Record<string, FxParamSpec[]> = {
  Reverb: [
    { id: 'wet', label: 'Wet', min: 0, max: 100, unit: '%', default: 60 },
    { id: 'dry', label: 'Dry', min: 0, max: 100, unit: '%', default: 40 },
    { id: 'decay', label: 'Decay', min: 0.1, max: 10, step: 0.1, unit: 's', default: 2.5 },
    { id: 'size', label: 'Size', min: 0, max: 100, unit: '%', default: 50 },
    { id: 'preDelay', label: 'Pre-Delay', min: 0, max: 200, unit: 'ms', default: 20 },
    { id: 'damping', label: 'Damping', min: 0, max: 100, unit: '%', default: 30 },
  ],
  Delay: [
    { id: 'wet', label: 'Wet', min: 0, max: 100, unit: '%', default: 40 },
    { id: 'dry', label: 'Dry', min: 0, max: 100, unit: '%', default: 60 },
    { id: 'time', label: 'Time', min: 0, max: 2000, unit: 'ms', default: 250 },
    { id: 'feedback', label: 'Feedback', min: 0, max: 95, unit: '%', default: 35 },
    { id: 'tone', label: 'Tone', min: 0, max: 100, unit: '%', default: 50 },
    { id: 'pingPong', label: 'Ping-Pong', min: 0, max: 100, unit: '%', default: 0 },
  ],
  Compressor: [
    { id: 'threshold', label: 'Threshold', min: -60, max: 0, step: 0.5, unit: 'dB', default: -24 },
    { id: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4 },
    { id: 'attack', label: 'Attack', min: 1, max: 200, unit: 'ms', default: 10 },
    { id: 'release', label: 'Release', min: 20, max: 1000, unit: 'ms', default: 120 },
    { id: 'makeup', label: 'Makeup', min: 0, max: 24, step: 0.5, unit: 'dB', default: 0 },
    { id: 'mix', label: 'Mix', min: 0, max: 100, unit: '%', default: 100 },
  ],
  EQ: [
    { id: 'sub', label: 'Sub 40', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 },
    { id: 'low', label: 'Low 120', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 },
    { id: 'mid', label: 'Mid 800', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 },
    { id: 'high', label: 'High 4k', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 },
    { id: 'air', label: 'Air 12k', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 },
    { id: 'q', label: 'Q', min: 0.2, max: 8, step: 0.1, default: 1 },
  ],
  Saturation: [
    { id: 'drive', label: 'Drive', min: 0, max: 100, unit: '%', default: 20 },
    { id: 'tone', label: 'Tone', min: 0, max: 100, unit: '%', default: 50 },
    { id: 'mix', label: 'Mix', min: 0, max: 100, unit: '%', default: 100 },
    { id: 'output', label: 'Output', min: -12, max: 12, step: 0.5, unit: 'dB', default: 0 },
  ],
  Chorus: [
    { id: 'rate', label: 'Rate', min: 0.05, max: 8, step: 0.05, unit: 'Hz', default: 0.8 },
    { id: 'depth', label: 'Depth', min: 0, max: 100, unit: '%', default: 40 },
    { id: 'mix', label: 'Mix', min: 0, max: 100, unit: '%', default: 35 },
    { id: 'spread', label: 'Spread', min: 0, max: 100, unit: '%', default: 50 },
  ],
  'Filter': [
    { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, unit: 'Hz', default: 12000 },
    { id: 'resonance', label: 'Reso', min: 0, max: 100, unit: '%', default: 10 },
    { id: 'drive', label: 'Drive', min: 0, max: 100, unit: '%', default: 0 },
  ],
  Limiter: [
    { id: 'ceiling', label: 'Ceiling', min: -12, max: 0, step: 0.1, unit: 'dB', default: -0.3 },
    { id: 'release', label: 'Release', min: 10, max: 500, unit: 'ms', default: 80 },
    { id: 'gain', label: 'Input Gain', min: -12, max: 24, step: 0.5, unit: 'dB', default: 0 },
  ],
};

/** Generic wet/dry fallback for slot types without a bespoke spec. */
const FALLBACK_SPEC: FxParamSpec[] = [
  { id: 'wet', label: 'Wet', min: 0, max: 100, unit: '%', default: 60 },
  { id: 'dry', label: 'Dry', min: 0, max: 100, unit: '%', default: 40 },
  { id: 'amount', label: 'Amount', min: 0, max: 100, unit: '%', default: 50 },
];

@Component({
  selector: 'app-effects-rack-ui',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './effects-rack-ui.component.html',
  styleUrls: ['./effects-rack-ui.component.css'],
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

  /** Splice/Un-splice the master-bus ScriptProcessor with a kernel closure
   *  that reads the current enabled plugins from the plugin store each block.
   *  Uses the width-preserving splice point (installMasterPluginInsertAfterWidth)
   *  so the M/S master-width stage stays in the signal path. */
  installMasterChain(ids: string[]): void {
    this.audioEngine.installMasterPluginInsertAfterWidth(ids, (pluginIds) => {
      const kernels: Array<((input: Float32Array, output: Float32Array, params: Float32Array, sr: number) => void) | null> = [];
      for (const id of pluginIds) {
        const mod = this.pluginStore['loader']?.getModule?.(id);
        const kernel = mod?.getKernel?.(this.kernelNameForManifest(id)) ?? null;
        kernels.push(kernel);
      }
      return kernels;
    });
    this.pluginStore.preload(ids);
  }

  /** Reverse-lookup for the kernel name from a plugin id (manifest catalog). */
  private kernelNameForManifest(id: string): string {
    return this.pluginStore.manifestFor(id)?.kernelName ?? 'process';
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
    'Reverb',
    'Delay',
    'Compressor',
    'EQ',
    'Saturation',
    'Chorus',
    'Filter',
    'Limiter',
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
    return FX_PARAM_SPECS[type ?? ''] ?? FALLBACK_SPEC;
  }

  /** Current value of a slot parameter, falling back to the spec default. */
  paramValue(slot: FxSlot | null, spec: FxParamSpec): number {
    const raw = slot?.params?.[spec.id];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : spec.default;
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
      this.musicManager.setFxSlotParam(track.id, slot.id, spec.id, spec.default);
    }
  }

  /**
   * Map a macro slot type onto a live WASM insert, so a slot the artist dialed
   * in can actually reach the audio path. Returns the manifest id or null when
   * no kernel corresponds to the type.
   */
  private liveManifestFor(type: string | undefined): string | null {
    switch ((type ?? '').toLowerCase()) {
      case 'compressor':
        return 'smuve.dynamics.v2';
      case 'eq':
        return 'smuve.eq.mastering.v2';
      case 'reverb':
        return 'smuve.reverb.v2';
      case 'saturation':
        return 'smuve.saturation.v2';
      default:
        return null;
    }
  }

  /** True when the active slot has a corresponding live WASM kernel. */
  canSendToLiveChain = computed(
    () => this.liveManifestFor(this.activeFxSlot()?.type) !== null
  );

  /**
   * Wet percentage shown on the slot's mix bar. Falls back to 50% for slot
   * types that carry no wet parameter rather than showing a fixed 50 that
   * contradicted whatever the knobs said.
   */
  mixPercentFor(slot: FxSlot | null): number {
    if (!slot) return 50;
    const spec = this.paramSpecs(slot.type).find((s) => s.id === 'wet');
    if (!spec) return 50;
    const raw = slot.params?.[spec.id];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return spec.default;
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
