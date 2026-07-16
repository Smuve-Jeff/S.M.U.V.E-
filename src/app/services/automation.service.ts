import { Injectable, inject, signal } from '@angular/core';
import { HistoryService } from './history.service';

export type CurveType = 'linear' | 'hold' | 'exp';

export interface Keyframe {
  id: string;
  /** Playback step (0..loopLengthSteps) */
  step: number;
  /** Target value (will be clamped to ParamTarget's min/max before applying) */
  value: number;
  curve: CurveType;
}

export interface AutomationLane {
  id: string;
  trackId: string;
  /** Stable param key (e.g. 'filterF', 'limiterThr', 'volume') */
  param: string;
  keyframes: Keyframe[];
  enabled: boolean;
}

/**
 * Binding from an automation lane → audio side. Multiple targets
 * can be registered against the same (trackId, param) key so
 * the macro pad and a future lane UI can drive the same AudioParam
 * without race conditions.
 */
export interface ParamTarget {
  audioParam: AudioParam;
  min: number;
  max: number;
}

@Injectable({ providedIn: 'root' })
export class AutomationService {
  private history = inject(HistoryService);
  lanes = signal<AutomationLane[]>([]);
  private targets = new Map<string, ParamTarget[]>();

  canUndo = this.history.canUndo;
  canRedo = this.history.canRedo;
  undoCount = this.history.undoCount;
  redoCount = this.history.redoCount;

  /** Add (or stack onto) a binding from a lane key to a real AudioParam. */
  registerTarget(trackId: string, param: string, target: ParamTarget): void {
    const key = `${trackId}:${param}`;
    const list = this.targets.get(key) ?? [];
    list.push(target);
    this.targets.set(key, list);
    // Lazily create a lane for first sighting so downstream code can
    // just write keyframes without explicit lane-set bookkeeping.
    if (!this.lanes().find((l) => l.trackId === trackId && l.param === param)) {
      this.lanes.update((list2) => [
        ...list2,
        {
          id: 'lane_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          trackId,
          param,
          keyframes: [],
          enabled: true,
        },
      ]);
    }
  }

  addKeyframe(
    trackId: string,
    param: string,
    kf: Omit<Keyframe, 'id'>
  ): string | null {
    const lane = this.lanes().find(
      (l) => l.trackId === trackId && l.param === param
    );
    if (!lane) return null;
    const id =
      'kf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const before = this.clone(lane.keyframes);
    const after = [...lane.keyframes, { ...kf, id }].sort(
      (a, b) => a.step - b.step
    );
    this.history.execute({
      name: 'Add Keyframe',
      execute: () =>
        this.lanes.update((list) =>
          list.map((l) =>
            l.id === lane.id ? { ...l, keyframes: after } : l
          )
        ),
      undo: () =>
        this.lanes.update((list) =>
          list.map((l) =>
            l.id === lane.id ? { ...l, keyframes: before } : l
          )
        ),
    });
    return id;
  }

  removeKeyframe(laneId: string, keyframeId: string): void {
    const lane = this.lanes().find((l) => l.id === laneId);
    if (!lane) return;
    const before = this.clone(lane.keyframes);
    const after = lane.keyframes.filter((k) => k.id !== keyframeId);
    this.history.execute({
      name: 'Remove Keyframe',
      execute: () =>
        this.lanes.update((list) =>
          list.map((l) =>
            l.id === laneId ? { ...l, keyframes: after } : l
          )
        ),
      undo: () =>
        this.lanes.update((list) =>
          list.map((l) =>
            l.id === laneId ? { ...l, keyframes: before } : l
          )
        ),
    });
  }

  setLaneEnabled(laneId: string, enabled: boolean): void {
    this.lanes.update((list) =>
      list.map((l) => (l.id === laneId ? { ...l, enabled } : l))
    );
  }

  /** Push interpolated value to all registered AudioParams for a (trackId, param). */
  applyAtStep(
    trackId: string,
    param: string,
    step: number,
    audioTime: number
  ): void {
    const lane = this.lanes().find(
      (l) => l.trackId === trackId && l.param === param
    );
    if (!lane || !lane.enabled || lane.keyframes.length === 0) return;
    const value = this.interpolate(lane.keyframes, step);
    if (value === null) return;
    const targets = this.targets.get(`${trackId}:${param}`) ?? [];
    targets.forEach((t) => {
      const clamped = Math.max(t.min, Math.min(t.max, value));
      try {
        t.audioParam.setValueAtTime(clamped, audioTime);
      } catch (_e) {
        /* AudioParam in invalid state — silently skip */
      }
    });
  }

  /** Linear/hold interpolation across keyframes. Returns null if step is outside range. */
  interpolate(kfs: Keyframe[], step: number): number | null {
    if (kfs.length === 0) return null;
    if (kfs.length === 1) return kfs[0].value;
    if (step < kfs[0].step || step > kfs[kfs.length - 1].step) return null;
    let prev = kfs[0];
    let next = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (kfs[i].step <= step && kfs[i + 1].step >= step) {
        prev = kfs[i];
        next = kfs[i + 1];
        break;
      }
    }
    if (step <= prev.step) return prev.value;
    if (prev.curve === 'hold') return prev.value;
    const span = Math.max(0.0001, next.step - prev.step);
    const ratio = (step - prev.step) / span;
    return prev.value + (next.value - prev.value) * ratio;
  }

  /** Iterate all enabled lanes — call from scheduler to step-paint the mix. */
  applyAllAtStep(step: number, audioTime: number): void {
    this.lanes().forEach((l) =>
      this.applyAtStep(l.trackId, l.param, step, audioTime)
    );
  }

  clear(): void {
    this.lanes.set([]);
    this.targets.clear();
  }

  private clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }
}
