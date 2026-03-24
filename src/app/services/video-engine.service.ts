import { Injectable, signal, computed, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

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

@Injectable({
  providedIn: 'root',
})
export class VideoEngineService {
  private audioEngine = inject(AudioEngineService);

  currentTime = signal(0);
  duration = signal(3600); // Default 1 hour for "full length"
  isPlaying = signal(false);

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
}
