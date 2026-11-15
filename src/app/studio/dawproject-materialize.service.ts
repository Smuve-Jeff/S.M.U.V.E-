import { Injectable, inject } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { InstrumentsService } from "../services/instruments.service";
import { createSampleStreamer } from "../services/sample-streamer.service";
import { LoggingService } from "../services/logging.service";
import {
  MusicManagerService,
  type TrackNote,
} from "../services/music-manager.service";
import type {
  DawprojectAudio,
  DawprojectNote,
  DawprojectTrack,
} from "./dawproject-export";
import type { DawprojectImportResult } from "./dawproject-import";

/**
 * Caps mirror MidiImportService so a DAWproject bundle cannot exceed what a
 * plain MIDI import is allowed to create.
 */
const MAX_IMPORT_TRACKS = 32;
const MAX_IMPORT_NOTES = 20_000;
const MIN_TEMPO_BPM = 20;
const MAX_TEMPO_BPM = 300;
const MIN_CLIP_BARS = 0.25;

const DEFAULT_MELODIC_INSTRUMENT = "grand-piano";
const DEFAULT_AUDIO_INSTRUMENT = "sampler-elite";

export interface DawprojectMaterializeSummary {
  trackCount: number;
  noteCount: number;
  audioClipCount: number;
  skippedTracks: number;
  skippedNotes: number;
  skippedAudio: number;
  tempoBpm?: number;
  warnings: string[];
}

/** Decode embedded audio bytes; injectable so specs can stand in for Web Audio. */
export type DawprojectAudioDecoder = (
  data: Uint8Array,
) => Promise<AudioBuffer | null>;

/**
 * Streaming attachment for long audio: keeps a bounded resident window
 * instead of pinning the whole decoded buffer. Mirrors the audio import's
 * >10s SampleStreamer path. Injectable so specs need no object URLs.
 */
export interface DawprojectStreamAttachment {
  streamer: unknown;
  sampleRate: number;
  channels: number;
  duration: number;
}

export type DawprojectAudioStreamer = (
  data: Uint8Array,
  decoded: AudioBuffer,
) => DawprojectStreamAttachment | null;

/** Above this decoded duration the full buffer is not cached; it streams. */
const STREAM_AUDIO_SECONDS = 10;

