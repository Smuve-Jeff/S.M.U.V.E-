import { Injectable, signal, computed, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

export type ProductionMode = 'movie' | 'music' | 'stream' | 'vlog';

/**
 * Colour looks a clip can be graded with.
 *
 * The first four shipped with the four-look picker; the rest are the film-stock
 * and stylisation looks a music video or a feature is actually cut with. Each
 * look resolves to a pure `ctx.filter` string, so the preview, the recorded
 * export and a captured still all carry exactly the same grade.
 */
export type ClipFilter =
  | 'none'
  | 'cinematic'
  | 'vivid'
  | 'mono'
  | 'noir'
  | 'bleach-bypass'
  | 'teal-orange'
  | 'sepia'
  | 'dream'
  | 'cold-steel'
  | 'golden-hour'
  | 'neon-pulse';

/**
 * Scene transitions.
 *
 * `cut`, `fade` and `dissolve` shipped first. The directional and geometric
 * moves below are the vocabulary an editor reaches for between two shots that
 * belong to the same scene, and each one is a real canvas pass rather than a
 * second alpha ramp — see the renderer's transition stage.
 */
export type ClipTransition =
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'blur'
  | 'flash';

/** Slow push or pan applied to a still or a locked-off shot. */
export type ClipMotion =
  | 'none'
  | 'ken-burns-in'
  | 'ken-burns-out'
  | 'pan-left'
  | 'pan-right';

/** How a title card is drawn on the program monitor. */
export type TitleStyle = 'title-card' | 'lower-third' | 'caption' | 'centered';

/** Where a title card sits inside the safe area. */
export type TitlePosition = 'top' | 'center' | 'bottom';

export const MIN_ACTIVE_CLIP_DURATION = 0.05;

/** Playback-rate envelope for the speed control (half speed to double speed). */
export const MIN_CLIP_SPEED = 0.25;
export const MAX_CLIP_SPEED = 4;

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

/**
 * A title card burnt into the program feed.
 *
 * Cards live on the timeline as `overlay` clips whose media is the card's own
 * text, so a title is trimmed, moved, transitioned and exported by the exact
 * same machinery as a shot — no separate title track to keep in sync.
 */
export interface TitleCard {
  text: string;
  subtitle: string;
  style: TitleStyle;
  position: TitlePosition;
}

/**
 * Narration recorded (or synthesised) onto the AI Voiceovers lane.
 *
 * The line is stored on the clip so the monitor can draw the spoken words as a
 * subtitle while the voiceover lane is live, and so a project reopened without
 * its audio bytes still knows what was said and in what voice.
 */
export interface VoiceoverLine {
  text: string;
  /** Voice archetype name the line was rendered with. */
  voice: string;
  /** Whether the bytes exist on the clip's url, or only the transcript does. */
  rendered: boolean;
}

/**
 * One non-destructive colour/FX pass over a clip, on top of its base grade.
 * `value` is 0..1 for every effect so a rack reads as a single set of dials.
 */
export type ClipEffectId =
  | 'vignette'
  | 'film-grain'
  | 'letterbox'
  | 'chroma-boost'
  | 'scanlines'
  | 'glow';

export interface ClipEffect {
  id: ClipEffectId;
  value: number;
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
    /** Slow push/pan for stills and locked-off shots. */
    motion: ClipMotion;
    /** Playback rate multiplier — a 0.5× slow-mo or a 2× time-lapse. */
    speed: number;
    /** Non-destructive FX rack applied after the base grade. */
    fx: ClipEffect[];
    /** Title card burnt into the feed when this clip is an overlay title. */
    title?: TitleCard;
    /** Narration line when this clip is a voiceover. */
    voiceover?: VoiceoverLine;
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
export const CINEMA_SNAPSHOT_VERSION = 2;

/**
 * Oldest snapshot format this build can still read.
 *
 * Bumping the written version must not orphan projects an artist already saved:
 * v1 records are upgraded on load (the new effect fields take their defaults)
 * rather than refused, which is what the version check used to do.
 */
export const CINEMA_SNAPSHOT_MIN_VERSION = 1;

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

/**
 * Every effect field at its neutral value, minted fresh.
 *
 * A factory rather than a shared constant: clip effects are mutated by the FX
 * matrix, and handing two clips the same object would grade both at once.
 */
export const createDefaultEffects = (
  overrides: Partial<VideoClip['effects']> = {}
): VideoClip['effects'] => ({
  upscale: false,
  bgRemoval: false,
  noiseReduction: false,
  brightness: 1,
  contrast: 1,
  filter: 'none',
  transition: 'cut',
  transitionDuration: 0,
  trimStart: 0,
  trimEnd: 0,
  motion: 'none',
  speed: 1,
  fx: [],
  ...overrides,
});

/** Every colour look the FX matrix offers, in picker order. */
export const CLIP_FILTERS: { id: ClipFilter; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'mono', label: 'Mono' },
  { id: 'noir', label: 'Noir' },
  { id: 'bleach-bypass', label: 'Bleach Bypass' },
  { id: 'teal-orange', label: 'Teal & Orange' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dream', label: 'Dream' },
  { id: 'cold-steel', label: 'Cold Steel' },
  { id: 'golden-hour', label: 'Golden Hour' },
  { id: 'neon-pulse', label: 'Neon Pulse' },
];

/** Every scene transition, grouped cut-first so the common case stays at the top. */
export const CLIP_TRANSITIONS: { id: ClipTransition; label: string }[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'fade', label: 'Fade' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'wipe-left', label: 'Wipe ←' },
  { id: 'wipe-right', label: 'Wipe →' },
  { id: 'wipe-up', label: 'Wipe ↑' },
  { id: 'wipe-down', label: 'Wipe ↓' },
  { id: 'slide-left', label: 'Slide ←' },
  { id: 'slide-right', label: 'Slide →' },
  { id: 'zoom-in', label: 'Zoom In' },
  { id: 'zoom-out', label: 'Zoom Out' },
  { id: 'blur', label: 'Blur Through' },
  { id: 'flash', label: 'Flash' },
];

/** Camera moves offered for stills and locked-off shots. */
export const CLIP_MOTIONS: { id: ClipMotion; label: string }[] = [
  { id: 'none', label: 'Static' },
  { id: 'ken-burns-in', label: 'Ken Burns In' },
  { id: 'ken-burns-out', label: 'Ken Burns Out' },
  { id: 'pan-left', label: 'Pan ←' },
  { id: 'pan-right', label: 'Pan →' },
];

/** The FX rack's dials, with the neutral position each one resets to. */
export const CLIP_EFFECTS: {
  id: ClipEffectId;
  label: string;
  hint: string;
}[] = [
  { id: 'vignette', label: 'Vignette', hint: 'Darkens the frame edges' },
  { id: 'film-grain', label: 'Film Grain', hint: 'Adds analogue texture' },
  { id: 'letterbox', label: 'Letterbox', hint: 'Bars the frame to a scope ratio' },
  { id: 'chroma-boost', label: 'Chroma Boost', hint: 'Pushes saturation and colour separation' },
  { id: 'scanlines', label: 'Scanlines', hint: 'Broadcast CRT lines over the feed' },
  { id: 'glow', label: 'Glow', hint: 'Blooms the highlights' },
];

/**
 * Streaming cutdowns — the vertical, square and teaser re-cuts a finished piece
 * is shipped as after the master exists. Each one names the platform it is for
 * and the length a viewer actually watches to, so the picker reads as delivery
 * instructions rather than abstract durations.
 */
export interface SocialCutdown {
  id: string;
  platform: string;
  aspectRatio: string;
  width: number;
  height: number;
  seconds: number;
  description: string;
}

export const SOCIAL_CUTDOWNS: SocialCutdown[] = [
  {
    id: 'short-vertical',
    platform: 'Shorts / Reels / TikTok',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    seconds: 60,
    description: 'Hook-forward vertical teaser cut from the top of the piece.',
  },
  {
    id: 'square-feed',
    platform: 'Instagram / Facebook Feed',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    seconds: 30,
    description: 'Square feed cut with the strongest frame first.',
  },
  {
    id: 'teaser-hook',
    platform: 'Pre-roll / Trailer',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    seconds: 15,
    description: 'Fifteen-second hook for pre-roll and paid placement.',
  },
  {
    id: 'story-vertical',
    platform: 'Stories / Status',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    seconds: 15,
    description: 'Vertical story beat sized for a single hold.',
  },
];

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
  bpm = computed(() => {
    const tempo = this.audioEngine.tempo();
    return Number.isFinite(tempo) ? Math.max(1, tempo) : 120;
  });
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
      // Normalise here rather than at every call site: a caller that only knows
      // the fields it cares about must not leave a clip with `undefined` speed
      // or a missing FX rack for the renderer to trip over.
      effects: createDefaultEffects(clip.effects),
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
      tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId) return clip;
          const next = { ...clip, ...patch };
          const requestedStart = patch.startTime ?? clip.startTime;
          const previousSpeed = this.clampSpeed(clip.effects.speed);
          const nextSpeed = this.clampSpeed(next.effects.speed);
          // Clip duration is timeline duration. Changing playback speed changes
          // how long a video takes to play its source, so preserve the source
          // span (duration × speed) and resize the timeline clip accordingly.
          // Stills/title cards have no source clock and remain the same length.
          const trimStart = Math.max(0, clip.effects.trimStart || 0);
          const trimEnd = Math.max(0, clip.effects.trimEnd || 0);
          const activeDuration = Math.max(
            MIN_ACTIVE_CLIP_DURATION,
            clip.duration - trimStart - trimEnd
          );
          const speedAdjustedDuration =
            clip.type === 'video' &&
            patch.effects?.speed !== undefined &&
            patch.duration === undefined
              ? trimStart + trimEnd + activeDuration * previousSpeed / nextSpeed
              : next.duration;
          const duration = Math.max(
            MIN_ACTIVE_CLIP_DURATION,
            Number.isFinite(speedAdjustedDuration)
              ? speedAdjustedDuration
              : clip.duration
          );
          const maxStart = Math.max(
            0,
            this.duration() - Math.max(MIN_ACTIVE_CLIP_DURATION, duration)
          );
          return {
            ...next,
            startTime: Math.min(
              maxStart,
              this.snapTime(Number.isFinite(requestedStart) ? requestedStart : clip.startTime)
            ),
            duration,
            effects: { ...next.effects, speed: nextSpeed },
          };
        }),
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
            // The right half starts wherever the left half had advanced to, at
            // the clip's own playback rate — a 2× shot must not restart its
            // source from the middle of the timeline it just left.
            offset: this.resolveSourceTime(clip, time - activeStart),
            effects: { ...clip.effects, trimStart: 0, fx: (clip.effects.fx ?? []).map((entry) => ({ ...entry })) },
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
   * Delete a clip and pull everything after it back by its length, so a cut
   * does not leave a hole in the scene.
   *
   * `removeClip` deliberately leaves the gap (an editor may want it); this is
   * the other half of the edit — the "ripple delete" a cut actually is. Only the
   * clip's own lane ripples: pulling every lane would desync a score cue from
   * the picture it was written against.
   *
   * @returns how many clips were pulled forward, or -1 when the lane is locked.
   */
  rippleDeleteClip(clipId: string): number {
    const track = this.trackOfClip(clipId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);
    if (!track || !clip) return -1;
    if (track.locked) return -1;

    const cutStart = clip.startTime;
    const cutEnd = clip.startTime + clip.duration;
    let shifted = 0;

    this.tracks.update((tracks) =>
      tracks.map((candidate) => {
        if (candidate.id !== track.id) return candidate;
        const clips = candidate.clips
          .filter((entry) => entry.id !== clipId)
          .map((entry) => {
            // A clip that starts inside the removed span moves back to the cut;
            // one that starts after it moves back by the full span. Clips before
            // the cut are untouched, so the head of the scene never shifts.
            if (entry.startTime >= cutEnd) {
              shifted += 1;
              return { ...entry, startTime: entry.startTime - clip.duration };
            }
            if (entry.startTime > cutStart) {
              shifted += 1;
              return { ...entry, startTime: cutStart };
            }
            return entry;
          });
        return { ...candidate, clips };
      })
    );

    return shifted;
  }

  /**
   * Cut a lane into one clip per scene, using the marker map as the scene list.
   *
   * This is how a long-form edit actually begins: a feature is divided into
   * acts and scenes before a single shot is placed. Every marker inside the
   * lane's span becomes a boundary; the lane's existing clips are replaced by
   * one card per scene so coverage can be dropped into each in turn.
   *
   * @returns the number of scene cards created.
   */
  cutLaneIntoScenes(trackId: string, kind?: MarkerKind): number {
    const track = this.tracks().find((candidate) => candidate.id === trackId);
    if (!track || track.locked) return 0;

    const boundaries = this.sortedMarkers().filter(
      (marker) => kind === undefined || marker.kind === kind
    );
    if (boundaries.length === 0) return 0;

    const cards: VideoClip[] = [];
    boundaries.forEach((marker, index) => {
      const next = boundaries[index + 1];
      const start = Math.max(0, marker.time);
      const end = next ? next.time : this.duration();
      const duration = end - start;
      if (duration < MIN_ACTIVE_CLIP_DURATION) return;
      cards.push({
        id: this.mintClipId(),
        name: marker.label,
        url: '',
        startTime: start,
        duration,
        offset: 0,
        trackId,
        type: 'overlay',
        source: 'ai',
        note: `Scene card — ${marker.label}`,
        shotType: marker.kind,
        effects: createDefaultEffects({ filter: 'none' }),
      });
    });
    if (cards.length === 0) return 0;

    this.tracks.update((tracks) =>
      tracks.map((candidate) =>
        candidate.id === trackId ? { ...candidate, clips: cards } : candidate
      )
    );
    return cards.length;
  }

  /**
   * Grade every clip on the timeline with one look in a single pass — the
   * "apply this film stock to the whole feature" move that is otherwise one
   * selection per clip.
   *
   * @returns the number of clips graded.
   */
  gradeAllClips(filter: ClipFilter): number {
    let graded = 0;
    this.tracks.update((tracks) =>
      tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          graded += 1;
          return { ...clip, effects: { ...clip.effects, filter } };
        }),
      }))
    );
    return graded;
  }

  /**
   * Set one FX-rack dial on every clip that is missing it, so a whole feature
   * can be pushed through the same grain or vignette.
   *
   * @returns the number of clips updated.
   */
  applyEffectToAllClips(id: ClipEffectId, value: number): number {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    let updated = 0;
    this.tracks.update((tracks) =>
      tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          updated += 1;
          const fx = (clip.effects.fx ?? []).filter((entry) => entry.id !== id);
          return {
            ...clip,
            effects: {
              ...clip.effects,
              fx: clamped > 0 ? [...fx, { id, value: clamped }] : fx,
            },
          };
        }),
      }))
    );
    return updated;
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

    const requestedStart =
      patch.startTime === undefined ? clip.startTime : patch.startTime;
    const maxStart = Math.max(0, this.duration() - Math.max(MIN_ACTIVE_CLIP_DURATION, clip.duration));
    const startTime = Math.min(
      maxStart,
      patch.startTime === undefined
        ? clip.startTime
        : this.snapTime(Number.isFinite(requestedStart) ? requestedStart : clip.startTime)
    );
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

  /** Playback rate a clip can actually be rendered at. */
  clampSpeed(speed: number | undefined): number {
    return Number.isFinite(speed)
      ? Math.max(MIN_CLIP_SPEED, Math.min(MAX_CLIP_SPEED, speed as number))
      : 1;
  }

  private isMotion(value: unknown): value is ClipMotion {
    return CLIP_MOTIONS.some((motion) => motion.id === value);
  }

  /**
   * Drop FX entries a record cannot have written meaningfully: an unknown id, a
   * non-finite value, or the neutral 0 which is the absence of the effect.
   */
  private sanitizeEffects(fx: unknown): ClipEffect[] {
    if (!Array.isArray(fx)) return [];
    return fx.reduce<ClipEffect[]>((entries, raw) => {
      if (!raw || typeof raw !== 'object') return entries;
      const id = (raw as ClipEffect).id;
      if (!CLIP_EFFECTS.some((effect) => effect.id === id)) return entries;
      const value = Number((raw as ClipEffect).value);
      if (!Number.isFinite(value) || value <= 0) return entries;
      entries.push({ id, value: Math.min(1, value) });
      return entries;
    }, []);
  }

  /**
   * The source-file time a clip shows `clipLocalTime` seconds into its picture.
   *
   * Three things have to line up here, and each was independently wrong before:
   *  - `trimStart` is skipped, so a trimmed head does not replay the footage the
   *    trim was meant to remove;
   *  - the clip's own `speed` scales the advance, so a 2× shot does not replay
   *    its first half twice;
   *  - the result is floored at 0, because a negative source time is unseekable.
   *
   * `clipLocalTime` is measured from the start of the *picture*, i.e. after the
   * head trim.
   */
  resolveSourceTime(clip: VideoClip, clipLocalTime: number): number {
    const speed = this.clampSpeed(clip.effects.speed);
    const trimStart = Math.max(0, clip.effects.trimStart || 0);
    return Math.max(
      0,
      (clip.offset || 0) + trimStart + clipLocalTime * speed
    );
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
    // Idempotent on purpose: a second call would spin up a second animation
    // loop, and two loops advancing the same clock run the timeline at double
    // speed until one of them is cancelled.
    if (this.isPlaying()) return;
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

      // The transport clock remains wall-clock time. At the timeline's tail we
      // stop exactly on duration instead of wrapping to zero: wrapping a
      // feature creates a surprise loop and can make a full-length export begin
      // capturing the opening frame again after reaching its end.
      const newTime = this.currentTime() + dt;
      if (newTime >= this.duration()) {
        this.seek(this.duration());
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
          effects: { ...clip.effects, fx: (clip.effects.fx ?? []).map((entry) => ({ ...entry })) },
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
        // Empty overlay clips are intentional storyboard cards (for example
        // an AI-staged shot) and are rendered from their note, not missing
        // footage. Only media-bearing clips should be reported here.
        if (!clip.url && clip.type !== 'overlay') report.clipsMissingMedia += 1;
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
        const effects = clip.effects ?? createDefaultEffects();
        return {
          ...clip,
          trackId: track.id,
          startTime,
          duration,
          offset: Math.max(0, Number.isFinite(clip.offset) ? clip.offset : 0),
          effects: {
            ...createDefaultEffects(effects),
            trimStart: Math.max(0, Number.isFinite(effects.trimStart) ? effects.trimStart : 0),
            trimEnd: Math.max(0, Number.isFinite(effects.trimEnd) ? effects.trimEnd : 0),
            transitionDuration: Math.max(0, Number.isFinite(effects.transitionDuration) ? effects.transitionDuration : 0),
            // A record written before the FX rack existed carries no array, and
            // a malformed one can carry entries that are not effects at all.
            fx: this.sanitizeEffects(effects.fx),
            speed: this.clampSpeed(effects.speed),
            motion: this.isMotion(effects.motion) ? effects.motion : 'none',
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
