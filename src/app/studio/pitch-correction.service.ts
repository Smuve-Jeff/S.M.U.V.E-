import { Injectable, signal, inject, effect } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

/** Root-note → semitone offset (0 = C). */
const ROOT_SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

/** Scale name → semitone intervals from the root. */
const SCALE_INTERVALS: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Melodic Minor': [0, 2, 3, 5, 7, 9, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

@Injectable({
  providedIn: 'root',
})
export class PitchCorrectionService {
  enabled = signal(false);
  amount = signal(0.5); // 0 to 1
  retuneSpeed = signal(0.1); // 0 to 1
  scale = signal<string>('C Major');

  private engine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private readonly ctx = this.engine.ctx;

  // Insertion chain: source → inputGain → [worklet] → outputGain → next stage.
  // The default inputGain→outputGain edge is a clean bypass until the
  // worklet loads (or when the browser can't provide AudioWorklet).
  private readonly inputGain = this.ctx.createGain();
  private readonly outputGain = this.ctx.createGain();
  private workletNode: AudioWorkletNode | null = null;
  private workletReady: Promise<AudioWorkletNode | null> | null = null;

  constructor() {
    this.inputGain.gain.value = 1;
    this.outputGain.gain.value = 1;
    this.inputGain.connect(this.outputGain);

    // Keep the worklet config in sync with the UI knobs. The effect only
    // reads the signals, so there is no feedback loop.
    effect(() => {
      this.enabled();
      this.amount();
      this.retuneSpeed();
      this.scale();
      this.pushConfig();
    });
  }

  /**
   * Insert the pitch-correction stage into an audio chain. Disconnects the
   * source (e.g. the mic analyser) and re-routes it through the correction
   * stage; returns the node the rest of the chain should connect from, or
   * null when the source is unusable (caller falls back to the raw source).
   */
  async insertIntoChain(source: AudioNode): Promise<AudioNode | null> {
    const src = source as AudioNode & {
      disconnect?: () => void;
      connect?: (dest: AudioNode) => void;
      context?: AudioContext;
    };
    if (!src || typeof src.connect !== 'function') return null;
    try {
      src.disconnect?.();
    } catch {
      /* already disconnected */
    }
    await this.ensureWorklet((src.context ?? this.ctx) as AudioContext);
    try {
      src.connect(this.inputGain);
    } catch {
      /* source may be closed */
    }
    // When the worklet is unavailable the bypass edge input→output stays
    // intact, so outputGain is always a valid continuation point for the
    // rest of the vocal chain.
    return this.outputGain;
  }

  /** Current DSP parameter snapshot (UI readouts / persistence). */
  getProcessingParams() {
    return {
      enabled: this.enabled(),
      amount: this.amount(),
      retuneSpeed: this.retuneSpeed(),
      scale: this.scale(),
    };
  }

  // ── Private ────────────────────────────────────────────────

  private async ensureWorklet(
    ctx: AudioContext
  ): Promise<AudioWorkletNode | null> {
    if (this.workletNode) return this.workletNode;
    if (this.workletReady) return this.workletReady;

    this.workletReady = (async () => {
      try {
        await ctx.audioWorklet.addModule(
          'assets/worklets/pitch-corrector.worklet.js'
        );
        const node = new AudioWorkletNode(ctx, 'pitch-corrector', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        });
        // Swap the bypass edge for the processed path.
        this.inputGain.disconnect(this.outputGain);
        this.inputGain.connect(node);
        node.connect(this.outputGain);
        this.workletNode = node;
        this.pushConfig();
        this.logger.info(
          'PitchCorrection: real-time pitch-corrector worklet active'
        );
        return node;
      } catch (err: any) {
        this.logger.warn(
          'PitchCorrection: worklet unavailable — staying bypassed',
          err?.message
        );
        return null;
      }
    })();

    return this.workletReady;
  }

  private pushConfig(): void {
    if (!this.workletNode) return;
    const { root, scaleNotes } = this.parseScale(this.scale());
    try {
      this.workletNode.port.postMessage({
        type: 'config',
        enabled: this.enabled(),
        amount: this.amount(),
        retuneSpeed: this.retuneSpeed(),
        root,
        scaleNotes,
      });
    } catch {
      /* port closed */
    }
  }

  private parseScale(label: string): {
    root: number;
    scaleNotes: number[];
  } {
    const trimmed = (label || 'C Major').trim();
    const match = trimmed.match(/^([A-G](?:#|b)?)\s*(.*)$/);
    const root =
      match && ROOT_SEMITONES[match[1]] !== undefined
        ? ROOT_SEMITONES[match[1]]
        : 0;
    const name = match?.[2]?.trim() || 'Major';
    return {
      root,
      scaleNotes: SCALE_INTERVALS[name] || SCALE_INTERVALS['Major'],
    };
  }
}
