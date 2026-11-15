import { Injectable, OnDestroy, computed, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { LoggingService } from "../services/logging.service";
import { MusicManagerService } from "../services/music-manager.service";
import { LocalStorageService } from "../services/local-storage.service";
import type { ProjectBackingTrackPort } from "./project-backing-track.token";
import { WavEncoder } from "./wav-encoder.util";

/** Where uploaded set media lives; the project bundle never carries audio. */
const PROJECT_MEDIA_STORE = "project_media";
const BACKING_ID_PREFIX = "backing_";

export interface BackingTrack {
  /** File name without its extension. */
  name: string;
  buffer: AudioBuffer;
  /** The uploaded file, kept so the guide can be stored with the set. */
  blob?: Blob;
  /**
   * Arrangement track this guide came from, when it was picked out of the song
   * rather than uploaded. Adding it back would duplicate the track.
   */
  sourceTrackId?: string;
  /** Clips that went into a guide composed from the song. */
  sourceClipCount?: number;
}

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * Monitor-only playback of an artist-uploaded backing track, so a vocal can be
 * sung against a custom instrumental inside the Vocal Suite.
 *
 * The graph is deliberately separate from the engine's master bus: the vocal
 * capture taps the microphone chain, and a backing routed through the master
 * would sit one mixer move away from being bounced into the vocal stem. Here it
 * can only ever be heard, never recorded.
 */
@Injectable({ providedIn: "root" })
export class VocalBackingTrackService
  implements OnDestroy, ProjectBackingTrackPort
{
  private readonly engine = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly storage = inject(LocalStorageService);
  /** Set this backing was last saved with, so it reopens with the project. */
  private projectId: string | null = null;
  /** Name/size of the stored file; unchanged means no write is needed. */
  private persistedSignature: string | null = null;
  /**
   * The uploaded file's own bytes, kept so an exported archive can carry the
   * guide without re-reading IndexedDB. Compressed source is small next to the
   * decoded AudioBuffer this service already holds.
   */
  private fileBytes: Uint8Array<ArrayBuffer> | null = null;

  track = signal<BackingTrack | null>(null);
  isPlaying = signal(false);
  loop = signal(false);
  /** Monitor level, 0 (muted) – 1 (unity). */
  level = signal(0.8);
  /** Read-out position inside the track, in seconds. */
  positionSeconds = signal(0);
  /** Last load/playback failure, surfaced instead of a silent no-op. */
  lastError = signal<string | null>(null);

  readonly hasTrack = computed(() => this.track() !== null);
  readonly durationSeconds = computed(() => this.track()?.buffer.duration ?? 0);
  readonly levelPercent = computed(() => Math.round(this.level() * 100));
  readonly positionLabel = computed(() => formatClock(this.positionSeconds()));
  readonly durationLabel = computed(() => formatClock(this.durationSeconds()));

  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAtCtxTime = 0;
  private startedFromSeconds = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.clear();
  }

  /** Decode a user-selected audio file as the backing track. */
  async loadFile(file: File): Promise<boolean> {
    this.clear();
    this.lastError.set(null);
    try {
      const ctx = this.engine.ctx;
      // decodeAudioData detaches its input, so decode a copy and keep the
      // original bytes for the project archive.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
      if (!buffer || buffer.duration <= 0) {
        throw new Error("Decoded backing track has no audio");
      }
      this.persistedSignature = null;
      this.fileBytes = bytes;
      this.track.set({
        name: file.name.replace(/\.[^/.]+$/, "") || "Backing track",
        buffer,
        blob: file,
      });
      this.positionSeconds.set(0);
      // The session already knows which project this is: store the upload now,
      // so reopening the set keeps its guide even before the next save.
      if (this.projectId) void this.persistProject(this.projectId);
      return true;
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not decode the backing track",
        error,
      );
      this.lastError.set("Could not read that audio file");
      return false;
    }
  }

  /**
   * Put the loaded guide track in the arrangement at bar 1 — the same downbeat
   * routed vocal takes are placed against. Returns the track name on success so
   * the caller can report what landed.
   */
  addToArrangement(): string | null {
    const track = this.track();
    if (!track) return null;
    // A guide picked out of the song is already there. Adding it again would
    // put the same beat on two tracks and double it on playback.
    if (
      track.sourceTrackId &&
      this.musicManager
        .tracks()
        .some((existing: { id?: string }) => existing?.id === track.sourceTrackId)
    ) {
      return null;
    }
    this.musicManager.addAudioTrack({
      id: `backing_${Date.now()}`,
      name: track.name,
      color: "#0E7C7B",
      buffer: track.buffer,
      offset: 0,
    });
    return track.name;
  }

  /** Drop the loaded track (and stop it, so nothing keeps playing). */
  clear(): void {
    this.stop();
    this.track.set(null);
    this.positionSeconds.set(0);
    this.lastError.set(null);
    this.fileBytes = null;
    // The stored copy is removed on the next save, not here: `loadFile` clears
    // first, and deleting the set's guide mid-replace would lose it.
    this.persistedSignature = null;
  }

  /**
   * Store the loaded file with the project so reopening the set restores the
   * guide track instead of asking the artist to find it again. Bytes go to
   * IndexedDB beside the project; the JSON bundle only ever holds the song.
   */
  async persistProject(projectId?: string | null): Promise<void> {
    const id = projectId ?? this.projectId;
    if (!id) return;
    this.projectId = id;
    const track = this.track();
    if (!track?.blob) {
      // A cleared track has to take its stored bytes with it, or the next open
      // would resurrect a guide the artist removed.
      if (!track) await this.forgetProject(id);
      return;
    }
    const signature = `${track.name}:${track.blob.size}:${track.blob.type}`;
    // Autosave runs every 30 s; the file only needs writing when it changed.
    if (signature === this.persistedSignature) return;
    try {
      await this.storage.saveItem(PROJECT_MEDIA_STORE, {
        id: `${BACKING_ID_PREFIX}${id}`,
        name: track.name,
        blob: track.blob,
        savedAt: Date.now(),
      });
      this.persistedSignature = signature;
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not store the backing track with the project",
        error,
      );
    }
  }

  /** Reopen the guide stored with `projectId` (false when the set has none). */
  async restoreProject(projectId: string): Promise<boolean> {
    this.projectId = projectId;
    this.persistedSignature = null;
    try {
      const record = await this.storage.getItem(
        PROJECT_MEDIA_STORE,
        `${BACKING_ID_PREFIX}${projectId}`,
      );
      if (!record?.blob) {
        // A set without a guide must not inherit the previous set's track.
        this.stop();
        this.track.set(null);
        this.positionSeconds.set(0);
        return false;
      }
      const bytes = new Uint8Array(await record.blob.arrayBuffer());
      const buffer = await this.engine.ctx.decodeAudioData(bytes.slice().buffer);
      if (!buffer || buffer.duration <= 0) return false;
      this.stop();
      this.fileBytes = bytes;
      this.track.set({
        name: record.name || "Backing track",
        buffer,
        blob: record.blob,
      });
      this.positionSeconds.set(0);
      this.persistedSignature = `${record.name}:${record.blob.size}:${record.blob.type}`;
      return true;
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not restore the backing track",
        error,
      );
      return false;
    }
  }

  /**
   * Use a track that is already in the song as the guide, so the artist does
   * not have to find the file again. It is encoded to 16-bit WAV on the spot,
   * which gives it the same bytes-everywhere treatment as an upload: saving,
   * archive export and restore all work without the original file.
   */
  useBuffer(
    buffer: AudioBuffer,
    name: string,
    sourceTrackId?: string,
    sourceClipCount?: number,
  ): boolean {
    if (!buffer || !(buffer.duration > 0)) return false;
    try {
      const channels: Float32Array[] = [];
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        channels.push(buffer.getChannelData(channel));
      }
      const bytes = WavEncoder.encodeMultiChannelBytes(
        channels,
        "wav-16",
        buffer.sampleRate,
      );
      this.stop();
      this.lastError.set(null);
      this.persistedSignature = null;
      this.fileBytes = bytes;
      this.track.set({
        name: name?.trim() || "Backing track",
        buffer,
        blob: new Blob([bytes], { type: "audio/wav" }),
        sourceTrackId: sourceTrackId || undefined,
        sourceClipCount: sourceClipCount ?? undefined,
      });
      this.positionSeconds.set(0);
      if (this.projectId) void this.persistProject(this.projectId);
      return true;
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not use an arrangement track as the backing",
        error,
      );
      this.lastError.set("Could not use that track as the backing");
      return false;
    }
  }

  /** The uploaded file as an exported archive should carry it. */
  archiveFile(): { name: string; data: Uint8Array; mimeType: string } | null {
    const track = this.track();
    if (!track || !this.fileBytes?.byteLength) return null;
    return {
      name: track.name,
      data: this.fileBytes,
      mimeType: track.blob?.type || "application/octet-stream",
    };
  }

  /**
   * Take the guide out of an imported archive: store it with the new project
   * and make it the loaded track, so the set opens with its backing on a
   * device that never had the file.
   */
  async adoptProject(
    projectId: string,
    file: { name: string; blob: Blob },
    options?: { persist?: boolean },
  ): Promise<boolean> {
    this.projectId = projectId;
    try {
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      const buffer = await this.engine.ctx.decodeAudioData(bytes.slice().buffer);
      if (!buffer || buffer.duration <= 0) return false;
      if (options?.persist !== false) {
        await this.storage.saveItem(PROJECT_MEDIA_STORE, {
          id: `${BACKING_ID_PREFIX}${projectId}`,
          name: file.name,
          blob: file.blob,
          savedAt: Date.now(),
        });
        this.persistedSignature = `${file.name}:${file.blob.size}:${file.blob.type}`;
      }
      this.stop();
      this.fileBytes = bytes;
      this.track.set({
        name: file.name || "Backing track",
        buffer,
        blob: file.blob,
      });
      this.positionSeconds.set(0);
      return true;
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not adopt the imported backing track",
        error,
      );
      return false;
    }
  }

  /** Drop the stored guide for a set that is being deleted. */
  async forgetProject(projectId?: string | null): Promise<void> {
    const id = projectId ?? this.projectId;
    if (!id) return;
    this.persistedSignature = null;
    try {
      await this.storage.deleteItem(
        PROJECT_MEDIA_STORE,
        `${BACKING_ID_PREFIX}${id}`,
      );
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not remove the stored backing track",
        error,
      );
    }
  }

  /**
   * Play from `fromSeconds`, optionally scheduled at an exact AudioContext time
   * so an audition can start the take and the backing on the same sample.
   */
  play(fromSeconds = 0, whenSeconds?: number): boolean {
    const track = this.track();
    if (!track) return false;

    const ctx = this.engine.ctx;
    const duration = track.buffer.duration;
    let from = Number.isFinite(fromSeconds) ? Math.max(0, fromSeconds) : 0;
    // A play press at the very end restarts the track rather than starting a
    // source that ends immediately.
    if (from >= duration - 0.01) from = 0;

    this.stopSource();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.loop = this.loop();
      const gain = ctx.createGain();
      gain.gain.value = this.level();
      source.connect(gain);
      gain.connect(ctx.destination);

      source.onended = () => {
        // A looped source only ends on stop() (handled there); a natural end
        // parks the read-out instead of leaving a moving playhead behind.
        if (this.source !== source) return;
        this.source = null;
        this.stopTicker();
        this.isPlaying.set(false);
        this.positionSeconds.set(duration);
        try {
          gain.disconnect();
        } catch {
          /* already disconnected */
        }
      };

      const when =
        typeof whenSeconds === "number" && Number.isFinite(whenSeconds)
          ? Math.max(ctx.currentTime, whenSeconds)
          : ctx.currentTime;
      source.start(when, from);

      this.source = source;
      this.gain = gain;
      this.startedAtCtxTime = when;
      this.startedFromSeconds = from;
      this.positionSeconds.set(from);
      this.isPlaying.set(true);
      this.startTicker();
      return true;
    } catch (error) {
      this.logger.warn(
        "VocalBackingTrack: could not start the backing track",
        error,
      );
      this.lastError.set("Could not start the backing track");
      this.stop();
      return false;
    }
  }

  /** Start again from the top — used when REC is armed. */
  restart(whenSeconds?: number): boolean {
    return this.play(0, whenSeconds);
  }

  toggle(): void {
    if (this.isPlaying()) {
      this.stop();
    } else {
      this.play(this.positionSeconds());
    }
  }

  stop(): void {
    this.stopSource();
    this.stopTicker();
    this.isPlaying.set(false);
  }

  /** Set the monitor level from a 0–100 control. */
  setLevel(percent: number): void {
    const next = Math.max(0, Math.min(1, (Number(percent) || 0) / 100));
    this.level.set(next);
    if (!this.gain) return;
    try {
      this.gain.gain.setTargetAtTime(next, this.engine.ctx.currentTime, 0.02);
    } catch {
      try {
        this.gain.gain.value = next;
      } catch {
        /* gain node was disposed with its context */
      }
    }
  }

  toggleLoop(): void {
    this.loop.update((value) => !value);
    if (this.source) this.source.loop = this.loop();
  }

  private startTicker(): void {
    this.stopTicker();
    if (typeof setInterval !== "function") return;
    this.ticker = setInterval(() => this.updatePosition(), 120);
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private updatePosition(): void {
    const track = this.track();
    if (!track) return;
    const duration = track.buffer.duration;
    const ctx = this.engine.ctx;
    const elapsed =
      this.startedFromSeconds + Math.max(0, ctx.currentTime - this.startedAtCtxTime);
    const position =
      this.loop() && duration > 0 ? elapsed % duration : Math.min(duration, elapsed);
    this.positionSeconds.set(Math.max(0, position));
  }

  private stopSource(): void {
    const source = this.source;
    this.source = null;
    if (source) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* never started or already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        /* already disconnected */
      }
      this.gain = null;
    }
  }
}
