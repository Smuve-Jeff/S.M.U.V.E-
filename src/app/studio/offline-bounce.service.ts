import { Injectable, inject, signal } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { MusicManagerService } from '../services/music-manager.service';
import { WavEncoder } from './wav-encoder.util';
import { LoggingService } from '../services/logging.service';

export type BounceFormat = 'wav-16' | 'wav-32' | 'wav-32-float';
export type BounceState = 'idle' | 'preparing' | 'rendering' | 'mixing' | 'encoding' | 'complete' | 'error';

export interface BounceProgress {
  state: BounceState;
  /** 0..100 percentage */
  progress: number;
  /** Estimated time remaining in seconds */
  etaSeconds: number;
  message: string;
}

export interface BounceResult {
  blob: Blob;
  url: string;
  format: BounceFormat;
  sampleRate: number;
  durationSeconds: number;
  peakDb: number;
  rmsDb: number;
}

/**
 * Professional Offline Bounce Engine
 * 
 * Renders the full arrangement to a high-quality audio file
 * using offline AudioContext rendering. Supports 16-bit PCM,
 * 32-bit PCM, and 32-bit float WAV output.
 * 
 * Unlike real-time recording, offline rendering processes audio
 * faster than real-time and guarantees bit-perfect output unaffected
 * by system load or buffer underruns.
 */
