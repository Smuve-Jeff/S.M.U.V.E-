import { Injectable, computed, inject, signal } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { NotificationService } from '../services/notification.service';
import {
  readStudioDeviceSignals,
  type StudioDeviceSignals,
} from '../services/studio-device-profile.service';
import type { ComposerPart, Composition, DrumLane } from './composer.types';

/** A score-shaped preview that does not need a full Composition record. */
export interface AuditionScore {
  id: string;
  bpm: number;
  durationSeconds: number;
  totalBars: number;
  parts: ComposerPart[];
}

/** One slice of a long score, with a tail used for the next crossfade. */
export interface AuditionChunkPlan {
  startSeconds: number;
  mainSeconds: number;
  renderSeconds: number;
}

/**
 * Split a score into bounded slices. Every slice but the last renders an extra
 * overlap tail; the next slice crossfades over that tail, so the joined audio
 * has no seam at the boundary.
 */
export function planAuditionChunks(
  totalSeconds: number,
  chunkSeconds = 120,
  overlapSeconds = 1,
): AuditionChunkPlan[] {
  const total = Math.max(0.001, totalSeconds);
  const chunk = Math.max(0.1, chunkSeconds);
  const overlap = Math.min(Math.max(0, overlapSeconds), chunk / 4);
  const count = Math.max(1, Math.ceil(total / chunk - 1e-9));
  return Array.from({ length: count }, (_, index) => {
    const startSeconds = index * chunk;
    const mainSeconds = Math.min(chunk, total - startSeconds);
    const isLast = index === count - 1;
    return {
      startSeconds,
      mainSeconds,
      renderSeconds: isLast ? mainSeconds : mainSeconds + overlap,
    };
  });
}

/** Human-readable remaining wall-clock estimate for a chunked render. */
export function formatRenderEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `~${rounded}s left`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `~${minutes}m ${rest}s left` : `~${minutes}m left`;
}

/** The inline and pre-render memory picture for a stitched audition. */
export interface AuditionMemoryEstimate {
  estimatedMb: number;
  budgetMb: number;
  exceedsBudget: boolean;
}

/** A rough memory-pressure check before a long stitched audition. */
export interface AuditionMemoryWarning {
  estimatedMb: number;
  budgetMb: number;
}

/**
 * Estimate the full output, the current and previous slice buffers, and a
 * small fixed overhead. The browser has to hold all of them at the seam, so a
 * buffer that is fine on its own can still push a constrained phone over.
 */
export function auditionMemoryEstimate(
  durationSeconds: number,
  chunkSeconds: number,
  memoryGb: number | null,
  mobile: boolean,
): AuditionMemoryEstimate {
  const seconds = Math.max(2, durationSeconds);
  const chunk = Math.max(0.1, Math.min(seconds, chunkSeconds));
  const frames = Math.ceil(seconds * 44100);
  const sliceFrames = Math.ceil(chunk * 44100);
  const bytesPerFrame = 2 * Float32Array.BYTES_PER_ELEMENT;
  const estimatedMb = Math.ceil(
    (frames * bytesPerFrame +
      sliceFrames * bytesPerFrame * 2 +
      16 * 1024 * 1024) /
      (1024 * 1024),
  );
  const reported =
    memoryGb !== null && Number.isFinite(memoryGb) && memoryGb > 0
      ? memoryGb
      : mobile
        ? 2
        : 8;
  const budgetMb = Math.min(512, Math.max(128, Math.round(reported * 64)));
  return { estimatedMb, budgetMb, exceedsBudget: estimatedMb > budgetMb };
}

/** Returns a warning only when the estimate is beyond the device budget. */
export function auditionMemoryWarning(
  durationSeconds: number,
  chunkSeconds: number,
  memoryGb: number | null,
  mobile: boolean,
): AuditionMemoryWarning | null {
  const estimate = auditionMemoryEstimate(
    durationSeconds,
    chunkSeconds,
    memoryGb,
    mobile,
  );
  return estimate.exceedsBudget
    ? { estimatedMb: estimate.estimatedMb, budgetMb: estimate.budgetMb }
    : null;
}

/**
 * Choose how much audio one offline render may cover. Smaller slices do not
 * shrink the final buffer, but they shorten the longest wait before progress
 * moves and before a cancel can stop the slice loop. Phones with little
 * reported memory get the shortest slices; unknown memory is treated
 * conservatively on mobile and neutrally on desktop.
 */
