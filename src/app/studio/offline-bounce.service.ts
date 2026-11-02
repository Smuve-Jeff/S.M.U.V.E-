import { Injectable, Injector, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { InstrumentsService, scheduleOfflinePresetSample } from "../services/instruments.service";
import { drumRatchetCount, MusicManagerService } from "../services/music-manager.service";
import { WavEncoder } from "./wav-encoder.util";
import { LoggingService } from "../services/logging.service";
import { connectOfflineMasterChain } from "../services/offline-master-chain";

export type BounceFormat = "wav-16" | "wav-32" | "wav-32-float";
export type BounceState =
  | "idle"
  | "preparing"
  | "rendering"
  | "mixing"
  | "encoding"
  | "complete"
  | "error";

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
@Injectable({ providedIn: "root" })
export class OfflineBounceService {
  private readonly engine = inject(AudioEngineService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly instruments = inject(InstrumentsService);
  private readonly logger = inject(LoggingService);
  /**
   * Lazy because ExportService → MusicManagerService → this service is a
   * construction cycle. The exporter is only resolved when a track bounce
   * actually starts, after every constructor has finished.
   */
  private readonly injector = inject(Injector);

  readonly progress = signal<BounceProgress>({
    state: "idle",
    progress: 0,
    etaSeconds: 0,
    message: "Ready",
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
    format: BounceFormat = "wav-32-float",
    durationBars?: number,
    tailSeconds = 2.0,
    onProgress?: (p: BounceProgress) => void,
  ): Promise<BounceResult | null> {
    if (this.isBouncing()) {
      this.logger.warn("OfflineBounce: Bounce already in progress");
      return null;
    }

    this.isBouncing.set(true);
    this.updateProgress(
      "preparing",
      0,
      "Preparing offline render context…",
      onProgress,
    );

    try {
      const sampleRate = this.getSampleRate(format);
      const tempo = this.engine.tempo();
      const totalSteps = this.computeTotalSteps(durationBars);
      const stepSeconds = 60 / tempo / 4;
      // Bars are meter-aware (3/4, 6/8 …); the render length is straight
      // step time plus the requested tail.
      const totalBars = (totalSteps * stepSeconds) / this.secondsPerBar(tempo);
      const totalDuration = totalSteps * stepSeconds + tailSeconds;
      const totalFrames = Math.ceil(totalDuration * sampleRate);

      this.updateProgress(
        "preparing",
        5,
        `Rendering ${totalBars.toFixed(1)} bars at ${sampleRate / 1000}kHz…`,
        onProgress,
      );

      // Create offline context
      const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

      // Clone the arrangement into the offline context
      await this.renderArrangement(
        offlineCtx,
        totalSteps,
        totalDuration,
        sampleRate,
        onProgress,
        undefined,
        durationBars === undefined ? totalSteps - 16 : totalSteps,
      );

      this.updateProgress(
        "rendering",
        40,
        "Processing audio through mastering chain…",
        onProgress,
      );

      // Start rendering
      const renderedBuffer = await offlineCtx.startRendering();

      this.updateProgress("mixing", 75, "Mixing down to stereo…", onProgress);
      this.updateProgress("encoding", 90, `Encoding to ${format}…`, onProgress);

      const result = this.buildResult(
        renderedBuffer,
        format,
        sampleRate,
        totalDuration,
      );

      this.lastResult.set(result);
      this.updateProgress(
        "complete",
        100,
        `Bounce complete · ${result.peakDb}dB peak · ${result.rmsDb}dB RMS`,
        onProgress,
      );
      this.logger.info(
        `OfflineBounce: ${totalBars.toFixed(1)} bars rendered to ${format}`,
      );

      return result;
    } catch (err: any) {
      this.updateProgress(
        "error",
        0,
        `Bounce failed: ${err?.message ?? "unknown"}`,
        onProgress,
      );
      this.logger.error("OfflineBounce failed", err);
      return null;
    } finally {
      this.isBouncing.set(false);
    }
  }

  /** Cancel an in-progress bounce (best-effort via abort flag) */
  cancel(): void {
    // OfflineAudioContext doesn't support cancellation, but we mark idle
    this.isBouncing.set(false);
    this.updateProgress("idle", 0, "Cancelled");
  }

  /**
   * Render a single track (synth notes + audio clips) to a WAV file — the
   * "Bounce Selected" action. Respects the track's mute/solo, clip fades
   * and the shared offline mastering gain.
   */
  async bounceTrack(
    trackId: string,
    format: BounceFormat = "wav-32-float",
    tailSeconds = 1.0,
  ): Promise<BounceResult | null> {
    const track = this.musicManager.tracks().find((t) => t.id === trackId);
    if (!track) {
      this.logger.warn("OfflineBounce: unknown track", trackId);
      return null;
    }
    if (this.isBouncing()) {
      this.logger.warn("OfflineBounce: Bounce already in progress");
      return null;
    }

    this.isBouncing.set(true);
    const trackName = (track as any).name ?? "Track";
    this.updateProgress("preparing", 0, `Preparing "${trackName}"…`);

    try {
      const sampleRate = this.getSampleRate(format);
      // One renderer, not two. Track bounce/freeze used to run the simplified
      // scheduling path above, which had no automation, CC curves, aux sends or
      // insert rack — so a frozen track could sound unlike the same track in
      // the full export. ExportService is the authoritative renderer; resolve it
      // lazily to avoid the MusicManager construction cycle.
      const { ExportService } = await import("../services/export.service");
      const exporter = this.injector.get(ExportService);
      const renderedBuffer = await exporter.renderProjectOffline({
        onlyTrackIds: new Set([trackId]),
        ignoreSolo: true,
        sampleRate,
      });
      const totalDuration = renderedBuffer.duration;
      const totalBars =
        (totalDuration - tailSeconds) / this.secondsPerBar(this.engine.tempo());
      this.updateProgress("encoding", 90, `Encoding to ${format}…`, undefined);
      const result = this.buildResult(
        renderedBuffer,
        format,
        renderedBuffer.sampleRate,
        totalDuration,
      );

      this.lastResult.set(result);
      this.updateProgress(
        "complete",
        100,
        `Bounced "${trackName}" · ${result.peakDb}dB peak`,
        undefined,
      );
      this.logger.info(
        `OfflineBounce: track ${trackId} (${totalBars.toFixed(1)} bars) → ${format}`,
      );
      return result;
    } catch (err: any) {
      this.updateProgress(
        "error",
        0,
        `Track bounce failed: ${err?.message ?? "unknown"}`,
      );
      this.logger.error("OfflineBounce track render failed", err);
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
    durationSeconds: number,
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
      case "wav-32-float":
      case "wav-32":
        return 96000;
      case "wav-16":
      default:
        return 48000;
    }
  }

  private computeTotalSteps(
    durationBars?: number,
    onlyTrackId?: string,
  ): number {
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
        if (track.type === 'drum' && track.drumPatternLength && note.step >= this.musicManager.drumPatternSpan(track)) continue;
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
    onlyTrackId?: string,
    musicalEndStep = totalSteps,
  ): Promise<void> {
    const tempo = this.engine.tempo();
    const stepsPerBeat = 4;
    const stepDuration = 60 / tempo / stepsPerBeat;

    // Use live master gain instead of hard-coded value
    const liveMasterGain = this.engine.masterGain.gain.value;
    const masterGain = ctx.createGain();
    masterGain.gain.value = liveMasterGain;
    if (onlyTrackId) {
      // A selected-track bounce is a pre-master stem.
      masterGain.connect(ctx.destination);
    } else {
      connectOfflineMasterChain(ctx, masterGain, this.engine);
    }

    this.updateProgress(
      "rendering",
      15,
      "Scheduling notes and clips…",
      onProgress,
    );

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
        // Solo-safe channels stay in the render under another channel's solo,
        // matching the live stepper so a bounce is not quieter than playback.
        ? pool.filter((t: any) => t.soloed === true || t.soloSafe === true)
        : pool.filter((t: any) => !t.muted);

    let trackCount = 0;

    for (const track of activeTracks) {
      trackCount++;
      const progressBase =
        15 + (trackCount / Math.max(1, activeTracks.length)) * 30;
      const trackLabel =
        "name" in (track as any) ? (track as any).name : `Track ${trackCount}`;
      this.updateProgress(
        "rendering",
        progressBase,
        `Rendering track: ${trackLabel}`,
        onProgress,
      );

      if (track.type !== "audio" && this.instruments.isSamplePreset(track.instrumentId)) {
        await this.musicManager.prepareTrackSamples(track, true);
      }
      const trackGain = (track as any).gain ?? 0.8;
      const synthParams = this.getTrackSynthParams(track as any);

      const notes = track.type === "drum" || this.instruments.isSamplePreset(track.instrumentId)
        ? this.musicManager.arrangementNotes(track, musicalEndStep) : track.notes;
      for (const note of notes) {
        if (note.step >= totalSteps) continue;
        this.renderNote(
          ctx,
          note,
          trackGain,
          synthParams,
          masterGain,
          stepDuration,
          track.instrumentId,
          track.pan ?? 0,
          track.type === "drum",
        );
      }

      // Audio clips — schedule the cached buffer (stem splits, recorded
      // takes, imported audio) so bounced exports include sampled material
      // instead of silently dropping it.
      const clips = (track as any).clips ?? [];
      if (clips.length > 0) {
        const secPerBar = this.secondsPerBar(tempo);
        for (const clip of clips) {
          if (clip.type !== "audio") continue;
          let clipBuffer =
            (clip as any).audioData ||
            ((clip as any).audioRefId &&
              this.musicManager.stemAudioCache?.get((clip as any).audioRefId));
          // Streamed long imports carry a SampleStreamer; render the bounded
          // resident window cued to the clip origin, as the live engine does.
          if (!clipBuffer && (clip as any).clipStreamer) {
            const streamer = (clip as any).clipStreamer;
            streamer.setPlayhead(
              Math.max(0, ((clip as any).clipOriginSeconds || 0) *
                ((clip as any).clipSampleRate || 48000)),
            );
            clipBuffer = streamer.getResidentBuffer();
          }
          if (!clipBuffer) continue;
          this.renderAudioClip(
            ctx,
            clip,
            clipBuffer,
            trackGain,
            masterGain,
            secPerBar,
            tempo,
          );
        }
      }
    }

    if (activeTracks.length === 0 && tracks.length > 0) {
      this.updateProgress(
        "rendering",
        50,
        "All tracks muted — rendering silence…",
        onProgress,
      );
    }

    this.updateProgress(
      "rendering",
      55,
      "Applying mix automation…",
      onProgress,
    );
  }

  /** The track's synth patch, shared with the live voice builder. */
  private getTrackSynthParams(track: any): Record<string, any> {
    const params = track?.synthParams;
    return params && typeof params === "object" ? { ...params } : {};
  }

  private renderNote(
    ctx: OfflineAudioContext,
    note: {
      step: number;
      midi: number;
      length: number;
      velocity: number;
      params?: any;
      microOffset?: number;
      probability?: number;
      pitchBend?: number;
      notePan?: number;
      articulation?: string;
    },
    trackGain: number,
    synthParams: Record<string, any>,
    destination: AudioNode,
    stepDuration: number,
    instrumentId: string,
    trackPan: number,
    isDrum = false,
  ): void {
    if (isDrum && note.probability !== undefined && Math.random() >= note.probability) return;
    const startTime = Math.max(0, (note.step + (note.microOffset ?? 0)) * stepDuration);
    const ratchet = isDrum ? drumRatchetCount(note.params) : 1;
    const duration = ratchet > 1
      ? Math.min(note.length * stepDuration, stepDuration / ratchet)
      : note.length * stepDuration;
    const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
    const velocity = note.velocity ?? 0.8;

    // Imported pad one-shots carry their decoded PCM in the note params.
    // Without this branch the bounce synthesized a pitched oscillator and the
    // exported kick/snare/hat did not match the pad the artist played.
    const inlineOneShot = note.params?.sampleBuffer as AudioBuffer | undefined;
    const oneShot =
      inlineOneShot &&
      Number.isFinite(inlineOneShot.duration) &&
      inlineOneShot.duration > 0
        ? inlineOneShot
        : note.params?.sampleRefId
          ? this.musicManager.stemAudioCache.get(note.params.sampleRefId)
          : undefined;
    if (oneShot && Number.isFinite(oneShot.duration) && oneShot.duration > 0) {
      for (let hit = 0; hit < ratchet; hit++) {
        const source = ctx.createBufferSource();
        source.buffer = oneShot;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, velocity * trackGain));
        source.connect(gain);
        gain.connect(destination);
        source.start(startTime + hit * stepDuration / ratchet);
      }
      return;
    }

    if (this.instruments.isSamplePreset(instrumentId)) {
      const sample = this.instruments.getPresetSample(
        instrumentId, note.midi, velocity, note.pitchBend ?? 0,
      );
      if (!sample) throw new Error(`Sample for MIDI ${note.midi} in “${instrumentId}” is unavailable.`);
      const lengthMul = note.articulation === 'staccato' ? 0.25
        : note.articulation === 'legato' ? 1.1
        : note.articulation === 'pizzicato' ? 0.15
        : note.articulation === 'accent' ? 0.5 : 1;
      for (let hit = 0; hit < ratchet; hit++) {
        scheduleOfflinePresetSample(ctx, destination, sample, startTime + hit * stepDuration / ratchet,
          ratchet > 1 ? Math.min(note.length * stepDuration * lengthMul, stepDuration / ratchet) : duration * lengthMul,
          velocity * trackGain, note.notePan ?? trackPan);
      }
      return;
    }

    // Same voice graph the artist hears: the track's filter, ADSR, sub
    // oscillator, LFO, pitch glide and pan all reach the export instead of a
    // bare oscillator with a fixed envelope.
    for (let hit = 0; hit < ratchet; hit++) {
      this.engine.scheduleOfflineNote(
        ctx,
        destination,
        freq,
        startTime + hit * stepDuration / ratchet,
        velocity * Math.max(0, trackGain),
        duration,
        { ...synthParams, ...(note.params ?? {}) },
        note.notePan ?? trackPan,
      );
    }
  }

  /** Notated bar length at a tempo; the meter lives on the engine. */
  private secondsPerBar(tempo: number): number {
    const sig: { beats?: number; unit?: number } | undefined = (
      this.engine as any
    ).timeSignature?.();
    const beats = Math.max(1, Number(sig?.beats) || 4);
    const unit = Math.max(1, Number(sig?.unit) || 4);
    return beats * (60 / Math.max(1, tempo)) * (4 / unit);
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
    tempo: number,
  ): void {
    const startTime = (clip.start || 0) * secPerBar;
    const clipDur = Math.max(0.001, (clip.length || 4) * secPerBar);
    const rate =
      typeof this.engine.calculatePlaybackRate === "function"
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
        startTime + Math.max(0.001, clipDur - 0.001),
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
    onProgress?: (p: BounceProgress) => void,
  ): void {
    const eta =
      progress > 0 && progress < 100
        ? Math.round(((100 - progress) / progress) * 3 * 10) / 10
        : 0;

    const p: BounceProgress = { state, progress, etaSeconds: eta, message };
    this.progress.set(p);
    onProgress?.(p);
  }
}
