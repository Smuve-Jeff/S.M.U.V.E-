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

  it('leaves the dials alone when the brief says nothing actionable', () => {
    service.setIntensity({ darkness: 0.24 });
    service.setBrief('make it feel like a rainy night');
    const composition = service.generate({ seed: 9 });
    expect(composition!.darkness).toBeCloseTo(0.24, 2);
    expect(composition!.rationale.join('\n')).not.toContain('Brief:');
  });
});
