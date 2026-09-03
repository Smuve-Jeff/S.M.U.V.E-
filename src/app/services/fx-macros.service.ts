import { Injectable, inject, signal, computed } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { NotificationService } from './notification.service';

export type MacroId =
  | 'filter-sweep'
  | 'wobble'
  | 'tape-stop'
  | 'glitch'
  | 'delay-trail';

export type MacroParamKey =
  | 'masterFilterHz'
  | 'limiterThr'
  | 'compressorRatio'
  | 'reverbWet';

/** Where a target sits when the macro is at rest — the exact value every
 * reset path returns the engine to. The XY position that maps to it is
 * derived per macro (see restX/restY) so the dot and the engine agree. */
export interface MacroTargetSpec {
  /** Stable param key (matched by switch in applyLive) */
  param: MacroParamKey;
  /** Min value at XY(0) */
  min: number;
  /** Max value at XY(1) */
  max: number;
  /** Curve shape across the XY axis */
  curve: 'linear' | 'exp';
  /** Human-readable HUD label */
  label: string;
  /** Resting (neutral) value the engine returns to on release. */
  rest: number;
}

export interface MacroPreset {
  id: MacroId;
  name: string;
  glyph: string;
  description: string;
  xTarget: MacroTargetSpec;
  yTarget: MacroTargetSpec;
  /** Track accent color */
  color: string;
}

/**
 * One-Finger FX Macro system — drives 2 master-bus parameters
 * simultaneously from a single XY touch surface.
 *
 * Reset parity contract:
 *  - Every target declares its `rest` value; AudioEngineService.MASTER_DEFAULTS
 *    is the canonical source for those numbers.
 *  - Releasing the pad (or hitting RESET) returns every modulated param to its
 *    rest value via the same routed setters the drag itself used, and snaps
 *    the XY position to the derived rest position — so the HUD dot, the
 *    readouts, and the actual audio state always agree.
 *
 * Every ramp uses `setTargetAtTime(value, ctx.currentTime, 0.05)`
 * (50ms exponential settle) so chained parameter writes inside
 * one drag don't pop.
 */
@Injectable({ providedIn: 'root' })
export class FxMacrosService {
  private audio = inject(AudioEngineService);
  private notify = inject(NotificationService);

  presets: MacroPreset[] = [
    {
      id: 'filter-sweep',
      name: 'Filter Sweep',
      glyph: '🎚',
      description: 'X = Cutoff · Y = Limiter drive',
      xTarget: {
        param: 'masterFilterHz',
        min: 200,
        max: 20000,
        curve: 'exp',
        label: 'Cutoff',
        rest: 20000,
      },
      yTarget: {
        param: 'limiterThr',
        min: -20,
        max: -0.5,
        curve: 'linear',
        label: 'Limiter',
        rest: -0.5,
      },
      color: '#FFB627',
    },
    {
      id: 'wobble',
      name: 'Wobble Bass',
      glyph: '🌀',
      description: 'X = Comp Ratio · Y = Limiter',
      xTarget: {
        param: 'compressorRatio',
        min: 1.5,
        max: 12,
        curve: 'linear',
        label: 'Comp',
        rest: 4,
      },
      yTarget: {
        param: 'limiterThr',
        min: -20,
        max: -0.5,
        curve: 'linear',
        label: 'Limiter',
        rest: -0.5,
      },
      color: '#FF1A4D',
    },
    {
      id: 'tape-stop',
      name: 'Tape Stop',
      glyph: '📼',
      description: 'X = Reverb · Y = Filter drop',
      xTarget: {
        param: 'reverbWet',
        min: 0,
        max: 1,
        curve: 'linear',
        label: 'Reverb',
        rest: 0,
      },
      yTarget: {
        param: 'masterFilterHz',
        min: 80,
        max: 20000,
        curve: 'exp',
        label: 'Filter',
        rest: 20000,
      },
      color: '#8B5CF6',
    },
    {
      id: 'glitch',
      name: 'Glitch Stutter',
      glyph: '⚡',
      description: 'X = Limiter · Y = Reverb spray',
      xTarget: {
        param: 'limiterThr',
        min: -20,
        max: -0.5,
        curve: 'exp',
        label: 'Limiter',
        rest: -0.5,
      },
      yTarget: {
        param: 'reverbWet',
        min: 0,
        max: 0.8,
        curve: 'linear',
        label: 'Reverb',
        rest: 0,
      },
      color: '#34F5C5',
    },
    {
      id: 'delay-trail',
      name: 'Delay Trail',
      glyph: '🌫',
      description: 'X = Comp · Y = Reverb',
      xTarget: {
        param: 'compressorRatio',
        min: 1.5,
        max: 12,
        curve: 'linear',
        label: 'Comp',
        rest: 4,
      },
      yTarget: {
        param: 'reverbWet',
        min: 0,
        max: 1,
        curve: 'linear',
        label: 'Reverb',
        rest: 0,
      },
      color: '#0E7C7B',
    },
  ];

  activeMacroId = signal<MacroId>('filter-sweep');
  /** 0..1 normalized XY position. Initialized to the derived rest position
   * in the constructor so the HUD truthfully reflects engine state on load. */
  xyPos = signal<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  engaged = signal(false);

