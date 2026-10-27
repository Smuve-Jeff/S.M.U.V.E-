import { Injectable, effect, signal, inject } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { bezierInterpolate, BezierPresets } from "./automation/bezier-utils";

export interface AutomationPoint {
  time: number;
  value: number;
  /** Bezier control handles (only used when interpolation is 'bezier') */
  bezierHandles?: {
    cpIn: { t: number; value: number };
    cpOut: { t: number; value: number };
  };
}

export type AutomationInterpolation = "linear" | "step" | "smooth" | "bezier";

export interface AutomationTarget {
  trackId: string;
  parameter: string; // e.g., 'volume', 'pan', 'cutoff'
  min?: number;
  max?: number;
}

export interface AutomationLane {
  id: string;
  target: AutomationTarget;
  points: AutomationPoint[];
  enabled: boolean;
  interpolation: AutomationInterpolation;
  /** Additional scalar applied to macro bias for this lane. Typical range: 0..1. */
  modulationDepth: number;
  macroId?: string;
}

export type ModulationType = "lfo" | "envelope-follower";

export interface ModulationSource {
  id: string;
  type: ModulationType;
  enabled: boolean;
  amount: number;
  rateHz?: number;
  phaseOffset?: number;
  attack?: number;
  release?: number;
  mappedLaneIds: string[];
}

export interface PerformanceMacro {
  id: string;
  name: string;
  value: number;
  mappings: Array<{
    laneId: string;
    depth: number;
  }>;
}

