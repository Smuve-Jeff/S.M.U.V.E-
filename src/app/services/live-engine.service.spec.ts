import { TestBed } from '@angular/core/testing';
import { LiveEngineService } from './live-engine.service';
import { LoggingService } from './logging.service';

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
  };
});

describe('LiveEngineService', () => {
  let service: LiveEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LiveEngineService,
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }
      ]
    });
    service = TestBed.inject(LiveEngineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set instrument', () => {
    service.setInstrument('mono-lead');
    expect(service.activeInstrument()).toBe('mono-lead');
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
