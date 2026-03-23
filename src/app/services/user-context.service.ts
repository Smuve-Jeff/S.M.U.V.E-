import { Injectable, signal } from '@angular/core';
import { AppTheme } from './app-theme';

export type { AppTheme };

export type MainViewMode =
  | 'hub'
  | 'studio'
  | 'player'
  | 'dj'
  | 'piano-roll'
  | 'image-editor'
  | 'video-editor'
  | 'vocal-suite'
  | 'networking'
  | 'profile'
  | 'tha-spot'
  | 'login'
  | 'projects'
  | 'release-pipeline'
  | 'lyric-editor'
  | 'remix-arena'
  | 'image-video-lab'
  | 'strategy'
  | 'analytics'
  | 'practice'
  | 'career'
  | 'knowledge-base'
  | 'business-suite'
  | 'business-pipeline'
  | 'settings';

export type { MainViewMode as ViewMode };

export interface Track {
  name: string;
  url: string;
  artist?: string;
  albumArtUrl?: string;
  videoSrc?: string;
}
export interface EqBand {
  label: string;
  value: number;
}
export interface Enhancements {
  bassBoost: boolean;
  surroundSound: boolean;
}

export interface DeckState {
  track: Track;
  isPlaying: boolean;
  progress: number;
  duration: number;
  playbackRate: number;
  vinylImageUrl?: string;
  filterFreq: number;
  loop: boolean;
  gain: number;
  eqHigh: number;
  eqMid: number;
  eqLow: number;
  wasPlayingBeforeScratch?: boolean;
  buffer?: AudioBuffer;
  hotCues: (number | null)[];
  keyLock: boolean;
  loopLength: number;
  bpm: number;
  beatGridOffset: number;
  sendA: number;
  sendB: number;
}

export const initialDeckState: DeckState = {
  track: {
    name: 'NO SIGNAL',
    url: '',
    artist: 'Load a track into deck',
    albumArtUrl: 'https://picsum.photos/seed/placeholder/500/500',
  },
  isPlaying: false,
  progress: 0,
  duration: 0,
  playbackRate: 1,
  vinylImageUrl: 'https://picsum.photos/seed/placeholder/200/200',
  filterFreq: 20000,
  loop: false,
  gain: 1.0,
  eqHigh: 0,
  eqMid: 0,
  eqLow: 0,
  wasPlayingBeforeScratch: false,
  hotCues: new Array(8).fill(null),
  keyLock: true,
  loopLength: 4,
  bpm: 128,
  beatGridOffset: 0,
  sendA: 0,
  sendB: 0,
};

@Injectable({
  providedIn: 'root',
})
export class UserContextService {
  mainViewMode = signal<MainViewMode>('tha-spot');
  lastUsedTheme = signal<AppTheme | null>(null);
  lastGeneratedImageUrl = signal<string | null>(null);

  setMainViewMode(mode: MainViewMode): void {
    this.mainViewMode.set(mode);
  }

  setTheme(theme: AppTheme): void {
    this.lastUsedTheme.set(theme);
  }

  setLastImageUrl(url: string): void {
    this.lastGeneratedImageUrl.set(url);
  }
}
