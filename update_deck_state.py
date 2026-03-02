import sys

file_path = 'src/app/services/user-context.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

old_deck_state = """export interface DeckState {
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
}"""

new_deck_state = """export interface DeckState {
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
  hotCues: (number | null)[];
  keyLock: boolean;
  loopLength: number;
}"""

content = content.replace(old_deck_state, new_deck_state)

old_initial_state = """export const initialDeckState: DeckState = {
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
};"""

new_initial_state = """export const initialDeckState: DeckState = {
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
  gain: 1.0,
  eqHigh: 0,
  eqMid: 0,
  eqLow: 0,
  wasPlayingBeforeScratch: false,
  hotCues: new Array(8).fill(null),
  keyLock: true,
  loopLength: 4,
};"""

content = content.replace(old_initial_state, new_initial_state)

with open(file_path, 'w') as f:
    f.write(content)