  constructor() {
    this.xyPos.set(this.restXY());
  }

  activeMacro = computed(
    () => this.presets.find((p) => p.id === this.activeMacroId())!
  );

  /** Inverse-curve: which normalized XY position produces `value`. */
  private unScale(
    value: number,
    min: number,
    max: number,
    curve: 'linear' | 'exp'
  ): number {
    const v = Math.max(min, Math.min(max, value));
    if (curve === 'exp' && min > 0 && max > 0) {
      return Math.log(v / min) / Math.log(max / min);
    }
    return (v - min) / (max - min);
  }

  /** The XY position that maps to a target's rest value. */
  restPosition(spec: MacroTargetSpec): number {
    return this.unScale(spec.rest, spec.min, spec.max, spec.curve);
  }

  /** Derived rest position for the active macro — where the dot parks. */
  restXY = computed(() => {
    const m = this.activeMacro();
    return { x: this.restPosition(m.xTarget), y: this.restPosition(m.yTarget) };
  });

  /** Live computed: scaled values + formatted labels for the HUD readout. */
  currentValues = computed(() => {
    const m = this.activeMacro();
    const xy = this.xyPos();
    const xV = this.scale(xy.x, m.xTarget.min, m.xTarget.max, m.xTarget.curve);
    const yV = this.scale(xy.y, m.yTarget.min, m.yTarget.max, m.yTarget.curve);
    return {
      x: xV,
      y: yV,
      xLabel: this.formatValue(m.xTarget.param, xV),
      yLabel: this.formatValue(m.yTarget.param, yV),
    };
  });

  setXY(x: number, y: number): void {
    this.xyPos.set({ x, y });
    const m = this.activeMacro();
    const xV = this.scale(x, m.xTarget.min, m.xTarget.max, m.xTarget.curve);
    const yV = this.scale(y, m.yTarget.min, m.yTarget.max, m.yTarget.curve);
    this.applyLive(m.xTarget.param, xV);
    this.applyLive(m.yTarget.param, yV);
  }

  /** Route a modulated value to the engine. All paths damp with the same
   * 50ms setTargetAtTime window so chained writes inside one drag never pop.
   * Routing is worklet-aware via the engine's master setters. */
  private applyLive(param: MacroParamKey, value: number): void {
    switch (param) {
      case 'masterFilterHz':
        this.audio.setMasterFilterHz(value);
        break;
      case 'limiterThr':
        this.audio.setMasterLimiterThreshold(value);
        break;
      case 'compressorRatio':
        this.audio.setMasterCompressorRatio(value);
        break;
      case 'reverbWet':
        this.audio.setMasterReverbWet(value);
        break;
    }
  }

  private scale(
    v: number,
    min: number,
    max: number,
    curve: 'linear' | 'exp'
  ): number {
    v = Math.max(0, Math.min(1, v));
    if (curve === 'exp' && min > 0 && max > 0) {
      return min * Math.pow(max / min, v);
    }
    return min + (max - min) * v;
  }

  private formatValue(param: MacroParamKey, value: number): string {
    switch (param) {
      case 'masterFilterHz':
        return value >= 1000
          ? (value / 1000).toFixed(1) + 'k Hz'
          : Math.round(value) + ' Hz';
      case 'limiterThr':
        return value.toFixed(1) + ' dB';
      case 'compressorRatio':
        return value.toFixed(1) + ':1';
      case 'reverbWet':
        return Math.round(value * 100) + '%';
      default:
        return value.toFixed(2);
    }
  }

  setMacro(id: MacroId): void {
    // Park the dot at the new macro's rest position and return any params the
    // previous macro left modulated to their rest values first.
    this.reset();
    this.activeMacroId.set(id);
    this.xyPos.set(this.restXY());
    const p = this.presets.find((x) => x.id === id);
    this.notify.show('FX Macro · ' + (p?.name ?? id), 'info');
  }

  engage(): void {
    this.engaged.set(true);
  }

  release(): void {
    this.engaged.set(false);
    this.reset();
  }

  /** Reset parity: restore every engine param the macros touch to its rest
   * value through the same routed setters the drag used, then snap the HUD
   * position to the derived rest position so UI and audio agree.
   * Rest values come from AudioEngineService.MASTER_DEFAULTS, except reverb
   * return whose rest is silence (0) by design. */
  reset(): void {
    const defaults = AudioEngineService.MASTER_DEFAULTS;
    const m = this.activeMacro();
    try {
      for (const spec of [m.xTarget, m.yTarget]) {
        if (spec.param === 'reverbWet') {
          this.applyLive('reverbWet', 0);
        } else if (spec.param === 'masterFilterHz') {
          this.applyLive('masterFilterHz', defaults.masterFilterHz);
        } else if (spec.param === 'limiterThr') {
          this.applyLive('limiterThr', defaults.limiterThresholdDb);
        } else if (spec.param === 'compressorRatio') {
          this.applyLive('compressorRatio', defaults.compressorRatio);
        }
      }
    } catch {
      /* AudioParam in invalid state — next reset retries. */
    }
    this.xyPos.set(this.restXY());
  }
}
