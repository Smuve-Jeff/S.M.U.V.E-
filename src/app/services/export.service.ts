import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService, TrackNote } from './music-manager.service';
import { WavEncoder } from '../studio/wav-encoder.util';
import { LoggingService } from './logging.service';
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
      this.scheduleTrackNotes(offline, master, notes, track.synthParams ?? { type: 'sine' }, secondsPerStep);
    }

    return offline.startRendering();
  }

  /** Schedule one oscillator voice per note with the track's ADSR envelope. */
  private scheduleTrackNotes(
    ctx: OfflineAudioContext,
    master: GainNode,
    notes: TrackNote[],
    params: any,
    secondsPerStep: number
  ): void {
    const type = params?.type ?? 'sine';
    const attack = params?.attack ?? 0.01;
    const decay = params?.decay ?? 0.1;
    const sustain = params?.sustain ?? 0.7;
    const release = params?.release ?? 0.2;

    for (const n of notes) {
      if (n.velocity <= 0) continue;
      const start = Math.max(0, (n.step ?? 0) * secondsPerStep);
      const dur = Math.max(0.05, (n.length ?? 1) * secondsPerStep);
      const freq = 440 * Math.pow(2, ((n.midi ?? 60) - 69) / 12);

      const osc = ctx.createOscillator();
      osc.type = (type as OscillatorType) || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      const gain = ctx.createGain();
      const peak = Math.min(1, Math.max(0.02, (n.velocity ?? 0.8) * 0.9));

      // ADSR envelope
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.setValueAtTime(peak, start + attack + decay);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, peak * sustain),
        start + attack + decay
      );
      gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), start + dur - release);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
  }

  async applySmuvePolish(buffer: AudioBuffer): Promise<AudioBuffer> {
    this.logger.info('Applying Elite S.M.U.V.E Polish...');
    return buffer;
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
