import { TestBed } from '@angular/core/testing';
import { LiveEngineService } from './live-engine.service';
import { LoggingService } from './logging.service';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';

// Mock Tone.js
jest.mock('tone', () => {
  return {
    PolySynth: jest.fn().mockImplementation(() => ({
      toDestination: jest.fn().mockReturnThis(),
      triggerAttackRelease: jest.fn(),
      triggerAttack: jest.fn(),
      triggerRelease: jest.fn(),
      set: jest.fn(),
      dispose: jest.fn(),
      connect: jest.fn(),
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
    Sampler: jest.fn().mockImplementation(() => ({
      toDestination: jest.fn().mockReturnThis(),
      triggerAttack: jest.fn(),
      triggerRelease: jest.fn(),
      set: jest.fn(),
      connect: jest.fn(),
      dispose: jest.fn(),
    })),
    Filter: jest.fn().mockImplementation(() => ({
      toDestination: jest.fn().mockReturnThis(),
      connect: jest.fn().mockReturnThis(),
      frequency: { value: 0, rampTo: jest.fn() },
      Q: { value: 0 },
      dispose: jest.fn(),
    })),
    start: jest.fn().mockResolvedValue(true),
    now: jest.fn().mockReturnValue(0),
    Synth: jest.fn(),
    setContext: jest.fn(),
    getContext: jest.fn().mockReturnValue({ rawContext: 'mock-ctx' }),
    getDestination: jest.fn().mockReturnValue({ connect: jest.fn() }),
    Frequency: jest.fn().mockImplementation((note: string) => ({
      toMidi: jest.fn().mockReturnValue(60),
    })),
  };
});

describe('LiveEngineService', () => {
  let service: LiveEngineService;

  beforeEach(() => {
    const mockAudioEngine = {
      ctx: { currentTime: 0 } as any,
      tempo: { set: jest.fn(), value: 120 } as any,
      onScheduleStep: undefined,
    };

    TestBed.configureTestingModule({
      providers: [
        LiveEngineService,
        InstrumentsService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: AudioEngineService, useValue: mockAudioEngine },
      ],
    });
    service = TestBed.inject(LiveEngineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set instrument', async () => {
    await service.setInstrument('analog-warmth');
    expect(service.activeInstrument()).toBe('analog-warmth');
  });

  it('should convert midi to note', () => {
    const note = (service as any).midiToNote(60);
    expect(note).toBe('C4');
  });

  it('should generate smart chord notes', () => {
    const notes = (service as any).generateSmartChord('C4');
    expect(notes).toEqual(['C4', 'E4', 'G4']);
  });
});
