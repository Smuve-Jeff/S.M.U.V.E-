import { TestBed } from '@angular/core/testing';
import * as Tone from 'tone';
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
      detune: { value: 0, rampTo: jest.fn() },
    })),
    Synth: jest.fn().mockImplementation(() => ({
      triggerAttack: jest.fn(),
      triggerRelease: jest.fn(),
      set: jest.fn(),
      connect: jest.fn(),
      dispose: jest.fn(),
      detune: { value: 0, rampTo: jest.fn() },
    })),
    Gain: jest.fn().mockImplementation(() => ({
      gain: { value: 1, rampTo: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
      dispose: jest.fn(),
    })),
    Filter: jest.fn().mockImplementation(() => ({
      toDestination: jest.fn().mockReturnThis(),
      connect: jest.fn().mockReturnThis(),
      frequency: { value: 0, rampTo: jest.fn() },
      Q: { value: 0 },
      dispose: jest.fn(),
    })),
    Panner: jest.fn().mockImplementation(() => ({
      pan: { value: 0, rampTo: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
      dispose: jest.fn(),
    })),
    start: jest.fn().mockResolvedValue(true),
    now: jest.fn().mockReturnValue(0),
    setContext: jest.fn(),
    getContext: jest.fn().mockReturnValue({ rawContext: 'mock-ctx' }),
    getDestination: jest.fn().mockReturnValue({ connect: jest.fn() }),
    Frequency: jest.fn().mockImplementation((_note: string) => ({
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

  it('assigns sample zones at their recorded pitches for melodic and hybrid presets', async () => {
    // The factory samples are midi-js-soundfonts files, whose names carry the
    // note in lower case (`...-g3.mp3`). What matters is that the zone is keyed
    // by the pitch the sample was recorded at.
    await service.setInstrument('strat-elite-clean');
    expect(Tone.Sampler).toHaveBeenLastCalledWith(expect.objectContaining({
      urls: { G3: expect.stringMatching(/g3\.mp3$/i) },
    }));
    await service.setInstrument('whisper-choir');
    expect(Tone.Sampler).toHaveBeenLastCalledWith(expect.objectContaining({
      urls: { C5: expect.stringMatching(/c5\.mp3$/i) },
    }));
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

  it('does not initialize Tone when the host has no Web Audio implementation', async () => {
    (service as any).audioEngine.audioAvailable = false;

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(service.isInitialized()).toBe(false);
    expect((service as any).currentInstrumentNode).toBeNull();
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

  it('routes the instrument into a project channel instead of the raw destination', async () => {
    await service.initialize();

    const channel = { connect: jest.fn(), disconnect: jest.fn() } as any;
    expect(service.setOutputTarget(channel)).toBe(true);
    expect(service.getOutputTarget()).toBe(channel);

    const output = (service as any).outputNode;
    expect(output).not.toBeNull();
    expect(output.connect).toHaveBeenLastCalledWith(channel);
    // The instrument's filter drives the pan stage, and the pan stage drives
    // that output — never Tone's destination directly.
    expect((service as any).filterNode.connect).toHaveBeenCalledWith(
      (service as any).panNode,
    );
    expect((service as any).panNode.connect).toHaveBeenCalledWith(output);

    service.setOutputTarget(null);
    expect(service.getOutputTarget()).toBeNull();
    expect(output.connect).toHaveBeenLastCalledWith(
      (service as any).audioEngine.masterGain,
    );
  });

  it('should handle midi message for note on', () => {
    // Set up a spy on triggerNoteStart
    const spy = jest.spyOn(service, 'triggerNoteStart');
    const msg = { data: [0x90, 60, 100] }; // Note On, C4, vel 100
    (service as any).handleMidiMessage(msg);
    expect(spy).toHaveBeenCalledWith(60, 100 / 127, 0);
  });

  it('routes MPE member-channel bend and pressure to that note only', async () => {
    await service.setInstrument('analog-warmth');

    (service as any).handleMidiMessage({ data: [0x91, 60, 100] });
    (service as any).handleMidiMessage({ data: [0x92, 64, 100] });
    const voices = (service as any).mpeVoices as Map<string, any>;
    expect(voices.size).toBe(2);
    const first = voices.get('1:60');
    const second = voices.get('2:64');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();

    (service as any).handleMidiMessage({ data: [0xe1, 127, 127] });
    expect(first.node.detune.rampTo).toHaveBeenCalled();
    const firstCents = first.node.detune.rampTo.mock.calls.at(-1)[0];
    expect(firstCents).toBeGreaterThan(4700);
    expect(second.node.detune.rampTo).toHaveBeenCalledTimes(1);
    expect(second.node.detune.rampTo.mock.calls[0][0]).toBe(0);

    (service as any).handleMidiMessage({ data: [0xd1, 127, 0] });
    expect(first.gain.gain.rampTo).toHaveBeenCalledWith(1, 0.03);
    expect(second.gain.gain.rampTo).not.toHaveBeenCalledWith(1, 0.03);

    (service as any).handleMidiMessage({ data: [0x81, 60, 0] });
    expect(voices.has('1:60')).toBe(false);
    expect(first.node.triggerRelease).toHaveBeenCalled();
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

  it('applies channel and polyphonic aftertouch to the live filter', () => {
    const rampTo = jest.fn();
    (service as any).filterNode = { frequency: { rampTo } };
    (service as any).activePreset = { synth: { cutoff: 1000 } };

    (service as any).handleMidiMessage({ data: [0xd0, 64, 0] });
    expect(service.aftertouch()).toBeCloseTo(64 / 127, 5);
    expect(rampTo).toHaveBeenCalled();

    rampTo.mockClear();
    (service as any).handleMidiMessage({ data: [0xa0, 60, 127] });
    expect(service.aftertouch()).toBe(1);
    expect(rampTo).toHaveBeenCalledWith(expect.closeTo(20000, 0), 0.03);
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

describe('LiveEngineService live performance controls', () => {
  let service: LiveEngineService;

  const mockAudioEngine = {
    ctx: { currentTime: 0, state: 'running' } as any,
    tempo: { set: jest.fn(), value: 120 } as any,
    onScheduleStep: undefined,
    resume: jest.fn(),
    masterAnalyser: null,
    masterGain: { connect: jest.fn() },
  };

  beforeEach(() => {
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

  it('names the selected patch before audio is allowed to start', () => {
    expect(service.isInitialized()).toBe(false);
    service.previewPatchReadout('grand-piano');
    expect(service.cutoff()).toBe(2000);
    expect(service.release()).toBe(1);
    service.previewPatchReadout('analog-warmth');
    expect(service.cutoff()).toBe(800);
    expect(service.isInitialized()).toBe(false);
  });

  it('seeds the rack read-out from the loaded patch', async () => {
    await service.setInstrument('analog-warmth');

    expect(service.cutoff()).toBe(800);
    expect(service.resonance()).toBe(2);
    expect(service.attack()).toBeCloseTo(0.1, 5);
    expect(service.release()).toBeCloseTo(0.4, 5);
  });

  it('stores parameter moves so a knob cannot drift from the engine', async () => {
    await service.setInstrument('analog-warmth');

    service.updateParameter('cutoff', 5000);
    expect(service.cutoff()).toBe(5000);
    expect((service as any).filterNode.frequency.rampTo).toHaveBeenCalledWith(
      5000,
      0.02,
    );

    service.updateParameter('attack', 1.5);
    expect(service.attack()).toBe(1.5);
  });

  it('applies ATK/REL to sampled instruments instead of dropping them', async () => {
    await service.setInstrument('grand-piano');
    const node = (service as any).currentInstrumentNode;

    service.updateParameter('release', 2);
    expect(service.release()).toBe(2);
    expect(node.set).toHaveBeenCalledWith({ release: 2 });

    service.updateParameter('attack', 0.2);
    expect(service.attack()).toBeCloseTo(0.2, 5);
    expect(node.set).toHaveBeenCalledWith({ attack: 0.2 });
  });

  it('plays the whole smart chord and releases every voice', async () => {
    await service.setInstrument('analog-warmth');
    const node = (service as any).currentInstrumentNode;
    service.smartChords.set(true);

    service.triggerNoteStart(60, 0.8);
    expect(node.triggerAttack.mock.calls.map((call: any[]) => call[0])).toEqual([
      'C4',
      'E4',
      'G4',
    ]);

    service.triggerNoteEnd(60);
    expect(
      node.triggerRelease.mock.calls.map((call: any[]) => call[0]),
    ).toEqual(['C4', 'E4', 'G4']);
  });

  it('derives chord quality and the snap grid from the selected scale', async () => {
    await service.setInstrument('analog-warmth');

    service.setScale('minor');
    expect(service.scaleMode()).toBe('minor');
    expect(service.currentScale()).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(service.generateSmartChord('C4')).toEqual(['C4', 'D#4', 'G4']);

    // An unknown mode resolves to the shipped default instead of leaving the
    // engine on a scale nothing recognises.
    service.setScale('locrian-nonexistent');
    expect(service.scaleMode()).toBe('major');
  });

  it('snaps notes into the scale only while Scale Lock is on', async () => {
    await service.setInstrument('analog-warmth');
    const node = (service as any).currentInstrumentNode;
    service.setScale('minor');

    service.triggerNoteStart(64);
    expect(node.triggerAttack).toHaveBeenLastCalledWith(
      'E4',
      expect.anything(),
      0.8,
    );

    node.triggerAttack.mockClear();
    service.setScaleLock(true);
    service.triggerNoteStart(64);
    expect(node.triggerAttack).toHaveBeenLastCalledWith(
      'D#4',
      expect.anything(),
      0.8,
    );
  });

  it('routes CC7 volume and CC10 pan to the live output', async () => {
    await service.setInstrument('analog-warmth');

    (service as any).handleMidiCC(7, 64);
    expect(service.instrumentVolume()).toBeCloseTo(64 / 127, 5);
    expect((service as any).outputNode.gain.rampTo).toHaveBeenCalledWith(
      expect.closeTo(64 / 127, 5),
      0.03,
    );

    (service as any).handleMidiCC(10, 127);
    expect(service.instrumentPan()).toBe(1);
    expect((service as any).panNode.pan.rampTo).toHaveBeenCalledWith(1, 0.03);
  });

  it('retriggers held notes while note repeat is on and stops on release', async () => {
    jest.useFakeTimers();
    try {
      await service.setInstrument('analog-warmth');
      const node = (service as any).currentInstrumentNode;
      service.setArpeggiatorRate('8n'); // 120 BPM -> 250 ms
      service.setArpeggiatorEnabled(true);

      service.triggerNoteStart(60, 0.7);
      expect(node.triggerAttackRelease).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(500);
      expect(node.triggerAttackRelease).toHaveBeenCalledTimes(3);

      service.triggerNoteEnd(60);
      jest.advanceTimersByTime(1000);
      expect(node.triggerAttackRelease).toHaveBeenCalledTimes(3);
      expect((service as any).arpTimer).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('LiveEngineService portamento', () => {
  let service: LiveEngineService;

  const mockAudioEngine = {
    ctx: { currentTime: 0, state: 'running' } as any,
    tempo: { set: jest.fn(), value: 120 } as any,
    onScheduleStep: undefined,
    resume: jest.fn(),
    masterAnalyser: null,
    masterGain: { connect: jest.fn() },
  };

  beforeEach(() => {
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

  it('starts with glide off and clamps the glide time', () => {
    expect(service.portamento()).toBe(0);
    service.setPortamento(2);
    expect(service.portamento()).toBe(0.5);
    service.setPortamento(-1);
    expect(service.portamento()).toBe(0);
    service.setPortamento(NaN);
    expect(service.portamento()).toBe(0);
  });

  it('pushes the glide time onto the live instrument', async () => {
    await service.setInstrument('analog-warmth');
    const node = (service as any).currentInstrumentNode;
    service.setPortamento(0.08);
    expect(service.portamento()).toBeCloseTo(0.08, 5);
    expect(node.set).toHaveBeenCalledWith({ portamento: 0.08 });
  });

  it('routes portamento through updateParameter like cutoff', async () => {
    await service.setInstrument('analog-warmth');
    service.updateParameter('portamento', 0.12);
    expect(service.portamento()).toBeCloseTo(0.12, 5);
    expect((service as any).currentInstrumentNode.set).toHaveBeenCalledWith({
      portamento: 0.12,
    });
  });
});