export function auditionChunkSecondsForDevice(
  signals: Pick<StudioDeviceSignals, 'cores' | 'memoryGb' | 'mobile'>,
): number {
  if (signals.memoryGb !== null) {
    if (signals.memoryGb <= 2) return 45;
    if (signals.memoryGb <= 4) return 60;
    if (signals.memoryGb < 8 || signals.mobile) return 90;
    return 120;
  }
  if (signals.mobile) return 60;
  if (signals.cores > 0 && signals.cores <= 4) return 60;
  if (signals.cores > 0 && signals.cores <= 6) return 90;
  return 120;
}

/** The slice of AudioBuffer the stitcher needs. */
export interface AuditionChunkBuffer {
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * Copy one rendered slice into the full score, crossfading its first overlap
 * with the previous slice's tail. Returns the new write position.
 */
export function writeAuditionChunk(
  output: AuditionChunkBuffer,
  previous: AuditionChunkBuffer | null,
  previousMainFrames: number,
  chunk: AuditionChunkBuffer,
  chunkMainFrames: number,
  overlapFrames: number,
  writeFrame: number,
): number {
  const mainFrames = Math.max(
    0,
    Math.min(chunkMainFrames, chunk.length, output.length - writeFrame),
  );
  const channels = Math.min(output.numberOfChannels, chunk.numberOfChannels);

  if (!previous || overlapFrames <= 0) {
    for (let channel = 0; channel < channels; channel++) {
      output
        .getChannelData(channel)
        .set(chunk.getChannelData(channel).subarray(0, mainFrames), writeFrame);
    }
    return writeFrame + mainFrames;
  }

  const previousTail = Math.max(0, previous.length - previousMainFrames);
  const blendFrames = Math.max(
    0,
    Math.min(
      overlapFrames,
      mainFrames,
      previousTail,
      output.length - writeFrame,
    ),
  );
  const blendChannels = Math.min(channels, previous.numberOfChannels);

  for (let channel = 0; channel < blendChannels; channel++) {
    const from = previous.getChannelData(channel);
    const to = output.getChannelData(channel);
    const next = chunk.getChannelData(channel);
    for (let frame = 0; frame < blendFrames; frame++) {
      const mix = (frame + 1) / (blendFrames + 1);
      to[writeFrame + frame] =
        from[previousMainFrames + frame] * (1 - mix) + next[frame] * mix;
    }
  }

  for (let channel = 0; channel < channels; channel++) {
    output
      .getChannelData(channel)
      .set(
        chunk.getChannelData(channel).subarray(blendFrames, mainFrames),
        writeFrame + blendFrames,
      );
  }
  return writeFrame + mainFrames;
}

/**
 * Audition renderer.
 *
 * The composition engine writes a score. This service turns that score into
 * audible sound in the browser so the artist can judge a pass before loading
 * anything into the Studio — no server, no uploaded audio, no fake waveform.
 *
 * It is a deliberately simple synth: pitched parts use filtered oscillators,
 * drums use synthesized transients and noise. It is an audition, not a mix —
 * the Studio instruments are where the record gets its tone.
 */
@Injectable({ providedIn: 'root' })
export class CompositionAuditionService {
  private engine = inject(AudioEngineService);
  private notify = inject(NotificationService);

  private readonly deviceSignals = readStudioDeviceSignals();

  /**
   * Bounded render slices keep long auditions from exhausting memory and let
   * constrained phones reach progress updates and cancel checkpoints sooner.
   */
  readonly renderChunkSeconds = auditionChunkSecondsForDevice(
    this.deviceSignals,
  );

  /** Rendered tail crossfaded into the next slice. */
  readonly chunkOverlapSeconds = 1;

  rendering = signal(false);
  error = signal<string | null>(null);
  readyCompositionId = signal<string | null>(null);
  previewSeconds = signal(0);
  previewBars = signal(0);
  /** Completed fraction of the current chunked render, 0–1. */
  renderProgress = signal(0);
  /** Slices completed in the current render. */
  renderSlicesDone = signal(0);
  /** Total slices planned for the current render; 0 when idle. */
  renderSliceTotal = signal(0);
  /** Rough wall-clock seconds left, null until a slice completes. */
  renderEtaSeconds = signal<number | null>(null);

