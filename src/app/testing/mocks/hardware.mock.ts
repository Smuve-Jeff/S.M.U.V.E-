import { signal } from '@angular/core';

export const createMockHapticService = () => ({
  light: jest.fn(),
  medium: jest.fn(),
  heavy: jest.fn(),
  impact: jest.fn(),
  selection: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  drumHit: jest.fn(),
});

export const createMockAudioSession = () => ({
  isPlaying: signal(false),
  isRecording: signal(false),
  togglePlay: jest.fn(),
  toggleRecord: jest.fn(),
});

export const createMockAudioEngine = () => ({
  tempo: signal(120),
  metronomeEnabled: signal(false),
  visualStep: signal(0),
  ctx: { currentTime: 0, decodeAudioData: jest.fn() },
  resume: jest.fn(),
  toggleMetronome: jest.fn(function (this: any) {
    this.metronomeEnabled.update((value: boolean) => !value);
    return this.metronomeEnabled();
  }),
  triggerAttack: jest.fn(),
  triggerSampler: jest.fn(),
});