@Injectable({ providedIn: "root" })
export class DawprojectMaterializeService {
  private readonly musicManager = inject(MusicManagerService);
  private readonly instruments = inject(InstrumentsService);
  private readonly audio = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);

  /**
   * Build live tracks, notes, clips and mix settings from a parsed
   * DAWproject bundle. Audio refs with no bytes (e.g. Studio One's
   * reference-only files) are skipped with a warning, never a failure.
   */
  async materialize(
    result: DawprojectImportResult,
    decode?: DawprojectAudioDecoder,
    stream?: DawprojectAudioStreamer,
  ): Promise<DawprojectMaterializeSummary> {
    const summary: DawprojectMaterializeSummary = {
      trackCount: 0,
      noteCount: 0,
      audioClipCount: 0,
      skippedTracks: 0,
      skippedNotes: 0,
      skippedAudio: 0,
      warnings: [...result.warnings],
    };
    const decodeAudio = decode ?? ((data) => this.decodeAudioData(data));
    const streamAudio = stream ?? ((data, decoded) => this.streamAudioData(data, decoded));

    summary.tempoBpm = this.applyTempo(result.project.tempo);

    // Keyed by ref id (what clip.audioId points at); the path is a fallback.
    const audioByRef = new Map<string, DawprojectAudio>();
    for (const ref of result.project.audio) {
      audioByRef.set(ref.id, ref);
      if (!audioByRef.has(ref.path)) audioByRef.set(ref.path, ref);
    }
    const stamp = Date.now().toString(36);

    for (const [trackIndex, parsed] of result.project.tracks.entries()) {
      if (summary.trackCount >= MAX_IMPORT_TRACKS) {
        summary.skippedTracks++;
        continue;
      }
      const kind = this.materializeKind(parsed);
      if (!kind) {
        summary.skippedTracks++;
        summary.warnings.push(
          `Skipped "${parsed.name || "Untitled"}": ${parsed.type} tracks have no playable Studio mapping.`,
        );
        continue;
      }
      const hasNotes = parsed.notes.length > 0;
      const hasClips = parsed.clips.length > 0;
      if (!hasNotes && !hasClips) {
        summary.skippedTracks++;
        continue;
      }

      const trackId = this.musicManager.addTrack(
        uniqueName(
          parsed.name,
          this.musicManager.tracks().map((t) => t.name),
        ),
        this.instrumentFor(parsed, kind),
        kind,
      );
      if (!trackId) {
        summary.skippedTracks++;
        summary.warnings.push(
          `Stopped at the device track limit; "${parsed.name || "Untitled"}" was not created.`,
        );
        break;
      }

      if (kind !== "audio" && hasNotes) {
        const usable = this.takeNotes(parsed.notes, summary, stamp, trackIndex);
        if (usable.length > 0) {
          this.musicManager.replaceTrackNotes(
            trackId,
            usable,
            "Import DAWproject",
          );
          summary.noteCount += usable.length;
        }
      }

      if (kind === "audio") {
        const made = await this.materializeAudioClips(
          trackId,
          parsed,
          audioByRef,
          decodeAudio,
          streamAudio,
          summary,
        );
        if (made === 0) {
          // Nothing playable survived: roll the empty track back so the
          // project is not littered with silent channels.
          this.musicManager.removeTrack(trackId);
          summary.skippedTracks++;
          continue;
        }
      } else {
        for (const clip of parsed.clips) {
          this.musicManager.addClipToTrack(trackId, {
            name: clip.name || parsed.name,
            start: Math.max(0, clip.start),
            length: Math.max(MIN_CLIP_BARS, clip.length),
            type: "midi",
          });
        }
      }

      this.musicManager.applyTrackPatch(
        trackId,
        {
          gain: clamp(parsed.gain, 0, 1.5),
          pan: clamp(parsed.pan, -1, 1),
          muted: parsed.muted,
          soloed: parsed.soloed,
        },
        "Import DAWproject",
      );
      if (parsed.color) this.musicManager.setTrackColor(trackId, parsed.color);

      summary.trackCount++;
    }

    this.logger.info(
      `DAWproject materialize: ${summary.trackCount} track(s), ` +
        `${summary.noteCount} note(s), ${summary.audioClipCount} audio clip(s)`,
    );
    return summary;
  }

  private materializeKind(
    parsed: DawprojectTrack,
  ): "midi" | "drum" | "audio" | null {
    if (parsed.type === "audio") return "audio";
    if (parsed.type === "drum") return "drum";
    if (parsed.type === "midi") return "midi";
    return null;
  }

  private instrumentFor(
    parsed: DawprojectTrack,
    kind: "midi" | "drum" | "audio",
  ): string {
    if (kind === "audio") return DEFAULT_AUDIO_INSTRUMENT;
    const wanted = (parsed.instrumentName || "").trim().toLowerCase();
    if (wanted) {
      const match = this.instruments
        .getPresets()
        .find(
          (preset) =>
            preset.id.toLowerCase() === wanted ||
            (preset.name ?? "").toLowerCase() === wanted,
        );
      if (match) return match.id;
    }
    return DEFAULT_MELODIC_INSTRUMENT;
  }

  private takeNotes(
    notes: DawprojectNote[],
    summary: DawprojectMaterializeSummary,
    stamp: string,
    trackIndex: number,
  ): TrackNote[] {
    const remaining = MAX_IMPORT_NOTES - summary.noteCount;
    if (remaining <= 0) {
      summary.skippedNotes += notes.length;
      return [];
    }
    const usable = notes.slice(0, remaining);
    summary.skippedNotes += notes.length - usable.length;
    if (usable.length < notes.length) {
      summary.warnings.push(
        `Truncated notes at the ${MAX_IMPORT_NOTES}-note cap.`,
      );
    }
    return usable.map((note, index) => ({
      id: `daw_${stamp}_${trackIndex}_${index}`,
      midi: clamp(Math.round(note.midi), 0, 127),
      step: round4(note.step),
      length: Math.max(0.125, round4(note.length)),
      velocity: clamp(note.velocity, 0, 1),
    }));
  }

  private async materializeAudioClips(
    trackId: string,
    parsed: DawprojectTrack,
    audioByRef: Map<string, DawprojectAudio>,
    decodeAudio: DawprojectAudioDecoder,
    streamAudio: DawprojectAudioStreamer,
    summary: DawprojectMaterializeSummary,
  ): Promise<number> {
    let made = 0;
    const tempo = this.currentTempo();
    const secondsPerBar = (60 / Math.max(1, tempo)) * 4;
    for (const [clipIndex, clip] of parsed.clips.entries()) {
      const ref = clip.audioId
        ? audioByRef.get(clip.audioId)
        : undefined;
      const bytes = ref && ref.data.length > 0 ? ref.data : null;
      if (!bytes) {
        summary.skippedAudio++;
        summary.warnings.push(
          `Skipped audio clip "${clip.name || parsed.name}": no audio was embedded for it.`,
        );
        continue;
      }
      let buffer: AudioBuffer | null = null;
      try {
        buffer = await decodeAudio(bytes);
      } catch (error) {
        this.logger.warn(`DAWproject audio decode failed (${ref?.path})`, error);
      }
      if (!buffer) {
        summary.skippedAudio++;
        summary.warnings.push(
          `Skipped audio clip "${clip.name || parsed.name}": the audio could not be decoded.`,
        );
        continue;
      }
      const clipId = `dawclip_${Date.now().toString(36)}_${clipIndex}_${made}`;
      const fallbackBars = Math.max(
        MIN_CLIP_BARS,
        buffer.duration / secondsPerBar,
      );
      const clipName = clip.name || parsed.name;
      const clipStart = Math.max(0, clip.start);
      const clipLength = Math.max(MIN_CLIP_BARS, clip.length || fallbackBars);
      // Long audio streams from a bounded resident window instead of
      // pinning the whole decoded buffer (phones OOM on full-song takes).
      const attachment =
        buffer.duration > STREAM_AUDIO_SECONDS
          ? streamAudio(bytes, buffer)
          : null;
      if (attachment) {
        this.musicManager.addClipToTrack(trackId, {
          id: clipId,
          name: clipName,
          start: clipStart,
          length: clipLength,
          type: "audio",
          audioRefId: clipId,
          clipStreamer: attachment.streamer,
          clipOriginSeconds: 0,
          clipLengthSeconds: attachment.duration,
          clipSampleRate: attachment.sampleRate,
          clipChannels: attachment.channels,
        });
      } else {
        this.musicManager.stemAudioCache.set(clipId, buffer);
        this.musicManager.addClipToTrack(trackId, {
          id: clipId,
          name: clipName,
          start: clipStart,
          length: clipLength,
          type: "audio",
          audioRefId: clipId,
        });
      }
      made++;
      summary.audioClipCount++;
    }
    return made;
  }

  private applyTempo(tempo: number | undefined): number | undefined {
    if (
      tempo === undefined ||
      !Number.isFinite(tempo) ||
      tempo < MIN_TEMPO_BPM ||
      tempo > MAX_TEMPO_BPM
    ) {
      return undefined;
    }
    const engineTempo = this.musicManager.engine?.tempo as
      | ((() => number) & { set?: (bpm: number) => void })
      | undefined;
    if (typeof engineTempo?.set === "function") {
      engineTempo.set(Math.round(tempo));
      return Math.round(tempo);
    }
    return undefined;
  }

  private currentTempo(): number {
    const engineTempo = this.musicManager.engine?.tempo as
      | ((() => number) & { set?: (bpm: number) => void })
      | undefined;
    const current =
      typeof engineTempo === "function" ? engineTempo() : NaN;
    return Number.isFinite(current) && current > 0 ? current : 120;
  }

  private async decodeAudioData(
    data: Uint8Array,
  ): Promise<AudioBuffer | null> {
    try {
      const copy = data.slice(0);
      return await this.audio.ctx.decodeAudioData(
        copy.buffer as ArrayBuffer,
      );
    } catch (error) {
      this.logger.warn("DAWproject audio decode failed", error);
      return null;
    }
  }

  private streamAudioData(
    data: Uint8Array,
    decoded: AudioBuffer,
  ): DawprojectStreamAttachment | null {
    try {
      if (
        typeof URL === "undefined" ||
        typeof URL.createObjectURL !== "function"
      ) {
        return null;
      }
      const url = URL.createObjectURL(
        new Blob([data.slice(0)], { type: "audio/wav" }),
      );
      const streamer = createSampleStreamer({
        maxResidentSeconds: 30,
        shortSampleThresholdSeconds: 10,
      });
      const copy = data.slice(0);
      if (!streamer.attachWavSource(url, copy.buffer as ArrayBuffer)) {
        URL.revokeObjectURL(url);
        return null;
      }
      streamer.setPlayhead(0);
      const resident = streamer.getResidentBuffer();
      return {
        streamer,
        sampleRate: resident?.sampleRate ?? decoded.sampleRate,
        channels: resident?.numberOfChannels ?? decoded.numberOfChannels,
        duration: streamer.getDuration() || decoded.duration,
      };
    } catch (error) {
      this.logger.warn("DAWproject audio stream attach failed", error);
      return null;
    }
  }
}

/** Musical positions keep 4 decimals so 1/16-step fractions stay exact. */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function uniqueName(name: string, existing: string[]): string {
  const base = (name || "DAW Track").trim().slice(0, 48) || "DAW Track";
  if (!existing.includes(base)) return base;
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base} ${Date.now().toString(36)}`;
}
