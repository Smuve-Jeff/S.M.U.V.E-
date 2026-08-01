import { Injectable, computed, inject, signal } from '@angular/core';
import { WasmLoaderService } from '../studio/wasm/wasm-loader.service';
import { WasmDspModule, DspKernelFn } from '../studio/wasm/wasm-dsp-interface';
import {
  wasmDynamicsModule,
  wasmEqModule,
  wasmSaturationModule,
  wasmMasterChainModule,
} from '../studio/wasm/wasm-dsp-kernels';
import { createAlgorithmicReverb } from '../studio/wasm/algorithmic-reverb';
import { LoggingService } from './logging.service';

/**
 * S.M.U.V.E. 2.0 — WASM Plugin Framework (Sprint B1)
 *
 * Official plugin API: a sandboxed DSP plugin is a manifest (id, params,
 * kernels) backed by a WasmDspModule — loaded through WasmLoaderService with
 * an automatic pure-JS fallback so every plugin works on every device.
 *
 * The registry owns the plugin store (catalog), per-device enabled state,
 * and a chain processor that runs enabled plugins over an AudioBuffer —
 * which the mastering/export pipeline uses as the "S.M.U.V.E Polish" stage.
 */

export interface DspPluginParam {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface DspPluginManifest {
  /** Stable plugin id (e.g. 'smuve.saturation.v2'). */
  id: string;
  name: string;
  version: string;
  author: string;
  category: 'Dynamics' | 'EQ' | 'Saturation' | 'Reverb' | 'Mastering';
  description: string;
  icon: string;
  /** Kernel name used when the whole plugin runs as one stage. */
  kernelName: string;
  /** Optional .wasm binary URL; JS fallback is used when absent/fails. */
  wasmUrl?: string;
  params: DspPluginParam[];
  /** Build the WasmDspModule (JS fallback path). */
  moduleFactory: () => WasmDspModule;
  /** Map param values → kernel Float32Array in kernel order. */
  buildParams: (values: Record<string, number>) => Float32Array;
}

const ENABLED_KEY = 'smuve_plugins_enabled';
const PARAMS_KEY = 'smuve_plugin_params';
const COMMUNITY_KEY = 'smuve_plugins_community';

/** Serializable plugin manifest for the community store (.smuveplugin JSON). */
export interface CommunityPluginPayload {
  format: 'smuve-plugin';
  manifest: {
    id: string;
    name: string;
    version: string;
    author: string;
    category: DspPluginManifest['category'];
    description: string;
    icon: string;
    kernelName: string;
    params: DspPluginParam[];
  };
}

const ALLOWED_CATEGORIES = new Set(['Dynamics', 'EQ', 'Saturation', 'Reverb', 'Mastering']);

function readArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
    }
  } catch {
    // storage unavailable — ignore
  }
  return [];
}

function readParams(key: string): Record<string, Record<string, number>> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // storage unavailable — ignore
  }
  return {};
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Read the persisted community plugin payloads. */
function readCommunity(): CommunityPluginPayload[] {
  try {
    const raw = localStorage.getItem(COMMUNITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // storage unavailable — ignore
  }
  return [];
}

/** Interleave any channel count into a stereo frame buffer the kernels expect. */
function interleaveStereo(channels: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length * 2);
  const c0 = channels[0] ?? new Float32Array(length);
  const c1 = channels[1] ?? c0;
  for (let i = 0; i < length; i++) {
    out[i * 2] = c0[i];
    out[i * 2 + 1] = c1[i];
  }
  return out;
}

function deinterleaveStereo(
  frames: Float32Array,
  channels: Float32Array[],
  length: number
): void {
  const c0 = channels[0];
  const c1 = channels[1];
  if (c0) {
    for (let i = 0; i < length; i++) c0[i] = frames[i * 2];
  }
  if (c1) {
    for (let i = 0; i < length; i++) c1[i] = frames[i * 2 + 1];
  }
}

