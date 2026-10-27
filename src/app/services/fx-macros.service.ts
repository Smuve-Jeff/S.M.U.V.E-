import { Injectable, inject, signal, computed } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService } from './music-manager.service';
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

/** Where the pad points: the mix bus, or the channel being performed. */
export type MacroScope = 'mix' | 'channel';

/**
 * Macro params that have a real per-channel control, mapped to the channel
 * field they drive. The limiter ceiling and the bus compressor exist only on
 * the mix bus, so those two keep acting on it in channel scope — the pad marks
 * each axis with the scope it actually reaches instead of pretending.
 */
const CHANNEL_TARGET_FIELDS: Partial<
  Record<MacroParamKey, 'cutoff' | 'sendA'>
> = {
  masterFilterHz: 'cutoff',
  reverbWet: 'sendA',
};

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
 * One-Finger FX Macro system — drives two parameters simultaneously from a
 * single XY touch surface.
 *
 * Scope: the pad used to be mix-bus only, so a filter sweep performed over a
 * beat ducked the whole arrangement instead of the channel under the hands.
 * `scope` now decides the destination — 'channel' (default) sends the cutoff
 * and reverb targets to the selected channel's filter and aux send, 'mix'
 * keeps the classic master-bus macros. Release/reset restores whichever
 * destination the gesture actually moved.
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
  private channels = inject(MusicManagerService);
  private notify = inject(NotificationService);

  /** Pad destination. Channel scope is the default: a performer means the
   * channel they are playing, not everything that happens to be playing. */
  scope = signal<MacroScope>('channel');

  /** The channel's pre-engage values, restored by release()/reset(). */
  private channelRest: {
    trackId: string;
    cutoff: number;
    sendA: number;
  } | null = null;

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

  /** Switch the pad between the performed channel and the mix bus. */
  setScope(scope: MacroScope): void {
    if (this.scope() === scope) return;
    // Unwind whatever the old destination is holding before moving on, so a
    // half-open filter does not stay behind on a channel nobody is watching.
    this.reset();
    this.scope.set(scope);
  }

  /** The channel this pad addresses, or null when it must fall back to mix. */
  channelTrackId(): string | null {
    if (this.scope() !== 'channel') return null;
    return this.channels.selectedTrackId() ?? null;
  }

  /** HUD scope for one axis: 'channel' only when a channel is really driven. */
  targetScope(spec: MacroTargetSpec): MacroScope {
    return this.channelTrackId() && CHANNEL_TARGET_FIELDS[spec.param]
      ? 'channel'
      : 'mix';
  }

  /** Human summary of what the pad is currently driving. */
  scopeLabel = computed(() => {
    if (this.scope() !== 'channel') return 'MIX BUS';
    const trackId = this.channels.selectedTrackId();
    if (!trackId) return 'MIX BUS · no channel selected';
    const track = this.channels.tracks().find((t) => t.id === trackId);
    return track ? `CHANNEL · ${track.name}` : 'MIX BUS';
  });

  /** Capture the channel's resting values the first time a drag moves it. */
  private rememberChannelRest(trackId: string): void {
    if (this.channelRest && this.channelRest.trackId === trackId) return;
    const track = this.channels.tracks().find((t) => t.id === trackId);
    if (!track) return;
    this.channelRest = {
      trackId,
      cutoff: AudioEngineService.CHANNEL_FILTER_DEFAULT_HZ,
      sendA: track.sendA ?? 0,
    };
  }

  /** Write one channel-scoped value through the same path the mixer uses. */
  private writeChannelValue(
    trackId: string,
    field: 'cutoff' | 'sendA',
    value: number
  ): void {
    if (field === 'cutoff') {
      // The channel filter is live engine state rather than a persisted track
      // field, so it is written straight to the graph (the mixer's own cutoff
      // control does the same).
      this.audio.updateTrack(trackId, {
        cutoff: Math.max(20, Math.min(20000, value)),
      });
      return;
    }
    this.channels.setChannelSend(
      trackId,
      'sendA',
      Math.max(0, Math.min(1, value))
    );
  }

  /** Route a modulated value to the engine. All paths damp with the same
   * 50ms setTargetAtTime window so chained writes inside one drag never pop.
   * Routing is worklet-aware via the engine's master setters. */
  private applyLive(param: MacroParamKey, value: number): void {
    const trackId = this.channelTrackId();
    const field = CHANNEL_TARGET_FIELDS[param];
    if (trackId && field) {
      this.rememberChannelRest(trackId);
      this.writeChannelValue(trackId, field, value);
      return;
    }
    this.applyMix(param, value);
  }

  /** The mix-bus destination (the classic master macros). */
  private applyMix(param: MacroParamKey, value: number): void {
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

  /** Reset parity: restore every param the macros touch to its rest value
   * through the same routed setters the drag used, then snap the HUD position
   * to the derived rest position so UI and audio agree.
   *
   * The two destinations unwind separately: the mix bus always returns to
   * AudioEngineService.MASTER_DEFAULTS (reverb return rest is silence, 0, by
   * design), while a channel gesture returns to what that channel held before
   * the drag started — a filter sweep must not leave the artist's channel shut.
   */
  reset(): void {
    const defaults = AudioEngineService.MASTER_DEFAULTS;
    const m = this.activeMacro();
    try {
      for (const spec of [m.xTarget, m.yTarget]) {
        if (spec.param === 'reverbWet') {
          this.applyMix('reverbWet', 0);
        } else if (spec.param === 'masterFilterHz') {
          this.applyMix('masterFilterHz', defaults.masterFilterHz);
        } else if (spec.param === 'limiterThr') {
          this.applyMix('limiterThr', defaults.limiterThresholdDb);
        } else if (spec.param === 'compressorRatio') {
          this.applyMix('compressorRatio', defaults.compressorRatio);
        }
      }
    } catch {
      /* AudioParam in invalid state — next reset retries. */
    }
    this.restoreChannel();
    this.xyPos.set(this.restXY());
  }

  /** Hand the performed channel back exactly as the drag found it. */
  private restoreChannel(): void {
    const rest = this.channelRest;
    if (!rest) return;
    this.channelRest = null;
    try {
      this.writeChannelValue(rest.trackId, 'cutoff', rest.cutoff);
      this.writeChannelValue(rest.trackId, 'sendA', rest.sendA);
    } catch {
      /* Graph in invalid state — the next gesture re-captures the rest. */
    }
  }
}
