import { TestBed } from '@angular/core/testing';
import { InstrumentsService } from '../instruments.service';
import { AudioEngineService } from '../audio-engine.service';

describe('InstrumentsService', () => {
  let service: InstrumentsService;
  let triggerAttack: jest.Mock;
  let triggerSampler: jest.Mock;
  let decoded: AudioBuffer;

  beforeEach(() => {
    decoded = { duration: 1.5 } as AudioBuffer;
    triggerAttack = jest.fn();
    triggerSampler = jest.fn();

    const mockEngine = {
      ctx: {
        currentTime: 0,
        decodeAudioData: jest.fn(async () => decoded),
      },
      logger: { info: jest.fn(), error: jest.fn() },
      triggerAttack,
      triggerSampler,
      resume: jest.fn(async () => undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        InstrumentsService,
        { provide: AudioEngineService, useValue: mockEngine },
      ],
    });
    service = TestBed.inject(InstrumentsService);
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('provides instrument quality metadata for sample presets', () => {
    const grandPiano = service.getPresets().find((p) => p.id === 'grand-piano');
    expect(grandPiano?.sampleQuality).toBe('high');
    expect(grandPiano?.zones?.length).toBeGreaterThan(0);
  });

  describe('preset sample loading', () => {
    it('selects the nearest overlapping sample root and transposes from its filename', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true, arrayBuffer: async () => new ArrayBuffer(8),
      }));
      await service.loadPresetSample('steinway-d-concert-grand', 57, 0.8);
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringContaining('/C4.mp3'));
      expect(service.getPresetSample('steinway-d-concert-grand', 57, 0.8)?.rate)
        .toBeCloseTo(Math.pow(2, -3 / 12));
      await service.loadPresetSample('steinway-d-concert-grand', 33, 0.8);
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringContaining('/A1.mp3'));
      expect(service.getPresetSample('steinway-d-concert-grand', 33, 0.8)?.rate).toBe(1);
    });

    it('loads the selected piano velocity layer and falls back to the base on failure', async () => {
      (globalThis as any).fetch = jest.fn(async (url: string) => ({
        ok: !url.endsWith('FF-C4.m4a'), arrayBuffer: async () => new ArrayBuffer(8),
      }));
      await service.loadPresetSample('grand-piano', 60, 0.4);
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringContaining('PP-C4.m4a'));
      await service.loadPresetSample('grand-piano', 60, 0.9);
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringContaining('FF-C4.m4a'));
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringContaining('/C4.mp3'));
      expect(service.getPresetSample('grand-piano', 60, 0.9)?.buffer).toBe(decoded);
    });

    it('selects a playable sample for each declared zone', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true, arrayBuffer: async () => new ArrayBuffer(8),
      }));
      for (const preset of service.getPresets()) {
        if (!service.isSamplePreset(preset.id)) continue;
        for (const zone of preset.zones ?? []) {
          const midi = zone.rootNote ?? (zone.midiRange[0] === zone.midiRange[1] ? zone.midiRange[0] : Math.round((zone.midiRange[0] + zone.midiRange[1]) / 2));
          await service.loadPresetSample(preset.id, midi, 0.8);
          expect(service.getPresetSample(preset.id, midi, 0.8)?.buffer).toBe(decoded);
        }
      }
    });

    it('coalesces concurrent sample requests and reports unmapped notes', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true, arrayBuffer: async () => new ArrayBuffer(8),
      }));
      await Promise.all([
        service.loadPresetSample('trap-kit-elite', 36, 0.8),
        service.loadPresetSample('trap-kit-elite', 36, 0.8),
      ]);
      expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
      await expect(service.loadPresetSample('trap-kit-elite', 37, 0.8))
        .rejects.toThrow('No sample zone');
    });
  });

  describe('audition', () => {
    it('plays a synth preset with its own envelope and oscillator', async () => {
      await service.audition('hang-drum-handpan');

      expect(triggerAttack).toHaveBeenCalledTimes(1);
      const params = triggerAttack.mock.calls[0][9];
      expect(params.oscillator).toBe('sine');
      expect(params.attack).toBeCloseTo(0.008);
      expect(params.release).toBeCloseTo(1.0);
      expect(params.cutoff).toBe(2000);
    });

    it('plays the sample a sample preset declares', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }));

      await service.audition('trap-kit-elite');

      expect(triggerSampler).toHaveBeenCalledTimes(1);
      expect(triggerSampler.mock.calls[0][1]).toBe(decoded);
      expect(triggerAttack).not.toHaveBeenCalled();
    });

    it('auditions the exact voice a pad names (snare, not the kick)', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }));

      await service.audition('trap-kit-elite', 38);

      const requested = ((globalThis as any).fetch as jest.Mock).mock
        .calls[0][0] as string;
      expect(requested).toContain('snare');
      expect(triggerSampler).toHaveBeenCalledTimes(1);
      // Zone root is 38, so the snare plays at its own pitch.
      expect(triggerSampler.mock.calls[0][6]).toBeCloseTo(1, 5);
    });

    it('falls back to the nearest zone for a note the kit does not map', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }));

      await service.audition('afro-cuban-kit', 36);

      const requested = ((globalThis as any).fetch as jest.Mock).mock
        .calls[0][0] as string;
      // The quinto (60) is the closest conga to a low note.
      expect(requested).toContain('Quinto');
      expect(triggerSampler).toHaveBeenCalledTimes(1);
    });

    it('falls back to a category patch when the sample cannot be fetched', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({ ok: false }));

      await service.audition('grand-piano');

      expect(triggerSampler).not.toHaveBeenCalled();
      expect(triggerAttack).toHaveBeenCalledTimes(1);
      expect(triggerAttack.mock.calls[0][9].attack).toBeGreaterThan(0);
    });

    it('stays silent for a preset id that does not exist', async () => {
      await service.audition('kick');

      expect(triggerAttack).not.toHaveBeenCalled();
      expect(triggerSampler).not.toHaveBeenCalled();
    });

    it('every default sound-pad-bank preset resolves to a real instrument', async () => {
      (globalThis as any).fetch = jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }));
      const padPresetIds = [
        'trap-kit-elite',
        'trap-kit-elite',
        'trap-kit-elite',
        'trap-kit-elite',
        'sub-commander',
        'trap-808-elite',
        'afro-cuban-kit',
        'afro-cuban-kit',
        'rhodes-mk2-stage',
        'minimoog-model-d-lead',
        'analog-warmth',
        'choir-ensemble',
        'tabla-classic',
        'cyber-stab',
        'supersaw-stack',
        'vhs-memory',
      ];

      for (const id of padPresetIds) {
        expect(service.getPresets().some((p) => p.id === id)).toBe(true);
        triggerAttack.mockClear();
        triggerSampler.mockClear();
        await service.audition(id);
        expect(
          triggerAttack.mock.calls.length + triggerSampler.mock.calls.length,
        ).toBe(1);
      }
    });
  });
});
