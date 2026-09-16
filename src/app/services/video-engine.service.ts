import { Injectable, signal, computed, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

export type ProductionMode = 'movie' | 'music' | 'stream' | 'vlog';
export type ClipFilter = 'none' | 'cinematic' | 'vivid' | 'mono';
export type ClipTransition = 'cut' | 'fade' | 'dissolve';
export const MIN_ACTIVE_CLIP_DURATION = 0.05;

/** Beat-grid tick for the timeline ruler. */
export interface BeatTick {
  time: number;
  index: number;
  isBar: boolean;
}

/** Marker kinds so scenes, acts, song sections and broadcast cues can share one lane. */
export type MarkerKind = 'scene' | 'act' | 'section' | 'cue';

export interface SceneMarker {
  id: string;
  label: string;
  time: number;
  kind: MarkerKind;
}

/** Streamer lower-third graphics, drawn into the preview so exports carry them. */
export interface LowerThird {
  enabled: boolean;
  title: string;
  subtitle: string;
}

export interface ClipMovePatch {
  startTime?: number;
  trackId?: string;
}

export interface DeliveryPreset {
  id: string;
  mode: ProductionMode;
  name: string;
  aspectRatio: string;
  width: number;
  height: number;
  duration: number;
  target: string;
  description: string;
}

export interface VideoClip {
  id: string;
  name: string;
  url: string;
  startTime: number; // in seconds on timeline
  duration: number; // in seconds
  offset: number; // start offset within the source file
  trackId: string;
  type: 'video' | 'image' | 'overlay';
  /**
   * Where the media came from. Drives preview/export rendering hints — camera
   * clips honour the viewfinder mirror setting, uploads and screen captures
   * never do.
   */
  source?: 'upload' | 'ai' | 'camera' | 'screen';
  /**
   * Identifies the clip's footage in the project's stored media library.
   *
   * A `blob:` url cannot be reopened after a reload, so the bytes are kept under
   * this id and a fresh url is minted on load. Clips whose media is a `data:` url
   * carry their own bytes and need no id.
   */
  mediaId?: string;
  /**
   * Director note printed on the clip's shot card when it has no decoded media
   * yet — how an AI-staged shot describes itself before it is shot.
   */
  note?: string;
  /** Shot size for staged storyboard cards (wide, close, insert…). */
  shotType?: string;
  effects: {
    upscale: boolean;
    bgRemoval: boolean;
    noiseReduction: boolean;
    brightness: number;
    contrast: number;
    filter: ClipFilter;
    transition: ClipTransition;
    transitionDuration: number;
    trimStart: number;
    trimEnd: number;
  };
}

export interface VideoTrack {
  id: string;
  name: string;
  type: 'visual' | 'overlay' | 'voiceover' | 'score';
  clips: VideoClip[];
  muted: boolean;
  locked: boolean;
}

/**
 * Everything the operator edits, in a form that survives a reload.
 *
 * Media bytes are deliberately kept outside this snapshot. The cinema project
 * store owns them separately and rehydrates `mediaId` clips after reload; this
 * keeps timeline metadata light while allowing footage to outlive the tab.
 */
/**
 * Snapshot format version, written with every saved project.
 *
 * It exists so a record written by a different build can be recognised instead
 * of being read as if it were the current shape and silently losing whatever it
 * carried that this build does not know about.
 */
export const CINEMA_SNAPSHOT_VERSION = 1;

export interface CinemaSnapshot {
  version: typeof CINEMA_SNAPSHOT_VERSION;
  productionMode: ProductionMode;
  deliveryPresetId: string;
  duration: number;
  currentTime: number;
  safeZoneEnabled: boolean;
  snapToBeat: boolean;
  lowerThird: LowerThird;
  markers: SceneMarker[];
  tracks: VideoTrack[];
}

/** What a restore could, and could not, bring back. */
export interface CinemaRestoreReport {
  clips: number;
  markers: number;
  /** Clips whose media was session-scoped and has to be ingested again. */
  clipsMissingMedia: number;
}

/**
 * Whether a clip url still resolves after a reload. A `data:` url carries its own
 * bytes, so it survives; a `blob:` url is an object URL minted by this session
 * and dies with the document that created it.
 */
const isReloadableMediaUrl = (url: string): boolean =>
  /^data:/i.test(url ?? '');

/** The lanes every project starts with, minted fresh so restores never alias. */
const createDefaultTracks = (): VideoTrack[] => [
  {
    id: 't1',
    name: 'Visuals',
    type: 'visual',
    clips: [],
    muted: false,
    locked: false,
  },
  {
    id: 't2',
    name: 'Overlays',
    type: 'overlay',
    clips: [],
    muted: false,
    locked: false,
  },
  {
    id: 't3',
    name: 'AI Voiceovers',
    type: 'voiceover',
    clips: [],
    muted: false,
    locked: false,
  },
  {
    id: 't4',
    name: 'Global Score',
    type: 'score',
    clips: [],
    muted: false,
    locked: false,
  },
];

const DELIVERY_PRESETS: DeliveryPreset[] = [
  {
    id: 'movie-cinema-4k',
    mode: 'movie',
    name: 'CinemaScope 4K',
    aspectRatio: '2.39:1',
    width: 4096,
    height: 1716,
    duration: 7200,
    target: 'Full-Length Film',
    description:
      'Built for long-form scenes, theatrical pacing, and soundtrack-driven storytelling.',
  },
  {
    id: 'movie-festival-master',
    mode: 'movie',
    name: 'Festival Master',
    aspectRatio: '16:9',
    width: 3840,
    height: 2160,
    duration: 5400,
    target: 'Screening / OTT',
    description:
      'Balanced for festival submissions, streaming platforms, and polished final masters.',
  },
  {
    id: 'music-video-master',
    mode: 'music',
    name: 'Music Video Master',
    aspectRatio: '16:9',
    width: 3840,
    height: 2160,
    duration: 420,
    target: 'YouTube / VEVO / Performance Cut',
    description:
      'Beat-locked cutting on the session tempo with performance takes and AI-generated concept inserts.',
  },
  {
    id: 'music-video-vertical',
    mode: 'music',
    name: 'Vertical Music Clip',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    duration: 180,
    target: 'TikTok / Reels / Shorts',
    description:
      'Vertical-first music cutdown with beat-synced scene changes and hook-forward framing.',
  },
  {
    id: 'stream-live-landscape',
    mode: 'stream',
    name: 'Live Stream Landscape',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    duration: 14400,
    target: 'YouTube / Twitch / Stage Broadcast',
    description:
      'Optimized for long broadcasts, overlays, chat-safe composition, and live switching.',
  },
  {
    id: 'stream-vertical-social',
    mode: 'stream',
    name: 'Vertical Social Live',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    duration: 3600,
    target: 'TikTok / IG Live / Shorts',
    description:
      'Vertical-first framing for social streaming, cutdowns, and high-retention audience capture.',
  },
  {
    id: 'vlog-daily-drop',
    mode: 'vlog',
    name: 'Daily Drop Vlog',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    duration: 1800,
    target: 'YouTube / Creator Feed',
    description:
      'Fast-turn vlog preset for behind-the-scenes storytelling, talking head segments, and b-roll.',
  },
  {
    id: 'vlog-mobile-story',
    mode: 'vlog',
    name: 'Mobile Story Cut',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    duration: 900,
    target: 'Reels / Stories / Clips',
    description:
      'Tuned for quick vertical edits, teaser cuts, and mobile-native updates.',
  },
];

@Injectable({
  providedIn: 'root',
})
export class VideoEngineService {
  private audioEngine = inject(AudioEngineService);

  currentTime = signal(0);
  duration = signal(7200);
  isPlaying = signal(false);
  productionMode = signal<ProductionMode>('movie');
  deliveryPreset = signal<DeliveryPreset>(DELIVERY_PRESETS[0]);
  safeZoneEnabled = signal(true);

  // ── Music-video beat grid ──────────────────────────────────────────────

  /** Live tempo from the audio engine — the cinema grid follows the session. */
  bpm = computed(() => Math.max(1, this.audioEngine.tempo()));
  beatSeconds = computed(() => 60 / this.bpm());
  barSeconds = computed(() => this.beatSeconds() * 4);
  /** When on, clip placement and dragging snap to the nearest beat. */
  snapToBeat = signal(false);

  // ── Scene / act / section markers ──────────────────────────────────────

  markers = signal<SceneMarker[]>([]);
  sortedMarkers = computed(() =>
    [...this.markers()].sort((a, b) => a.time - b.time)
  );

  // ── Broadcast cue kit (streamers) ──────────────────────────────────────

  lowerThird = signal<LowerThird>({
    enabled: false,
    title: '',
    subtitle: '',
  });
  /** Seconds left on the go-live cue, or null when no countdown is running. */
  countdownRemaining = signal<number | null>(null);
  /**
   * Increments each time a cue countdown reaches zero, so the host UI can run
   * one-shot reactions (roll the transport, flip a live badge) without polling.
   */
  cueFired = signal(0);
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  tracks = signal<VideoTrack[]>(createDefaultTracks());

  private animationFrameId: number | null = null;
  private lastUpdateTime = 0;

  availablePresets = computed(() =>
    DELIVERY_PRESETS.filter((preset) => preset.mode === this.productionMode())
  );

  constructor() {}

  addClip(trackId: string, clip: Omit<VideoClip, 'id' | 'trackId'>) {
    const newClip: VideoClip = {
      ...clip,
      // With the beat grid armed, a placed clip lands on the nearest beat so a
      // music-video cut stays locked to the song without manual nudging.
      startTime: this.snapTime(clip.startTime),
      id: this.mintClipId(),
      trackId,
    };

    this.tracks.update((tracks) =>
      tracks.map((t) => {
        if (t.id === trackId) {
          return { ...t, clips: [...t.clips, newClip] };
        }
        return t;
      })
    );
    return newClip.id;
  }

  removeClip(clipId: string) {
    this.tracks.update((tracks) =>
      tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }))
    );
  }

  updateClip(clipId: string, patch: Partial<VideoClip>) {
    this.tracks.update((tracks) =>
      tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      }))
    );
  }

  /** Resolve a clip anywhere on the timeline. */
  findClip(clipId: string): VideoClip | null {
    for (const track of this.tracks()) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) return clip;
    }
    return null;
  }

  /** The track a clip currently lives on (null when it has been deleted). */
  trackOfClip(clipId: string): VideoTrack | null {
    return (
      this.tracks().find((track) =>
        track.clips.some((clip) => clip.id === clipId)
      ) ?? null
    );
  }

  /**
   * Cut every unlocked clip that straddles `time` into two, which is the edit
   * the whole timeline has been missing: until now a clip could only be added
   * or deleted, never trimmed from the middle.
   *
   * Both halves keep playing the same source, so the cut is seamless: the left
   * half keeps its in-point, the right half advances its source offset by the
   * footage it now starts after.
   *
   * @returns the ids of the clips created on the right of the cut.
   */
  splitClipsAt(time: number): string[] {
    const created: string[] = [];

    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.locked) return track;

        const clips: VideoClip[] = [];
        track.clips.forEach((clip) => {
          const trimStart = Math.max(0, clip.effects.trimStart || 0);
          const trimEnd = Math.max(0, clip.effects.trimEnd || 0);
          const activeStart = clip.startTime + trimStart;
          const leftDuration = time - clip.startTime;
          const activeEnd = this.activeEnd(clip);
          const canSplit =
            time >= activeStart + MIN_ACTIVE_CLIP_DURATION &&
            activeEnd - time >= MIN_ACTIVE_CLIP_DURATION;

          if (!canSplit) {
            clips.push(clip);
            return;
          }

          const right: VideoClip = {
            ...clip,
            id: this.mintClipId(),
            startTime: time,
            duration: activeEnd - time + trimEnd,
            offset: (clip.offset || 0) + Math.max(0, time - activeStart) + trimStart,
            effects: { ...clip.effects, trimStart: 0 },
          };
          created.push(right.id);
          clips.push(
            {
              ...clip,
              duration: leftDuration,
              effects: { ...clip.effects, trimEnd: 0 },
            },
            right
          );
        });

        return { ...track, clips };
      })
    );

    return created;
  }

  /** Copy a clip in place, offset to start exactly where the original ends. */
  duplicateClip(clipId: string): string | null {
    const track = this.trackOfClip(clipId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);
    if (!track || !clip || track.locked) return null;

    const copy: VideoClip = {
      ...clip,
      id: this.mintClipId(),
      name: `${clip.name} copy`,
      startTime: this.clampToTimeline(clip.startTime + clip.duration),
      effects: { ...clip.effects },
    };

    this.tracks.update((tracks) =>
      tracks.map((t) =>
        t.id === track.id ? { ...t, clips: [...t.clips, copy] } : t
      )
    );
    return copy.id;
  }

  /**
   * Reposition a clip in time and/or across lanes. Start times run through the
   * beat grid when snapping is armed, and locked lanes refuse the move so a
   * finished scene can't be nudged by accident.
   */
  moveClip(clipId: string, patch: ClipMovePatch): boolean {
    const track = this.trackOfClip(clipId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);
    if (!track || !clip || track.locked) return false;

    const targetTrack = patch.trackId
      ? this.tracks().find((candidate) => candidate.id === patch.trackId)
      : null;
    if (patch.trackId && (!targetTrack || targetTrack.locked)) return false;

    const startTime =
      patch.startTime === undefined
        ? clip.startTime
        : this.snapTime(patch.startTime);
    const nextTrackId = targetTrack?.id ?? track.id;

    this.tracks.update((tracks) =>
      tracks.map((candidate) => {
        const without = candidate.clips.filter((c) => c.id !== clipId);
        if (candidate.id !== nextTrackId) {
          return without.length === candidate.clips.length
            ? candidate
            : { ...candidate, clips: without };
        }
        return {
          ...candidate,
          clips: [...without, { ...clip, startTime, trackId: nextTrackId }],
        };
      })
    );
    return true;
  }

  /** Drop every clip on a lane — the reset half of a re-cut. */
  clearTrack(trackId: string): number {
    const track = this.tracks().find((candidate) => candidate.id === trackId);
    if (!track || track.locked) return 0;
    const removed = track.clips.length;
    this.tracks.update((tracks) =>
      tracks.map((candidate) =>
        candidate.id === trackId ? { ...candidate, clips: [] } : candidate
      )
    );
    return removed;
  }

  private activeEnd(clip: VideoClip): number {
    const trimStart = Math.max(0, clip.effects.trimStart || 0);
    const trimEnd = Math.max(0, clip.effects.trimEnd || 0);
    const activeDuration = Math.max(
      MIN_ACTIVE_CLIP_DURATION,
      clip.duration - trimStart - trimEnd
    );
    return clip.startTime + trimStart + activeDuration;
  }

  private mintClipId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private clampToTimeline(time: number): number {
    return Math.max(0, Math.min(time, this.duration()));
  }

  seek(time: number) {
    this.currentTime.set(Math.max(0, Math.min(time, this.duration())));
  }

  togglePlay() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.isPlaying.set(true);
    this.lastUpdateTime = performance.now();
    this.startLoop();
  }

  pause() {
    this.isPlaying.set(false);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private startLoop() {
    const loop = (now: number) => {
      if (!this.isPlaying()) return;

      const dt = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;

      const newTime = this.currentTime() + dt;
      if (newTime >= this.duration()) {
        this.seek(0);
        this.pause();
      } else {
        this.currentTime.set(newTime);
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  getActiveClips(time: number): VideoClip[] {
    const active: VideoClip[] = [];
    this.tracks().forEach((track) => {
      if (track.muted) return;
      track.clips.forEach((clip) => {
        const trimStart = Math.max(
          0,
          Math.min(
            clip.effects.trimStart || 0,
            Math.max(clip.duration - MIN_ACTIVE_CLIP_DURATION, 0)
          )
        );
        const trimEnd = Math.max(
          0,
          Math.min(
            clip.effects.trimEnd || 0,
            Math.max(clip.duration - trimStart - MIN_ACTIVE_CLIP_DURATION, 0)
          )
        );
        const activeStart = clip.startTime + trimStart;
        const activeDuration = Math.max(
          MIN_ACTIVE_CLIP_DURATION,
          clip.duration - trimStart - trimEnd
        );
        if (time >= activeStart && time <= activeStart + activeDuration) {
          active.push(clip);
        }
      });
    });
    return active;
  }

  getAllDeliveryPresets(): DeliveryPreset[] {
    return [...DELIVERY_PRESETS];
  }

  setProductionMode(mode: ProductionMode) {
    this.productionMode.set(mode);
    // Beat-locked cutting is the default for music videos and opt-in elsewhere.
    if (mode === 'music') this.snapToBeat.set(true);
    const nextPreset =
      DELIVERY_PRESETS.find((preset) => preset.mode === mode) ||
      DELIVERY_PRESETS[0];
    this.applyDeliveryPreset(nextPreset.id);
  }

  applyDeliveryPreset(presetId: string) {
    const preset =
      DELIVERY_PRESETS.find((candidate) => candidate.id === presetId) ||
      DELIVERY_PRESETS[0];

    this.deliveryPreset.set(preset);
    this.productionMode.set(preset.mode);
    this.duration.set(preset.duration);

    if (this.currentTime() > preset.duration) {
      this.seek(0);
    }
  }

  // ── Beat grid ──────────────────────────────────────────────────────────

  /** Nearest beat boundary to `time` (never negative). */
  nearestBeatTime(time: number): number {
    const beat = this.beatSeconds();
    if (!Number.isFinite(beat) || beat <= 0) return Math.max(0, time);
    return Math.max(0, Math.round(time / beat) * beat);
  }

  /** Apply the beat grid when armed, then clamp into the timeline. */
  snapTime(time: number): number {
    const clamped = this.clampToTimeline(Number.isFinite(time) ? time : 0);
    if (!this.snapToBeat()) return clamped;
    return this.clampToTimeline(this.nearestBeatTime(clamped));
  }

  /**
   * Beat ticks for a visible timeline window. Returns an empty list when the
   * window would need more than `maxTicks` lines, so a zoomed-out hour-long film
   * does not paint thousands of hairlines.
   */
  beatTicks(startTime: number, endTime: number, maxTicks = 200): BeatTick[] {
    const beat = this.beatSeconds();
    if (!Number.isFinite(beat) || beat <= 0) return [];
    const from = Math.max(0, Math.min(startTime, endTime));
    const to = Math.max(startTime, endTime);
    if (to <= from) return [];
    if ((to - from) / beat > maxTicks) return [];

    const ticks: BeatTick[] = [];
    let index = Math.ceil(from / beat);
    for (let t = index * beat; t <= to + 1e-6; t += beat) {
      ticks.push({ time: t, index, isBar: index % 4 === 0 });
      index += 1;
    }
    return ticks;
  }

  /** Whole bars spanned by a duration — how a shot length is expressed. */
  barsForDuration(seconds: number): number {
    const bar = this.barSeconds();
    if (!Number.isFinite(bar) || bar <= 0) return 1;
    return Math.max(1, Math.round(seconds / bar));
  }

  // ── Markers ────────────────────────────────────────────────────────────

  addMarker(label: string, time: number, kind: MarkerKind = 'scene'): string {
    const marker: SceneMarker = {
      id: this.mintClipId(),
      label: label.trim() || `Marker ${this.markers().length + 1}`,
      time: this.clampToTimeline(time),
      kind,
    };
    this.markers.update((markers) => [...markers, marker]);
    return marker.id;
  }

  removeMarker(markerId: string): boolean {
    const before = this.markers().length;
    this.markers.update((markers) =>
      markers.filter((marker) => marker.id !== markerId)
    );
    return this.markers().length !== before;
  }

  renameMarker(markerId: string, label: string): boolean {
    const trimmed = label.trim();
    if (!trimmed) return false;
    let renamed = false;
    this.markers.update((markers) =>
      markers.map((marker) => {
        if (marker.id !== markerId) return marker;
        renamed = true;
        return { ...marker, label: trimmed };
      })
    );
    return renamed;
  }

  clearMarkers(kind?: MarkerKind): void {
    this.markers.update((markers) =>
      kind ? markers.filter((marker) => marker.kind !== kind) : []
    );
  }

  /** The marker sitting within `tolerance` seconds of a timeline position. */
  markerNear(time: number, tolerance = 0.25): SceneMarker | null {
    const safeTolerance = Math.max(0, Number.isFinite(tolerance) ? tolerance : 0);
    return (
      this.sortedMarkers().find(
        (marker) => Math.abs(marker.time - time) <= safeTolerance
      ) ?? null
    );
  }

  /** Move the playhead to a marker. */
  seekToMarker(markerId: string): boolean {
    const marker = this.markers().find((candidate) => candidate.id === markerId);
    if (!marker) return false;
    this.seek(marker.time);
    return true;
  }

  // ── Broadcast cue kit ──────────────────────────────────────────────────

  setLowerThird(patch: Partial<LowerThird>): void {
    this.lowerThird.update((current) => ({ ...current, ...patch }));
  }

  toggleLowerThird(enabled?: boolean): boolean {
    const next = enabled ?? !this.lowerThird().enabled;
    this.setLowerThird({ enabled: next });
    return next;
  }

  /**
   * Broadcast cue: count down from `seconds` and roll the transport at zero.
   * The interval is always replaced, never stacked, so repeatedly hitting the
   * cue cannot leave two tickers running against the same clock.
   */
  startCountdown(seconds = 3): void {
    this.stopCountdown();
    const total = Math.max(1, Math.round(seconds));
    this.countdownRemaining.set(total);
    this.countdownHandle = setInterval(() => {
      const remaining = (this.countdownRemaining() ?? 0) - 1;
      if (remaining > 0) {
        this.countdownRemaining.set(remaining);
        return;
      }
      this.stopCountdown();
      this.cueFired.update((count) => count + 1);
      this.play();
    }, 1000);
  }

  stopCountdown(): void {
    if (this.countdownHandle !== null) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
    this.countdownRemaining.set(null);
  }

  /** Human-readable cue readout for the HUD. */
  countdownLabel(): string | null {
    const remaining = this.countdownRemaining();
    return remaining === null ? null : `T-${remaining}`;
  }

  // ── Project snapshot ───────────────────────────────────────────────────

  /**
   * Capture the current edit for persistence. Everything is copied so a saved
   * project can never be mutated from under the timeline by a later edit.
   */
  snapshot(): CinemaSnapshot {
    return {
      version: CINEMA_SNAPSHOT_VERSION,
      productionMode: this.productionMode(),
      deliveryPresetId: this.deliveryPreset().id,
      duration: this.duration(),
      currentTime: this.currentTime(),
      safeZoneEnabled: this.safeZoneEnabled(),
      snapToBeat: this.snapToBeat(),
      lowerThird: { ...this.lowerThird() },
      markers: this.markers().map((marker) => ({ ...marker })),
      tracks: this.tracks().map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          // Session-scoped media is dropped rather than saved as a url that will
          // never resolve again.
          url: isReloadableMediaUrl(clip.url) ? clip.url : '',
          effects: { ...clip.effects },
        })),
      })),
    };
  }

  /**
   * Replace the whole edit with a snapshot and report what came back.
   *
   * Transport state is deliberately not restored: a reopened project must not
   * land mid-playback or mid-countdown, and an in-flight cue belongs to the old
   * session. Lane membership comes from the track array rather than the clip, so
   * a hand-edited or partially-written record cannot put a clip in two lanes.
   */
  restore(
    snapshot: Partial<CinemaSnapshot> | null | undefined
  ): CinemaRestoreReport {
    this.stopCountdown();
    this.pause();
    this.cueFired.set(0);

    const report: CinemaRestoreReport = {
      clips: 0,
      markers: 0,
      clipsMissingMedia: 0,
    };
    if (!snapshot) return report;

    // The preset owns the timeline length, so the snapshot's own duration has to
    // be applied after it rather than before.
    if (snapshot.deliveryPresetId) {
      this.applyDeliveryPreset(snapshot.deliveryPresetId);
    }
    if (typeof snapshot.duration === 'number' && snapshot.duration > 0) {
      this.duration.set(snapshot.duration);
    }

    const tracks = (snapshot.tracks ?? []).map((track) => {
      const clips = (track.clips ?? []).map((clip) => {
        if (!clip.url) report.clipsMissingMedia += 1;
        const requestedDuration = Math.max(
          MIN_ACTIVE_CLIP_DURATION,
          Number.isFinite(clip.duration) ? clip.duration : MIN_ACTIVE_CLIP_DURATION
        );
        const startTime = Math.max(
          0,
          Math.min(
            Number.isFinite(clip.startTime) ? clip.startTime : 0,
            Math.max(0, this.duration() - MIN_ACTIVE_CLIP_DURATION)
          )
        );
        const duration = Math.min(
          requestedDuration,
          Math.max(MIN_ACTIVE_CLIP_DURATION, this.duration() - startTime)
        );
        const effects = clip.effects ?? {
          upscale: false,
          bgRemoval: false,
          noiseReduction: false,
          brightness: 1,
          contrast: 1,
          filter: 'none' as ClipFilter,
          transition: 'cut' as ClipTransition,
          transitionDuration: 0,
          trimStart: 0,
          trimEnd: 0,
        };
        return {
          ...clip,
          trackId: track.id,
          startTime,
          duration,
          offset: Math.max(0, Number.isFinite(clip.offset) ? clip.offset : 0),
          effects: {
            ...effects,
            trimStart: Math.max(0, Number.isFinite(effects.trimStart) ? effects.trimStart : 0),
            trimEnd: Math.max(0, Number.isFinite(effects.trimEnd) ? effects.trimEnd : 0),
            transitionDuration: Math.max(0, Number.isFinite(effects.transitionDuration) ? effects.transitionDuration : 0),
          },
        };
      });
      report.clips += clips.length;
      return { ...track, clips };
    });

    // A record written by an older build, or one that lost its lanes, must not
    // leave the editor with nowhere to drop a clip.
    this.tracks.set(tracks.length > 0 ? tracks : createDefaultTracks());

    const markers = (snapshot.markers ?? []).map((marker) => ({ ...marker }));
    this.markers.set(markers);
    report.markers = markers.length;

    if (snapshot.lowerThird) {
      this.lowerThird.set({ ...snapshot.lowerThird });
    }
    if (typeof snapshot.safeZoneEnabled === 'boolean') {
      this.safeZoneEnabled.set(snapshot.safeZoneEnabled);
    }
    if (typeof snapshot.snapToBeat === 'boolean') {
      this.snapToBeat.set(snapshot.snapToBeat);
    }
    if (snapshot.productionMode) {
      this.productionMode.set(snapshot.productionMode);
    }

    this.currentTime.set(
      Math.max(0, Math.min(snapshot.currentTime ?? 0, this.duration()))
    );
    return report;
  }
}
