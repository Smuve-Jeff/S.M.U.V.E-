import { Injectable, signal } from "@angular/core";

import { writeJsonStore } from "../../services/guarded-storage";
import { reportUnreadableStore } from "../../services/storage-notice";

/** A named snapshot of one macro insert's parameter surface. */
export interface EffectPreset {
  id: string;
  name: string;
  /** Macro effect type (Reverb, Delay, Compressor, ...). */
  type: string;
  params: Record<string, number>;
  createdAt: number;
}

const STORAGE_KEY = "smuve_fx_insert_presets_v1";

function declareUnreadablePresets(): null {
  reportUnreadableStore("Your saved insert presets");
  return null;
}

/** Stored presets, or null when the record cannot be read. */
function readPresets(): EffectPreset[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return declareUnreadablePresets();
    return parsed.filter(isPreset);
  } catch {
    return declareUnreadablePresets();
  }
}

function isPreset(value: unknown): value is EffectPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<EffectPreset>;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.type === "string" &&
    typeof preset.createdAt === "number" &&
    !!preset.params &&
    typeof preset.params === "object"
  );
}

function numericParams(params: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!params || typeof params !== "object") return out;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Insert presets are intentionally tied to the macro effect type, not to a
 * track: a Reverb preset can be recalled on any Reverb slot, while a Delay
 * preset never spills its parameters into a Compressor.
 */
@Injectable({ providedIn: "root" })
export class EffectPresetService {
  private readonly storedPresets = readPresets();
  private readonly presetsReadable = this.storedPresets !== null;
  readonly presets = signal<EffectPreset[]>(this.storedPresets ?? []);

  presetsFor(type: string | undefined): EffectPreset[] {
    if (!type) return [];
    return this.presets()
      .filter((preset) => preset.type === type)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  save(
    name: string,
    type: string,
    params: Record<string, unknown> | null | undefined,
  ): EffectPreset | null {
    const trimmed = name.trim().slice(0, 48);
    if (!trimmed || !type) return null;
    const preset: EffectPreset = {
      id: `fx-preset-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      name: trimmed,
      type,
      params: numericParams(params),
      createdAt: Date.now(),
    };
    this.write([preset, ...this.presets()]);
    return preset;
  }

  remove(id: string): void {
    this.write(this.presets().filter((preset) => preset.id !== id));
  }

  private write(next: EffectPreset[]): void {
    this.presets.set(next);
    if (!this.presetsReadable) {
      // An unreadable preset list is not an empty one; never replace it.
      return;
    }
    writeJsonStore("Your saved insert presets", STORAGE_KEY, next);
  }
}
