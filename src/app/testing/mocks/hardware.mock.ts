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
  visualStep: signal(0),
  ctx: { currentTime: 0, decodeAudioData: jest.fn() },
  triggerAttack: jest.fn(),
  triggerSampler: jest.fn(),
});
