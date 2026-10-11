import { Injectable, inject, signal, computed } from '@angular/core';
import { AiService } from './ai.service';
import { LoggingService } from './logging.service';

/**
 * Measured features of an uploaded vocal take. Extracted from the raw samples
 * so the model reviews evidence instead of a bare instruction.
 */
export interface VocalAnalysis {
  durationSeconds: number;
  peakDb: number;
  rmsDb: number;
  /** Peak-to-RMS distance — a proxy for dynamic range / compression need. */
  crestDb: number;
  silentRatio: number;
  clippedSamples: number;
  sampleRate: number;
  channels: number;
}

/**
 * Pure, browser-free analysis of a decoded vocal buffer. Exported so it can be
 * unit tested with a hand-built buffer and reused by any surface.
 */
export function analyzeVocalBuffer(buffer: AudioBuffer): VocalAnalysis {
  const channel = buffer.getChannelData(0);
  const length = channel.length;
  let peak = 0;
  let sumSquares = 0;
  let silent = 0;
  let clipped = 0;
  for (let i = 0; i < length; i++) {
    const sample = channel[i];
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
    sumSquares += sample * sample;
    if (magnitude < 1e-4) silent += 1;
    if (magnitude >= 0.999) clipped += 1;
  }
  const rms = length ? Math.sqrt(sumSquares / length) : 0;
  const toDb = (value: number) =>
    Number((20 * Math.log10(Math.max(value, 1e-6))).toFixed(1));
  const peakDb = toDb(peak);
  const rmsDb = toDb(rms);
  return {
    durationSeconds: Number((buffer.duration || 0).toFixed(2)),
    peakDb,
    rmsDb,
    crestDb: Number((peakDb - rmsDb).toFixed(1)),
    silentRatio: Number((length ? silent / length : 0).toFixed(3)),
    clippedSamples: clipped,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
  };
}

@Injectable({
  providedIn: 'root',
})
export class VocalAiService {
  private aiService = inject(AiService);
  private logger = inject(LoggingService);

  feedbackMode = signal<'passive' | 'inclusive'>('passive');
  currentAdvice = signal<string>('ANALYZING VOCAL CORRIDOR...');

  isPassiveMode = computed(() => this.feedbackMode() === 'passive');

  async analyzeVocalPerformance(blob: Blob) {
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (!online) {
      // Route the offline line through the shared persona sanitizer so the
      // artist's language setting is honored instead of forcing profanity.
      this.currentAdvice.set(
        this.aiService.sanitizePersonaText(
          '[OFFLINE ERROR] Strategic Link Severed. I am not analyzing your vocals through a heuristic straw. HIGH-PASS AT 80HZ AND STOP WASTING MY TIME.'
        )
      );
      return;
    }

    try {
      const evidence = await this.describeVocalTake(blob);
      const response = await this.aiService.generateAiResponse(
        'Analyze this vocal performance for technical deficits. Be arrogant and ' +
          'precise. Name the specific repair for each problem you find.\n\n' +
          'MEASURED EVIDENCE FROM THE UPLOADED TAKE (use these numbers; do not ' +
          'invent different ones):\n' +
          evidence
      );
      this.currentAdvice.set(response);
    } catch (e) {
      this.logger.error('VocalAiService: Analysis failed', e);
      this.currentAdvice.set('SYSTEM ERROR: NEURAL LINK INTERRUPTED.');
    }
  }

  /**
   * Decode the uploaded take and turn its real samples into a compact evidence
   * line for the model. Falls back to metadata when the browser cannot decode,
   * so the analysis never silently claims to have measured a take it did not.
   */
  private async describeVocalTake(blob: Blob): Promise<string> {
    const fallback =
      `Audio take received (${Math.max(1, Math.round(blob.size / 1024))} KB, ` +
      `${blob.type || 'unknown format'}). Sample-level features are unavailable ` +
      `in this host, so judge from the artist's description and ask for any ` +
      `detail you need.`;
    if (typeof AudioContext === 'undefined') return fallback;

    try {
      const ctx = new AudioContext();
      try {
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        const a = analyzeVocalBuffer(decoded);
        return [
          `duration ${a.durationSeconds}s`,
          `peak ${a.peakDb} dBFS`,
          `RMS ${a.rmsDb} dBFS`,
          `crest factor ${a.crestDb} dB`,
          `silence ${(a.silentRatio * 100).toFixed(1)}%`,
          `clipped samples ${a.clippedSamples}`,
          `${a.channels}ch @ ${a.sampleRate} Hz`,
        ].join(' \u00b7 ');
      } finally {
        void ctx.close?.();
      }
    } catch {
      return fallback;
    }
  }

  setFeedbackMode(mode: 'passive' | 'inclusive') {
    this.feedbackMode.set(mode);
  }

  toggleFeedbackMode() {
    this.feedbackMode.update((v) =>
      v === 'passive' ? 'inclusive' : 'passive'
    );
  }
}
