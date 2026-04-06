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

  it('should update adaptive performance tier from cpu load', () => {
    service.updateAdaptivePerformance(80);
    expect(service.performanceTier()).toBe('performance');

    service.updateAdaptivePerformance(30);
    expect(service.performanceTier()).toBe('ultra');
  });

  it('should support sidechain routing matrix', () => {
    service.connectSidechain('kick', 'bass');
    service.connectSidechain('kick', 'pad');
    expect(service.sidechainEnabled()).toBe(true);
    expect(service.getSidechainRouting()).toEqual([
      { triggerTrackId: 'kick', targetTrackIds: ['bass', 'pad'] },
    ]);

    service.disconnectSidechain('kick', 'pad');
    expect(service.getSidechainRouting()).toEqual([
      { triggerTrackId: 'kick', targetTrackIds: ['bass'] },
    ]);
  });

  it('should apply production parameters to tracked channels and globals', () => {
    service.ensureTrack({ id: 101, gain: 0.8, pan: 0 });
    service.applyProductionParameter('101', 'gain', 1.1);
    service.applyProductionParameter('101', 'pan', 0.2);
    service.applyProductionParameter('101', 'sendA', 0.4);
    service.applyProductionParameter('0', 'tempo', 130);

    expect(service.tempo()).toBe(130);
  });

  it('should expose mastering targets and apply safe ceiling', () => {
    service.setMasteringTargets({ lufs: -13, truePeak: -0.2 });
    const targets = service.getMasteringTargets();
    expect(targets.lufs).toBe(-13);
    expect(targets.truePeak).toBe(-0.2);
    expect(compressorNode.threshold.setTargetAtTime).toHaveBeenCalled();
  });
});
