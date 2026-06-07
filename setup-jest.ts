import 'jest-preset-angular/setup-env/zoneless';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

TestBed.initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);

(window as any).env = {
  AUTH_SALT: 'test-auth-salt',
  ENCRYPTION_KEY: 'test-encryption-key',
};

// Polyfill TextEncoder/Decoder for Jest
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

// Mock Web Audio API Mock
const createMockNode = () => ({
  gain: {
    value: 0,
    setTargetAtTime: jest.fn(),
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
  },
  delayTime: { value: 0, setTargetAtTime: jest.fn() },
  frequency: { value: 0, setTargetAtTime: jest.fn() },
  pan: { value: 0 },
  Q: { value: 0 },
  threshold: { value: 0, setTargetAtTime: jest.fn() },
  ratio: { value: 0, setTargetAtTime: jest.fn() },
  attack: { value: 0, setTargetAtTime: jest.fn() },
  release: { value: 0, setTargetAtTime: jest.fn() },
  knee: { value: 0 },
  curve: null,
  oversample: 'none',
  connect: jest.fn().mockReturnThis(),
  disconnect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  type: 'lowpass',
  frequencyBinCount: 1024,
  getByteFrequencyData: jest.fn(),
  getByteTimeDomainData: jest.fn(),
  playbackRate: { value: 1 },
  buffer: null,
});

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  destination = {};
  createGain = jest.fn().mockImplementation(createMockNode);
  createOscillator = jest.fn().mockImplementation(createMockNode);
  createDynamicsCompressor = jest.fn().mockImplementation(createMockNode);
  createDelay = jest.fn().mockImplementation(createMockNode);
  createBiquadFilter = jest.fn().mockImplementation(createMockNode);
  createAnalyser = jest.fn().mockImplementation(createMockNode);
  createConvolver = jest.fn().mockImplementation(createMockNode);
  createStereoPanner = jest.fn().mockImplementation(createMockNode);
  createWaveShaper = jest.fn().mockImplementation(createMockNode);
  createBufferSource = jest.fn().mockImplementation(createMockNode);
  createBuffer = jest.fn().mockReturnValue({
    getChannelData: jest.fn().mockReturnValue(new Float32Array(100)),
    numberOfChannels: 2,
    length: 100,
    sampleRate: 44100,
  });
  createMediaStreamDestination = jest.fn().mockReturnValue({
    stream: {},
    connect: jest.fn(),
  });
  decodeAudioData = jest.fn().mockResolvedValue({
    duration: 1,
    getChannelData: () => new Float32Array(100),
  });
  resume = jest.fn().mockResolvedValue(undefined);
  suspend = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
}

(window as any).AudioContext = MockAudioContext;
(window as any).webkitAudioContext = MockAudioContext;

jest.mock('tone', () => ({
  PolySynth: jest.fn().mockImplementation(() => ({
    toDestination: jest.fn().mockReturnThis(),
    triggerAttackRelease: jest.fn(),
    triggerAttack: jest.fn(),
    triggerRelease: jest.fn(),
    set: jest.fn(),
    dispose: jest.fn(),
  })),
  MonoSynth: jest.fn().mockImplementation(() => ({
    toDestination: jest.fn().mockReturnThis(),
    triggerAttackRelease: jest.fn(),
    triggerAttack: jest.fn(),
    triggerRelease: jest.fn(),
    set: jest.fn(),
    dispose: jest.fn(),
  })),
  FMSynth: jest.fn().mockImplementation(() => ({
    toDestination: jest.fn().mockReturnThis(),
    triggerAttackRelease: jest.fn(),
    triggerAttack: jest.fn(),
    triggerRelease: jest.fn(),
    set: jest.fn(),
    dispose: jest.fn(),
  })),
  start: jest.fn().mockResolvedValue(true),
  now: jest.fn().mockReturnValue(0),
  Synth: jest.fn(),
}));

// Mock MediaRecorder
(window as any).MediaRecorder = class {
  start() {}
  stop() {}
  addEventListener() {}
  removeEventListener() {}
  state = 'inactive';
  static isTypeSupported() {
    return true;
  }
};

// Mock Web Crypto API using node:crypto
const nodeCrypto = require('node:crypto');
if (typeof crypto === 'undefined') {
  (global as any).crypto = nodeCrypto.webcrypto;
} else if (!crypto.subtle) {
  (crypto as any).subtle = nodeCrypto.webcrypto.subtle;
}
