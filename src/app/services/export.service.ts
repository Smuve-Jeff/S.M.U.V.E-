import { Injectable, inject, signal } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService, TrackNote } from './music-manager.service';
import { VideoEngineService } from './video-engine.service';
import { WavEncoder } from '../studio/wav-encoder.util';
import {
  ABSOLUTE_GATE_LUFS,
  analyseChannels,
  phaseCorrelation,
  toDecibels,
} from './loudness-meter';
import { LoggingService } from './logging.service';
import { PluginStoreService } from './plugin-store.service';
import {
  MidiTrackData,
  MidiNoteEvent,
  MidiWriter,
} from '../studio/midi-writer.util';
import { buildZip, type ZipEntry } from '../studio/zip.util';

/** Steps-per-beat grid used across the app (16th-note grid). */
const STEPS_PER_BEAT = 4;

/** Container/codec preference order for `MediaRecorder` video muxing. */
const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

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
  { id: 'wav24', label: 'WAV 24-bit', ext: 'wav', mime: 'audio/wav' },
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
  private videoEngine = inject(VideoEngineService);

  /** True while a canvas capture is recording. */
  private isCapturing = signal(false);

  /** Sum of every tapped timeline clip's audio; zero unless a take is rolling. */
  private clipAudioTap: GainNode | null = null;

  /**
   * Whether the timeline transport was rolling when the live capture started.
   *
   * A capture always rolls the transport (the frames being recorded come from
   * the timeline), so "was it rolling before" is the only thing needed to hand
   * it back the way the caller found it.
   */
  private transportWasRolling = false;

  /**
   * Render the master mix to WAV.
   *
   * `bitDepth` defaults to 16 for the everyday mixdown; 24 is the delivery
   * format for mixing/mastering, where the extra headroom survives the other
   * engineer's gain staging. Filenames carry the depth so a 16-bit file and a
   * 24-bit file of the same take cannot be confused in a download folder.
   */
  async exportProjectWav(
    bitDepth: 16 | 24 = 16,
    sampleRate: number = 44100
  ): Promise<Blob> {
    this.logger.info(
      `Starting offline PCM WAV (${bitDepth}-bit, ${sampleRate} Hz) export...`
    );
    const buffer = await this.renderProjectOffline({ sampleRate });
    const blob = await this.exportToFormat(
      buffer,
      bitDepth === 24 ? 'wav24' : 'wav'
    );
    const depthTag = bitDepth === 24 ? '_24bit' : '';
    const rateTag = Math.round(sampleRate) === 44100 ? '' : `_${Math.round(sampleRate / 1000)}k`;
    this.downloadBlob(blob, `${(this.musicManager.projectName || 'Elite_Session').replace(/[^\w.-]/g, '_')}${depthTag}${rateTag}_${Date.now()}.wav`);
    return blob;
  }

  /**
   * Export the master mix plus one WAV stem per unmuted track, bundled in a
   * single ZIP.
   *
   * Each stem is rendered through the same offline graph, at the same sample
   * rate and with the same total length as the master, so the files line up
   * sample-for-sample when a mix engineer drops them into another DAW. Solo is
   * ignored for stems: a stem set that silently drops a soloed track is worse
   * than no stem set. Muted tracks are still skipped.
   *
   * Stems are written at 24-bit: they are the files another engineer will gain
   * stage and process, so they keep the extra 8 bits of resolution that a
   * 16-bit stem would throw away before the first plug-in runs.
   */
  async exportStems(
    options: { bitDepth?: 16 | 24; sampleRate?: number } = {}
  ): Promise<Blob> {
    const bitDepth = options.bitDepth ?? 24;
    const sampleRate = options.sampleRate ?? 44100;
    const projectName = (this.musicManager.projectName || 'Elite_Session').replace(/[^\w.-]/g, '_');
    const tracks = this.musicManager
      .tracks()
      .filter((track) => !track.muted && track.type !== 'bus');
    const entries: ZipEntry[] = [];
    const usedNames = new Set<string>();
    const uniqueName = (raw: string): string => {
      const base = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'Track';
      let name = `${projectName}_${base}.wav`;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        name = `${projectName}_${base}_${suffix++}.wav`;
      }
      usedNames.add(name.toLowerCase());
      return name;
    };

    const master = await this.renderProjectOffline({ sampleRate });
    entries.push({
      name: uniqueName('MASTER'),
      data: new Uint8Array(await this.audioBufferToWav(master, bitDepth)),
    });

    for (const track of tracks) {
      const stem = await this.renderProjectOffline({
        onlyTrackIds: new Set([track.id]),
        ignoreSolo: true,
        sampleRate,
      });
      entries.push({
        name: uniqueName(track.name || 'Track'),
        data: new Uint8Array(await this.audioBufferToWav(stem, bitDepth)),
      });
    }

    this.logger.info(`Exported ${entries.length} stems (master + ${tracks.length} tracks)`);
    const zip = buildZip(entries);
    this.downloadBlob(zip, `${projectName}_stems_${Date.now()}.zip`);
    return zip;
  }

  startLiveRecording() {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Live recording is not supported in this browser (MediaRecorder missing).');
    }
    const streamDest = this.engine.ctx.createMediaStreamDestination();
    this.engine.masterGain.connect(streamDest);
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];
    const mimeType = candidates.find((type) =>
      typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(
      streamDest.stream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: Blob[] = [];
    let settled = false;
    const cleanup = () => {
      try { this.engine.masterGain.disconnect(streamDest); } catch { /* already detached */ }
      streamDest.stream.getTracks?.().forEach((track) => track.stop());
    };
    const result = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const actualMime = recorder.mimeType || mimeType || chunks[0]?.type || 'application/octet-stream';
        resolve(new Blob(chunks, { type: actualMime }));
      };
      recorder.onerror = (event) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject((event as any)?.error ?? new Error('Live recording failed'));
      };
    });
    recorder.start();
    return { recorder, result };
  }

  // ── Sprint A6 — real offline render ─────────────────────────────────

  /** Sample rates the exporter offers: music delivery plus video/broadcast. */
  static readonly SAMPLE_RATES = [44100, 48000] as const;

  /**
   * Render the full arrangement into an AudioBuffer via OfflineAudioContext —
   * no live playback required, deterministic sample-accurate bounce. Each
   * unmuted MIDI track schedules oscillators (from its synthParams envelope)
   * for every note; results are mixed to stereo at the project tempo.
   *
   * `sampleRate` is a render property, not a post-process: the offline context
   * is created at that rate, so an exported 48 kHz file is synthesised at
   * 48 kHz rather than a 44.1 kHz bounce wearing a 48 kHz header.
   */
  async renderProjectOffline(
    options: {
      /** Render only these track ids (stems). Length still follows the song. */
      onlyTrackIds?: ReadonlySet<string>;
      /** Ignore the project's solo state — a stem set must contain every track. */
      ignoreSolo?: boolean;
      /** Delivery sample rate (default 44.1 kHz). */
      sampleRate?: number;
    } = {},
  ): Promise<AudioBuffer> {
    const tempo = Math.max(20, Math.min(300, this.engine.tempo()));
    const tracks = this.musicManager.tracks();
    const lastEventStep = tracks.reduce((end, track) => Math.max(end,
      ...(track.notes ?? []).map((note) => note.step + note.length),
      ...(track.clips ?? []).map((clip: any) => {
        const clipSeconds = clip.clipLengthSeconds ?? clip.length * (60 / tempo) * 4;
        return clip.start * 16 + clipSeconds / ((60 / tempo) / 4);
      }),
    ), 0);
    const bars = Math.max(1, this.musicManager.activeLoopBars(), Math.ceil(lastEventStep / 16));
    const secondsPerBar = (60 / tempo) * 4;
    const totalSeconds = Math.max(1, bars * secondsPerBar + 1);
    if (!Number.isFinite(totalSeconds) || totalSeconds > 600) throw new Error('Offline export supports up to 10 minutes per render. Shorten the arrangement first.');
    // Guard the context constructor: a NaN/0 rate throws deep inside WebAudio
    // with a message that says nothing about the export.
    const sampleRate =
      Number.isFinite(options.sampleRate) && (options.sampleRate ?? 0) >= 8000
        ? Math.round(options.sampleRate!)
        : 44100;

    const offline = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
    const master = offline.createGain();
    master.gain.value = this.engine.masterGain.gain.value;
    master.connect(offline.destination);

    const secondsPerStep = (60 / tempo) / STEPS_PER_BEAT;

    // A single-track render is a stem: solo on another track must not silence
    // it, so `onlyTrackIds` implies `ignoreSolo`.
    const hasSolo =
      !options.ignoreSolo &&
      !options.onlyTrackIds &&
      tracks.some((track) => track.soloed);
    for (const track of tracks) {
      if (options.onlyTrackIds && !options.onlyTrackIds.has(track.id)) continue;
      if (track.muted || (hasSolo && !track.soloed) || track.type === 'bus') continue;
      const channel = offline.createGain();
      channel.gain.value = Math.max(0, Math.min(1.5, track.gain ?? track.volume ?? 0.8));
      channel.connect(master);
      if (track.type !== 'audio') {
        this.scheduleTrackNotes(offline, channel, track.notes ?? [],
          track.synthParams ?? { type: 'sine' }, secondsPerStep, track.pan ?? 0);
      }
      for (const clip of track.clips ?? []) {
        if (clip.type !== 'audio') continue;
        // One panner + one fade gain per clip: a clip's fade is its own
        // envelope, so clips sharing a track cannot share a gain stage
        // without one clip's fade doubling or muting the other.
        const pan = offline.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, track.pan ?? 0));
        const fader = offline.createGain();
        pan.connect(fader);
        fader.connect(channel);
        const streamer = (clip as any).clipStreamer;
        let buffer = clip.audioData || (clip.audioRefId && this.musicManager.stemAudioCache.get(clip.audioRefId));
        let offset = Math.max(0, clip.offset ?? 0);
        if (!buffer && streamer) {
          const sampleRate = (clip as any).clipSampleRate || 48000;
          streamer.setPlayhead(Math.max(0, ((clip as any).clipOriginSeconds || 0) * sampleRate));
          buffer = streamer.getResidentBuffer();
          offset = streamer.getResidentOffsetSeconds?.() ?? 0;
        }
        if (!buffer) throw new Error(`Audio for “${track.name}” is unavailable. Restore or re-import the clip before export.`);
        const start = Math.max(0, clip.start * secondsPerBar);
        const duration = Math.min(
          clip.clipLengthSeconds ?? clip.length * secondsPerBar,
          streamer ? streamer.getRemainingSecondsFrom((clip as any).clipOriginSeconds || 0) : Math.max(0, buffer.duration - offset),
        );
        // Phase L: clip-level gain and reverse land here with the live path.
        const clipGain = (clip as any).clipGain ?? 1.0;
        const reversedClip = (clip as any).reversed && !streamer;
        const playbackBuffer = reversedClip
          ? this.engine.reverseBuffer(
              buffer as AudioBuffer,
              (channelIndex, src) =>
                src.getChannelData(channelIndex).slice().reverse(),
            )
          : buffer;
        fader.gain.setValueAtTime(clipGain, start);
        this.applyClipFade(fader.gain, start, duration, clip, secondsPerBar);
        if (streamer) {
          const sampleRate = (clip as any).clipSampleRate || 48000;
          const sampleRateRatio = sampleRate / buffer.sampleRate;
          const sourceRate = Math.max(0.01, (this.engine.tempo() / ((clip as any).originalBpm || this.engine.tempo())) * sampleRateRatio);
          let elapsed = 0;
          let sourcePosition = (clip as any).clipOriginSeconds || 0;
          let currentBuffer: AudioBuffer | null = buffer;
          let currentOffset = offset;
          while (currentBuffer && elapsed < duration - 0.000001) {
            const availableSeconds = Math.max(0, currentBuffer.duration - currentOffset);
            const consumedSeconds = Math.min((duration - elapsed) * sourceRate, availableSeconds);
            if (consumedSeconds <= 0.000001) break;
            const source = offline.createBufferSource();
            source.buffer = currentBuffer;
            source.playbackRate.setValueAtTime(sourceRate, start + elapsed);
            source.connect(pan);
            source.start(start + elapsed, currentOffset, consumedSeconds);
            elapsed += consumedSeconds / sourceRate;
            sourcePosition += consumedSeconds / sampleRateRatio;
            if (elapsed < duration - 0.000001) {
              streamer.setPlayhead(sourcePosition * sampleRate);
              currentBuffer = streamer.getResidentBuffer();
              currentOffset = streamer.getResidentOffsetSeconds?.() ?? 0;
            }
          }
        } else {
          const source = offline.createBufferSource();
          source.buffer = playbackBuffer as AudioBuffer;
          source.connect(pan);
          if (duration > 0) source.start(start, offset, duration);
        }
      }
    }

    return offline.startRendering();
  }

  /**
   * Write an audio clip's fade-in/fade-out envelope onto its own gain stage.
   *
   * Phase F2 added fades to the arrangement, but only the live sampler applied
   * them, so a bounced fade came out as a hard edge. The clamps, the linear
   * ramps and the "fade-out never starts before the fade-in ends" rule are
   * copied from `AudioEngineService.triggerSampler` so the export measures the
   * same envelope the artist heard.
   */
  private applyClipFade(
    gain: AudioParam,
    start: number,
    duration: number,
    clip: { length: number; fadeIn?: number; fadeOut?: number },
    secondsPerBar: number
  ): void {
    const safeDuration = Math.max(0.001, duration);
    // Fades are stored in bars, like `start`/`length`; the clamp matches live.
    const fadeIn = Math.max(
      0,
      Math.min(Math.min(clip.fadeIn ?? 0, clip.length) * secondsPerBar, safeDuration)
    );
    const fadeOut = Math.max(
      0,
      Math.min(Math.min(clip.fadeOut ?? 0, clip.length) * secondsPerBar, safeDuration)
    );

    gain.setValueAtTime(0, start);
    if (fadeIn > 0) gain.linearRampToValueAtTime(1, start + fadeIn);
    else gain.setTargetAtTime(1, start, 0.005);
    if (fadeOut > 0) {
      const fadeStart = start + Math.max(fadeIn, safeDuration - fadeOut);
      gain.setValueAtTime(1, fadeStart);
      gain.linearRampToValueAtTime(0, start + safeDuration);
    }
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

      const start = Math.max(0, ((n.step ?? 0) + (n.microOffset ?? 0)) * secondsPerStep);
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

    if (info.id === 'wav' || info.id === 'wav24') {
      const wav = await this.audioBufferToWav(
        buffer,
        info.id === 'wav24' ? 24 : 16
      );
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
    // Resample to 48k in PLANAR layout (all of channel 0, then channel 1, …),
    // which is what AudioData with format 'f32-planar' requires. Interleaving
    // here would scramble stereo channels in the encoded output.
    const ratio = buffer.sampleRate / 48000;
    for (let c = 0; c < channelData.length; c++) {
      const src = channelData[c];
      const base = c * frames;
      for (let i = 0; i < frames; i++) {
        pcm[base + i] = src[Math.min(buffer.length - 1, Math.floor(i * ratio))];
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
    for (let frameStart = 0; frameStart < frames; frameStart += frameSize) {
      const blockFrames = Math.min(frameSize, frames - frameStart);
      // Re-assemble each 1024-frame block as C planar runs, padding the tail.
      const block = new Float32Array(frameSize * channelData.length);
      for (let c = 0; c < channelData.length; c++) {
        block.set(
          pcm.subarray(c * frames + frameStart, c * frames + frameStart + blockFrames),
          c * frameSize
        );
      }
      encoder.encode(new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfFrames: frameSize,
        numberOfChannels: channelData.length,
        timestamp: (frameStart / 48000) * 1_000_000,
        data: block,
      }));
    }
    await encoder.flush();
    encoder.close();

    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: info.mime });
  }

  async audioBufferToWav(
    buffer: AudioBuffer,
    bitDepth: 16 | 24 = 16
  ): Promise<ArrayBuffer> {
    const channels: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    // WavEncoder takes one planar Float32Array per channel and interleaves
    // internally; handing it a pre-interleaved buffer alongside a channel
    // count > 1 throws for stereo renders.
    const blob =
      bitDepth === 24
        ? WavEncoder.encodeMultiChannel(
            channels,
            'wav-24',
            buffer.sampleRate
          )
        : WavEncoder.encode(channels, channels.length, buffer.sampleRate);
    return await blob.arrayBuffer();
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

  // ── Video export (canvas capture) ───────────────────────────────────

  /**
   * Capture a real video master from a canvas element via MediaRecorder.
   *
   * The returned `recorder` intentionally exposes only `stop()`: the caller
   * drives the timeline and owns the capture window. `result` resolves with the
   * muxed blob once the recorder has flushed, and rejects on recorder error so
   * failures surface instead of producing a silent 0-byte download.
   *
   * The transport is handed back by this service, not left to the caller's
   * window timer: a recording can also end for reasons that timer never sees
   * (the recorder erroring, a shared display track ending, the tab being
   * throttled), and the timeline must not be left rolling because one code path
   * was skipped.
   */
  async startVideoExport(
    canvas: HTMLCanvasElement,
    options: {
      fps?: number;
      withAudio?: boolean;
      bitsPerSecond?: number;
      /** Clip sound to sum into the master, when the callsite has any. */
      clipAudio?: AudioNode | null;
    } = {}
  ): Promise<{
    recorder: { stop: () => void };
    result: Promise<Blob>;
    /** Container the recorder actually muxed, for the download's extension. */
    mimeType: string | null;
  }> {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error(
        'Video export is not supported in this browser (MediaRecorder missing).'
      );
    }
    if (typeof canvas?.captureStream !== 'function') {
      throw new Error('Canvas capture is not available in this browser.');
    }

    const stream = canvas.captureStream(options.fps ?? 30);
    // Keep the canvas-owned tracks separate from the shared audio track. Stopping
    // the latter would mute the Studio after an export completes.
    // Older test doubles and a few embedded WebViews expose only addTrack;
    // retain a safe cleanup path without making export fail before recording.
    const canvasTracks =
      typeof stream.getTracks === 'function'
        ? stream.getTracks().filter((track) => track.kind !== 'audio')
        : [];

    // Fold the live master bus into the recording so the exported master keeps
    // its score instead of shipping silent frames, and sum any clip sound on top
    // of it: a take with dialogue in it used to download silent.
    if (options.withAudio !== false) {
      try {
        const audioTrack = this.buildExportAudioTrack(options.clipAudio);
        if (audioTrack) stream.addTrack(audioTrack);
      } catch (err) {
        this.logger.warn('Video export is running without an audio track', err);
      }
    }

    const mimeType = this.resolveVideoMimeType();
    const recorderOptions: MediaRecorderOptions = {
      // 12 Mbps preserves 1080p detail and avoids the soft, blocky master that
      // the previous 6 Mbps default produced on motion-heavy footage.
      videoBitsPerSecond: options.bitsPerSecond ?? 12_000_000,
      audioBitsPerSecond: 192_000,
    };
    if (mimeType) recorderOptions.mimeType = mimeType;

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, recorderOptions);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const result = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        this.endCapture();
        // captureStream() owns tracks that otherwise remain alive after the
        // download, keeping camera/audio resources and encoders resident.
        canvasTracks.forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
      };
      recorder.onerror = (event) => {
        this.endCapture();
        canvasTracks.forEach((track) => track.stop());
        reject(
          (event as unknown as { error?: Error })?.error ??
            new Error('Video recording failed')
        );
      };
    });

    // Snapshot the transport before the caller starts rolling it for the take.
    this.transportWasRolling = this.videoEngine.isPlaying();
    this.isCapturing.set(true);
    recorder.start(250);

    return {
      recorder: {
        stop: () => {
          if (recorder.state !== 'inactive') recorder.stop();
        },
      },
      result,
      mimeType,
    };
  }

  /**
   * Tap a timeline clip's own soundtrack for the master.
   *
   * A clip element is muted and never touches the audio graph, so a take with
   * dialogue in it exported silent. This routes the element through WebAudio
   * (the speakers stop hearing it directly) into a gain that stays at zero until
   * a take actually records, so preview playback is unchanged.
   *
   * @returns false when the host cannot tap the element — cross-origin media
   * without CORS, or a host without `createMediaElementSource`.
   */
  connectClipAudio(element: HTMLMediaElement): boolean {
    try {
      const ctx = this.engine.ctx;
      if (!ctx || typeof ctx.createMediaElementSource !== 'function') {
        return false;
      }
      if (!this.clipAudioTap) {
        this.clipAudioTap = ctx.createGain();
        this.clipAudioTap.gain.value = 0;
      }
      const source = ctx.createMediaElementSource(element);
      source.connect(this.clipAudioTap);
      return true;
    } catch (err) {
      this.logger.warn('Clip audio could not be tapped for export', err);
      return false;
    }
  }

  /** Open or close the clip-audio tap around a take. */
  setClipAudioLevel(level: number): void {
    if (!this.clipAudioTap) return;
    this.clipAudioTap.gain.value = Math.max(0, Math.min(1, level));
  }

  /**
   * One audio track carrying everything the master should hear.
   *
   * The studio bus is re-sourced into a fresh destination so clip audio can be
   * summed with it — `MediaRecorder` records the stream's tracks as they were
   * when it started, so the mix has to exist before the take rolls. Returns null
   * when the host cannot build the mix (older WebViews, test doubles), letting
   * the caller fall back to the plain master track.
   */
  private buildExportAudioTrack(
    clipAudio?: AudioNode | null
  ): MediaStreamTrack | null {
    // Read the bus before touching a destination: when the audio graph is not
    // up yet this throws, and the caller turns that into a video-only capture
    // rather than a second attempt that would mask the failure.
    const master = this.engine.getMasterStream()?.stream;
    const plain = master?.getAudioTracks?.()[0] ?? null;
    const tap = clipAudio ?? this.clipAudioTap;
    const ctx = this.engine.ctx;
    if (
      !ctx ||
      typeof ctx.createMediaStreamDestination !== 'function' ||
      typeof MediaStream === 'undefined'
    ) {
      return plain;
    }
    try {
      const destination = ctx.createMediaStreamDestination();
      if (typeof ctx.createMediaStreamSource === 'function' && master) {
        ctx.createMediaStreamSource(master).connect(destination);
      }
      if (tap) tap.connect(destination);
      return destination.stream?.getAudioTracks?.()[0] ?? plain;
    } catch (err) {
      this.logger.warn(
        'Export audio mix unavailable — recording the plain master',
        err
      );
      return plain;
    }
  }

  /**
   * Hand the timeline transport back once a capture has ended, however it
   * ended — a plain stop, an early recorder stop, or a recorder error.
   *
   * Idempotent: `onstop` and `onerror` can both fire for one recording, and the
   * caller may have restored playback from its own window timer already, so
   * this only ever settles on the pre-capture state.
   */
  private endCapture(): void {
    if (!this.isCapturing()) return;
    this.isCapturing.set(false);

    const resume = this.transportWasRolling;
    this.transportWasRolling = false;
    this.videoEngine.pause();
    if (resume) this.videoEngine.play();
  }

  /** First `MediaRecorder`-supported video container, or null when unknown. */
  private resolveVideoMimeType(): string | null {
    if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
    return (
      VIDEO_MIME_CANDIDATES.find((type) =>
        MediaRecorder.isTypeSupported(type)
      ) ?? null
    );
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
    // Codec fallback returns PCM WAV, so the filename must follow the bytes.
    const extension = blob.type === 'audio/wav' ? 'wav' : info.ext;
    const filename = `${(this.musicManager.projectName || 'Elite_Session').replace(/\s+/g, '_')}_${Date.now()}.${extension}`;
    return this.shareBlob(blob, filename);
  }

  /** Share the arrangement as a Standard MIDI File via the native sheet. */
  async shareMidi(): Promise<boolean> {
    const blob = this.exportProjectMidi();
    const filename = `${(this.musicManager.projectName || 'Elite_Session').replace(/\s+/g, '_')}_${Date.now()}.mid`;
    return this.shareBlob(blob, filename);
  }

  /**
   * Analyze a rendered buffer for the mastering suite.
   *
   * Every number here is measured by the shared BS.1770-4 meter, over ALL
   * channels. It used to report `20·log10(rms) + 4` of channel 0 and call it
   * "Integrated LUFS", which ignored the right channel, ignored the standard's
   * gating, and disagreed with the live meter under the same label.
   *
   * `peaks` are dBFS: `peakDb` is the sample peak and `truePeakDb` the
   * 4x-over-sampled estimate, so a mastering ceiling can be checked against
   * the figure that actually matters for lossy transcodes.
   */
  analyzeBuffer(buffer: AudioBuffer): {
    peakDb: number;
    truePeakDb: number;
    rmsDb: number;
    lufs: number;
    lra: number;
    correlation: number;
    durationSec: number;
    sampleCount: number;
  } {
    const channelCount = Math.max(0, buffer.numberOfChannels ?? 0);
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < channelCount; channel++) {
      channels.push(buffer.getChannelData(channel));
    }

    const sampleCount = channels[0]?.length ?? 0;
    let sumSq = 0;
    let samples = 0;
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) {
        sumSq += channel[i] * channel[i];
      }
      samples += channel.length;
    }
    const rms = samples > 0 ? Math.sqrt(sumSq / samples) : 0;

    const measured = analyseChannels(channels, buffer.sampleRate || 44100);

    return {
      peakDb: round1(measured.samplePeakDb),
      truePeakDb: round1(measured.truePeakDb),
      rmsDb: round1(toDecibels(rms)),
      // Floored at the standard's absolute gate so a silent render reads -70
      // rather than "-Infinity" in the panel.
      lufs: round1(Math.max(measured.lufs, ABSOLUTE_GATE_LUFS)),
      lra: round1(measured.lra),
      // Mono has nothing to correlate; a single channel is perfectly coherent
      // with itself, which is the honest answer rather than a fabricated 0.82.
      correlation:
        channels.length >= 2
          ? roundTo(phaseCorrelation(channels[0], channels[1]), 0.01)
          : 1,
      durationSec:
        Math.round((sampleCount / (buffer.sampleRate || 44100)) * 100) / 100,
      sampleCount,
    };
  }
}

/** One decimal place — the resolution these meters are read at. */
function round1(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : value;
}

/** Round to the nearest `step`, used for the correlation in [-1, 1]. */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
