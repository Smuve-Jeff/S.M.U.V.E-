import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DrumMachineComponent } from './drum-machine.component';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MicrophoneService } from '../../services/microphone.service';
import { AiService } from '../../services/ai.service';
import { LoggingService } from '../../services/logging.service';
import { MusicManagerService } from '../../services/music-manager.service';

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
      onScheduleStep: undefined as any,
      ensureTrack: jest.fn(),
    };

    const mockMicService = {
      isInitialized: signal(false),
      isRecording: signal(false),
      recordedBlob: signal<Blob | null>(null),
      initialize: jest.fn().mockResolvedValue(undefined),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      stop: jest.fn(),
    };

    const mockAiService = {
      generateAiResponse: jest.fn().mockResolvedValue('trap'),
    };

    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DrumMachineComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            tracks: signal([]),
            selectedTrackId: signal(null),
            ensureTrack: jest.fn(),
            loadLastSession: jest.fn(),
          },
        },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: MicrophoneService, useValue: mockMicService },
        { provide: AiService, useValue: mockAiService },
        { provide: LoggingService, useValue: mockLogger },
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
      mockMicService,
      mockAiService,
    };
  };

  it('initializes with 12 pads', async () => {
    const { component } = await createComponent();
    expect(component.pads().length).toBe(12);
  });

  it('each pad has 16 steps initialized to inactive', async () => {
    const { component } = await createComponent();
    for (const pad of component.pads()) {
      expect(pad.steps.length).toBe(16);
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
    // Activate some steps
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

  it('each pad has a semitone parameter', async () => {
    const { component } = await createComponent();
    for (const pad of component.pads()) {
      expect(pad.params.semitone).toBeDefined();
      expect(typeof pad.params.semitone).toBe('number');
    }
  });

  it('generateAiPattern sets isGeneratingPattern then clears it', async () => {
    const { component, mockAiService } = await createComponent();
    mockAiService.generateAiResponse.mockResolvedValue('house');

    const promise = component.generateAiPattern();
    expect(component.isGeneratingPattern()).toBe(true);
    await promise;
    expect(component.isGeneratingPattern()).toBe(false);
  });

  it('generateAiPattern applies house pattern with kick on beats 0,4,8,12', async () => {
    const { component, mockAiService } = await createComponent();
    mockAiService.generateAiResponse.mockResolvedValue('house');

    await component.generateAiPattern();

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

  it('hooks into audioEngine.onScheduleStep and updates currentStep', async () => {
    const { component, mockAudioEngine } = await createComponent();
    expect(typeof mockAudioEngine.onScheduleStep).toBe('function');
    mockAudioEngine.onScheduleStep!(4, 0, 0.1);
    expect(component.currentStep()).toBe(4);
  });

  it('scheduler triggers pad sounds for active steps', async () => {
    const { component, mockAudioEngine } = await createComponent();
    // Activate step 0 on the kick pad
    component.toggleStep(component.pads()[0], 0);
    const createOscSpy = mockAudioEngine.ctx.createOscillator;
    mockAudioEngine.onScheduleStep!(0, 0, 0.1);
    expect(createOscSpy).toHaveBeenCalled();
  });

  it('micStatus starts as idle', async () => {
    const { component } = await createComponent();
    expect(component.micStatus()).toBe('idle');
  });

  it('stepRange has 16 elements', async () => {
    const { component } = await createComponent();
    expect(component.stepRange.length).toBe(16);
  });
});
