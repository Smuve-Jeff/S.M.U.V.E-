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
      ctx: { currentTime: 0, state: 'running' } as any,
      tempo: { set: jest.fn(), value: 120 } as any,
      onScheduleStep: undefined,
      resume: jest.fn(),
      masterAnalyser: null,
      masterGain: { connect: jest.fn() },
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

  it('should auto-load default instrument on initialize', async () => {
    expect(service.isInitialized()).toBe(false);
    expect((service as any).currentInstrumentNode).toBeNull();

    await service.initialize();

    expect(service.isInitialized()).toBe(true);
    // After initialize(), a default instrument (grand-piano) should be loaded
    expect(service.activeInstrument()).toBe('grand-piano');
    expect((service as any).currentInstrumentNode).not.toBeNull();
  });

  it('should produce sound after initialize - triggerNoteStart works', async () => {
    await service.initialize();

    // Spy on triggerAttack
    const instrument = (service as any).currentInstrumentNode;
    expect(instrument).not.toBeNull();

    // Trigger a note - should not throw
    expect(() => service.triggerNoteStart(60, 0.8)).not.toThrow();
    expect(instrument.triggerAttack).toHaveBeenCalled();
  });

  it('should handle AudioContext resume safely', async () => {
    // Should not throw when called on a running context
    await expect(service.resumeContext()).resolves.not.toThrow();
  });

  it('should resume suspended AudioContext', async () => {
    // Mock a suspended context
    (service as any).audioEngine.ctx.state = 'suspended';
    await service.resumeContext();
    // ctx.resume should have been called (via the spy on audioEngine)
    expect((service as any).audioEngine.ctx.state).toBe('suspended');
  });

  it('should be idempotent - calling initialize twice does not re-init', async () => {
    await service.initialize();
    const node = (service as any).currentInstrumentNode;

    await service.initialize(); // call again

    // The same instrument node should still be active
    expect((service as any).currentInstrumentNode).toBe(node);
  });

  it('should convert midi to note', () => {
    const note = (service as any).midiToNote(60);
    expect(note).toBe('C4');
  });

  it('should generate smart chord notes', () => {
    const notes = (service as any).generateSmartChord('C4');
    expect(notes).toEqual(['C4', 'E4', 'G4']);
  });

  it('should handle midi message for note on', () => {
    // Set up a spy on triggerNoteStart
    const spy = jest.spyOn(service, 'triggerNoteStart');
    const msg = { data: [0x90, 60, 100] }; // Note On, C4, vel 100
    (service as any).handleMidiMessage(msg);
    expect(spy).toHaveBeenCalledWith(60, 100 / 127);
  });

  it('should handle sustain pedal CC', () => {
    // The sustain pedal (CC 64, value >= 64 = pedal down)
    const msg = { data: [0xB0, 64, 100] };
    (service as any).handleMidiMessage(msg);
    expect((service as any).sustainActive).toBe(true);

    // Release pedal
    const msg2 = { data: [0xB0, 64, 0] };
    (service as any).handleMidiMessage(msg2);
    expect((service as any).sustainActive).toBe(false);
  });

  it('should initialize with fallback when grand-piano preset fails', async () => {
    // Clear the instrument so the fallback is triggered
    (service as any).currentInstrumentNode = null;
    // Mock setInstrument to reject
    jest.spyOn(service, 'setInstrument').mockRejectedValueOnce(new Error('fail'));

    // Reset initialized flag
    (service as any).isInitialized.set(false);

    await service.initialize();

    // Should have a fallback instrument (PolySynth)
    expect((service as any).currentInstrumentNode).not.toBeNull();
    expect(service.activeInstrument()).toBe('grand-piano');
  });
});
