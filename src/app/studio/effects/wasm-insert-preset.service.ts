import { Injectable, signal } from "@angular/core";

/** A named snapshot of one WASM insert's parameter surface. */
export interface WasmInsertPreset {
  id: string;
  name: string;
  /** Stable WASM manifest id, e.g. `smuve.reverb.v2`. */
  pluginId: string;
  params: Record<string, number>;
  /** Factory presets are built in and cannot be deleted. */
  factory: boolean;
  createdAt: number;
}

const STORAGE_KEY = "smuve_wasm_insert_presets_v1";

interface FactoryPreset {
  name: string;
  params: Record<string, number>;
}

/**
 * Factory sounds are keyed by manifest id. Values stay inside the manifest's
 * declared ranges so recalling one never needs a second clamp pass.
 */
const FACTORY_PRESETS: Record<string, FactoryPreset[]> = {
  "smuve.dynamics.v2": [
    {
      name: "Vocal Glue",
      params: {
        thresholdDb: -24,
        ratio: 3,
        attack: 0.005,
        release: 0.12,
        makeupDb: 2,
      },
    },
    {
      name: "Drum Punch",
      params: {
        thresholdDb: -30,
        ratio: 4,
        attack: 0.01,
        release: 0.08,
        makeupDb: 4,
      },
    },
    {
      name: "Bass Tamer",
      params: {
        thresholdDb: -28,
        ratio: 6,
        attack: 0.003,
        release: 0.15,
        makeupDb: 3,
      },
    },
  ],
  "smuve.eq.mastering.v2": [
    {
      name: "Air Lift",
      params: { sub: 0, low: -1, mid: 0, high: 2, air: 4 },
    },
    {
      name: "Warm Low End",
      params: { sub: 2, low: 3, mid: -1, high: 0, air: 1 },
    },
    {
      name: "Vocal Clarity",
      params: { sub: -2, low: -1, mid: 2, high: 2, air: 3 },
    },
  ],
  "smuve.saturation.v2": [
    { name: "Tape Warmth", params: { amount: 0.25, mix: 0.6, mode: 0 } },
    { name: "Console Drive", params: { amount: 0.45, mix: 0.8, mode: 2 } },
    { name: "Subtle Glue", params: { amount: 0.12, mix: 0.35, mode: 0 } },
  ],
  "smuve.reverb.v2": [
    {
      name: "Tight Room",
      params: { mix: 0.22, decay: 0.8, damping: 0.5, width: 0.6 },
    },
    {
      name: "Plate Sheen",
      params: { mix: 0.32, decay: 2.2, damping: 0.25, width: 0.95 },
    },
    {
      name: "Cathedral",
      params: { mix: 0.4, decay: 6.5, damping: 0.55, width: 1 },
    },
  ],
  "smuve.master.v2": [
    {
      name: "Streaming Ready",
      params: {
        thresholdDb: -22,
        ratio: 3,
        amount: 0.12,
        ceilingDb: -1,
      },
    },
    {
      name: "Club Weight",
      params: {
        thresholdDb: -26,
        ratio: 4,
        amount: 0.25,
        ceilingDb: -0.3,
      },
    },
    {
      name: "Gentle Master",
      params: {
        thresholdDb: -16,
        ratio: 2,
        amount: 0.08,
        ceilingDb: -0.6,
      },
    },
  ],
};

function numericParams(params: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!params || typeof params !== "object") return out;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function isPreset(value: unknown): value is WasmInsertPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<WasmInsertPreset>;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.pluginId === "string" &&
    typeof preset.factory === "boolean" &&
    typeof preset.createdAt === "number" &&
    !!preset.params &&
    typeof preset.params === "object"
  );
}

function readUserPresets(): WasmInsertPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isPreset)
      .filter((preset) => !preset.factory)
      .map((preset) => ({ ...preset, params: numericParams(preset.params) }));
  } catch {
    return [];
  }
}

/**
 * Recallable sounds for the live WASM inserts, kept separate from the macro
 * effect-slot presets. Factory banks cover the built-in catalogue; user
 * presets are scoped to a manifest id and survive reloads.
 */
@Injectable({ providedIn: "root" })
export class WasmInsertPresetService {
  readonly presets = signal<WasmInsertPreset[]>(readUserPresets());

  presetsFor(pluginId: string | undefined | null): WasmInsertPreset[] {
    if (!pluginId) return [];
    const factories = (FACTORY_PRESETS[pluginId] ?? []).map(
      (preset, index): WasmInsertPreset => ({
        id: `factory:${pluginId}:${index}`,
        name: preset.name,
        pluginId,
        params: { ...preset.params },
        factory: true,
        createdAt: 0,
      }),
    );
    const user = this.presets()
      .filter((preset) => preset.pluginId === pluginId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return [...factories, ...user];
  }

  save(
    name: string,
    pluginId: string,
    params: Record<string, unknown> | null | undefined,
  ): WasmInsertPreset | null {
    const trimmed = name.trim().slice(0, 48);
    if (!trimmed || !pluginId) return null;
    const preset: WasmInsertPreset = {
      id: `wasm-preset-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      name: trimmed,
      pluginId,
      params: numericParams(params),
      factory: false,
      createdAt: Date.now(),
    };
    this.write([preset, ...this.presets()]);
    return preset;
  }

  remove(id: string): void {
    if (id.startsWith("factory:")) return;
    this.write(this.presets().filter((preset) => preset.id !== id));
  }

  private write(next: WasmInsertPreset[]): void {
    this.presets.set(next);
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full / private mode: keep the in-memory list usable */
    }
  }
}
