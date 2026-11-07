import { Injectable, inject, signal } from '@angular/core';
import {
  AudioEngineService,
  tempoRampSeconds,
  type VoiceControlPoint,
} from './audio-engine.service';
import { InstrumentsService, scheduleOfflinePresetSample } from './instruments.service';
import {
  connectOfflineMasterChain,
  type OfflineMasterChain,
} from './offline-master-chain';
import {
  FX_TYPE_TO_PLUGIN_ID,
  drumRatchetCount,
  MusicManagerService,
  TrackNote,
  TrackModel,
} from './music-manager.service';
import { AutomationLane, AutomationService } from '../studio/automation.service';
import { VcaBusService } from '../studio/vca-bus.service';
import { PluginRegistry } from '../studio/effects/plugin-interface';
import { bindFxSlotParams } from '../studio/effects/fx-param-specs';
import { VideoEngineService } from './video-engine.service';
import { WavEncoder } from '../studio/wav-encoder.util';
import {
  ABSOLUTE_GATE_LUFS,
  analyseChannels,
  phaseCorrelation,
  toDecibels,
} from './loudness-meter';
import { LoggingService } from './logging.service';
import { isTrackAudibleUnderSolo } from './mix-routing.util';
import { PluginStoreService } from './plugin-store.service';
import type { ClipFadeCurve } from '../types/studio.types';
import {
  normalizeFadeCurve,
  scheduleFadeSegment,
} from '../studio/clip-fade.util';
import {
  MidiTrackData,
  MidiNoteEvent,
  MidiWriter,
} from '../studio/midi-writer.util';
import { buildZip, type ZipEntry } from '../studio/zip.util';
import { encodeFlacBlob } from '../studio/flac-encoder.util';
import {
  buildDawproject,
  xmlId,
  type DawprojectAudio,
  type DawprojectClip,
  type DawprojectTrack,
} from '../studio/dawproject-export';

/** Musical-to-seconds conversion for the offline renderer. */
interface TempoTimeline {
  bpmAtStep(step: number): number;
  timeAtStep(step: number): number;
  stepAtTime(time: number): number;
  secondsForSteps(startStep: number, steps: number): number;
  minStepSeconds: number;
}

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
  { id: 'flac', label: 'FLAC (lossless)', ext: 'flac', mime: 'audio/flac' },
  { id: 'mp3', label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', webCodecs: 'mp3' },
  { id: 'm4a', label: 'AAC (M4A)', ext: 'm4a', mime: 'audio/mp4', webCodecs: 'aac' },
  { id: 'opus', label: 'Opus (OGG)', ext: 'ogg', mime: 'audio/ogg', webCodecs: 'opus' },
];

/** Bitrates the lossy WebCodecs export path offers, in bits per second. */
export const COMPRESSED_EXPORT_BITRATES: number[] = [
  96_000,
  128_000,
  160_000,
  192_000,
  256_000,
  320_000,
];

/** Codec-default bitrate; zero means the format is uncompressed. */
export function defaultExportBitrate(format: string): number {
  if (format === 'mp3') return 192_000;
  if (format === 'm4a') return 128_000;
  if (format === 'opus') return 160_000;
  return 0;
}