  private buffer: AudioBuffer | null = null;
  private noise: AudioBuffer | null = null;
  private renderToken = 0;
  private warnedForMemory: Set<string> | null = null;

  readonly playing = computed(() => this.engine.auditionPlaying());
  readonly progress = computed(() => this.engine.auditionProgress());

  readonly playingThis = computed(
    () => this.playing() && this.readyCompositionId() !== null
  );

  async toggle(composition: Composition): Promise<void> {
    if (this.playing()) {
      this.stop();
      return;
    }
    if (this.buffer && this.readyCompositionId() === composition.id) {
      this.play(composition);
      return;
    }
    await this.render(composition);
    if (
      this.buffer &&
      this.readyCompositionId() === composition.id &&
      !this.error()
    ) {
      this.play(composition);
    }
  }

  /**
   * Forces this exact composition to play. Unlike `toggle`, this never just
   * stops — used when an artist picks a specific side of an A/B comparison.
   */
  async start(composition: Composition): Promise<void> {
    this.stop();
    if (this.buffer && this.readyCompositionId() === composition.id) {
      this.play(composition);
      return;
    }
    await this.render(composition);
    if (
      this.buffer &&
      this.readyCompositionId() === composition.id &&
      !this.error()
    ) {
      this.play(composition);
    }
  }

  play(composition: Composition): void {
    if (!this.buffer) {
      void this.render(composition);
      return;
    }
    this.playBuffer();
  }

  stop(): void {
    this.engine.stopAudition();
  }

  /**
   * Abandon the current render. An OfflineAudioContext cannot be interrupted,
   * so the slice already in flight finishes silently and the loop stops before
   * scheduling the next one.
   */
  cancelRender(): void {
    if (!this.rendering()) return;
    this.renderToken++;
    this.rendering.set(false);
    this.renderProgress.set(0);
    this.renderSlicesDone.set(0);
    this.renderSliceTotal.set(0);
    this.renderEtaSeconds.set(null);
    this.buffer = null;
    this.readyCompositionId.set(null);
    this.error.set(null);
  }

  /** "Slice 2/5" for a render that needs more than one pass. */
  renderSliceLabel(): string {
    const total = this.renderSliceTotal();
    if (total <= 1) return '';
    const done = Math.min(this.renderSlicesDone(), total);
    return `Slice ${Math.min(done + 1, total)}/${total}`;
  }

  /** Rough remaining wall-clock time for a multi-slice render. */
  renderEtaLabel(): string {
    if (!this.rendering() || this.renderSliceTotal() <= 1) return '';
    return formatRenderEta(this.renderEtaSeconds());
  }

  /** Peak memory the UI can show before the artist starts a render. */
  memoryEstimateFor(durationSeconds: number): AuditionMemoryEstimate {
    return auditionMemoryEstimate(
      durationSeconds,
      this.renderChunkSeconds ?? 120,
      this.deviceSignals?.memoryGb ?? null,
      this.deviceSignals?.mobile ?? false,
    );
  }

  private warnAboutMemory(
    score: AuditionScore,
    chunkSeconds: number,
  ): void {
    const warning = auditionMemoryWarning(
      score.durationSeconds,
      chunkSeconds,
      this.deviceSignals?.memoryGb ?? null,
      this.deviceSignals?.mobile ?? false,
    );
    if (!warning) return;
    const warned = (this.warnedForMemory ??= new Set<string>());
    if (warned.has(score.id)) return;
    warned.add(score.id);
    const minutes = Math.max(1, Math.round(score.durationSeconds / 60));
    this.notify.show(
      `This ~${minutes} min audition needs about ${warning.estimatedMb} MB to stitch. Your device may run low on memory; cancel is available while it renders.`,
      'warning',
    );
  }

  /** Renders the score to an AudioBuffer, then plays it. */
  async render(composition: Composition): Promise<void> {
    await this.renderScore({
      id: composition.id,
      bpm: composition.bpm,
      durationSeconds: composition.durationSeconds,
      totalBars: composition.totalBars,
      parts: composition.parts,
    });
  }

