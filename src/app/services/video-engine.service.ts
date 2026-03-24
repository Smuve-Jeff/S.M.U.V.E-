import { Injectable, signal, computed, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

export type ProductionMode = 'movie' | 'stream' | 'vlog';

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
  effects: {
    upscale: boolean;
    bgRemoval: boolean;
    noiseReduction: boolean;
    brightness: number;
    contrast: number;
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

  tracks = signal<VideoTrack[]>([
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
  ]);

  private animationFrameId: number | null = null;
  private lastUpdateTime = 0;

  availablePresets = computed(() =>
    DELIVERY_PRESETS.filter((preset) => preset.mode === this.productionMode())
  );

  constructor() {}

  addClip(trackId: string, clip: Omit<VideoClip, 'id' | 'trackId'>) {
    const newClip: VideoClip = {
      ...clip,
      id: Math.random().toString(36).substr(2, 9),
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
        if (time >= clip.startTime && time <= clip.startTime + clip.duration) {
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
}
