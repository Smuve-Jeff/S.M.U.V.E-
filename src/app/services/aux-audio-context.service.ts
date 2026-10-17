import { Injectable, OnDestroy, inject } from '@angular/core';
import { LoggingService } from './logging.service';

/** Latency intent for an auxiliary audio graph. */
export type AuxLatencyHint = 'interactive' | 'playback';

/**
 * Auxiliary audio graph hygiene.
 *
 * S.M.U.V.E. runs several audio graphs that are *not* the studio engine: a
 * co-write preview, the haptic click, the voice-activity analyser on a call,
 * the stem-separation worklet, a decode-only vocal analysis and the recorder's
 * level meter. Each of them used to call `new AudioContext()` with no
 * `latencyHint`, so every one of them asked the host for an interactive
 * (small-buffer, CPU-hungry) output stream that then competes with the primary
 * engine for the audio device.
 *
 * This service is the single place those graphs are created, which makes the
 * intent explicit and testable:
 *
 *  - `analysisContext()` — one shared context for work that only decodes or
 *    measures. Never connected to the destination, so it never competes for
 *    playback, and it is reused instead of being built and closed per call.
 *  - `createAuxContext(hint)` — an owned, one-shot context the caller closes.
 *    Work with no real-time requirement asks for `'playback'` (the host is free
 *    to pick a larger, cheaper buffer); work a human hears in real time —
 *    monitoring, preview, the feedback click — asks for `'interactive'`.
 *    The one-shot graphs that a human hears immediately (co-write preview,
 *    haptic click, recorder meter) construct their context inline with the same
 *    explicit hint, because they close it themselves and need no shared state;
 *    the policy lives here so the reason is in one place.
 *  - `attachSilentSink()` — a zero-gain path to the destination. Web Audio only
 *    pulls a node that reaches the destination, so an analyser or a
 *    `numberOfInputs: 0` worklet with no sink never runs at all.
 *    `StudioRecordingEngineService` already relies on this trick; this is the
 *    same guarantee for the auxiliary graphs.
 */
@Injectable({ providedIn: 'root' })
export class AuxAudioContextService implements OnDestroy {
  private logger = inject(LoggingService, { optional: true });

  private analysis: AudioContext | null = null;
  /** Sinks owned by this service, disconnected on destroy. */
  private sinks: GainNode[] = [];

  /**
   * Shared context for decode / measure work. The same instance is returned for
   * every caller: it is never connected to the destination, so there is no
   * reason to open (and pay for) a second one.
   */
  analysisContext(): AudioContext {
    if (!this.analysis) {
      this.analysis = this.createAuxContext('playback');
    }
    return this.analysis;
  }

  /**
   * Create an auxiliary context the caller owns and is expected to close.
   * `'playback'` is the default because an auxiliary graph usually has no
   * real-time requirement — a stale interactive stream is the costly mistake.
   */
  createAuxContext(latencyHint: AuxLatencyHint = 'playback'): AudioContext {
    return new AudioContext({ latencyHint });
  }

  /**
   * Give `node` a zero-gain path to the destination so the audio graph actually
   * pulls it. Returns the sink (the caller may disconnect it early), or null
   * when the host refuses the wiring — a missing analyser reading must never
   * throw through a call setup or a separation run.
   */
  attachSilentSink(context: AudioContext, node: AudioNode): GainNode | null {
    try {
      const sink = context.createGain();
      sink.gain.value = 0;
      node.connect(sink);
      sink.connect(context.destination);
      this.sinks.push(sink);
      return sink;
    } catch (error) {
      this.logger?.warn(
        'AuxAudio: could not attach the silent processing sink.',
        error
      );
      return null;
    }
  }

  ngOnDestroy(): void {
    for (const sink of this.sinks) {
      try {
        sink.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.sinks = [];
    const analysis = this.analysis;
    this.analysis = null;
    if (analysis) {
      void Promise.resolve(analysis.close?.()).catch(() => undefined);
    }
  }
}