@Injectable({ providedIn: 'root' })
export class OfflineBounceService {
  private readonly engine = inject(AudioEngineService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly logger = inject(LoggingService);

  readonly progress = signal<BounceProgress>({
    state: 'idle',
    progress: 0,
    etaSeconds: 0,
    message: 'Ready',
  });

  readonly isBouncing = signal(false);
  readonly lastResult = signal<BounceResult | null>(null);

  /**
   * Perform an offline bounce of the current arrangement.
   * 
   * @param format Output format
   * @param durationBars Number of bars to render (default: auto-detect from arrangement)
   * @param tailSeconds Extra silence at the end for reverb tails (default: 2s)
   * @param onProgress Optional progress callback
   */
  async bounce(
    format: BounceFormat = 'wav-32-float',
    durationBars?: number,
    tailSeconds = 2.0,
    onProgress?: (p: BounceProgress) => void
  ): Promise<BounceResult | null> {
    if (this.isBouncing()) {
      this.logger.warn('OfflineBounce: Bounce already in progress');
      return null;
    }

    this.isBouncing.set(true);
    this.updateProgress('preparing', 0, 'Preparing offline render context…', onProgress);

    try {
      const sampleRate = this.getSampleRate(format);
      const tempo = this.engine.tempo();
      const stepsPerBar = 64;
      const totalSteps = this.computeTotalSteps(durationBars);
      const totalBars = totalSteps / 16;
      const barDuration = 60 / tempo * 4; // seconds per bar
      const totalDuration = totalBars * barDuration + tailSeconds;
      const totalFrames = Math.ceil(totalDuration * sampleRate);

      this.updateProgress('preparing', 5, `Rendering ${totalBars.toFixed(1)} bars at ${sampleRate / 1000}kHz…`, onProgress);

      // Create offline context
      const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

      // Clone the arrangement into the offline context
      await this.renderArrangement(offlineCtx, totalSteps, totalDuration, sampleRate, onProgress);

      this.updateProgress('rendering', 40, 'Processing audio through mastering chain…', onProgress);

      // Start rendering
      const renderedBuffer = await offlineCtx.startRendering();

      this.updateProgress('mixing', 75, 'Mixing down to stereo…', onProgress);
      this.updateProgress('encoding', 90, `Encoding to ${format}…`, onProgress);

      const result = this.buildResult(
        renderedBuffer,
        format,
        sampleRate,
        totalDuration
      );

      this.lastResult.set(result);
      this.updateProgress('complete', 100, `Bounce complete · ${result.peakDb}dB peak · ${result.rmsDb}dB RMS`, onProgress);
      this.logger.info(`OfflineBounce: ${totalBars.toFixed(1)} bars rendered to ${format}`);

      return result;
    } catch (err: any) {
      this.updateProgress('error', 0, `Bounce failed: ${err?.message ?? 'unknown'}`, onProgress);
      this.logger.error('OfflineBounce failed', err);
      return null;
    } finally {
      this.isBouncing.set(false);
    }
  }

  /** Cancel an in-progress bounce (best-effort via abort flag) */
  cancel(): void {
    // OfflineAudioContext doesn't support cancellation, but we mark idle
    this.isBouncing.set(false);
    this.updateProgress('idle', 0, 'Cancelled');
  }

  /**
   * Render a single track (synth notes + audio clips) to a WAV file — the
   * "Bounce Selected" action. Respects the track's mute/solo, clip fades
   * and the shared offline mastering gain.
   */
  async bounceTrack(
    trackId: string,
    format: BounceFormat = 'wav-32-float',
    tailSeconds = 1.0
  ): Promise<BounceResult | null> {
    const track = this.musicManager.tracks().find((t) => t.id === trackId);
    if (!track) {
      this.logger.warn('OfflineBounce: unknown track', trackId);
      return null;
    }
    if (this.isBouncing()) {
      this.logger.warn('OfflineBounce: Bounce already in progress');
      return null;
    }

    this.isBouncing.set(true);
    const trackName = (track as any).name ?? 'Track';
    this.updateProgress('preparing', 0, `Preparing "${trackName}"…`);

    try {
      const sampleRate = this.getSampleRate(format);
      const tempo = this.engine.tempo();
      const totalSteps = this.computeTotalSteps(undefined, trackId);
      const totalBars = totalSteps / 16;
      const barDuration = (60 / tempo) * 4;
      const totalDuration = totalBars * barDuration + tailSeconds;
      const totalFrames = Math.ceil(totalDuration * sampleRate);

      const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
      await this.renderArrangement(
        offlineCtx,
        totalSteps,
        totalDuration,
        sampleRate,
        undefined,
        trackId
      );

      const renderedBuffer = await offlineCtx.startRendering();
      this.updateProgress('encoding', 90, `Encoding to ${format}…`, undefined);
      const result = this.buildResult(
        renderedBuffer,
        format,
        sampleRate,
        totalDuration
      );

      this.lastResult.set(result);
      this.updateProgress('complete', 100, `Bounced "${trackName}" · ${result.peakDb}dB peak`, undefined);
      this.logger.info(`OfflineBounce: track ${trackId} (${totalBars.toFixed(1)} bars) → ${format}`);
      return result;
    } catch (err: any) {
      this.updateProgress('error', 0, `Track bounce failed: ${err?.message ?? 'unknown'}`);
      this.logger.error('OfflineBounce track render failed', err);
      return null;
    } finally {
      this.isBouncing.set(false);
    }
  }

  // ---- Private helpers ----

  /** Shared WAV encode + peak/RMS analysis for full and per-track bounces. */
  private buildResult(
    renderedBuffer: AudioBuffer,
    format: BounceFormat,
    sampleRate: number,
    durationSeconds: number
  ): BounceResult {
    let peakL = 0,
      peakR = 0,
      sumSq = 0;
    const chL = renderedBuffer.getChannelData(0);
    const chR = renderedBuffer.getChannelData(1);
    const totalSamples = chL.length * 2;

    for (let i = 0; i < chL.length; i++) {
      const al = Math.abs(chL[i]);
      const ar = Math.abs(chR[i]);
      if (al > peakL) peakL = al;
      if (ar > peakR) peakR = ar;
      sumSq += chL[i] * chL[i] + chR[i] * chR[i];
    }

    const peak = Math.max(peakL, peakR);
    const rms = Math.sqrt(sumSq / totalSamples);
    const peakDb = 20 * Math.log10(Math.max(peak, 1e-10));
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));

    const channels = [chL, chR];
    const blob = WavEncoder.encodeMultiChannel(channels, format, sampleRate);
    const url = URL.createObjectURL(blob);