@Injectable({
  providedIn: "root",
})
export class AutomationService {
  private readonly engine = inject(AudioEngineService);
  private idCounter = 0;

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.idCounter.toString(36)}`;
  }

  lanes = signal<AutomationLane[]>([]);
  modulationSources = signal<ModulationSource[]>([]);
  macros = signal<PerformanceMacro[]>([]);

  /**
   * Automation write. Armed from the arrangement's AUTO button: while it is on
   * and the transport runs, fader and pan moves are captured as keyframes.
   */
  writeEnabled = signal(false);

  /** Last step the curves were evaluated at (the transport repeats steps). */
  private lastAutomationStep = -1;

  constructor() {
    /**
     * Read the curves while the song plays.
     *
     * The lanes, their curves, macros, modulation and the engine bridge all
     * existed, but nothing ever drove them from the transport —
     * `applyAutomation` was only reached by its own spec, so automation was a
     * drawing studio rather than playback. Following the engine's visual step
     * keeps this on the audio clock's schedule (and, in pattern mode, loops the
     * automation with the pattern, the way a DAW does).
     */
    effect(() => {
      const step = this.transportStep();
      if (step === null) {
        this.lastAutomationStep = -1;
        return;
      }
      if (step === this.lastAutomationStep) return;
      this.lastAutomationStep = step;
      if (this.lanes().length === 0) return;
      this.applyAutomation(this.timeAtStep(step), this.stepDurationSeconds());
    });
  }

  /** Seconds per 16th-note step at the current tempo. */
  private stepDurationSeconds(): number {
    const bpm = this.currentTempo();
    return 60 / bpm / 4;
  }

  /** Song position in seconds for a step, on the 16-step bar grid. */
  timeAtStep(step: number): number {
    return Math.max(0, step) * this.stepDurationSeconds();
  }

  private currentTempo(): number {
    const tempo = (this.engine as any).tempo;
    const bpm = typeof tempo === "function" ? tempo() : 120;
    return Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  }

  /**
   * The transport step, or null when nothing is running. Guarded because
   * AutomationService is also reached from non-transport hosts (project
   * import/export, tests) that have no playback state.
   */
  private transportStep(): number | null {
    const isPlaying = (this.engine as any).isPlaying;
    const visualStep = (this.engine as any).visualStep;
    if (typeof isPlaying !== "function" || typeof visualStep !== "function") {
      return null;
    }
    if (!isPlaying()) return null;
    const step = visualStep();
    return Number.isFinite(step) ? step : null;
  }

  /**
   * Write a keyframe at the current transport position. Returns true when one
   * was captured. Only records while write is armed *and* the transport runs:
   * moving a fader while stopped is a mix decision, not automation.
   */
  captureWrite(trackId: string, parameter: string, value: number): boolean {
    if (!this.writeEnabled()) return false;
    const step = this.transportStep();
    if (step === null || !Number.isFinite(value)) return false;

    const lane = this.ensureLane(trackId, parameter);
    const time = this.timeAtStep(step);
    const min = lane.target.min ?? -Infinity;
    const max = lane.target.max ?? Infinity;
    // One keyframe per step: a drag emits dozens of moves, and baking every
    // one would leave a staircase of near-identical points in the lane.
    const points = lane.points.filter(
      (point) => Math.abs(point.time - time) > 0.001,
    );
    points.push({ time, value: Math.min(max, Math.max(min, value)) });
    this.setPoints(lane.id, points);
    return true;
  }

  addLane(
    trackId: string,
    parameter: string,
    options?: {
      interpolation?: AutomationInterpolation;
      min?: number;
      max?: number;
      modulationDepth?: number;
      macroId?: string;
    },
  ) {
    const lane: AutomationLane = {
      id: this.nextId("auto-lane"),
      target: {
        trackId,
        parameter,
        min: options?.min,
        max: options?.max,
      },
      points: [],
      enabled: true,
      interpolation: options?.interpolation ?? "linear",
      modulationDepth: options?.modulationDepth ?? 0,
      macroId: options?.macroId,
    };
    this.lanes.update((lanes) => [...lanes, lane]);
    return lane;
  }

  /**
   * Find an existing lane for (trackId, parameter) or create it lazily.
   * Used by CC automation recording so repeated keyframes land on the same lane.
   */
  ensureLane(
    trackId: string,
    parameter: string,
    options?: {
      interpolation?: AutomationInterpolation;
      min?: number;
      max?: number;
      modulationDepth?: number;
      macroId?: string;
    },
  ): AutomationLane {
    const existing = this.lanes().find(
      (lane) =>
        lane.target.trackId === trackId && lane.target.parameter === parameter,
    );
    if (existing) return existing;
    return this.addLane(trackId, parameter, options);
  }

  removeLane(laneId: string) {
    this.lanes.update((lanes) => lanes.filter((lane) => lane.id !== laneId));
    this.modulationSources.update((sources) =>
      sources.map((source) => ({
        ...source,
        mappedLaneIds: source.mappedLaneIds.filter((id) => id !== laneId),
      })),
    );
    this.macros.update((macros) =>
      macros.map((macro) => ({
        ...macro,
        mappings: macro.mappings.filter((mapping) => mapping.laneId !== laneId),
      })),
    );
  }

  /** Arm/disarm automation write (the arrangement's AUTO button). */
  setWriteEnabled(enabled: boolean) {
    this.writeEnabled.set(!!enabled);
  }

  setLaneEnabled(laneId: string, enabled: boolean) {
    this.lanes.update((lanes) =>
      lanes.map((lane) => (lane.id === laneId ? { ...lane, enabled } : lane)),
    );
  }

  setLaneInterpolation(laneId: string, interpolation: AutomationInterpolation) {
    this.lanes.update((lanes) =>
      lanes.map((lane) =>
        lane.id === laneId ? { ...lane, interpolation } : lane,
      ),
    );
  }

  addPoint(laneId: string, time: number, value: number) {
    this.lanes.update((lanes) => {
      const lane = lanes.find((l) => l.id === laneId);
      if (lane) {
        lane.points.push({ time, value });
        lane.points.sort((a, b) => a.time - b.time);
      }
      return [...lanes];
    });
  }

  removePoint(laneId: string, pointIndex: number) {
    this.lanes.update((lanes) => {
      const lane = lanes.find((l) => l.id === laneId);
      if (lane) {
        lane.points.splice(pointIndex, 1);
      }
      return [...lanes];
    });
  }

  /** Replace the full point list of a lane (used for undo/redo snapshots). */
  setPoints(laneId: string, points: AutomationPoint[]) {
    this.lanes.update((lanes) =>
      lanes.map((lane) =>
        lane.id === laneId
          ? {
              ...lane,
              points: [...points].sort((a, b) => a.time - b.time),
            }
          : lane,
      ),
    );
  }

  /**
   * Move a keyframe in one update (drag edits). Re-sorts the lane and returns
   * the point's new index so the caller can keep dragging it after crossings.
   */
  movePoint(
    laneId: string,
    pointIndex: number,
    time: number,
    value: number,
  ): number {
    let newIndex = -1;
    this.lanes.update((lanes) =>
      lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        const existing = lane.points[pointIndex];
        if (!existing) return lane;
        const moved = { ...existing, time, value };
        const points = lane.points.filter((_, index) => index !== pointIndex);
        points.push(moved);
        points.sort((a, b) => a.time - b.time);
        newIndex = points.indexOf(moved);
        return { ...lane, points };
      }),
    );
    return newIndex;
  }

  updatePoint(
    laneId: string,
    pointIndex: number,
    patch: Partial<AutomationPoint>,
  ) {
    this.lanes.update((lanes) => {
      const lane = lanes.find((l) => l.id === laneId);
      if (lane && lane.points[pointIndex]) {
        lane.points[pointIndex] = { ...lane.points[pointIndex], ...patch };
        lane.points.sort((a, b) => a.time - b.time);
      }
      return [...lanes];
    });
  }

  getValueAtTime(laneId: string, time: number, macroBias = 0): number | null {
    const lane = this.lanes().find((l) => l.id === laneId);
    if (!lane || lane.points.length === 0) return null;

    const points = lane.points;
    let base: number | null = null;
    if (time <= points[0].time) {
      base = points[0].value;
    } else if (time >= points[points.length - 1].time) {
      base = points[points.length - 1].value;
    } else {
      for (let i = 0; i < points.length - 1; i++) {
        if (time >= points[i].time && time <= points[i + 1].time) {
          const ratio =
            (time - points[i].time) / (points[i + 1].time - points[i].time);
          base = this.interpolate(
            points[i].value,
            points[i + 1].value,
            ratio,
            lane.interpolation,
            points[i].time,
            points[i + 1].time,
            points[i].bezierHandles,
          );
          break;
        }
      }
    }

    if (base === null) return null;
    const modulation = this.getModulationContribution(lane, time);
    let value = base + modulation + macroBias * lane.modulationDepth;
    if (typeof lane.target.min === "number") {
      value = Math.max(lane.target.min, value);
    }
    if (typeof lane.target.max === "number") {
      value = Math.min(lane.target.max, value);
    }
    return value;
  }

  private interpolate(
    start: number,
    end: number,
    ratio: number,
    interpolation: AutomationInterpolation,
    startTime?: number,
    endTime?: number,
    bezierHandles?: AutomationPoint["bezierHandles"],
  ): number {
    if (interpolation === "step") {
      return start;
    }
    if (
      interpolation === "bezier" &&
      startTime !== undefined &&
      endTime !== undefined
    ) {
      return bezierInterpolate(
        startTime,
        start,
        endTime,
        end,
        ratio,
        bezierHandles ?? BezierPresets.easeInOut,
      );
    }
    if (interpolation === "smooth") {
      const t = ratio * ratio * (3 - 2 * ratio);
      return start + t * (end - start);
    }
    return start + ratio * (end - start);
  }

  createModulationSource(
    type: ModulationType,
    config?: Partial<ModulationSource>,
  ): ModulationSource {
    const source: ModulationSource = {
      id: this.nextId("auto-mod"),
      type,
      enabled: true,
      amount: config?.amount ?? 0.25,
      rateHz: config?.rateHz ?? 1,
      phaseOffset: config?.phaseOffset ?? 0,
      attack: config?.attack ?? 0.01,
      release: config?.release ?? 0.2,
      mappedLaneIds: config?.mappedLaneIds ?? [],
    };
    this.modulationSources.update((sources) => [...sources, source]);
    return source;
  }

  mapModulationToLane(sourceId: string, laneId: string) {
    this.modulationSources.update((sources) =>
      sources.map((source) =>
        source.id !== sourceId || source.mappedLaneIds.includes(laneId)
          ? source
          : { ...source, mappedLaneIds: [...source.mappedLaneIds, laneId] },
      ),
    );
  }

  unmapModulationFromLane(sourceId: string, laneId: string) {
    this.modulationSources.update((sources) =>
      sources.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              mappedLaneIds: source.mappedLaneIds.filter((id) => id !== laneId),
            }
          : source,
      ),
    );
  }

  createMacro(name: string): PerformanceMacro {
    const macro: PerformanceMacro = {
      id: this.nextId("auto-macro"),
      name,
      value: 0,
      mappings: [],
    };
    this.macros.update((macros) => [...macros, macro]);
    return macro;
  }

  mapMacroToLane(macroId: string, laneId: string, depth = 0.2) {
    this.macros.update((macros) =>
      macros.map((macro) =>
        macro.id !== macroId || macro.mappings.some((m) => m.laneId === laneId)
          ? macro
          : {
              ...macro,
              mappings: [...macro.mappings, { laneId, depth }],
            },
      ),
    );
  }

  setMacroValue(macroId: string, value: number) {
    const clamped = Math.max(-1, Math.min(1, value));
    this.macros.update((macros) =>
      macros.map((macro) =>
        macro.id === macroId ? { ...macro, value: clamped } : macro,
      ),
    );
  }

  private getMacroBiasForLane(lane: AutomationLane): number {
    if (!lane.macroId) return 0;
    const macro = this.macros().find((m) => m.id === lane.macroId);
    if (!macro) return 0;
    const mapping = macro.mappings.find((m) => m.laneId === lane.id);
    if (!mapping) return 0;
    return macro.value * mapping.depth;
  }

  private getModulationContribution(
    lane: AutomationLane,
    time: number,
  ): number {
    let total = 0;
    for (const source of this.modulationSources()) {
      if (!source.enabled || !source.mappedLaneIds.includes(lane.id)) continue;
      if (source.type === "lfo") {
        const phase = (source.phaseOffset ?? 0) + time * (source.rateHz ?? 1);
        total += Math.sin(phase * Math.PI * 2) * source.amount;
        continue;
      }
      if (source.type === "envelope-follower") {
        const atk = Math.max(0.001, source.attack ?? 0.01);
        const rel = Math.max(0.001, source.release ?? 0.2);
        const pulse = ((time % (atk + rel)) / (atk + rel)) * 2 - 1;
        total += Math.max(0, 1 - Math.abs(pulse)) * source.amount;
      }
    }
    return total;
  }

  applyAutomation(time: number, duration: number) {
    const lanes = this.lanes();
    lanes.forEach((lane) => {
      if (!lane.enabled) return;
      const value = this.getValueAtTime(
        lane.id,
        time,
        this.getMacroBiasForLane(lane),
      );
      if (value !== null) {
        this.engine.applyProductionParameter(
          lane.target.trackId,
          lane.target.parameter,
          value,
          duration,
        );
      }
    });
  }

  scheduleAutomation(startTime: number, duration: number, slices = 16) {
    const step = duration / Math.max(1, slices);
    for (let i = 0; i <= slices; i++) {
      this.applyAutomation(startTime + i * step, step);
    }
  }

  getSnapshot() {
    return {
      lanes: this.lanes(),
      modulationSources: this.modulationSources(),
      macros: this.macros(),
    };
  }

  hydrateSnapshot(snapshot: {
    lanes?: AutomationLane[];
    modulationSources?: ModulationSource[];
    macros?: PerformanceMacro[];
  }) {
    this.lanes.set(snapshot.lanes ?? []);
    this.modulationSources.set(snapshot.modulationSources ?? []);
    this.macros.set(snapshot.macros ?? []);
  }
}
