import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DrumMachineComponent } from './drum-machine.component';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { LoggingService } from '../../services/logging.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { InstrumentsService } from '../../services/instruments.service';

describe('DrumMachineComponent', () => {
  const createComponent = async () => {
    const mockAudioEngine = {
      isPlaying: signal(false),
      tempo: signal(124),
      currentBeat: signal(0),
      ctx: {
        currentTime: 0,
        sampleRate: 44100,
        createOscillator: jest.fn(() => ({
          connect: jest.fn().mockReturnThis(),
          frequency: {
            setValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
          },
          start: jest.fn(),
          stop: jest.fn(),
          type: 'sine',
        })),
        createGain: jest.fn(() => ({
          connect: jest.fn().mockReturnThis(),
          gain: {
            setValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
            value: 1,
          },
        })),
        createBuffer: jest.fn(() => ({
          getChannelData: jest.fn(() => new Float32Array(100)),
        })),
        createBufferSource: jest.fn(() => ({
          connect: jest.fn().mockReturnThis(),
          buffer: null,
          playbackRate: { value: 1 },
          start: jest.fn(),
        })),
        createBiquadFilter: jest.fn(() => ({
          connect: jest.fn().mockReturnThis(),
          type: 'lowpass',
          frequency: {
            setValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
            value: 1000,
          },
          Q: { value: 1 },
        })),
        decodeAudioData: jest.fn().mockResolvedValue(null),
      },
      masterGain: {
        connect: jest.fn().mockReturnThis(),
        gain: { value: 1 },
      },
      getMasterAnalyser: jest.fn(() => ({
        frequencyBinCount: 128,
        getByteFrequencyData: jest.fn(),
        fftSize: 256,
      })),
      onScheduleStep: jest.fn(),
      ensureTrack: jest.fn(),
      getContext: jest.fn().mockReturnValue({ currentTime: 0 }),
      triggerAttack: jest.fn(),
    };

    const mockAiService = {
      generateAiResponse: jest.fn().mockResolvedValue('trap'),
      isUnlocked: jest.fn().mockReturnValue(true),
    };

    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const mockInstrumentsService = {
      getPresets: jest.fn().mockReturnValue([
        { id: 'kit-808', name: '808 Kit', category: 'drum' },
        { id: 'kit-studio', name: 'Studio Kit', category: 'drum' },
      ]),
    };

    const mockMusicManager = {
      tracks: signal([]),
      selectedTrackId: signal(null),
      currentStep: signal(-1),
      midiToFreq: (_m) => 440,
      setInstrument: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DrumMachineComponent],
      providers: [
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: AiService, useValue: mockAiService },
        { provide: LoggingService, useValue: mockLogger },
        { provide: InstrumentsService, useValue: mockInstrumentsService },
      ],
    })
      .overrideComponent(DrumMachineComponent, {
        set: { template: '<div></div>' },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(DrumMachineComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return {
      component,
      fixture,
      mockAudioEngine,
      mockAiService,
      mockInstrumentsService,
      mockMusicManager,
    };
  };

  it('initializes with 12 pads', async () => {
    const { component } = await createComponent();
    expect(component.pads().length).toBe(12);
  });

  it('each pad has a 4-bar pattern initialized to inactive', async () => {
    const { component } = await createComponent();
    for (const pad of component.pads()) {
      expect(pad.steps.length).toBe(64);
      for (const step of pad.steps) {
        expect(step.active).toBe(false);
        expect(step.velocity).toBeGreaterThan(0);
      }
    }
  });

  it('toggleStep activates and deactivates a step', async () => {
    const { component } = await createComponent();
    const pad = component.pads()[0];
    expect(pad.steps[0].active).toBe(false);
    component.toggleStep(pad, 0);
    expect(component.pads()[0].steps[0].active).toBe(true);
    component.toggleStep(component.pads()[0], 0);
    expect(component.pads()[0].steps[0].active).toBe(false);
  });

  it('selectPad updates selectedPad', async () => {
    const { component } = await createComponent();
    const secondPad = component.pads()[1];
    component.selectPad(secondPad);
    expect(component.selectedPad()?.id).toBe(secondPad.id);
  });

  it('clearPattern resets all steps to inactive', async () => {
    const { component } = await createComponent();
    component.toggleStep(component.pads()[0], 0);
    component.toggleStep(component.pads()[1], 4);
    component.clearPattern();
    for (const pad of component.pads()) {
      for (const step of pad.steps) {
        expect(step.active).toBe(false);
      }
    }
  });

  it('pads include expanded sound types: cowbell, shaker, ride', async () => {
    const { component } = await createComponent();
    const types = component.pads().map((p) => p.type);
    expect(types).toContain('cowbell');
    expect(types).toContain('shaker');
    expect(types).toContain('ride');
  });

  it('each pad has advanced parameters', async () => {
    const { component } = await createComponent();
    for (const pad of component.pads()) {
      expect(pad.params.pan).toBeDefined();
      expect(pad.params.decay).toBeDefined();
    }
  });

  it('generateAiPattern applies house pattern with kick on beats 0,4,8,12', async () => {
    const { component } = await createComponent();
    await component.generateAiPattern('house');

    const kick = component.pads().find((p) => p.name === 'KICK')!;
    expect(kick.steps[0].active).toBe(true);
    expect(kick.steps[4].active).toBe(true);
    expect(kick.steps[8].active).toBe(true);
    expect(kick.steps[12].active).toBe(true);
  });

  it('isSequencerRunning reflects audioEngine.isPlaying', async () => {
    const { component, mockAudioEngine } = await createComponent();
    expect(component.isSequencerRunning()).toBe(false);
    mockAudioEngine.isPlaying.set(true);
    expect(component.isSequencerRunning()).toBe(true);
  });

  it('stepRange spans 64 steps (4 bars)', async () => {
    const { component } = await createComponent();
    expect(component.stepRange.length).toBe(64);
  });

  it('evolvePattern mutates steps based on intensity', async () => {
    const { component } = await createComponent();
    component.evolutionIntensity.set(1.0); // High intensity
    const initialActive = component
      .pads()[0]
      .steps.filter((s) => s.active).length;
    component.evolvePattern();
    const newActive = component.pads()[0].steps.filter((s) => s.active).length;
    // With intensity 1, it's highly likely something changed
    expect(newActive).not.toBe(initialActive);
  });
});