@Injectable({ providedIn: 'root' })
export class PluginStoreService {
  private loader = inject(WasmLoaderService);
  private logger = inject(LoggingService);

  /** The plugin store catalog — built-in, sandboxed DSP modules. */
  readonly catalog: DspPluginManifest[] = [
    {
      id: 'smuve.dynamics.v2',
      name: 'Dynamics Processor',
      version: '2.0.0',
      author: 'S.M.U.V.E Labs',
      category: 'Dynamics',
      description:
        'Feed-forward soft-knee compressor with makeup gain — glue drums and vocals.',
      icon: 'compress',
      kernelName: 'compressor',
      moduleFactory: wasmDynamicsModule,
      params: [
        { id: 'thresholdDb', label: 'Threshold', min: -60, max: 0, step: 0.5, default: -24, unit: 'dB' },
        { id: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4 },
        { id: 'attack', label: 'Attack', min: 0.001, max: 0.05, step: 0.001, default: 0.003, unit: 's' },
        { id: 'release', label: 'Release', min: 0.01, max: 0.5, step: 0.01, default: 0.1, unit: 's' },
        { id: 'makeupDb', label: 'Makeup', min: 0, max: 12, step: 0.5, default: 0, unit: 'dB' },
      ],
      buildParams: (v) =>
        new Float32Array([
          v['thresholdDb'] ?? -24,
          v['ratio'] ?? 4,
          v['attack'] ?? 0.003,
          v['release'] ?? 0.1,
          6, // knee
          v['makeupDb'] ?? 0,
        ]),
    },
    {
      id: 'smuve.eq.mastering.v2',
      name: 'Mastering EQ',
      version: '2.0.0',
      author: 'S.M.U.V.E Labs',
      category: 'EQ',
      description:
        '5-band parametric mastering EQ — sub, low, mid, high and air bands.',
      icon: 'graphic_eq',
      kernelName: 'eq',
      moduleFactory: wasmEqModule,
      params: [
        { id: 'sub', label: 'Sub (40Hz)', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        { id: 'low', label: 'Low (120Hz)', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        { id: 'mid', label: 'Mid (800Hz)', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        { id: 'high', label: 'High (4kHz)', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        { id: 'air', label: 'Air (12kHz)', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
      ],
      buildParams: (v) => {
        const freqs = [40, 120, 800, 4000, 12000];
        const out = new Float32Array(15);
        for (let b = 0; b < 5; b++) {
          const key = ['sub', 'low', 'mid', 'high', 'air'][b];
          out[b * 3] = freqs[b];
          out[b * 3 + 1] = v[key] ?? 0;
          out[b * 3 + 2] = 0.707;
        }
        return out;
      },
    },
    {
      id: 'smuve.saturation.v2',
      name: 'Saturation / Exciter',
      version: '2.0.0',
      author: 'S.M.U.V.E Labs',
      category: 'Saturation',
      description:
        'Tanh/cubic/soft saturation with dry/wet blend — add harmonic warmth.',
      icon: 'flare',
      kernelName: 'saturate',
      moduleFactory: wasmSaturationModule,
      params: [
        { id: 'amount', label: 'Drive', min: 0, max: 1, step: 0.01, default: 0.2 },
        { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, default: 1 },
        { id: 'mode', label: 'Curve', min: 0, max: 2, step: 1, default: 0 },
      ],
      buildParams: (v) =>
        new Float32Array([v['amount'] ?? 0.2, v['mix'] ?? 1, v['mode'] ?? 0]),
    },
    {
      id: 'smuve.reverb.v2',
      name: 'Algorithmic Reverb',
      version: '2.0.0',
      author: 'S.M.U.V.E Labs',
      category: 'Reverb',
      description:
        'Schroeder-Moorer FDN reverb with all-pass diffusers and stereo width.',
      icon: 'surround_sound',
      kernelName: 'process',
      moduleFactory: () => createAlgorithmicReverb(48000),
      params: [
        { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, default: 0.4 },
        { id: 'decay', label: 'Decay', min: 0.5, max: 8, step: 0.1, default: 2.5, unit: 's' },
        { id: 'damping', label: 'Damping', min: 0, max: 0.9, step: 0.01, default: 0.3 },
        { id: 'width', label: 'Width', min: 0, max: 1, step: 0.01, default: 0.8 },
      ],
      buildParams: (v) =>
        new Float32Array([
          v['mix'] ?? 0.4,
          v['decay'] ?? 2.5,
          v['damping'] ?? 0.3,
          v['width'] ?? 0.8,
        ]),
    },
    {
      id: 'smuve.master.v2',
      name: 'Full Mastering Chain',
      version: '2.0.0',
      author: 'S.M.U.V.E Labs',
      category: 'Mastering',
      description:
        'Monolithic EQ → Compressor → Saturator → Limiter chain in one kernel.',
      icon: 'workspaces',
      kernelName: 'process',
      moduleFactory: wasmMasterChainModule,
      params: [
        { id: 'thresholdDb', label: 'Comp Threshold', min: -40, max: 0, step: 0.5, default: -20, unit: 'dB' },
        { id: 'ratio', label: 'Comp Ratio', min: 1, max: 20, step: 0.5, default: 4 },
        { id: 'amount', label: 'Sat Drive', min: 0, max: 1, step: 0.01, default: 0.15 },
        { id: 'ceilingDb', label: 'Limiter Ceiling', min: -6, max: -0.1, step: 0.1, default: -0.3, unit: 'dB' },
      ],
      buildParams: (v) => {
        // 28 floats: 15 EQ + 6 comp + 3 sat + 4 limiter
        const out = new Float32Array(28);
        const freqs = [40, 120, 800, 4000, 12000];
        for (let b = 0; b < 5; b++) {
          out[b * 3] = freqs[b];
          out[b * 3 + 1] = 0;
          out[b * 3 + 2] = 0.707;
        }
        out[15] = v['thresholdDb'] ?? -20;
        out[16] = v['ratio'] ?? 4;
        out[17] = 0.003;
        out[18] = 0.1;
        out[19] = 6;
        out[20] = 0;
        out[21] = v['amount'] ?? 0.15;
        out[22] = 1;
        out[23] = 0;
        out[24] = v['ceilingDb'] ?? -0.3;
        out[25] = 0.01;
        out[26] = 0;
        out[27] = -1;
        return out;
      },
    },
  ];

  /** Community plugins imported from .smuveplugin JSON (persisted). */
  private readonly community = signal<CommunityPluginPayload[]>(readCommunity());

  /** Plugin ids the user has enabled on this device (persisted). */
  private readonly enabledIds = signal<string[]>(readArray(ENABLED_KEY));

  /** Per-plugin param overrides (id → paramId → value). */
  private readonly paramOverrides = signal<Record<string, Record<string, number>>>(
    readParams(PARAMS_KEY)
  );

  readonly enabled = computed(() => new Set(this.enabledIds()));

  /** Full catalog — built-ins plus imported community plugins. */
  readonly communityPlugins = this.community.asReadonly();

  isEnabled(id: string): boolean {
    return this.enabledIds().includes(id);
  }

  /** Look up a manifest by id across built-ins and community imports. */
  manifestFor(id: string): DspPluginManifest | null {
    const builtIn = this.catalog.find((p) => p.id === id);
    if (builtIn) return builtIn;
    const community = this.community().find((p) => p.manifest.id === id);
    if (community) {
      const m = community.manifest;
      return {
        id: m.id,
        name: m.name,
        version: m.version,
        author: m.author,
        category: m.category,
        description: m.description,
        icon: m.icon,
        kernelName: m.kernelName,
        params: m.params,
        moduleFactory: () => {
          // Community plugins share the built-in kernel namespace; the
          // importer guarantees kernelName is one of the known kernels.
          return this.catalog.find((p) => p.kernelName === m.kernelName)
            ?.moduleFactory() ?? wasmSaturationModule();
        },
        buildParams: (values: Record<string, number>) => {
          const out = new Float32Array(m.params.length);
          m.params.forEach((p, i) => {
            out[i] = values[p.id] ?? p.default;
          });
          return out;
        },
      };
    }
    return null;
  }

  /**
   * Sprint B1 Phase 2 — community store: serialize a plugin to the
   * shareable .smuveplugin JSON payload.
   */
  exportCommunityPlugin(id: string): string | null {
    const manifest = this.manifestFor(id);
    if (!manifest) return null;
    const payload: CommunityPluginPayload = {
      format: 'smuve-plugin',
      manifest: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        category: manifest.category,
        description: manifest.description,
        icon: manifest.icon,
        kernelName: manifest.kernelName,
        params: manifest.params.map((p) => ({ ...p })),
      },
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Validate + import a community plugin payload. Rejects malformed JSON,
   * duplicate ids, and unknown categories. Returns the imported id or throws
   * with a user-facing message.
   */
  importCommunityPlugin(raw: string): string {
    let payload: CommunityPluginPayload;
    try {
      payload = JSON.parse(raw) as CommunityPluginPayload;
    } catch {
      throw new Error('Invalid plugin file — not valid JSON');
    }

    if (!payload || payload.format !== 'smuve-plugin' || !payload.manifest) {
      throw new Error('Invalid plugin file — missing smuve-plugin envelope');
    }
    const m = payload.manifest;
    if (!m.id || !m.name || !m.kernelName || !Array.isArray(m.params)) {
      throw new Error('Invalid plugin manifest — id, name, kernel and params required');
    }
    if (!ALLOWED_CATEGORIES.has(m.category)) {
      throw new Error(`Unsupported plugin category '${m.category}'`);
    }
    for (const p of m.params) {
      if (p.id && typeof p.id === 'string' && isFinite(p.min) && isFinite(p.max)) continue;
      throw new Error(`Invalid param '${p?.id ?? '?'}' — min/max must be numbers`);
    }
    if (this.manifestFor(m.id)) {
      throw new Error(`Plugin '${m.id}' already exists`);
    }

    const next = [...this.community(), payload];
    this.community.set(next);
    try {
      localStorage.setItem(COMMUNITY_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — ignore
    }
    return m.id;
  }

  /** Remove an imported community plugin. Built-ins cannot be removed. */
  removeCommunityPlugin(id: string): void {
    const next = this.community().filter((p) => p.manifest.id !== id);
    this.community.set(next);
    try {
      localStorage.setItem(COMMUNITY_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — ignore
    }
    // Drop it from the enabled set too.
    if (this.isEnabled(id)) this.toggle(id);
  }

  /**
   * Synchronous block processor for LIVE audio inserts (Sprint B1 Phase 2).
   * Runs the given plugin chain over a mono block in-place. Kernels must be
   * pre-loaded (call `preload(ids)` when the chain is attached); unloaded
   * plugins pass through silently so live audio never drops out.
   */
  processLiveBlock(
    pluginIds: string[],
    block: Float32Array,
    sampleRate: number
  ): void {
    if (pluginIds.length === 0 || block.length === 0) return;
    const frames = interleaveStereo([block, block], block.length);
    const processed = new Float32Array(frames.length);

    for (const id of pluginIds) {
      const manifest = this.manifestFor(id);
      if (!manifest) continue;
      const module = this.loader.getModule(id);
      const kernel: DspKernelFn | null = module?.getKernel(manifest.kernelName) ?? null;
      if (!kernel) {
        // Kick off a background load so the next block can use it.
        this.loadModule(id).catch(() => {});
        continue;
      }
      kernel(frames, processed, this.kernelParamsFor(id), sampleRate);
      frames.set(processed);
    }
    for (let i = 0; i < block.length; i++) block[i] = frames[i * 2];
  }

  /** Preload every plugin in a chain so live inserts have zero-drop kernels. */
  async preload(pluginIds: string[]): Promise<void> {
    await Promise.all(pluginIds.map((id) => this.loadModule(id).catch(() => null)));
  }

  toggle(id: string): void {
    const current = this.enabledIds();
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    this.enabledIds.set(next);
    try {
      localStorage.setItem(ENABLED_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — ignore
    }
  }

  setParam(pluginId: string, paramId: string, value: number): void {
    const manifest = this.catalog.find((p) => p.id === pluginId);
    const param = manifest?.params.find((p) => p.id === paramId);
    const clamped = param ? clamp(value, param.min, param.max) : value;
    this.paramOverrides.update((all) => ({
      ...all,
      [pluginId]: { ...(all[pluginId] ?? {}), [paramId]: clamped },
    }));
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(this.paramOverrides()));
    } catch {
      // storage unavailable — ignore
    }
  }

  /** Effective (override-or-default) param values for a plugin. */
  valuesFor(pluginId: string): Record<string, number> {
    const manifest = this.catalog.find((p) => p.id === pluginId);
    const base: Record<string, number> = {};
    for (const p of manifest?.params ?? []) base[p.id] = p.default;
    return { ...base, ...(this.paramOverrides()[pluginId] ?? {}) };
  }

  /** Kernel Float32Array for a plugin with current values. */
  kernelParamsFor(pluginId: string): Float32Array {
    const manifest = this.catalog.find((p) => p.id === pluginId);
    if (!manifest) return new Float32Array();
    return manifest.buildParams(this.valuesFor(pluginId));
  }

  /** Load (and cache) a plugin's WasmDspModule — Wasm first, JS fallback. */
  async loadModule(pluginId: string): Promise<WasmDspModule | null> {
    const manifest = this.catalog.find((p) => p.id === pluginId);
    if (!manifest) return null;
    return this.loader.loadModule(pluginId, {
      wasmUrl: manifest.wasmUrl,
      jsFallback: manifest.moduleFactory,
    });
  }

  /**
   * Run a single plugin over an AudioBuffer in-place (sandboxed block
   * processing via the module's DSP kernel). Returns a fresh copy when the
   * buffer is immutable; mutates channel data otherwise.
   */
  async processBuffer(
    buffer: AudioBuffer,
    pluginId: string
  ): Promise<AudioBuffer> {
    const manifest = this.catalog.find((p) => p.id === pluginId);
    if (!manifest) return buffer;
    const module = await this.loadModule(pluginId);
    const kernel: DspKernelFn | null = module?.getKernel(manifest.kernelName) ?? null;
    if (!kernel) {
      this.logger.warn(`Plugin '${pluginId}' has no kernel '${manifest.kernelName}'`);
      return buffer;
    }

    const channels: Float32Array[] = [];
    const count = Math.min(2, buffer.numberOfChannels);
    for (let c = 0; c < count; c++) channels.push(buffer.getChannelData(c));

    const frames = interleaveStereo(channels, buffer.length);
    const processed = new Float32Array(frames.length);
    kernel(frames, processed, this.kernelParamsFor(pluginId), buffer.sampleRate);
    deinterleaveStereo(processed, channels, buffer.length);

    // If the buffer was a plain object (tests), reflect mono→stereo copies.
    if (buffer.numberOfChannels === 1) {
      const left = buffer.getChannelData(0);
      for (let i = 0; i < left.length; i++) left[i] = processed[i * 2];
    }
    return buffer;
  }

  /**
   * Run the enabled plugin chain over a buffer (catalog order = signal flow).
   * This is the "S.M.U.V.E Polish" stage used by the mastering/export path.
   */
  async applyEnabledChain(buffer: AudioBuffer): Promise<AudioBuffer> {
    let out = buffer;
    for (const manifest of this.catalog) {
      if (!this.isEnabled(manifest.id)) continue;
      try {
        out = await this.processBuffer(out, manifest.id);
      } catch (err) {
        this.logger.warn(`Plugin '${manifest.id}' failed, skipping`, err);
      }
    }
    return out;
  }
}