    return {
      blob,
      url,
      format,
      sampleRate,
      durationSeconds,
      peakDb: Math.round(peakDb * 10) / 10,
      rmsDb: Math.round(rmsDb * 10) / 10,
    };
  }

  private getSampleRate(format: BounceFormat): number {
    switch (format) {
      case 'wav-32-float':
      case 'wav-32':
        return 96000;
      case 'wav-16':
      default:
        return 48000;
    }
  }

  private computeTotalSteps(durationBars?: number, onlyTrackId?: string): number {
    if (durationBars !== undefined) return durationBars * 16;

    // Auto-detect from arrangement (or a single track for per-track bounce):
    // find the last note/clip end
    let maxStep = 64; // minimum 4 bars
    const tracks = onlyTrackId
      ? this.musicManager.tracks().filter((t) => t.id === onlyTrackId)
      : this.musicManager.tracks();
    for (const track of tracks) {
      for (const clip of track.clips) {
        const end = (clip.start || 0) + (clip.length || 4);
        const endSteps = Math.ceil(end * 16);
        if (endSteps > maxStep) maxStep = endSteps;
      }
      for (const note of track.notes) {
        const end = note.step + note.length;
        if (end > maxStep) maxStep = end;
      }
    }
    // Round up to nearest bar + extra bar for tails
    return Math.ceil(maxStep / 16) * 16 + 16;
  }

  private async renderArrangement(
    ctx: OfflineAudioContext,
    totalSteps: number,
    totalDuration: number,
    sampleRate: number,
    onProgress?: (p: BounceProgress) => void,
    onlyTrackId?: string
  ): Promise<void> {
    const tempo = this.engine.tempo();
    const stepsPerBeat = 4;
    const stepDuration = 60 / tempo / stepsPerBeat;

    // Use live master gain instead of hard-coded value
    const liveMasterGain = this.engine.masterGain.gain.value;
    const masterGain = ctx.createGain();
    masterGain.gain.value = liveMasterGain;
    masterGain.connect(ctx.destination);

    this.updateProgress('rendering', 15, 'Scheduling notes and clips…', onProgress);

    const tracks = this.musicManager.tracks();

    // Respect solo/mute: if any track is soloed, only render soloed tracks;
    // otherwise render all non-muted tracks. A single-track bounce narrows
    // the pool to the chosen track and renders it regardless of its own mute
    // (the user explicitly selected it to bounce).
    const pool = onlyTrackId
      ? tracks.filter((t: any) => t.id === onlyTrackId)
      : tracks;
    const hasSolo = pool.some((t: any) => t.soloed === true);
    const activeTracks = onlyTrackId
      ? pool
      : hasSolo
        ? pool.filter((t: any) => t.soloed === true)
        : pool.filter((t: any) => !t.muted);

    let trackCount = 0;

    for (const track of activeTracks) {
      trackCount++;
      const progressBase = 15 + (trackCount / Math.max(1, activeTracks.length)) * 30;
      const trackLabel = 'name' in (track as any) ? (track as any).name : `Track ${trackCount}`;
      this.updateProgress('rendering', progressBase, `Rendering track: ${trackLabel}`, onProgress);

      const trackGain = (track as any).gain ?? 0.8;
      const waveform = this.getTrackWaveform(track as any);

      for (const note of track.notes) {
        if (note.step >= totalSteps) continue;
        this.renderNote(
          ctx, note, trackGain, waveform, masterGain, stepDuration, sampleRate
        );
      }

      // Audio clips — schedule the cached buffer (stem splits, recorded
      // takes, imported audio) so bounced exports include sampled material
      // instead of silently dropping it.
      const clips = (track as any).clips ?? [];
      if (clips.length > 0) {
        const secPerBar = 4 * (60 / tempo);
        for (const clip of clips) {
          if (clip.type !== 'audio') continue;
          const clipBuffer =
            (clip as any).audioData ||
            ((clip as any).audioRefId &&
              this.musicManager.stemAudioCache?.get((clip as any).audioRefId));
          if (!clipBuffer) continue;
          this.renderAudioClip(
            ctx,
            clip,
            clipBuffer,
            trackGain,
            masterGain,
            secPerBar,
            tempo
          );
        }
      }
    }

    if (activeTracks.length === 0 && tracks.length > 0) {
      this.updateProgress('rendering', 50, 'All tracks muted — rendering silence…', onProgress);
    }

    this.updateProgress('rendering', 55, 'Applying mix automation…', onProgress);
  }

  /** Extract the waveform type from a track's synthParams */
  private getTrackWaveform(track: any): OscillatorType {
    const raw = track?.synthParams?.type;
    if (typeof raw === 'string' &&
        (raw === 'sine' || raw === 'sawtooth' || raw === 'square' ||
         raw === 'triangle' || raw === 'sawtooth')) {
      return raw;
    }
    return 'sine';
  }

  private renderNote(
    ctx: OfflineAudioContext,
    note: { step: number; midi: number; length: number; velocity: number },
    trackGain: number,
    waveform: OscillatorType,
    destination: AudioNode,
    stepDuration: number,
    sampleRate: number
  ): void {
    const startTime = note.step * stepDuration;
    const duration = note.length * stepDuration;
    const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
    const velocity = note.velocity ?? 0.8;

    // Use antialiased oscillator (bandlimited for saw/square)
    const osc = this.createBounceOscillator(ctx, waveform, freq, startTime, sampleRate);
    const env = ctx.createGain();

    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(velocity * trackGain * 0.5, startTime + 0.005);
    env.gain.setValueAtTime(velocity * trackGain * 0.5, startTime + duration * 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(env);
    env.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  }

  /**
   * Create a bandlimited oscillator in an OfflineAudioContext.
   * For sawtooth/square, synthesize a bandlimited PeriodicWave to avoid
   * aliasing at high frequencies.
   */
  private createBounceOscillator(
    ctx: OfflineAudioContext,
    type: OscillatorType,
    freq: number,
    startTime: number,
    sampleRate: number
  ): OscillatorNode {
    const osc = ctx.createOscillator();

    if (type === 'sawtooth' || type === 'square') {
      const nyquist = sampleRate / 2;
      const maxHarmonics = Math.floor(nyquist / freq);
      const real = new Float32Array(maxHarmonics + 1);
      const imag = new Float32Array(maxHarmonics + 1);

      if (type === 'sawtooth') {
        for (let h = 1; h <= maxHarmonics; h++) {
          imag[h] = (1 / h) * Math.pow(1 - h / maxHarmonics, 0.3);
        }
      } else {
        for (let h = 1; h <= maxHarmonics; h += 2) {
          imag[h] = (1 / h) * Math.pow(1 - h / maxHarmonics, 0.3);
        }
      }

      try {
        const wave = ctx.createPeriodicWave(real, imag, {
          disableNormalization: false,
        });
        osc.setPeriodicWave(wave);
      } catch {
        // Fallback to native type if PeriodicWave isn't supported
        osc.type = type;
      }
    } else {
      osc.type = type;
    }

    osc.frequency.setValueAtTime(freq, startTime);
    return osc;
  }

  /**
   * Schedule an audio clip into the offline render. Mirrors the live
   * `AudioEngine.triggerSampler` path (rate = originalBpm time-stretch,
   * clip fades converted from bar-length values to seconds).
   */
  private renderAudioClip(
    ctx: OfflineAudioContext,
    clip: {
      start?: number;
      length?: number;
      fadeIn?: number;
      fadeOut?: number;
      originalBpm?: number;
    },
    buffer: AudioBuffer,
    trackGain: number,
    destination: AudioNode,
    secPerBar: number,
    tempo: number
  ): void {
    const startTime = (clip.start || 0) * secPerBar;
    const clipDur = Math.max(0.001, (clip.length || 4) * secPerBar);
    const rate =
      typeof this.engine.calculatePlaybackRate === 'function'
        ? this.engine.calculatePlaybackRate(clip.originalBpm || tempo)
        : 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(rate, startTime);

    const gain = ctx.createGain();
    const fadeIn = Math.min(clip.fadeIn || 0, clip.length || 4) * secPerBar;
    const fadeOut = Math.min(clip.fadeOut || 0, clip.length || 4) * secPerBar;

    gain.gain.setValueAtTime(0, startTime);
    if (fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(trackGain, startTime + fadeIn);
    } else {
      gain.gain.setValueAtTime(trackGain, startTime);
    }
    if (fadeOut > 0) {
      const fadeStart = startTime + Math.max(fadeIn, clipDur - fadeOut);
      gain.gain.setValueAtTime(trackGain, fadeStart);
      gain.gain.linearRampToValueAtTime(0, startTime + clipDur);
    } else {
      gain.gain.setValueAtTime(
        trackGain,
        startTime + Math.max(0.001, clipDur - 0.001)
      );
    }

    src.connect(gain);
    gain.connect(destination);
    src.start(startTime);
    src.stop(startTime + clipDur + 0.05);
  }

  private updateProgress(
    state: BounceState,
    progress: number,
    message: string,
    onProgress?: (p: BounceProgress) => void
  ): void {
    const eta = progress > 0 && progress < 100
      ? Math.round(((100 - progress) / progress) * 3 * 10) / 10
      : 0;

    const p: BounceProgress = { state, progress, etaSeconds: eta, message };
    this.progress.set(p);
    onProgress?.(p);
  }
}
