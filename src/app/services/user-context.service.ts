import { Injectable, signal } from '@angular/core';

export interface AppTheme {
  name: string;
  primary: string;
  accent: string;
  neutral: string;
  purple: string;
  red: string;
  blue: string;
}

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
  | 'mixer'
  | 'drum-machine'
  | 'mastering'
  | 'dj-deck'
  | 'settings';

export interface Stems {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  instrumental: AudioBuffer;
  other: AudioBuffer;
}

export interface DeckState {
  track: any;
  bpm: number;
  playbackRate: number;
  progress: number;
  duration: number;
  gain: number;
  filterFreq: number;
  eqHigh: number;
  eqMid: number;
  eqLow: number;
  slip: boolean;
  isPlaying: boolean;
  loop: boolean;
  hotCues: (number | null)[];
  samplerPads: (number | null)[];
  stemGains: Record<string, number>;
  vinylImageUrl?: string;
}

export const initialDeckState: DeckState = {
  track: null,
  bpm: 128,
  playbackRate: 1,
  progress: 0,
  duration: 0,
  gain: 1,
  filterFreq: 15000,
  eqHigh: 0,
  eqMid: 0,
  eqLow: 0,
  slip: false,
  isPlaying: false,
  loop: false,
  hotCues: new Array(8).fill(null),
  samplerPads: new Array(8).fill(null),
  stemGains: { vocals: 1, drums: 1, bass: 1, instrumental: 1, other: 1 },
  vinylImageUrl: '',
};

@Injectable({
  providedIn: 'root',
})
export class UserContextService {
  mainViewMode = signal<MainViewMode>('tha-spot');
  appTheme = signal<any>('analog-v42');

  setMainViewMode(mode: MainViewMode): void {
    this.mainViewMode.set(mode);
  }

  setAppTheme(theme: any): void {
    this.appTheme.set(theme);
  }
}