  /** Render any score-shaped part list without requiring a Composition. */
  async renderScore(score: AuditionScore): Promise<void> {
    if (this.rendering()) return;
    const token = ++this.renderToken;
    this.rendering.set(true);
    this.error.set(null);
    this.buffer = null;
    this.readyCompositionId.set(null);
    this.renderProgress.set(0);
    this.renderSlicesDone.set(0);
    this.renderSliceTotal.set(0);
    this.renderEtaSeconds.set(null);

    try {
      const seconds = Math.max(2, score.durationSeconds);
      const stepSeconds = 60 / Math.max(40, score.bpm) / 4;
      const sampleRate = 44100;
      const totalFrames = Math.ceil(seconds * sampleRate);
      const plan = planAuditionChunks(
        seconds,
        this.renderChunkSeconds,
        this.chunkOverlapSeconds,
      );
      this.renderSliceTotal.set(plan.length);
      this.warnAboutMemory(score, this.renderChunkSeconds ?? 120);
      const output = new AudioBuffer({
        length: totalFrames,
        numberOfChannels: 2,
        sampleRate,
      });
      const overlapFrames = Math.round(this.chunkOverlapSeconds * sampleRate);
      let previous: AudioBuffer | null = null;
      let previousMainFrames = 0;
      let writeFrame = 0;
      const renderStartedAt = Date.now();

      for (const [index, slice] of plan.entries()) {
        const frames = Math.max(
          1,
          Math.ceil(slice.renderSeconds * sampleRate),
        );
        const ctx = new OfflineAudioContext(2, frames, sampleRate);

        const master = ctx.createGain();
        master.gain.value = 0.9;
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 24;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.18;
        master.connect(compressor);
        compressor.connect(ctx.destination);

        this.noise = this.makeNoiseBuffer(ctx, 1.2);
        const from = slice.startSeconds;
        const until = from + slice.renderSeconds;

        for (const part of score.parts) {
          // Reference harmony is context, not a deliverable; leave it out.
          if (part.reference) continue;
          if (part.hits.length) {
            this.scheduleDrums(ctx, master, part, stepSeconds, from, until);
          }
          if (part.notes.length) {
            this.scheduleNotes(ctx, master, part, stepSeconds, from, until);
          }
        }

        const rendered = await ctx.startRendering();
        if (token !== this.renderToken) return;
        const mainFrames = Math.min(
          Math.ceil(slice.mainSeconds * sampleRate),
          totalFrames - writeFrame,
        );
        writeFrame = writeAuditionChunk(
          output,
          previous,
          previousMainFrames,
          rendered,
          mainFrames,
          overlapFrames,
          writeFrame,
        );
        previous = rendered;
        previousMainFrames = mainFrames;
        this.renderProgress.set(
          Math.min(1, writeFrame / Math.max(1, totalFrames)),
        );
        this.renderSlicesDone.set(index + 1);
        const remaining = plan.length - index - 1;
        this.renderEtaSeconds.set(
          remaining > 0
            ? Math.max(
                1,
                Math.round(
                  ((Date.now() - renderStartedAt) / 1000 / (index + 1)) *
                    remaining,
                ),
              )
            : null,
        );
      }

      if (token !== this.renderToken) return;
      this.renderProgress.set(1);
      this.renderEtaSeconds.set(null);
      this.buffer = output;
      this.previewSeconds.set(Math.round(output.duration));
      this.previewBars.set(
        Math.min(
          score.totalBars,
          Math.ceil(output.duration / (stepSeconds * 16)),
        ),
      );
      this.readyCompositionId.set(score.id);
    } catch (cause: any) {
      if (token !== this.renderToken) return;
      this.error.set(
        'Audition could not be rendered in this browser: ' +
          (cause?.message ?? 'unknown audio error')
      );
      this.renderProgress.set(0);
      this.renderSlicesDone.set(0);
      this.renderSliceTotal.set(0);
      this.renderEtaSeconds.set(null);
      this.notify.show('Audition rendering failed.', 'warning');
    } finally {
      if (token === this.renderToken) this.rendering.set(false);
    }
  }

