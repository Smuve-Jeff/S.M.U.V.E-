import { IAudioPlugin, PluginParam } from "./plugin-interface";

/**
 * The one description of a macro effect's editable parameters.
 *
 * These specs used to live inside the rack panel, where they described knobs
 * that only wrote `slot.params`: the plugin behind the slot never saw the
 * values, so turning Decay or Threshold changed the panel and nothing else.
 * The DSP plugin classes now build their own `params` from this same table and
 * `bindFxSlotParams()` pushes a slot's values into them, which makes the panel,
 * the live graph and the offline bounce read from one source.
 */

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
    { id: "wet", label: "Wet", min: 0, max: 100, unit: "%", default: 60 },
    { id: "dry", label: "Dry", min: 0, max: 100, unit: "%", default: 40 },
    {
      id: "decay",
      label: "Decay",
      min: 0.1,
      max: 10,
      step: 0.1,
      unit: "s",
      default: 2.5,
    },
    { id: "size", label: "Size", min: 0, max: 100, unit: "%", default: 50 },
    {
      id: "preDelay",
      label: "Pre-Delay",
      min: 0,
      max: 200,
      unit: "ms",
      default: 20,
    },
    {
      id: "damping",
      label: "Damping",
      min: 0,
      max: 100,
      unit: "%",
      default: 30,
    },
  ],
  Delay: [
    { id: "wet", label: "Wet", min: 0, max: 100, unit: "%", default: 40 },
    { id: "dry", label: "Dry", min: 0, max: 100, unit: "%", default: 60 },
    { id: "time", label: "Time", min: 0, max: 2000, unit: "ms", default: 250 },
    {
      id: "feedback",
      label: "Feedback",
      min: 0,
      max: 95,
      unit: "%",
      default: 35,
    },
    { id: "tone", label: "Tone", min: 0, max: 100, unit: "%", default: 50 },
  ],
  Compressor: [
    {
      id: "threshold",
      label: "Threshold",
      min: -60,
      max: 0,
      step: 0.5,
      unit: "dB",
      default: -24,
    },
    { id: "ratio", label: "Ratio", min: 1, max: 20, step: 0.5, default: 4 },
    {
      id: "attack",
      label: "Attack",
      min: 1,
      max: 200,
      unit: "ms",
      default: 10,
    },
    {
      id: "release",
      label: "Release",
      min: 20,
      max: 1000,
      unit: "ms",
      default: 120,
    },
    {
      id: "makeup",
      label: "Makeup",
      min: 0,
      max: 24,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
    { id: "mix", label: "Mix", min: 0, max: 100, unit: "%", default: 100 },
  ],
  EQ: [
    {
      id: "sub",
      label: "Sub 40",
      min: -18,
      max: 18,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
    {
      id: "low",
      label: "Low 120",
      min: -18,
      max: 18,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
    {
      id: "mid",
      label: "Mid 800",
      min: -18,
      max: 18,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
    {
      id: "high",
      label: "High 4k",
      min: -18,
      max: 18,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
    {
      id: "air",
      label: "Air 12k",
      min: -18,
      max: 18,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
    { id: "q", label: "Q", min: 0.2, max: 8, step: 0.1, default: 1 },
  ],
  Saturation: [
    { id: "drive", label: "Drive", min: 0, max: 100, unit: "%", default: 20 },
    { id: "tone", label: "Tone", min: 0, max: 100, unit: "%", default: 50 },
    { id: "mix", label: "Mix", min: 0, max: 100, unit: "%", default: 100 },
    {
      id: "output",
      label: "Output",
      min: -12,
      max: 12,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
  ],
  Chorus: [
    {
      id: "rate",
      label: "Rate",
      min: 0.05,
      max: 8,
      step: 0.05,
      unit: "Hz",
      default: 0.8,
    },
    { id: "depth", label: "Depth", min: 0, max: 100, unit: "%", default: 40 },
    { id: "mix", label: "Mix", min: 0, max: 100, unit: "%", default: 35 },
  ],
  Filter: [
    {
      id: "cutoff",
      label: "Cutoff",
      min: 20,
      max: 20000,
      unit: "Hz",
      default: 12000,
    },
    {
      id: "resonance",
      label: "Reso",
      min: 0,
      max: 100,
      unit: "%",
      default: 10,
    },
    { id: "drive", label: "Drive", min: 0, max: 100, unit: "%", default: 0 },
  ],
  Limiter: [
    {
      id: "ceiling",
      label: "Ceiling",
      min: -12,
      max: 0,
      step: 0.1,
      unit: "dB",
      default: -0.3,
    },
    {
      id: "release",
      label: "Release",
      min: 10,
      max: 500,
      unit: "ms",
      default: 80,
    },
    {
      id: "gain",
      label: "Input Gain",
      min: -12,
      max: 24,
      step: 0.5,
      unit: "dB",
      default: 0,
    },
  ],
};

/** Generic wet/dry fallback for slot types without a bespoke spec. */
export const FALLBACK_SPEC: FxParamSpec[] = [
  { id: "wet", label: "Wet", min: 0, max: 100, unit: "%", default: 60 },
  { id: "dry", label: "Dry", min: 0, max: 100, unit: "%", default: 40 },
  { id: "amount", label: "Amount", min: 0, max: 100, unit: "%", default: 50 },
];

/** Plugin parameter descriptors for a slot type, built from its panel specs. */
export function slotPluginParams(type: string): PluginParam[] {
  const specs = FX_PARAM_SPECS[type] ?? FALLBACK_SPEC;
  return specs.map((spec) => ({
    id: spec.id,
    name: spec.label,
    value: spec.default,
    defaultValue: spec.default,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    unit: spec.unit,
  }));
}

/**
 * Push a slot's stored knob values into its live plugin.
 *
 * Ids come from `FX_PARAM_SPECS`, which is exactly what the plugins expose, so
 * this is a straight assignment with clamping handled by each `setParam`. A
 * value the plugin does not know is skipped rather than written to a random
 * parameter — a slot created before a spec change must not move something else.
 */
export function bindFxSlotParams(
  plugin: IAudioPlugin,
  params: Record<string, unknown> | undefined | null,
): void {
  if (!params || !plugin) return;
  const descriptors = (plugin as IAudioPlugin).params;
  // Hosts and tests hand the rack stub plugins; a slot must never throw
  // because the insert has no parameter list.
  if (!Array.isArray(descriptors)) return;
  for (const param of descriptors) {
    const raw = params[param.id];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) continue;
    plugin.setParam(param.id, value);
  }
}
