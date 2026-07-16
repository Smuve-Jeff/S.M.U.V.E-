import { Injectable, inject, signal, computed } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { NotificationService } from './notification.service';

export type MacroId =
  | 'filter-sweep'
  | 'wobble'
  | 'tape-stop'
  | 'glitch'
  | 'delay-trail';

export interface MacroTargetSpec {
  /** Stable param key (matched by switch in applyLive) */
  param: string;
  /** Min value at XY(0) */
  min: number;
  /** Max value at XY(1) */
  max: number;
  /** Curve shape across the XY axis */
  curve: 'linear' | 'exp';
  /** Human-readable HUD label */
  label: string;
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
 * One-Finger FX Macro system — drives 2 audio-engine parameters
 * simultaneously from a single XY touch surface.
 *
 * Every ramp uses `setTargetAtTime(value, ctx.currentTime, 0.05)`
 * (50ms exponential settle) so chained parameter writes inside
 * one drag don't pop.  Reset() snaps all targets back to defaults.
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
        param: 'filterF',
        min: 200,
        max: 18000,
        curve: 'exp',
        label: 'Cutoff',
      },
      yTarget: {
        param: 'limiterThr',
        min: -20,
        max: -0.5,
        curve: 'linear',
        label: 'Limiter',
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
      },
      yTarget: {
        param: 'limiterThr',
        min: -20,
        max: -0.5,
        curve: 'linear',
        label: 'Limiter',
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
      },
      yTarget: {
        param: 'filterF',
        min: 80,
        max: 18000,
        curve: 'exp',
        label: 'Filter',
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
        max: -1,
        curve: 'exp',
        label: 'Limiter',
      },
      yTarget: {
        param: 'reverbWet',
        min: 0,
        max: 0.8,
        curve: 'linear',
        label: 'Reverb',
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
      },
      yTarget: {
        param: 'reverbWet',
        min: 0,
        max: 1,
        curve: 'linear',
        label: 'Reverb',
      },
      color: '#0E7C7B',
    },
  ];

  activeMacroId = signal<MacroId>('filter-sweep');
  /** 0..1 normalized XY position. Default = center (no modulation). */
  xyPos = signal<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  engaged = signal(false);

  activeMacro = computed(
    () => this.presets.find((p) => p.id === this.activeMacroId())!
  );

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
    const t = this.audio.ctx.currentTime;
    const tau = 0.05;
    const xV = this.scale(x, m.xTarget.min, m.xTarget.max, m.xTarget.curve);
    const yV = this.scale(y, m.yTarget.min, m.yTarget.max, m.yTarget.curve);
    this.applyLive(m.xTarget.param, xV, t, tau);
    this.applyLive(m.yTarget.param, yV, t, tau);
  }

  private applyLive(
    param: string,
    value: number,
    t: number,
    tau: number
  ): void {
    try {
      switch (param) {
        case 'filterF':
          this.audio.masterEQ.frequency.setTargetAtTime(value, t, tau);
          break;
        case 'limiterThr':
          this.audio.limiter.threshold.setTargetAtTime(value, t, tau);
          break;
        case 'compressorRatio':
          this.audio.compressor.ratio.setTargetAtTime(value, t, tau);
          break;
        case 'reverbWet':
          this.audio.reverbWet.gain.setTargetAtTime(value, t, tau);
          break;
        case 'masterRate':
          this.audio.setDeckRate('A', value);
          this.audio.setDeckRate('B', value);
          break;
      }
    } catch (_e) {
      /* AudioParam in invalid state — silently skip */
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

  private formatValue(param: string, value: number): string {
    switch (param) {
      case 'filterF':
        return value >= 1000
          ? (value / 1000).toFixed(1) + 'k Hz'
          : Math.round(value) + ' Hz';
      case 'limiterThr':
        return value.toFixed(1) + ' dB';
      case 'compressorRatio':
        return value.toFixed(1) + ':1';
      case 'reverbWet':
        return Math.round(value * 100) + '%';
      case 'masterRate':
        return value.toFixed(2) + 'x';
      default:
        return value.toFixed(2);
    }
  }

  setMacro(id: MacroId): void {
    this.activeMacroId.set(id);
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

  reset(): void {
    const t = this.audio.ctx.currentTime;
    try {
      this.audio.masterEQ.frequency.setTargetAtTime(20000, t, 0.05);
      this.audio.limiter.threshold.setTargetAtTime(-1, t, 0.05);
      this.audio.compressor.ratio.setTargetAtTime(4, t, 0.05);
      this.audio.reverbWet.gain.setTargetAtTime(0, t, 0.05);
    } catch (_e) {
      /* */
    }
  }
}
