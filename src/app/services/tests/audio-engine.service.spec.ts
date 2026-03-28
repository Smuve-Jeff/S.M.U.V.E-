import { TestBed } from '@angular/core/testing';
import { AudioEngineService } from '../audio-engine.service';
import { StemSeparationService } from '../stem-separation.service';

describe('AudioEngineService', () => {
  let service: AudioEngineService;
  let mockAudioContext: any;
  let compressorNode: any;

  beforeEach(() => {
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
      connect: jest.fn().mockImplementation(() => createMockNode()),
      disconnect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      type: 'lowpass',
      frequencyBinCount: 1024,
    });

    compressorNode = createMockNode();

    mockAudioContext = {
      createGain: jest.fn().mockImplementation(createMockNode),
      createOscillator: jest.fn().mockImplementation(createMockNode),
      createDynamicsCompressor: jest.fn().mockReturnValue(compressorNode),
      createDelay: jest.fn().mockImplementation(createMockNode),
      createBiquadFilter: jest.fn().mockImplementation(createMockNode),
      createAnalyser: jest.fn().mockImplementation(createMockNode),
      createConvolver: jest.fn().mockImplementation(createMockNode),
      createStereoPanner: jest.fn().mockImplementation(createMockNode),
      createWaveShaper: jest.fn().mockImplementation(createMockNode),
      createBuffer: jest.fn().mockReturnValue({
        getChannelData: jest.fn().mockReturnValue(new Float32Array(100)),
        numberOfChannels: 2,
        length: 100,
        sampleRate: 44100,
      }),
      createMediaStreamDestination: jest.fn().mockReturnValue({
        stream: {},
        connect: jest.fn(),
      }),
      destination: {},
      currentTime: 0,
      sampleRate: 44100,
      state: 'suspended',
      resume: jest.fn().mockResolvedValue(undefined),
    };

    (window as any).AudioContext = jest
      .fn()
      .mockImplementation(() => mockAudioContext);

    TestBed.configureTestingModule({
      providers: [
        AudioEngineService,
        { provide: StemSeparationService, useValue: {} },
      ],
    });
    service = TestBed.inject(AudioEngineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should resume context on start', () => {
    service.start();
    expect(mockAudioContext.resume).toHaveBeenCalled();
  });

  it('should configure compressor correctly', () => {
    service.configureCompressor({ threshold: -20, ratio: 4 });
    expect(compressorNode.threshold.setTargetAtTime).toHaveBeenCalledWith(
      -20,
      0,
      0.01
    );
  });

  it('should initialize deck filters fully open', () => {
    const deckA = service.getDeck('A');
    const deckB = service.getDeck('B');
    expect(deckA.filter.frequency.value).toBe(20000);
    expect(deckB.filter.frequency.value).toBe(20000);
  });

  it('should bypass saturation when amount is zero', () => {
    service.setSaturation(0.4);
    service.setSaturation(0);
    expect(service.saturationNode.curve).toBeNull();
    expect(service.saturationNode.oversample).toBe('none');
  });

  it('should toggle metronome on and off', () => {
    expect(service.metronomeEnabled()).toBe(false);
    const result1 = service.toggleMetronome();
    expect(result1).toBe(true);
    expect(service.metronomeEnabled()).toBe(true);
    const result2 = service.toggleMetronome();
    expect(result2).toBe(false);
    expect(service.metronomeEnabled()).toBe(false);
  });

  it('should set metronome volume within bounds', () => {
    service.setMetronomeVolume(0.75);
    expect(service.metronomeVolume()).toBe(0.75);
    
    // Test clamping
    service.setMetronomeVolume(1.5);
    expect(service.metronomeVolume()).toBe(1);
    
    service.setMetronomeVolume(-0.5);
    expect(service.metronomeVolume()).toBe(0);
  });

  it('should not play metronome click when disabled', () => {
    service.metronomeEnabled.set(false);
    service.playMetronomeClick(0, true);
    // Should not create oscillator when metronome is disabled
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
  });

  it('should play metronome click when enabled', () => {
    service.metronomeEnabled.set(true);
    service.playMetronomeClick(0, true);
    expect(mockAudioContext.resume).toHaveBeenCalled();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
  });
});
