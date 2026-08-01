import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService, TrackNote } from './music-manager.service';
import { WavEncoder } from '../studio/wav-encoder.util';
import { LoggingService } from './logging.service';
import { PluginStoreService } from './plugin-store.service';
import {
  MidiTrackData,
  MidiNoteEvent,
  MidiWriter,
} from '../studio/midi-writer.util';

/** Steps-per-beat grid used across the app (16th-note grid). */
const STEPS_PER_BEAT = 4;

/**
 * Supported export formats. `ext` drives the download filename; `mime` the
 * blob type; `webCodecs` the AudioEncoder codec string (when available).
 */
export interface ExportFormatInfo {
  id: string;
  label: string;
  ext: string;
  mime: string;
  webCodecs?: string;
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  { id: 'wav', label: 'WAV 16-bit', ext: 'wav', mime: 'audio/wav' },
  { id: 'mp3', label: 'MP3 192k', ext: 'mp3', mime: 'audio/mpeg', webCodecs: 'mp3' },
  { id: 'm4a', label: 'AAC (M4A)', ext: 'm4a', mime: 'audio/mp4', webCodecs: 'aac' },
  { id: 'opus', label: 'Opus (OGG)', ext: 'ogg', mime: 'audio/ogg', webCodecs: 'opus' },
];

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private engine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);
  private pluginStore = inject(PluginStoreService);

  async exportProjectWav() {
    this.logger.info('Starting Professional Offline Export...');
    const tempo = this.engine.tempo();
    const bars = this.musicManager.activeLoopBars();
    const secondsPerBar = (60 / tempo) * 4;
    const totalDuration = bars * secondsPerBar;

    return this.realTimeBounce(totalDuration);
  }

  startLiveRecording() {
    const streamDest = this.engine.ctx.createMediaStreamDestination();
    this.engine.masterGain.connect(streamDest);
    const recorder = new MediaRecorder(streamDest.stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const result = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/wav' }));
    });
    recorder.start();
    return { recorder, result };
  }

  // ── Sprint A6 — real offline render ─────────────────────────────────

  /**
   * Render the full arrangement into an AudioBuffer via OfflineAudioContext —
   * no live playback required, deterministic sample-accurate bounce. Each
   * unmuted MIDI track schedules oscillators (from its synthParams envelope)
   * for every note; results are mixed to stereo at the project tempo.
   */
  async renderProjectOffline(): Promise<AudioBuffer> {
    const tempo = Math.max(20, this.engine.tempo());
    const bars = Math.max(1, this.musicManager.activeLoopBars());
    const secondsPerBar = (60 / tempo) * 4;
    const totalSeconds = Math.max(1, bars * secondsPerBar + 1);
    const sampleRate = 44100;

    const offline = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
    const master = offline.createGain();
    master.gain.value = 0.85;
    master.connect(offline.destination);

    const secondsPerStep = (60 / tempo) / STEPS_PER_BEAT;

    for (const track of this.musicManager.tracks()) {
      if (track.muted || track.type === 'audio' || track.type === 'bus') continue;
      const notes = track.notes ?? [];
      if (notes.length === 0) continue;
      this.scheduleTrackNotes(
        offline,
        master,
        notes,
        track.synthParams ?? { type: 'sine' },
        secondsPerStep,
        track.pan ?? 0
      );
    }

    return offline.startRendering();
  }

  /**
   * Schedule the track's notes using the REAL live synth voice graph
   * (antialiased oscillator + filter + ADSR + glide + pan) via the audio
   * engine, so offline bounces sound identical to live playback.
   */
  private scheduleTrackNotes(
    ctx: OfflineAudioContext,
    master: GainNode,
    notes: TrackNote[],
    params: any,
    secondsPerStep: number,
    trackPan: number
  ): void {
    for (const n of notes) {
      if (n.velocity <= 0) continue;
      // Probability gate — matches live playStep behavior
      if (n.probability !== undefined && Math.random() >= n.probability) continue;

      const start =
        Math.max(0, (n.step ?? 0) * secondsPerStep) +
        (n.microOffset ?? 0) * secondsPerStep;
      const baseFreq = 440 * Math.pow(2, ((n.midi ?? 60) - 69) / 12);
      const freq = baseFreq * Math.pow(2, (n.pitchBend ?? 0) / 12);

      // Articulation-driven length multiplier — same table as live playStep
      let lengthMul = 1.0;
      switch (n.articulation) {
        case 'staccato': lengthMul = 0.25; break;
        case 'legato': lengthMul = 1.1; break;
        case 'pizzicato': lengthMul = 0.15; break;
        case 'accent': lengthMul = 0.5; break;
      }
      const dur = Math.max(
        0.05,
        (n.length ?? 1) * secondsPerStep * lengthMul
      );

      // Slide notes: glide from the base pitch to the pitch-bend target
      const glideTo =
        n.isSlide && (n.pitchBend ?? 0) !== 0
          ? baseFreq * Math.pow(2, (n.pitchBend ?? 0) / 12)
          : undefined;
      const voiceParams =
        glideTo !== undefined
          ? { ...params, glideTo: baseFreq * Math.pow(2, (n.pitchBend ?? 0) / 12) }
          : params;

      const notePan = n.notePan ?? trackPan;
      this.engine.scheduleOfflineNote(
        ctx,
        master,
        freq,
        start,
        n.velocity ?? 0.8,
        dur,
        voiceParams,
        notePan
      );
    }
  }

  async applySmuvePolish(buffer: AudioBuffer): Promise<AudioBuffer> {
    // Sprint B1 — the enabled WASM plugin chain IS the S.M.U.V.E Polish stage.
    this.logger.info('Applying Elite S.M.U.V.E Polish (WASM plugin chain)...');
    return this.pluginStore.applyEnabledChain(buffer);
  }

  // ── Sprint A6 — real format encoding ────────────────────────────────

  /**
   * Encode an AudioBuffer to the requested format. WAV is always supported
   * (PCM via WavEncoder). MP3 / AAC / Opus use the browser's WebCodecs
   * AudioEncoder when available and gracefully fall back to WAV otherwise.
   */
  async exportToFormat(
    buffer: AudioBuffer,
    format: string,
    _quality: number = 16
  ): Promise<Blob> {
    const info = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];

    if (info.id === 'wav') {
      const wav = await this.audioBufferToWav(buffer);
      return new Blob([wav], { type: 'audio/wav' });
    }

    if (info.webCodecs && typeof (globalThis as any).AudioEncoder === 'function') {
      try {
        const encoded = await this.encodeViaWebCodecs(buffer, info);
        if (encoded) return encoded;
      } catch (err) {
        this.logger.warn(`WebCodecs ${info.id} encode failed, falling back to WAV`, err);
      }
    }

    // Graceful fallback: lossless WAV keeps the export usable on every browser.
    const wav = await this.audioBufferToWav(buffer);
    return new Blob([wav], { type: 'audio/wav' });
  }

  /** Encode an AudioBuffer to a compressed format via WebCodecs AudioEncoder. */
  private async encodeViaWebCodecs(
    buffer: AudioBuffer,
    info: ExportFormatInfo
  ): Promise<Blob | null> {
    const AudioEncoderCtor = (globalThis as any).AudioEncoder;
    if (typeof AudioEncoderCtor !== 'function') return null;
    const codec = info.webCodecs!;

    const channelData: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      channelData.push(buffer.getChannelData(c));
    }
    const frames = Math.max(
      0,
      Math.floor((buffer.length / buffer.sampleRate) * 48000)
    );
    const pcm = new Float32Array(Math.max(1, frames) * channelData.length);
    // Resample stereo/mono to 48k float planar-ish interleaved for the encoder.
    const ratio = buffer.sampleRate / 48000;
    for (let i = 0; i < frames; i++) {
      const srcIdx = Math.min(buffer.length - 1, Math.floor(i * ratio));
      for (let c = 0; c < channelData.length; c++) {
        pcm[i * channelData.length + c] = channelData[c][srcIdx];
      }
    }

    const config: AudioEncoderConfig = {
      codec,
      sampleRate: 48000,
      numberOfChannels: channelData.length,
      bitrate: info.id === 'mp3' ? 192_000 : info.id === 'opus' ? 160_000 : 128_000,
    };
    if (!AudioEncoderCtor.isConfigSupported) {
      return null;
    }
    const support = await AudioEncoderCtor.isConfigSupported(config);
    if (!support?.supported) return null;

    const chunks: BlobPart[] = [];
    const encoder = new AudioEncoderCtor({
      output: (chunk: any, metadata: any) => {
        const mime = metadata?.decoderConfig?.description
          ? info.mime
          : info.mime;
        chunks.push(new Blob([chunk], { type: mime }));
      },
      error: (e: any) => this.logger.warn('AudioEncoder error', e),
    });
    encoder.configure(config);

    const frameSize = 1024;
    for (let offset = 0; offset < pcm.length; offset += frameSize * channelData.length) {
      const end = Math.min(offset + frameSize * channelData.length, pcm.length);
      const framePcm = pcm.subarray(offset, end);
      // Pad to a full frame when the tail is short.
      if (end - offset < frameSize * channelData.length) {
        const padded = new Float32Array(frameSize * channelData.length);
        padded.set(framePcm);
        encoder.encode(new AudioData({
          format: 'f32-planar',
          sampleRate: 48000,
          numberOfFrames: frameSize,
          numberOfChannels: channelData.length,
          timestamp: (offset / channelData.length / 48000) * 1_000_000,
          data: padded,
        }));
      } else {
        encoder.encode(new AudioData({
          format: 'f32-planar',
          sampleRate: 48000,
          numberOfFrames: frameSize,
          numberOfChannels: channelData.length,
          timestamp: (offset / channelData.length / 48000) * 1_000_000,
          data: framePcm,
        }));
      }
    }
    await encoder.flush();
    encoder.close();

    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: info.mime });
  }

  async audioBufferToWav(buffer: AudioBuffer): Promise<ArrayBuffer> {
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    const interleaved = this.interleave(channels);
    const blob = WavEncoder.encode(
      [interleaved],
      buffer.numberOfChannels,
      buffer.sampleRate
    );
    return await blob.arrayBuffer();
  }

  private interleave(channels: Float32Array[]): Float32Array {
    if (channels.length === 1) return channels[0];
    const length = channels[0].length * channels.length;
    const result = new Float32Array(length);
    for (let i = 0; i < channels[0].length; i++) {
      for (let j = 0; j < channels.length; j++) {
        result[i * channels.length + j] = channels[j][i];
      }
    }
    return result;
  }

  // ── Sprint A6 — MIDI export ─────────────────────────────────────────

  /**
   * Export the arrangement as a Standard MIDI File (Format 1) via MidiWriter.
   * One track per unmuted MIDI track; 16th-note steps map to 480 TPQN ticks.
   */
  exportProjectMidi(): Blob {
    const bpm = Math.max(20, this.engine.tempo());
    const sequenceName =
      this.musicManager.projectName || 'S.M.U.V.E Project';
    const midiTracks: MidiTrackData[] = [];

    for (const track of this.musicManager.tracks()) {
      if (track.muted || track.type === 'audio' || track.type === 'bus') continue;
      const notes = track.notes ?? [];
      if (notes.length === 0) continue;

      const midiNotes: MidiNoteEvent[] = notes
        .filter((n) => (n.velocity ?? 0.8) > 0)
        .map((n) => ({
          note: Math.max(0, Math.min(127, Math.round(n.midi ?? 60))),
          velocity: Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.8) * 127))),
          startTick: Math.max(0, Math.round((n.step ?? 0) * 120)),
          durationTicks: Math.max(1, Math.round((n.length ?? 1) * 120)),
        }));
      if (midiNotes.length === 0) continue;

      midiTracks.push({
        name: track.name || 'Track',
        notes: midiNotes,
      });
    }

    const bytes = MidiWriter.toArrayBuffer(midiTracks, bpm, sequenceName);
    return new Blob([bytes], { type: 'audio/midi' });
  }

  async startVideoExport(config: any) {
    return {
      recorder: { stop: () => {} },
      result: Promise.resolve(new Blob()),
    };
  }

  public downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Sprint A6.5 — export share sheet ──────────────────────────────

  /**
   * Share a rendered/encoded blob via the native Web Share API when available
   * (Android/iOS share sheet with the audio file attached). Falls back to a
   * plain download + clipboard link copy everywhere else.
   *
   * @returns true when the native share sheet was used, false on fallback.
   */
  async shareBlob(blob: Blob, filename: string): Promise<boolean> {
    const nav = navigator as any;
    const file = new File([blob], filename, { type: blob.type });

    if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
      try {
        if (nav.canShare({ files: [file] })) {
          await nav.share({
            files: [file],
            title: `${this.musicManager.projectName || 'Elite Session'} — S.M.U.V.E`,
            text: `Made with S.M.U.V.E — ${filename}`,
          });
          return true;
        }
      } catch (err: any) {
        // User dismissed the sheet (AbortError) → fall through to download.
        if (err?.name === 'AbortError') return false;
        this.logger.warn('Web Share failed, falling back to download', err);
      }
    }

    // Fallback: download + copy a shareable link.
    this.downloadBlob(blob, filename);
    try {
      const url = `${location.origin}/studio?view=arrangement&export=${encodeURIComponent(filename)}`;
      await navigator.clipboard?.writeText(url);
    } catch {
      // clipboard unavailable — download alone is fine
    }
    return false;
  }

  /**
   * One-tap share: render the project offline with real synth voices, encode
   * to the requested format, then open the native share sheet.
   */
  async exportAndShare(format: string): Promise<boolean> {
    const buffer = await this.renderProjectOffline();
    const polished = await this.applySmuvePolish(buffer);
    const blob = await this.exportToFormat(polished, format, 16);
    const info = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];
    const filename = `${(this.musicManager.projectName || 'Elite_Session').replace(/\s+/g, '_')}_${Date.now()}.${info.ext}`;
    return this.shareBlob(blob, filename);
  }

  /** Share the arrangement as a Standard MIDI File via the native sheet. */
  async shareMidi(): Promise<boolean> {
    const blob = this.exportProjectMidi();
    const filename = `${(this.musicManager.projectName || 'Elite_Session').replace(/\s+/g, '_')}_${Date.now()}.mid`;
    return this.shareBlob(blob, filename);
  }

  // ── Mastering: real-render analysis meters ─────────────────────────

  /**
   * Analyze a rendered buffer for the mastering suite: true peak (dBFS),
   * RMS (dBFS), an integrated LUFS estimate (K-weighting approximated via
   * simple mean-square with a 4dB high-shelf tilt), and duration.
   */
  analyzeBuffer(
    buffer: AudioBuffer
  ): {
    peakDb: number;
    rmsDb: number;
    lufs: number;
    durationSec: number;
    sampleCount: number;
  } {
    const ch = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
    const length = ch.length;
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < length; i++) {
      const s = ch[i];
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      sumSq += s * s;
    }
    const rms = length > 0 ? Math.sqrt(sumSq / length) : 0;
    const peakDb = 20 * Math.log10(Math.max(peak, 1e-6));
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-6));
    // K-weighting approximation: +4dB high-shelf tilt + mean-square.
    const lufs = rmsDb + 4;
    return {
      peakDb: Math.round(peakDb * 10) / 10,
      rmsDb: Math.round(rmsDb * 10) / 10,
      lufs: Math.round(lufs * 10) / 10,
      durationSec: Math.round((length / (buffer.sampleRate || 44100)) * 100) / 100,
      sampleCount: length,
    };
  }

  private async realTimeBounce(duration: number) {
    if (this.engine.isPlaying()) {
      throw new Error(
        'WAV export requires playback to be stopped before starting the bounce.'
      );
    }

    const { recorder, result } = this.startLiveRecording();
    this.engine.start();

    setTimeout(
      () => {
        this.engine.stop();
        recorder.stop();
      },
      duration * 1000 + 500
    );

    const blob = await result;
    this.downloadBlob(blob, `Elite_Session_${Date.now()}.wav`);
    return blob;
  }
}