  /**
   * Force a score preview to play, without changing any project state. Pass
   * `loop` for short pattern auditions that should repeat until stopped. The
   * optional `onEnd` reports whether a one-pass take finished naturally or
   * was stopped, so the caller can hold its completed progress briefly.
   */
  async startScore(
    score: AuditionScore,
    loop = false,
    onEnd?: (natural: boolean) => void,
  ): Promise<void> {
    this.stop();
    if (this.buffer && this.readyCompositionId() === score.id) {
      this.playBuffer(loop, onEnd);
      return;
    }
    // Abandon any in-flight render so quickly switching rows never plays the
    // pattern the artist moved away from.
    this.renderToken++;
    this.rendering.set(false);
    this.buffer = null;
    await this.renderScore(score);
    // A newer preview may have finished first; only play this score if its
    // render is still the current one.
    if (
      this.buffer &&
      this.readyCompositionId() === score.id &&
      !this.error()
    ) {
      this.playBuffer(loop, onEnd);
    }
  }

  private playBuffer(
    loop = false,
    onEnd?: (natural: boolean) => void,
  ): void {
    if (!this.buffer) return;
    this.engine.playAudition(
      this.buffer,
      (natural) => onEnd?.(natural),
      { loop },
    );
  }

  clear(): void {
    this.stop();
    this.renderToken++;
    this.buffer = null;
    this.readyCompositionId.set(null);
    this.rendering.set(false);
    this.renderProgress.set(0);
    this.renderSlicesDone.set(0);
    this.renderSliceTotal.set(0);
    this.renderEtaSeconds.set(null);
    this.error.set(null);
  }

  /* ── Scheduling ──────────────────────────────────────────────── */

  private scheduleDrums(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    part: ComposerPart,
    stepSeconds: number,
    fromSeconds: number,
    toSeconds: number,
  ): void {
    for (const hit of part.hits) {
      const time = (hit.bar * 16 + hit.step) * stepSeconds;
      if (time < fromSeconds || time >= toSeconds) continue;
      this.drum(ctx, bus, hit.lane, time - fromSeconds, hit.velocity);
    }
  }

  private scheduleNotes(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    part: ComposerPart,
    stepSeconds: number,
    fromSeconds: number,
    toSeconds: number,
  ): void {
    const voice = this.voiceFor(part.role);
    for (const note of part.notes) {
      const time = (note.bar * 16 + note.step) * stepSeconds;
      const duration = Math.max(0.05, note.length * stepSeconds * 0.94);
      const end = time + duration;
      const freq = 440 * Math.pow(2, (note.midi - 69) / 12);

      if (time >= fromSeconds && time < toSeconds) {
        this.tone(
          ctx,
          bus,
          voice,
          freq,
          time - fromSeconds,
          duration,
          note.velocity,
          Boolean(note.slide),
          0,
        );
      } else if (time < fromSeconds && end > fromSeconds) {
        // A held note that began in an earlier slice resumes with its envelope
        // already in progress, so the crossfade joins without a restart click.
        this.tone(
          ctx,
          bus,
          voice,
          freq,
          0,
          duration,
          note.velocity,
          Boolean(note.slide),
          fromSeconds - time,
        );
      }
    }
  }

  private voiceFor(role: ComposerPart['role']): {
    type: OscillatorType;
    cutoff: number;
    gain: number;
    attack: number;
    detune?: number;
  } {
    switch (role) {
      case 'bass':
        return { type: 'sine', cutoff: 320, gain: 0.5, attack: 0.008 };
      case 'chords':
        return { type: 'triangle', cutoff: 1700, gain: 0.16, attack: 0.02 };
      case 'pad':
        return { type: 'sawtooth', cutoff: 900, gain: 0.07, attack: 0.18 };
      case 'melody':
        return { type: 'triangle', cutoff: 3200, gain: 0.2, attack: 0.012 };
      case 'counter':
        return { type: 'sine', cutoff: 1800, gain: 0.12, attack: 0.04 };
      case 'arp':
        return { type: 'square', cutoff: 2400, gain: 0.09, attack: 0.006 };
      case 'fx':
        return { type: 'sawtooth', cutoff: 2600, gain: 0.12, attack: 0.03 };
      default:
        return { type: 'triangle', cutoff: 2400, gain: 0.14, attack: 0.01 };
    }
  }