export function exportSupportsBitrate(format: string): boolean {
  return defaultExportBitrate(format) > 0;
}

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private engine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  private instruments = inject(InstrumentsService);
  private logger = inject(LoggingService);
  private pluginStore = inject(PluginStoreService);
  /** Read-only here: the bounce samples the same curves playback evaluates. */
  private automation = inject(AutomationService);
  private vcaBuses = inject(VcaBusService, { optional: true });
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
    sampleRate: number = 44100,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    this.logger.info(
      `Starting offline PCM WAV (${bitDepth}-bit, ${sampleRate} Hz) export...`
    );
    const buffer = await this.renderProjectOffline({
      sampleRate,
      ...(onProgress ? { onProgress } : {}),
      ...(signal ? { signal } : {}),
    });
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
    options: {
      bitDepth?: 16 | 24;
      sampleRate?: number;
      /** Reports completed files out of the total (master + one per track). */
      onProgress?: (completed: number, total: number) => void;
      /** Abort between stem renders; an in-flight audio render must finish. */
      signal?: AbortSignal;
    } = {}
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

    const totalFiles = 1 + tracks.length;
    const master = await this.renderProjectOffline({
      sampleRate,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    entries.push({
      name: uniqueName('MASTER'),
      data: new Uint8Array(await this.audioBufferToWav(master, bitDepth)),
    });
    options.onProgress?.(entries.length, totalFiles);

    for (const track of tracks) {
      const stem = await this.renderProjectOffline({
        onlyTrackIds: new Set([track.id]),
        ignoreSolo: true,
        sampleRate,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      entries.push({
        name: uniqueName(track.name || 'Track'),
        data: new Uint8Array(await this.audioBufferToWav(stem, bitDepth)),
      });
      options.onProgress?.(entries.length, totalFiles);
    }

    this.logger.info(`Exported ${entries.length} stems (master + ${tracks.length} tracks)`);
    const zip = buildZip(entries);
    this.downloadBlob(zip, `${projectName}_stems_${Date.now()}.zip`);
    return zip;
  }

  /** Musical export duration, matching the offline mix (without its audio tail). */
  interchangeEndStep(): number {
    const tempo = Math.max(20, Math.min(300, this.engine.tempo()));
    const lastStep = this.musicManager.tracks().reduce((end, track) => Math.max(end,
      ...(track.notes ?? [])
        .filter((note) => track.type !== 'drum' || !track.drumPatternLength || note.step < this.musicManager.drumPatternSpan(track))
        .map((note) => note.step + note.length),
      ...(track.clips ?? []).map((clip) => {
        const seconds = clip.clipLengthSeconds ?? clip.length * (60 / tempo) * 4;
        return clip.start * 16 + seconds / ((60 / tempo) / 4);
      }),
    ), 0);
    return Math.max(16, this.musicManager.activeLoopBars() * 16, Math.ceil(lastStep / 16) * 16);
  }

  /** Flatten drum cycles, swing and ratchets for deterministic interchange notes. */
  interchangeDrumNotes(track: TrackModel, endStep: number): TrackNote[] {
    return this.musicManager.arrangementNotes(track, endStep).flatMap((note) => {
      // MIDI and DAWproject do not reproduce the live per-cycle random gate.
      // A zero-probability hit is never played; all other hits are exported.
      if ((note.probability ?? 1) <= 0 || (note.velocity ?? 0.8) <= 0) return [];
      const count = drumRatchetCount(note.params);
      const multiplier = note.articulation === 'staccato' ? 0.25
        : note.articulation === 'legato' ? 1.1
        : note.articulation === 'pizzicato' ? 0.15
        : note.articulation === 'accent' ? 0.5 : 1;
      const length = (note.length ?? 1) * multiplier;
      return Array.from({ length: count }, (_, hit) => ({
        ...note,
        step: note.step + (note.microOffset ?? 0) + hit / count,
        length: count > 1 ? Math.min(length, 1 / count) : length,
      }));
    });
  }

  /**
   * DAWproject interchange bundle: `project.xml` plus every rendered or
   * recorded clip's audio, zipped as `.dawproject` (Bitwig / Studio One /
   * Cubasis 3.7+).
   *
   * This is an interchange export, not a backup: device state, plugin inserts
   * and automation curves have no faithful mapping in the format, so tracks
   * travel as notes + audio + level/pan/mute/solo.
   */
  async exportDawproject(): Promise<Blob> {
    const tempo = this.engine.tempo();
    const audioBuffers = new Map<string, AudioBuffer>();
    const endStep = this.interchangeEndStep();

    const tracks: DawprojectTrack[] = this.musicManager.tracks().map((track) => {
      const clips: DawprojectClip[] = (track.clips ?? []).map((clip: any) => {
        const cacheId =
          clip.type === 'audio' && clip.audioRefId ? clip.audioRefId : null;
        const buffer = cacheId
          ? this.musicManager.stemAudioCache.get(cacheId)
          : null;
        if (cacheId && buffer) audioBuffers.set(cacheId, buffer);
        return {
          name: clip.name ?? track.name,
          start: Number(clip.start) || 0,
          length: Math.max(0.25, Number(clip.length) || 1),
          audioId: cacheId && buffer ? cacheId : undefined,
          ...(track.type === 'drum' && clip.type !== 'audio' ? {
            notes: this.interchangeDrumNotes({ ...track, clips: [clip] }, endStep).map((note) => ({
              step: note.step, length: note.length, midi: note.midi, velocity: note.velocity,
            })),
          } : {}),
        };
      });

      // A MIDI track with no arrangement clips still plays its pattern; the
      // format needs a clip to hold those notes, so synthesise one window.
      if (clips.length === 0 && (track.notes?.length ?? 0) > 0) {
        const lastStep = Math.max(
          ...track.notes.map((note) => note.step + (note.length || 1)),
        );
        const drumNotes = track.type === 'drum' ? this.interchangeDrumNotes(track, endStep) : null;
        clips.push({
          name: track.name,
          start: 0,
          length: drumNotes && track.drumPatternLength ? endStep / 16 : Math.max(1, Math.ceil(lastStep / 16)),
          ...(drumNotes ? { notes: drumNotes.map((note) => ({
            step: note.step, length: note.length, midi: note.midi, velocity: note.velocity,
          })) } : {}),
        });
      }

      return {
        id: track.id,
        name: track.name,
        type: track.type,
        color: track.color,
        instrumentName: track.instrumentId,
        gain: track.gain,
        pan: track.pan,
        muted: !!track.muted,
        soloed: !!track.soloed,
        notes: (track.notes ?? []).map((note) => ({
          step: note.step,
          length: note.length,
          midi: note.midi,
          velocity: note.velocity,
        })),
        clips,
      };
    });

    const audio: DawprojectAudio[] = [];
    for (const [id, buffer] of audioBuffers) {
      const wav = await this.audioBufferToWav(buffer, 16);
      audio.push({
        id,
        path: `audio/${xmlId('clip', id)}.wav`,
        data: new Uint8Array(wav),
      });
    }

    const blob = buildDawproject({
      name: 'S.M.U.V.E. Project',
      tempo,
      numerator: 4,
      denominator: 4,
      tracks,
      audio,
    });
    this.logger.info(
      `Exported DAWproject: ${tracks.length} tracks, ${audio.length} audio files`,
    );
    return blob;
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
      /**
       * Stop at the mix bus: render the full arrangement without the master
       * chain, so it can be mastered again later without re-rendering.
       */
      preMaster?: boolean;
      /** Ignore the project's solo state — a stem set must contain every track. */
      ignoreSolo?: boolean;
      /** Delivery sample rate (default 44.1 kHz). */
      sampleRate?: number;
      /**
       * Render this many bars instead of auto-detecting the arrangement. The
       * full-mix bounce passes its explicit bar count through here.
       */
      durationBars?: number;
      /** Silence after the last bar for reverb/echo tails (default 1 s). */
      tailSeconds?: number;
      /**
       * Render progress, 0–100. Fired after setup, once per scheduled track,
       * and after the offline context finishes; a listener may not abort the
       * render, so its exceptions are swallowed.
       */
      onProgress?: (percent: number) => void;
      /** Abort between scheduling stages; Web Audio cannot interrupt startRendering. */
      signal?: AbortSignal;
    } = {},
  ): Promise<AudioBuffer> {
    const timing = this.buildTempoTimeline();
    const tracks = this.musicManager.tracks();
    const byId = new Map(tracks.map((track) => [track.id, track]));

    const lastEventStep = tracks.reduce((end, track) => Math.max(
      end,
      ...(track.notes ?? [])
        .filter((note) => track.type !== 'drum' || !track.drumPatternLength || note.step < this.musicManager.drumPatternSpan(track))
        .map((note) => note.step + note.length),
      ...(track.clips ?? []).map((clip: any) => {
        const startBar = Math.max(0, Number(clip.start) || 0);
        const startStep = this.stepAtBar(startBar);
        const windowSteps = this.stepsForBars(
          startBar,
          Math.max(0, Number(clip.length) || 0),
        );
        const clipSeconds = Number.isFinite(clip.clipLengthSeconds)
          ? Math.max(0, clip.clipLengthSeconds)
          : timing.secondsForSteps(startStep, windowSteps);
        return timing.stepAtTime(timing.timeAtStep(startStep) + clipSeconds);
      }),
    ), 0);
    const requestedBars = Number(options.durationBars);
    const bars = Math.max(
      1,
      Number.isFinite(requestedBars) && requestedBars > 0
        ? Math.round(requestedBars)
        : Math.max(
            this.musicManager.activeLoopBars(),
            this.barCountForStep(lastEventStep),
          ),
    );
    const requestedTail = Number(options.tailSeconds);
    const tailSeconds =
      Number.isFinite(requestedTail) && requestedTail >= 0 ? requestedTail : 1;
    const totalSeconds = Math.max(
      1,
      timing.timeAtStep(this.stepAtBar(bars)) + tailSeconds,
    );
    if (!Number.isFinite(totalSeconds) || totalSeconds > 600) {
      throw new Error('Offline export supports up to 10 minutes per render. Shorten the arrangement first.');
    }

    const reportProgress = (percent: number): void => {
      if (options.signal?.aborted) {
        throw new DOMException('Export cancelled.', 'AbortError');
      }
      const value = Math.max(0, Math.min(100, Math.round(percent)));
      try {
        options.onProgress?.(value);
      } catch {
        // A progress listener must never be able to abort an export.
      }
    };
    reportProgress(8);

    // Guard the context constructor: a NaN/0 rate throws deep inside WebAudio
    // with a message that says nothing about the export.
    const sampleRate =
      Number.isFinite(options.sampleRate) && (options.sampleRate ?? 0) >= 8000
        ? Math.round(options.sampleRate!)
        : 44100;

    const offline = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
    const master = offline.createGain();
    master.gain.value = this.engine.masterGain.gain.value;

    // ── Automation ──────────────────────────────────────────────────────
    // Each enabled lane is sampled on a grid finer than the shortest musical
    // step, then written as ramps onto the same node the live parameter drives.
    const lanes = this.automation?.lanes?.() ?? [];
    const laneFor = (trackId: string, ...params: string[]) =>
      lanes.find(
        (lane) =>
          lane.enabled &&
          lane.target.trackId === trackId &&
          params.includes(lane.target.parameter),
      );
    const pluginAutomation: Array<{
      plugin: { setParam(id: string, value: number): void };
      lane: AutomationLane;
      paramId: string;
    }> = [];

    if (!options.onlyTrackIds) {
      const masterLane = laneFor('master', 'volume', 'gain');
      if (masterLane) {
        this.scheduleLaneCurve(
          master.gain,
          masterLane,
          totalSeconds,
          timing.minStepSeconds,
          (value) => Math.max(0, Math.min(1.5, value)),
        );
      }
    }

    // Stems and retained mixes stop at the mix bus; the master chain is either
    // deliberately omitted or applied later to the retained buffer.
    if (options.onlyTrackIds || options.preMaster) {
      master.connect(offline.destination);
    } else {
      this.connectMasterChain(offline, master, totalSeconds, timing, lanes);
    }
    reportProgress(10);

    // ── Aux returns ─────────────────────────────────────────────────────
    // Send A is the reverb convolver, Send B the tempo-synced echo, both fed
    // from the post-fader tap like `getTrackOutput` splices them.
    const sendSnapshot =
      typeof (this.engine as Partial<AudioEngineService>).getSendBusSnapshot ===
      'function'
        ? this.engine.getSendBusSnapshot()
        : null;
    let reverbReturn: AudioNode | null = null;
    let echoReturn: AudioNode | null = null;
    const ensureReverbReturn = (): AudioNode | null => {
      if (reverbReturn || !sendSnapshot?.impulse) return reverbReturn;
      const sum = offline.createGain();
      const convolver = offline.createConvolver();
      convolver.buffer = sendSnapshot.impulse;
      const wet = offline.createGain();
      wet.gain.value = sendSnapshot.reverbWet;
      const returnLane = laneFor('aux:reverb', 'volume');
      if (returnLane) {
        this.scheduleLaneCurve(
          wet.gain,
          returnLane,
          totalSeconds,
          timing.minStepSeconds,
          (value) => Math.max(0, Math.min(1, value)),
        );
      }
      sum.connect(convolver);
      convolver.connect(wet);
      wet.connect(master);
      reverbReturn = sum;
      return sum;
    };
    const ensureEchoReturn = (): AudioNode | null => {
      if (echoReturn || !sendSnapshot) return echoReturn;
      const sum = offline.createGain();
      const delay = offline.createDelay(2);
      const snapshotDelay = Number(sendSnapshot.echo.delaySeconds);
      delay.delayTime.value =
        Number.isFinite(snapshotDelay) && snapshotDelay > 0
          ? Math.max(0.02, Math.min(2, snapshotDelay))
          : Math.max(0.02, Math.min(2, (60 / timing.bpmAtStep(0)) * 0.75));
      const damp = offline.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = sendSnapshot.echo.dampingHz;
      const feedback = offline.createGain();
      feedback.gain.value = sendSnapshot.echo.feedback;
      const wet = offline.createGain();
      wet.gain.value = sendSnapshot.echo.wet;
      const returnLane = laneFor('aux:echo', 'volume');
      if (returnLane) {
        this.scheduleLaneCurve(
          wet.gain,
          returnLane,
          totalSeconds,
          timing.minStepSeconds,
          (value) => Math.max(0, Math.min(1, value)),
        );
      }
      sum.connect(delay);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      damp.connect(wet);
      wet.connect(master);
      echoReturn = sum;
      return sum;
    };

    // A single-track render is a stem: solo on another track must not silence
    // it, so `onlyTrackIds` implies `ignoreSolo`.
    const soloIgnored = options.ignoreSolo === true || options.onlyTrackIds !== undefined;

    // Sample presets are loaded lazily by the live path. The offline renderer
    // must ask for the same banks before it schedules a note, otherwise
    // getPresetSample below either fails or reads a stale/empty cache. Only
    // load tracks that will actually sound: a muted or solo-excluded track
    // must not turn a missing bank into a failed export.
    if (typeof this.musicManager.prepareTrackSamples === "function") {
      const audibleTracks = tracks.filter((track) => {
        if (track.type === 'bus' || track.muted) return false;
        if (options.onlyTrackIds) return options.onlyTrackIds.has(track.id);
        return soloIgnored || isTrackAudibleUnderSolo(track, tracks);
      });
      await Promise.all(
        audibleTracks.map((track) =>
          this.musicManager.prepareTrackSamples(track, true),
        ),
      );
    }

    type OfflineChannel = { input: AudioNode; channel: GainNode };
    const channels = new Map<string, OfflineChannel>();
    const building = new Set<string>();

    /**
     * Build a channel once, recursively resolving its parent bus first.
     * Returns the point where sources enter the channel (before inserts) and
     * the post-fader gain that feeds the parent. A cycle is rejected with a
     * master route rather than creating a feedback loop in the render graph.
     */
    const buildChannel = (track: TrackModel): OfflineChannel | null => {
      const existing = channels.get(track.id);
      if (existing) return existing;
      if (building.has(track.id)) {
        this.logger.warn(`Export: bus cycle at “${track.name}”; routing it to master.`);
        return null;
      }
      building.add(track.id);

      let destination: AudioNode = master;
      if (!options.onlyTrackIds && track.busId) {
        const busTrack = byId.get(track.busId);
        if (busTrack && busTrack.type === 'bus' && busTrack.id !== track.id) {
          const bus = buildChannel(busTrack);
          if (bus) destination = bus.input;
        }
      }

      const channel = offline.createGain();
      const audible = soloIgnored
        ? !track.muted
        : isTrackAudibleUnderSolo(track, tracks);
      channel.gain.value = audible
        ? Math.max(0, Math.min(1.5, track.gain ?? track.volume ?? 0.8))
        : 0;
      let sendSource: AudioNode = channel;

      // VCA is a control multiplier, not an audio bus. Give the channel its own
      // post-fader gain node so an offline curve can ride the group without
      // overwriting the track fader's own automation.
      const vcaId = this.vcaBuses?.assignments()[track.id];
      if (vcaId) {
        const vcaGain = offline.createGain();
        const vcaBus = this.vcaBuses!.buses().find((bus) => bus.id === vcaId);
        const vcaLane = laneFor(`vca:${vcaId}`, 'vca', 'volume');
        vcaGain.gain.value = vcaBus?.muted
          ? 0
          : this.vcaBuses!.effectiveMultiplier(track.id);
        channel.connect(vcaGain);
        vcaGain.connect(destination);
        sendSource = vcaGain;
        if (audible && vcaLane && !vcaBus?.muted) {
          this.scheduleLaneCurve(
            vcaGain.gain,
            vcaLane,
            totalSeconds,
            timing.minStepSeconds,
            (value) => Math.max(0, Math.min(1.5, value)),
          );
        }
      } else {
        channel.connect(destination);
      }

      let input: AudioNode = channel;
      let panner: StereoPannerNode | null = null;
      let channelFilter: BiquadFilterNode | null = null;
      const panLane = laneFor(track.id, 'pan');
      const cutoffLane = laneFor(track.id, 'cutoff');
      if (panLane || track.type === 'bus') {
        panner = offline.createStereoPanner();
        panner.pan.value = panLane
          ? 0
          : Math.max(-1, Math.min(1, track.pan ?? 0));
        panner.connect(input);
        input = panner;
      }
      if (cutoffLane) {
        channelFilter = offline.createBiquadFilter();
        channelFilter.type = 'lowpass';
        channelFilter.frequency.value = AudioEngineService.CHANNEL_FILTER_DEFAULT_HZ;
        channelFilter.Q.value = 0.0001;
        channelFilter.connect(input);
        input = channelFilter;
      }

      // Insert rack: the enabled macro slots, in the order the rack shows them.
      const fxSlots = track.fxSlots ?? [];
      for (let index = fxSlots.length - 1; index >= 0; index -= 1) {
        const slot = fxSlots[index];
        if (slot.enabled === false) continue;
        const pluginId = FX_TYPE_TO_PLUGIN_ID[slot.type];
        if (!pluginId) continue;
        try {
          const plugin = PluginRegistry.create(
            pluginId,
            offline as unknown as AudioContext,
          );
          if (!plugin) continue;
          bindFxSlotParams(plugin, slot.params);
          const prefix = `plugin:${pluginId}:`;
          for (const lane of lanes) {
            if (
              lane.enabled &&
              lane.target.trackId === track.id &&
              lane.target.parameter.startsWith(prefix)
            ) {
              pluginAutomation.push({
                plugin,
                lane,
                paramId: lane.target.parameter.slice(prefix.length),
              });
            }
          }
          plugin.output.connect(input);
          input = plugin.input;
        } catch (error) {
          this.logger.warn(
            `Export: the ${slot.type} insert on “${track.name}” could not be rendered offline.`,
            error,
          );
        }
      }

      const levelLane = laneFor(track.id, 'volume', 'gain');
      if (audible && levelLane) {
        this.scheduleLaneCurve(channel.gain, levelLane, totalSeconds,
          timing.minStepSeconds, (value) => Math.max(0, Math.min(1.5, value)));
      }
      if (audible && panLane && panner) {
        this.scheduleLaneCurve(panner.pan, panLane, totalSeconds,
          timing.minStepSeconds, (value) => Math.max(-1, Math.min(1, value)));
      }
      if (audible && cutoffLane && channelFilter) {
        this.scheduleLaneCurve(channelFilter.frequency, cutoffLane,
          totalSeconds, timing.minStepSeconds,
          (value) => Math.max(20, Math.min(20000, value)));
      }

      // Post-fader, post-VCA aux sends. `reverb` is the lane name the editor
      // offers for send A, so both spellings resolve to the same return.
      const sendALane = laneFor(track.id, 'sendA', 'reverb');
      const sendBLane = laneFor(track.id, 'sendB');
      const staticSendA = Math.max(0, Math.min(1, track.sendA ?? 0));
      const staticSendB = Math.max(0, Math.min(1, track.sendB ?? 0));
      if (audible && (sendALane || staticSendA > 0)) {
        const bus = ensureReverbReturn();
        if (bus) {
          const send = offline.createGain();
          send.gain.value = staticSendA;
          sendSource.connect(send);
          send.connect(bus);
          if (sendALane) {
            this.scheduleLaneCurve(send.gain, sendALane, totalSeconds,
              timing.minStepSeconds, (value) => Math.max(0, Math.min(1, value)));
          }
        }
      }
      if (audible && (sendBLane || staticSendB > 0)) {
        const bus = ensureEchoReturn();
        if (bus) {
          const send = offline.createGain();
          send.gain.value = staticSendB;
          sendSource.connect(send);
          send.connect(bus);
          if (sendBLane) {
            this.scheduleLaneCurve(send.gain, sendBLane, totalSeconds,
              timing.minStepSeconds, (value) => Math.max(0, Math.min(1, value)));
          }
        }
      }

      const result = { input, channel };
      channels.set(track.id, result);
      building.delete(track.id);
      return result;
    };

    // Build every channel first: a member can be reached before its bus while
    // iterating tracks, and the recursive builder has to connect into a bus
    // whose inserts and fader already exist.
    for (const [index, track] of tracks.entries()) {
      buildChannel(track);
      reportProgress(10 + ((index + 1) / Math.max(1, tracks.length)) * 10);
    }

    for (const [index, track] of tracks.entries()) {
      reportProgress(20 + (index / Math.max(1, tracks.length)) * 50);
      if (track.type === 'bus') continue;
      if (options.onlyTrackIds && !options.onlyTrackIds.has(track.id)) continue;
      if (track.muted) continue;
      if (!soloIgnored && !isTrackAudibleUnderSolo(track, tracks)) continue;
      const built = channels.get(track.id);
      if (!built) continue;
      const input = built.input;

      if (track.type !== 'audio') {
        const notes = track.type === 'drum' || this.instruments.isSamplePreset(track.instrumentId)
          ? this.musicManager.arrangementNotes(track, this.stepAtBar(bars))
          : track.notes ?? [];
        this.scheduleTrackNotes(offline, input, notes,
          track.synthParams ?? { type: 'sine' }, timing,
          laneFor(track.id, 'pan') ? 0 : (track.pan ?? 0),
          track.instrumentId, track.type === 'drum', track.id);
      }
      for (const clip of track.clips ?? []) {
        if (clip.type !== 'audio') continue;
        const pan = offline.createStereoPanner();
        pan.pan.value = laneFor(track.id, 'pan')
          ? 0
          : Math.max(-1, Math.min(1, track.pan ?? 0));
        const fader = offline.createGain();
        pan.connect(fader);
        fader.connect(input);
        const streamer = (clip as any).clipStreamer;
        let buffer = clip.audioData || (clip.audioRefId && this.musicManager.stemAudioCache.get(clip.audioRefId));
        let offset = Math.max(0, clip.offset ?? 0);
        if (!buffer && streamer) {
          const clipSampleRate = (clip as any).clipSampleRate || 48000;
          streamer.setPlayhead(Math.max(0, ((clip as any).clipOriginSeconds || 0) * clipSampleRate));
          buffer = streamer.getResidentBuffer();
          offset = streamer.getResidentOffsetSeconds?.() ?? 0;
        }
        if (!buffer) throw new Error(`Audio for “${track.name}” is unavailable. Restore or re-import the clip before export.`);
        const startBar = Math.max(0, Number(clip.start) || 0);
        const clipBars = Math.max(0, Number(clip.length) || 0);
        const startStep = this.stepAtBar(startBar);
        const start = timing.timeAtStep(startStep);
        const windowSeconds = timing.secondsForSteps(
          startStep,
          this.stepsForBars(startBar, clipBars),
        );
        const duration = Math.min(
          clip.clipLengthSeconds ?? windowSeconds,
          streamer ? streamer.getRemainingSecondsFrom((clip as any).clipOriginSeconds || 0) : Math.max(0, buffer.duration - offset),
        );
        const clipGain = (clip as any).clipGain ?? 1.0;
        const reversedClip = (clip as any).reversed && !streamer;
        const playbackBuffer = reversedClip
          ? this.engine.reverseBuffer(
              buffer as AudioBuffer,
              (channelIndex, src) =>
                src.getChannelData(channelIndex).slice().reverse(),
            )
          : buffer;
        const fadeInBars = Math.max(0, Math.min(clip.fadeIn ?? 0, clip.length));
        const fadeOutBars = Math.max(0, Math.min(clip.fadeOut ?? 0, clip.length));
        const fadeInSeconds = timing.secondsForSteps(
          startStep,
          this.stepsForBars(startBar, fadeInBars),
        );
        const fadeOutStartBar = startBar + Math.max(0, clipBars - fadeOutBars);
        const fadeOutStartStep = this.stepAtBar(fadeOutStartBar);
        const fadeOutSeconds = timing.timeAtStep(this.stepAtBar(startBar + clipBars))
          - timing.timeAtStep(fadeOutStartStep);
        this.applyClipFade(
          fader.gain,
          start,
          duration,
          fadeInSeconds,
          fadeOutSeconds,
          clipGain,
          clip.fadeCurve ?? 'linear'
        );
        if (streamer) {
          const clipSampleRate = (clip as any).clipSampleRate || 48000;
          const sampleRateRatio = clipSampleRate / buffer.sampleRate;
          const clipTempo = timing.bpmAtStep(startStep);
          const sourceRate = Math.max(0.01, (clipTempo / ((clip as any).originalBpm || clipTempo)) * sampleRateRatio);
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
              streamer.setPlayhead(sourcePosition * clipSampleRate);
              currentBuffer = streamer.getResidentBuffer();
              currentOffset = streamer.getResidentOffsetSeconds?.() ?? 0;
            }
          }
        } else {
          const source = offline.createBufferSource();
          source.buffer = playbackBuffer as AudioBuffer;
          source.connect(pan);
          // A clip recorded at another tempo is time-stretched live; without
          // this the export played it at its original speed and drifted.
          const rate =
            typeof this.engine.calculatePlaybackRate === 'function'
              ? this.engine.calculatePlaybackRate(
                  (clip as any).originalBpm || timing.bpmAtStep(startStep),
                )
              : 1;
          if (Number.isFinite(rate) && rate > 0) {
            source.playbackRate.setValueAtTime(rate, start);
          }
          if (duration > 0) source.start(start, offset, duration);
        }
      }
    }

    reportProgress(72);
    this.schedulePluginAutomation(offline, pluginAutomation, totalSeconds);
    const rendered = await offline.startRendering();
    reportProgress(92);
    return rendered;
  }

  /**
   * Build and schedule the master bus onto an offline context.
   *
   * Shared by the full bounce and by re-mastering a retained mix, so a file
   * downloaded after a Mastering change runs the same chain, automation and
   * ceilings as the original render rather than an approximation.
   */
  private connectMasterChain(
    offline: OfflineAudioContext,
    input: AudioNode,
    totalSeconds: number,
    timing: TempoTimeline,
    lanes: AutomationLane[],
  ): OfflineMasterChain | null {
    const hasBandLanes = lanes.some(
      (lane) =>
        lane.enabled &&
        lane.target.trackId === 'master' &&
        /^band[1-5](Threshold|Ratio|Attack|Release|Knee)$/.test(lane.target.parameter),
    );
    const chain = connectOfflineMasterChain(offline, input, this.engine, hasBandLanes);
    if (!chain) return null;
    const laneFor = (trackId: string, ...params: string[]) =>
      lanes.find(
        (lane) =>
          lane.enabled &&
          lane.target.trackId === trackId &&
          params.includes(lane.target.parameter),
      );
    const scheduleMaster = (
      parameter: string,
      params: AudioParam[],
      scale: (value: number) => number,
    ): void => {
      const lane = laneFor('master', parameter);
      if (!lane) return;
      for (const param of params) {
        this.scheduleLaneCurve(
          param,
          lane,
          totalSeconds,
          timing.minStepSeconds,
          scale,
        );
      }
    };
    scheduleMaster('makeup', [chain.makeup.gain], (value) =>
      Math.pow(10, Math.max(-12, Math.min(12, value)) / 20),
    );
    scheduleMaster(
      'compressorThreshold',
      chain.compressors.map((comp) => comp.threshold),
      (value) => Math.max(-60, Math.min(0, value)),
    );
    scheduleMaster(
      'compressorRatio',
      chain.compressors.map((comp) => comp.ratio),
      (value) => Math.max(1, Math.min(20, value)),
    );
    scheduleMaster('limiterThreshold', [chain.limiter.threshold], (value) =>
      Math.max(-6, Math.min(-0.01, value)),
    );
    scheduleMaster('filterHz', [chain.filter.frequency], (value) =>
      Math.max(20, Math.min(20000, value)),
    );
    scheduleMaster('lowShelf', [chain.lowShelf.gain], (value) =>
      Math.max(-18, Math.min(18, value)),
    );
    scheduleMaster('lowMid', [chain.lowMid.gain], (value) =>
      Math.max(-18, Math.min(18, value)),
    );
    scheduleMaster('highShelf', [chain.highShelf.gain], (value) =>
      Math.max(-18, Math.min(18, value)),
    );
    for (let band = 1; band <= 5; band += 1) {
      const comp = chain.compressors[band - 1];
      if (!comp) continue;
      scheduleMaster(
        `band${band}Threshold`,
        [comp.threshold],
        (value) => Math.max(-60, Math.min(0, value)),
      );
      scheduleMaster(
        `band${band}Ratio`,
        [comp.ratio],
        (value) => Math.max(1, Math.min(20, value)),
      );
      scheduleMaster(
        `band${band}Attack`,
        [comp.attack],
        (value) => Math.max(0.001, Math.min(1, value)),
      );
      scheduleMaster(
        `band${band}Release`,
        [comp.release],
        (value) => Math.max(0.005, Math.min(3, value)),
      );
      scheduleMaster(
        `band${band}Knee`,
        [comp.knee],
        (value) => Math.max(0, Math.min(40, value)),
      );
    }
    return chain;
  }

  /**
   * Apply the current master chain to a mix rendered without it.
   *
   * Only the master bus runs again over the retained stereo mix; the
   * arrangement is not re-synthesised. A delivery-target, ceiling or makeup
   * change therefore costs one short pass instead of a full project bounce.
   */
  async masterRetainedMix(preMaster: AudioBuffer): Promise<AudioBuffer> {
    const timing = this.buildTempoTimeline();
    const lanes = this.automation?.lanes?.() ?? [];
    const offline = new OfflineAudioContext(
      2,
      Math.max(1, preMaster.length),
      preMaster.sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = preMaster;
    const input = offline.createGain();
    source.connect(input);
    // connectOfflineMasterChain wires its own fallback path when the host
    // cannot build the full graph; the real chain terminates at destination.
    this.connectMasterChain(offline, input, preMaster.duration, timing, lanes);
    source.start(0);
    return offline.startRendering();
  }

  private stepAtBar(bar: number): number {
    return Math.max(0, Math.round(this.engine.stepAtBar?.(bar) ?? bar * 16));
  }

  private stepsForBars(startBar: number, bars: number): number {
    if (!(bars > 0)) return 0;
    return Math.max(
      0,
      Math.round(this.engine.stepsForBars?.(startBar, bars) ?? bars * 16),
    );
  }

  private barCountForStep(step: number): number {
    return Math.max(
      1,
      this.engine.barCountForStep?.(step) ?? Math.ceil(step / 16),
    );
  }

  /**
   * Convert the engine's tempo map into the musical clock used by the render.
   * A map is optional; a project with no markers reduces to the former single
   * BPM path, while each marker changes the seconds-per-step from that step on.
   */
  private buildTempoTimeline(): TempoTimeline {
    const base = Math.max(20, Math.min(300, this.engine.tempo()));
    const raw = (this.engine as Partial<AudioEngineService>).getTempoMap?.() ?? [];
    const markers = raw
      .filter((marker) => Number.isFinite(marker?.step) && Number.isFinite(marker?.bpm))
      .map((marker) => ({
        step: Math.max(0, Math.round(marker.step)),
        bpm: Math.max(20, Math.min(300, marker.bpm)),
        curve: marker.curve === 'ramp' ? ('ramp' as const) : undefined,
      }))
      .sort((a, b) => a.step - b.step);

    // A marker on step 0 replaces the initial tempo; later markers are
    // breakpoints. Duplicate steps resolve to the last marker, matching the
    // live engine's "last marker at or before this step" lookup.
    let initialBpm = base;
    let initialCurve: 'ramp' | undefined;
    const points: Array<{ step: number; bpm: number; curve?: 'ramp' }> = [];
    for (const marker of markers) {
      if (marker.step <= 0) {
        initialBpm = marker.bpm;
        initialCurve = marker.curve;
      } else {
        const previous = points[points.length - 1];
        if (previous?.step === marker.step) {
          previous.bpm = marker.bpm;
          previous.curve = marker.curve;
        } else {
          points.push({ ...marker });
        }
      }
    }

    const pointAtStep = (step: number) => {
      let found: { step: number; bpm: number; curve?: 'ramp' } | undefined =
        initialCurve ? { step: 0, bpm: initialBpm, curve: initialCurve } : undefined;
      for (const point of points) {
        if (point.step <= step) found = point;
        else break;
      }
      return found;
    };

    const bpmAtStep = (step: number): number => {
      let bpm = initialBpm;
      let active: { step: number; bpm: number; curve?: 'ramp' } | undefined =
        initialCurve ? { step: 0, bpm: initialBpm, curve: initialCurve } : undefined;
      let next: { step: number; bpm: number; curve?: 'ramp' } | undefined;
      for (let i = 0; i < points.length; i++) {
        if (points[i].step <= step) {
          active = points[i];
          next = points[i + 1];
        } else {
          next = points[i];
          break;
        }
      }
      if (!active) return bpm;
      bpm = active.bpm;
      if (active.curve === 'ramp' && next && next.step > active.step) {
        const progress = Math.max(
          0,
          Math.min(1, (step - active.step) / (next.step - active.step)),
        );
        bpm = active.bpm + (next.bpm - active.bpm) * progress;
      }
      return bpm;
    };

    const timeAtStep = (step: number): number => {
      const target = Math.max(0, step);
      const breakpoints = [
        0,
        ...points.map((point) => point.step).filter((point) => point > 0 && point < target),
        target,
      ];
      let seconds = 0;
      for (let i = 0; i < breakpoints.length - 1; i++) {
        const from = breakpoints[i];
        const to = breakpoints[i + 1];
        const span = to - from;
        if (span <= 0) continue;
        const active = pointAtStep(from);
        const fromBpm = Math.max(1, bpmAtStep(from));
        const toBpm = Math.max(1, bpmAtStep(to));
        seconds +=
          active?.curve === 'ramp'
            ? tempoRampSeconds(span, fromBpm, toBpm, STEPS_PER_BEAT)
            : (span * 60) / fromBpm / STEPS_PER_BEAT;
      }
      return seconds;
    };

    const stepAtTime = (time: number): number => {
      const target = Math.max(0, time);
      if (target === 0) return 0;
      // Time is monotonic, so a bounded binary search is stable for ramps and
      // steps alike. Start from a generous upper bound and expand only if a
      // very slow outro needs it.
      let high = Math.max(64, target * 300 * STEPS_PER_BEAT + 64);
      while (timeAtStep(high) < target) high *= 2;
      let low = 0;
      for (let i = 0; i < 56; i++) {
        const middle = (low + high) / 2;
        if (timeAtStep(middle) < target) low = middle;
        else high = middle;
      }
      return (low + high) / 2;
    };

    const minStepSeconds =
      60 / Math.max(...[initialBpm, ...points.map((point) => point.bpm), 20]) / STEPS_PER_BEAT;

    return {
      bpmAtStep,
      timeAtStep,
      stepAtTime,
      secondsForSteps: (startStep, steps) =>
        Math.max(0, timeAtStep(startStep + Math.max(0, steps)) - timeAtStep(startStep)),
      minStepSeconds,
    };
  }

  /**
   * Write an audio clip's fade-in/fade-out envelope onto its own gain stage.
   *
   * Phase F2 added fades to the arrangement, but only the live sampler applied
   * them, so a bounced fade came out as a hard edge. The clamps, the linear
   * ramps and the "fade-out never starts before the fade-in ends" rule are
   * copied from `AudioEngineService.triggerSampler` so the export measures the
   * same envelope the artist heard.
   *
   * `peak` is the clip-level gain (`clip.clipGain`): the full-level the
   * envelope reaches. The live path composes the same product into
   * triggerSampler's velocity (`t.gain * clipGain`; this export carries
   * `track.gain` on the channel stage instead), so the bounce must peak at
   * the same value. A standalone `setValueAtTime(clipGain, start)` used to
   * run before this call and was immediately overwritten by the envelope's
   * own `setValueAtTime(0, start)` at the same instant — every ramp then
   * targeted 1 and clip gain silently vanished from exports.
   */
  private applyClipFade(
    gain: AudioParam,
    start: number,
    duration: number,
    fadeInSeconds: number,
    fadeOutSeconds: number,
    peak: number = 1,
    fadeCurve: ClipFadeCurve = 'linear'
  ): void {
    const safeDuration = Math.max(0.001, duration);
    const fadeIn = Math.max(0, Math.min(fadeInSeconds, safeDuration));
    const fadeOut = Math.max(0, Math.min(fadeOutSeconds, safeDuration));
    const curve = normalizeFadeCurve(fadeCurve);

    gain.setValueAtTime(0, start);
    if (fadeIn > 0) {
      if (curve === 'equalPower') {
        scheduleFadeSegment(gain, 'in', curve, start, fadeIn, peak);
      } else {
        gain.linearRampToValueAtTime(peak, start + fadeIn);
      }
    } else gain.setTargetAtTime(peak, start, 0.005);
    if (fadeOut > 0) {
      const fadeStart = start + Math.max(fadeIn, safeDuration - fadeOut);
      const fadeWindow = Math.max(0.001, start + safeDuration - fadeStart);
      gain.setValueAtTime(peak, fadeStart);
      if (curve === 'equalPower') {
        scheduleFadeSegment(gain, 'out', curve, fadeStart, fadeWindow, peak);
      } else {
        gain.linearRampToValueAtTime(0, start + safeDuration);
      }
    }
  }

  /**
   * Write an automation lane onto an AudioParam as one ramp chain.
   *
   * The lane's own keyframes are always included, plus a grid half a step
   * apart so a curved segment (bezier/smooth interpolation, LFO modulation,
   * macro bias) is approximated where the audio clock needs it instead of only
   * at the few points the artist happened to place. Sampling covers the whole
   * render, so the final value holds through the tail.
   */
  /** Write a sampled CC curve onto an AudioParam for sampler notes. */
  private scheduleControlCurve(
    param: AudioParam,
    points: VoiceControlPoint[],
    key: keyof VoiceControlPoint,
    scale: (value: number) => number,
    startTime = 0,
  ): void {
    let scheduled = false;
    for (const point of points) {
      const raw = point[key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const at = startTime + Math.max(0, point.at);
      const value = scale(raw);
      if (!scheduled) {
        param.setValueAtTime(value, at);
        scheduled = true;
      } else {
        param.linearRampToValueAtTime(value, at);
      }
    }
  }

  /**
   * Plugin DSP parameters are not guaranteed to be AudioParams. Suspend the
   * offline render at each lane point, push the sampled value through
   * `setParam`, then resume — this keeps every registered FX plugin automatable
   * without a second, plugin-specific scheduling API.
   */
  private schedulePluginAutomation(
    offline: OfflineAudioContext,
    entries: Array<{
      plugin: { setParam(id: string, value: number): void };
      lane: AutomationLane;
      paramId: string;
    }>,
    totalSeconds: number,
  ): void {
    if (entries.length === 0) return;
    const suspend = (offline as unknown as {
      suspend?: (when: number) => Promise<void>;
    }).suspend;
    if (typeof suspend !== 'function') return;

    // A curve that starts at time zero must not lose its first value to the
    // slot's static default before the first suspend point arrives.
    for (const entry of entries) {
      const initial = this.automation.getValueAtTime(entry.lane.id, 0);
      if (initial !== null && Number.isFinite(initial)) {
        entry.plugin.setParam(entry.paramId, initial);
      }
    }

    const times = new Set<number>();
    for (const entry of entries) {
      for (const point of entry.lane.points) {
        if (point.time > 0.001 && point.time < totalSeconds - 0.02) {
          times.add(Math.round(point.time * 1000) / 1000);
        }
      }
    }
    for (const time of [...times].sort((a, b) => a - b)) {
      void suspend.call(offline, time).then(() => {
        try {
          for (const entry of entries) {
            const value = this.automation.getValueAtTime(entry.lane.id, time);
            if (value !== null && Number.isFinite(value)) {
              entry.plugin.setParam(entry.paramId, value);
            }
          }
        } finally {
          void offline.resume().catch(() => {});
        }
      }).catch(() => {});
    }
  }

  private scheduleLaneCurve(
    param: AudioParam,
    lane: AutomationLane,
    totalSeconds: number,
    minStepSeconds: number,
    scale: (value: number) => number,
  ): void {
    const grid = Math.max(0.01, minStepSeconds / 2);
    const sampleAt = (time: number): number | null => {
      const value = this.automation.sampleLane(lane.id, time);
      return value !== null && Number.isFinite(value) ? scale(value) : null;
    };
    const values = new Map<number, number>();
    const add = (time: number): void => {
      if (values.has(time)) return;
      const value = sampleAt(time);
      if (value !== null) values.set(time, value);
    };
    add(0);
    for (const point of lane.points) {
      if (point.time > 0 && point.time < totalSeconds) add(point.time);
    }
    for (let time = 0; time < totalSeconds; time += grid) {
      add(Math.round(time * 1000) / 1000);
    }

    // A curved lane can travel a long way inside one grid slice, and the
    // linear join then cuts the corner: the bounce took a shape the live curve
    // never played. Refine each slice whose chord misses the curve, in scaled
    // units so a 20 kHz filter and a 0 dB gain are both resolved.
    if (lane.interpolation !== 'step') {
      const minGap = 0.002;
      for (let pass = 0; pass < 6 && values.size < 4096; pass += 1) {
        const times = [...values.keys()].sort((a, b) => a - b);
        let inserted = false;
        for (let i = 0; i < times.length - 1; i += 1) {
          const start = times[i];
          const end = times[i + 1];
          if (end - start <= minGap * 2) continue;
          const middle = (start + end) / 2;
          if (values.has(middle)) continue;
          const sampled = sampleAt(middle);
          if (sampled === null) continue;
          const from = values.get(start)!;
          const to = values.get(end)!;
          const tolerance = Math.max(
            1e-4,
            0.002 * Math.max(Math.abs(from), Math.abs(to)),
          );
          if (Math.abs(sampled - (from + to) / 2) > tolerance) {
            values.set(middle, sampled);
            inserted = true;
          }
        }
        if (!inserted) break;
      }
    }

    let scheduled = false;
    for (const time of [...values.keys()].sort((a, b) => a - b)) {
      const target = values.get(time)!;
      if (!scheduled) {
        param.setValueAtTime(target, time);
        scheduled = true;
      } else if (lane.interpolation === 'step') {
        // A step lane must jump. Ramping from the previous grid sample glided
        // into the new value for one slice, so the bounce smeared every step.
        param.setValueAtTime(target, time);
      } else {
        param.linearRampToValueAtTime(target, time);
      }
    }
  }

  /**
   * Schedule the track's notes using the REAL live synth voice graph
   * (antialiased oscillator + filter + ADSR + glide + pan) via the audio
   * engine, so offline bounces sound identical to live playback.
   */
  private scheduleTrackNotes(
    ctx: OfflineAudioContext,
    master: AudioNode,
    notes: TrackNote[],
    params: any,
    timing: TempoTimeline,
    trackPan: number,
    instrumentId: string,
    isDrum: boolean,
    trackId: string,
  ): void {
    for (const n of notes) {
      if (n.velocity <= 0) continue;
      // Probability gate — matches live playStep behavior
      if (n.probability !== undefined && Math.random() >= n.probability) continue;

      const noteStartStep = Math.max(0, (n.step ?? 0) + (n.microOffset ?? 0));
      const noteLength = Math.max(0.01, n.length ?? 1);
      const ratchet = isDrum ? drumRatchetCount(n.params) : 1;
      const noteStepSeconds = timing.secondsForSteps(noteStartStep, noteLength) / noteLength;

      // CC lanes are shared with live playback: sample the same curve over
      // this note and hand it to the shared voice builder.
      let midiCc = this.automation.sampleCcCurve(
        trackId,
        noteStartStep,
        noteStartStep + noteLength,
        noteStepSeconds,
      );
      const pressure = Number(n.aftertouch);
      if (Number.isFinite(pressure) && pressure > 0) {
        const touchGain = 0.5 + 0.5 * Math.max(0, Math.min(1, pressure));
        if (midiCc.length > 0) {
          for (const point of midiCc) {
            point.expression = (point.expression ?? 1) * touchGain;
          }
        } else {
          midiCc = [{ at: 0, expression: touchGain }];
        }
      }
      const ccStart = midiCc[0];
      const ccPan = ccStart?.pan ?? n.notePan ?? trackPan;

      // Imported one-shot notes carry their decoded PCM. Schedule the sample
      // itself rather than synthesising the pad's MIDI pitch: the live stepper
      // now takes the same branch, so monitoring and the bounce agree.
      const noteParams = (n as any).params;
      const inlineOneShot = noteParams?.sampleBuffer as AudioBuffer | undefined;
      const oneShot =
        inlineOneShot &&
        Number.isFinite(inlineOneShot.duration) &&
        inlineOneShot.duration > 0
          ? inlineOneShot
          : noteParams?.sampleRefId
            ? this.musicManager.stemAudioCache.get(noteParams.sampleRefId)
            : undefined;
      if (oneShot && Number.isFinite(oneShot.duration) && oneShot.duration > 0) {
        for (let hit = 0; hit < ratchet; hit++) {
          const hitStep = noteStartStep + (hit * noteLength) / ratchet;
          const hitTime = timing.timeAtStep(hitStep);
          const source = ctx.createBufferSource();
          source.buffer = oneShot;
          const gain = ctx.createGain();
          const oneShotVelocity = Math.max(0, Math.min(1, n.velocity ?? 0.8));
          if (midiCc.some((point) => typeof point.expression === 'number')) {
            this.scheduleControlCurve(
              gain.gain,
              midiCc,
              'expression',
              (value) => Math.max(0, Math.min(1, oneShotVelocity * value)),
              hitTime,
            );
          } else {
            gain.gain.value = oneShotVelocity;
          }
          const panner = ctx.createStereoPanner();
          if (midiCc.some((point) => typeof point.pan === 'number')) {
            this.scheduleControlCurve(
              panner.pan,
              midiCc,
              'pan',
              (value) => Math.max(-1, Math.min(1, value)),
              hitTime,
            );
          } else {
            panner.pan.value = Math.max(-1, Math.min(1, ccPan));
          }
          source.connect(panner);
          panner.connect(gain);
          gain.connect(master);
          source.start(hitTime);
        }
        continue;
      }

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
      const noteDuration = timing.secondsForSteps(noteStartStep, noteLength) * lengthMul;
      if (this.instruments.isSamplePreset(instrumentId)) {
        const sample = this.instruments.getPresetSample(
          instrumentId, n.midi, n.velocity ?? 0.8, n.pitchBend ?? 0,
        );
        if (!sample) throw new Error(`Sample for MIDI ${n.midi} in “${instrumentId}” is unavailable.`);
        for (let hit = 0; hit < ratchet; hit++) {
          const hitStep = noteStartStep + (hit * noteLength) / ratchet;
          const hitDuration = timing.secondsForSteps(hitStep, noteLength / ratchet);
          scheduleOfflinePresetSample(
            ctx, master, sample, timing.timeAtStep(hitStep),
            ratchet > 1 ? Math.min(noteDuration, hitDuration) : Math.max(0.05, noteDuration),
            n.velocity ?? 0.8, ccPan, midiCc,
          );
        }
        continue;
      }

      // Slide notes: glide from the base pitch to the pitch-bend target
      const glideTo =
        n.isSlide && (n.pitchBend ?? 0) !== 0
          ? baseFreq * Math.pow(2, (n.pitchBend ?? 0) / 12)
          : undefined;
      const voiceParams =
        glideTo !== undefined
          ? { ...params, glideTo: baseFreq * Math.pow(2, (n.pitchBend ?? 0) / 12) }
          : params;

      const notePan = ccPan;
      const ccVoiceParams = midiCc.length
        ? { ...voiceParams, midiCc }
        : voiceParams;
      for (let hit = 0; hit < ratchet; hit++) {
        const hitStep = noteStartStep + (hit * noteLength) / ratchet;
        const hitDuration = timing.secondsForSteps(hitStep, noteLength / ratchet);
        const dur = ratchet > 1
          ? Math.min(noteDuration, hitDuration)
          : Math.max(0.05, noteDuration);
        this.engine.scheduleOfflineNote(
          ctx,
          master,
          freq,
          timing.timeAtStep(hitStep),
          n.velocity ?? 0.8,
          dur,
          ccVoiceParams,
          notePan
        );
      }
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
    qualityOrBitrate: number = 16
  ): Promise<Blob> {
    const info = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];
    const bitrate = this.resolveExportBitrate(info.id, qualityOrBitrate);

    if (info.id === 'wav' || info.id === 'wav24') {
      const wav = await this.audioBufferToWav(
        buffer,
        info.id === 'wav24' ? 24 : 16
      );
      return new Blob([wav], { type: 'audio/wav' });
    }

    if (info.id === 'flac') {
      // Lossless, and unlike the WebCodecs formats it needs no browser codec
      // support: the encoder in flac-encoder.util writes the stream itself.
      return encodeFlacBlob(buffer, { bitDepth: 16, dither: true });
    }

    if (info.webCodecs && typeof (globalThis as any).AudioEncoder === 'function') {
      try {
        const encoded = await this.encodeViaWebCodecs(buffer, info, bitrate);
        if (encoded) return encoded;
      } catch (err) {
        this.logger.warn(`WebCodecs ${info.id} encode failed, falling back to WAV`, err);
      }
    }

    // Graceful fallback: lossless WAV keeps the export usable on every browser.
    const wav = await this.audioBufferToWav(buffer);
    return new Blob([wav], { type: 'audio/wav' });
  }

  /** Validate a requested bitrate, falling back to the codec default. */
  private resolveExportBitrate(format: string, requested: number): number {
    const fallback = defaultExportBitrate(format);
    if (!fallback) return 0;
    if (!Number.isFinite(requested) || requested < 32_000 || requested > 512_000) {
      return fallback;
    }
    return Math.round(requested);
  }

  /** Encode an AudioBuffer to a compressed format via WebCodecs AudioEncoder. */
  private async encodeViaWebCodecs(
    buffer: AudioBuffer,
    info: ExportFormatInfo,
    bitrate: number = defaultExportBitrate(info.id)
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
      bitrate: bitrate || defaultExportBitrate(info.id),
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
            buffer.sampleRate,
            { dither: true },
          )
        : WavEncoder.encode(channels, channels.length, buffer.sampleRate, {
            dither: true,
          });
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
    const endStep = this.interchangeEndStep();

    for (const track of this.musicManager.tracks()) {
      if (track.muted || track.type === 'audio' || track.type === 'bus') continue;
      const notes = track.type === 'drum' ? this.interchangeDrumNotes(track, endStep) : track.notes ?? [];
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
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
  async exportAndShare(
    format: string,
    options: { bitrate?: number; sampleRate?: number } = {},
  ): Promise<boolean> {
    const buffer = await this.renderProjectOffline(
      options.sampleRate ? { sampleRate: options.sampleRate } : {},
    );
    const polished = await this.applySmuvePolish(buffer);
    const blob = exportSupportsBitrate(format)
      ? await this.exportToFormat(
          polished,
          format,
          options.bitrate ?? defaultExportBitrate(format),
        )
      : await this.exportToFormat(polished, format);
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
