import { TestBed } from '@angular/core/testing';
import { AudioEngineService } from '../audio-engine.service';
import { StemSeparationService } from '../stem-separation.service';
import { AudioRecorderService } from '../../studio/audio-recorder.service';

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
      playbackRate: {
        value: 1,
        setTargetAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
      },
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
      createBufferSource: jest.fn().mockImplementation(createMockNode),
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
        {
          provide: AudioRecorderService,
          useValue: {
            pendingMidi: [],
            startRecording: jest.fn(),
            stopRecording: jest.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(AudioEngineService);
    mockAudioContext.createOscillator.mockClear();
    mockAudioContext.createGain.mockClear();
    mockAudioContext.createBiquadFilter.mockClear();
    mockAudioContext.createStereoPanner.mockClear();
    mockAudioContext.createBufferSource.mockClear();
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

  it('should shape synth notes and capture midi when recording', () => {
    service.isRecording.set(true);
    service.recorder.pendingMidi = [];

    service.playSynth(
      1.25,
      440,
      0.5,
      2,
      -0.25,
      0.4,
      0.1,
      0.05,
      {
        type: 'square',
        cutoff: 2400,
        attack: 0.02,
        decay: 0.1,
        sustain: 0.6,
        release: 0.3,
      },
      2
    );

    const osc = mockAudioContext.createOscillator.mock.results.at(-1)?.value;
    const filter =
      mockAudioContext.createBiquadFilter.mock.results.at(-1)?.value;
    const vca = mockAudioContext.createGain.mock.results.at(-1)?.value;
    const panner =
      mockAudioContext.createStereoPanner.mock.results.at(-1)?.value;

    expect(osc.type).toBe('square');
    expect(osc.frequency.value).toBe(440);
    expect(filter.frequency.value).toBe(2400);
    expect(panner.pan.value).toBe(-0.25);
    expect(vca.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      expect.closeTo(0.72, 5),
      1.27
    );
    expect(vca.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      2,
      expect.closeTo(0.432, 5),
      1.37
    );
    expect(vca.gain.setTargetAtTime).toHaveBeenCalledWith(0, 1.75, 0.3);
    expect(osc.start).toHaveBeenCalledWith(1.25);
    expect(osc.stop).toHaveBeenCalledWith(3.25);
    expect(service.recorder.pendingMidi).toEqual([
      {
        pitch: 69,
        startTime: 1.25,
        duration: 0.5,
        velocity: 2,
      },
    ]);
  });

  it('should clamp buffer playback gain and velocity envelopes', () => {
    const buffer = {} as AudioBuffer;

    service.playBuffer(2, buffer, 0.004, 3, 0.4, 2);

    const source =
      mockAudioContext.createBufferSource.mock.results.at(-1)?.value;
    const vca = mockAudioContext.createGain.mock.results.at(-1)?.value;
    const panner =
      mockAudioContext.createStereoPanner.mock.results.at(-1)?.value;

    expect(source.buffer).toBe(buffer);
    expect(panner.pan.value).toBe(0.4);
    expect(vca.gain.linearRampToValueAtTime).toHaveBeenCalledWith(2.7, 2.002);
    expect(vca.gain.setTargetAtTime).toHaveBeenCalledWith(0, 2.002, 0.012);
    expect(source.start).toHaveBeenCalledWith(2);
    expect(source.stop).toHaveBeenCalledWith(2.014);
  });

  it('should schedule metronome and step callbacks with lookahead timing', () => {
    service.metronomeEnabled.set(true);
    const scheduled = jest.fn();
    service.onScheduleStep = scheduled;
    service.tempo.set(120);
    (service as any).nextNoteTime = 0.05;
    mockAudioContext.currentTime = 0;

    (service as any).scheduleTick();

    expect(scheduled).toHaveBeenNthCalledWith(1, 0, 0.05, 0.125);
    expect(scheduled).toHaveBeenNthCalledWith(2, 1, 0.175, 0.125);
    expect(service.currentBeat()).toBe(2);

    const osc = mockAudioContext.createOscillator.mock.results.at(-1)?.value;
    expect(osc.frequency.value).toBe(1200);
  });

  it('should use the performance lookahead interval when starting playback', () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    service.setPerformanceTier('performance');

    service.start();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 160);
    setIntervalSpy.mockRestore();
    service.stop();
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
