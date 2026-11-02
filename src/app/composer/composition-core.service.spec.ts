import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CompositionCoreService } from './composition-core.service';
import { ComposerUplinkService } from './composer-uplink.service';
import { GENRE_BY_ID } from './atlas';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { NotificationService } from '../services/notification.service';

describe('CompositionCoreService creative briefs', () => {
  let service: CompositionCoreService;

  beforeEach(() => {
    localStorage.clear();
    const genre = GENRE_BY_ID.get('house');
    if (!genre) throw new Error('house genre missing from atlas');

    const gate = signal({
      ready: true,
      blockers: [],
      personalization: { artistName: 'Test Artist', genreLabel: 'House' },
    });
    const uplink = {
      gate,
      allowedGenres: () => [genre],
      availableGenres: () => [genre],
      isDeclaredGenre: () => true,
      personalizationLines: () => [],
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ComposerUplinkService, useValue: uplink },
        { provide: MusicManagerService, useValue: {} },
        { provide: AudioEngineService, useValue: {} },
        { provide: NotificationService, useValue: { show: jest.fn() } },
      ],
    });
    service = TestBed.inject(CompositionCoreService);
  });

  it('steers tempo, key and darkness from the brief', () => {
    service.setIntensity({ darkness: 0.1 });
    service.setBrief('dark and 140 bpm in F# minor');
    const composition = service.generate({ seed: 42 });

    expect(composition).not.toBeNull();
    expect(composition!.bpm).toBe(140);
    expect(composition!.keyLabel).toContain('F#');
    expect(composition!.keyLabel.toLowerCase()).toContain('minor');
    expect(composition!.darkness).toBeGreaterThan(0.7);
    expect(composition!.rationale.join('\n')).toContain('Brief:');
  });

  it('lets explicit call overrides beat the brief', () => {
    service.setBrief('140 bpm in F# minor');
    const composition = service.generate({ seed: 7, bpm: 96, keyLabel: 'C major' });
    expect(composition!.bpm).toBe(96);
    expect(composition!.keyLabel).toMatch(/^C /);
    expect(composition!.keyLabel.toLowerCase()).toContain('major');
  });

  it('saves the brief with the pass and restores both together', () => {
    service.setBrief('dark and 140 bpm in F# minor');
    service.generate({ seed: 42 });
    const saved = service.saveCurrent();
    expect(saved?.brief).toBe('dark and 140 bpm in F# minor');

    service.setBrief('');
    service.setIntensity({ darkness: 0.2 });
    const loaded = service.loadSaved(saved!);

    expect(service.briefText()).toBe('dark and 140 bpm in F# minor');
    expect(loaded!.bpm).toBe(140);
    expect(loaded!.darkness).toBeGreaterThan(0.7);
    expect(loaded!.rationale.join('\n')).toContain('Brief:');
  });

  it('restores older saved entries that predate briefs', () => {
    service.setBrief('bright');
    const legacy = {
      id: 'legacy-1',
      title: 'Old Pass',
      genreId: 'house',
      seed: 42,
      motifSeed: 99,
      component: 'full-song' as const,
      bpm: 124,
      keyLabel: 'F# Minor (Aeolian)',
      complexity: 0.6,
      energy: 0.6,
      darkness: 0.6,
      savedAt: Date.now(),
    };
    const loaded = service.loadSaved(legacy);
    expect(service.briefText()).toBe('');
    expect(loaded!.rationale.join('\n')).not.toContain('Brief:');
  });

  it('keeps earlier readings newest-first and restores one with its brief', () => {
    service.setBrief('dark and 140 bpm');
    const first = service.generate({ seed: 11 });
    service.setBrief('bright and 96 bpm');
    const second = service.generate({ seed: 12 });

    expect(service.passHistory().map((pass) => pass.composition)).toEqual([second, first]);
    expect(service.passHistory()[0].brief).toBe('bright and 96 bpm');

    service.setBrief('');
    const restored = service.restorePass(service.passHistory()[1]);

    expect(restored).toBe(first);
    expect(service.current()).toBe(first);
    expect(service.briefText()).toBe('dark and 140 bpm');
    expect(service.intensity().darkness).toBeCloseTo(first!.darkness, 5);
  });

  it('caps the history and collapses an identical re-run', () => {
    for (let seed = 1; seed <= 13; seed++) {
      service.generate({ seed });
    }
    expect(service.passHistory()).toHaveLength(service.maxPassHistory);

    service.clearPassHistory();
    service.generate({ seed: 5 });
    service.generate({ seed: 5 });
    expect(service.passHistory()).toHaveLength(1);
  });

  it('leaves the dials alone when the brief says nothing actionable', () => {
    service.setIntensity({ darkness: 0.24 });
    service.setBrief('make it feel like a rainy night');
    const composition = service.generate({ seed: 9 });
    expect(composition!.darkness).toBeCloseTo(0.24, 2);
    expect(composition!.rationale.join('\n')).not.toContain('Brief:');
  });
});