  private tone(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    voice: { type: OscillatorType; cutoff: number; gain: number; attack: number },
    freq: number,
    time: number,
    noteDuration: number,
    velocity: number,
    slide: boolean,
    offsetSeconds: number,
  ): void {
    if (offsetSeconds >= noteDuration) return;
    const osc = ctx.createOscillator();
    osc.type = voice.type;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.cutoff;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    const peak = Math.max(0.0001, voice.gain * Math.min(1, velocity));

    if (slide) {
      const slideDuration = Math.min(0.18, noteDuration * 0.4);
      const slideStart = freq * 0.94;
      if (offsetSeconds < slideDuration) {
        const currentFreq =
          slideStart *
          Math.pow(freq / slideStart, offsetSeconds / Math.max(0.0001, slideDuration));
        osc.frequency.setValueAtTime(currentFreq, time);
        osc.frequency.exponentialRampToValueAtTime(
          freq,
          time + Math.max(0.001, slideDuration - offsetSeconds),
        );
      } else {
        osc.frequency.setValueAtTime(freq, time);
      }
    } else {
      osc.frequency.setValueAtTime(freq, time);
    }

    const attack = Math.min(voice.attack, noteDuration * 0.5);
    if (offsetSeconds < attack) {
      const startGain =
        0.0001 *
        Math.pow(peak / 0.0001, offsetSeconds / Math.max(0.0001, attack));
      gain.gain.setValueAtTime(Math.max(0.0001, startGain), time);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, peak),
        time + Math.max(0.001, attack - offsetSeconds),
      );
    } else {
      const decay =
        (offsetSeconds - attack) /
        Math.max(0.0001, noteDuration - attack);
      gain.gain.setValueAtTime(
        Math.max(0.0001, peak * Math.pow(0.0001 / peak, decay)),
        time,
      );
    }
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + Math.max(0.001, noteDuration - offsetSeconds),
    );
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + Math.max(0.001, noteDuration - offsetSeconds) + 0.02);
  }

  /* ── Drum voices ─────────────────────────────────────────────── */

  private drum(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    lane: DrumLane,
    time: number,
    velocity: number
  ): void {
    const level = Math.max(0.03, Math.min(1, velocity));
    switch (lane) {
      case 'kick':
        this.kick(ctx, bus, time, level);
        break;
      case 'snare':
        this.noiseHit(ctx, bus, time, 0.2, 1800, 0.9, level * 0.5);
        this.bodyHit(ctx, bus, time, 185, 0.1, level * 0.28, 'triangle');
        break;
      case 'clap':
        this.noiseHit(ctx, bus, time, 0.05, 1300, 1.2, level * 0.32);
        this.noiseHit(ctx, bus, time + 0.012, 0.05, 1400, 1.2, level * 0.28);
        this.noiseHit(ctx, bus, time + 0.026, 0.07, 1500, 1.2, level * 0.24);
        break;
      case 'rim':
        this.bodyHit(ctx, bus, time, 780, 0.045, level * 0.3, 'square');
        break;
      case 'hat':
        this.noiseHit(ctx, bus, time, 0.045, 7800, 2.2, level * 0.2);
        break;
      case 'openhat':
        this.noiseHit(ctx, bus, time, 0.24, 7200, 1.8, level * 0.17);
        break;
      case 'ride':
        this.noiseHit(ctx, bus, time, 0.28, 5600, 2.4, level * 0.11);
        break;
      case 'perc':
        this.bodyHit(ctx, bus, time, 430, 0.12, level * 0.22, 'triangle');
        break;
      case 'shaker':
        this.noiseHit(ctx, bus, time, 0.06, 9200, 2.6, level * 0.12);
        break;
      case 'tom':
        this.bodyHit(ctx, bus, time, 175, 0.2, level * 0.3, 'sine', 110);
        break;
      case 'crash':
        this.noiseHit(ctx, bus, time, 0.8, 4800, 1.4, level * 0.14);
        break;
      default:
        this.noiseHit(ctx, bus, time, 0.08, 2600, 1.5, level * 0.14);
    }
  }

  private kick(ctx: OfflineAudioContext, bus: AudioNode, time: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.13);
    const gain = ctx.createGain();
    const peak = 0.6 * level;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + 0.36);
  }

  private bodyHit(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    time: number,
    freq: number,
    duration: number,
    level: number,
    type: OscillatorType,
    endFreq?: number
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private noiseHit(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    time: number,
    duration: number,
    cutoff: number,
    q: number,
    level: number
  ): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  private makeNoiseBuffer(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
