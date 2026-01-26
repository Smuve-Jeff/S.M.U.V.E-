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
  | 'networking'
  | 'profile'
  | 'tha-spot'
  | 'login'
  | 'projects'
  | 'remix-arena'
  | 'image-video-lab'
  | 'strategy';

export type { MainViewMode as ViewMode };

// FIX: Moved shared interfaces here to break circular dependencies
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
  filterFreq: number;
  loop: boolean;
  gain: number;
  eqHigh: number;
  eqMid: number;
  eqLow: number;
  wasPlayingBeforeScratch?: boolean;
  buffer?: AudioBuffer;
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
  filterFreq: 20000,
  loop: false,
  gain: 50,
  eqHigh: 50,
  eqMid: 50,
  eqLow: 50,
  wasPlayingBeforeScratch: false,
};

/**
 * Service to hold the user's current session context.
 * This allows the AI to have a short-term "memory" of user actions
 * like theme changes or image generations.
 */
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
