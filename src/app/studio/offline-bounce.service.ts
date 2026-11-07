import { Injectable, Injector, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { MusicManagerService } from "../services/music-manager.service";
import { WavEncoder } from "./wav-encoder.util";
import { LoggingService } from "../services/logging.service";

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

      this.updateProgress(
        "preparing",
        5,
        `Rendering ${totalBars.toFixed(1)} bars at ${sampleRate / 1000}kHz…`,
        onProgress,
      );

      // One renderer, not two. The full bounce used to run the simplified
      // arrangement pass below, which had no automation, CC curves, aux sends
      // or insert rack — a lane drawn in the editor was dropped on export.
      // ExportService is the authoritative renderer; resolve it lazily to
      // avoid the MusicManager construction cycle.
      const { ExportService } = await import("../services/export.service");
      const exporter = this.injector.get(ExportService);
      const renderedBuffer = await exporter.renderProjectOffline({
        sampleRate,
        durationBars: durationBars ?? totalSteps / 16,
        tailSeconds,
        onProgress: (percent) => {
          this.updateProgress(
            "rendering",
            Math.max(10, Math.min(90, 10 + percent * 0.8)),
            "Rendering arrangement…",
            onProgress,
          );
        },
      });

      this.updateProgress("encoding", 90, `Encoding to ${format}…`, onProgress);

      const result = this.buildResult(
        renderedBuffer,
        format,
        sampleRate,
        renderedBuffer.duration,
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

  /** Notated bar length at a tempo; the meter lives on the engine. */
  private secondsPerBar(tempo: number): number {
    const sig: { beats?: number; unit?: number } | undefined = (
      this.engine as any
    ).timeSignature?.();
    const beats = Math.max(1, Number(sig?.beats) || 4);
    const unit = Math.max(1, Number(sig?.unit) || 4);
    return beats * (60 / Math.max(1, tempo)) * (4 / unit);
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
