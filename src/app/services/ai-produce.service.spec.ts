import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AiProduceService } from './ai-produce.service';
import { AiBeatGeneratorService } from './ai-beat-generator.service';
import { SongwritingAssistantService } from './songwriting-assistant.service';
import { AiMixAssistantService } from '../studio/effects/ai-mix-assistant.service';
import { ReleasePipelineService } from './release-pipeline.service';
import { MusicManagerService } from './music-manager.service';
import { NotificationService } from './notification.service';
import { LoggingService } from './logging.service';

/**
 * The produced idea has to carry the genre's real tempo, energy and length.
 * Stage 1 is pure apart from those lookups, so the other stage services can be
 * stubbed out; what matters here is that Country, Blues and Rap no longer land
 * on the generic 120 BPM / 104-bar fallback.
 */
describe('AiProduceService genre wiring', () => {
  let service: AiProduceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AiProduceService,
        { provide: AiBeatGeneratorService, useValue: {} },
        { provide: SongwritingAssistantService, useValue: {} },
        { provide: AiMixAssistantService, useValue: {} },
        { provide: ReleasePipelineService, useValue: {} },
        { provide: MusicManagerService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: LoggingService, useValue: {} },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });
    service = TestBed.inject(AiProduceService);
  });

  it.each([
    // genre, catalog BPM (midpoint), catalog energy, catalog structure bars
    ['Country', 97, 0.6, 104],
    ['Blues', 90, 0.5, 68],
    ['Rap', 92, 0.72, 88],
  ])(
    'builds %s from the catalog, not the 120 BPM fallback',
    (genre, bpm, energy, bars) => {
      const idea = service.applyIdea({
        prompt: 'a new song',
        genre: genre as string,
        // A neutral mood keeps suggestEnergy on the genre's own value.
        mood: 'warm',
      });

      expect(idea.bpm).toBe(bpm);
      expect(idea.energy).toBe(energy);
      expect(idea.estimatedBars).toBe(bars);
      expect(idea.bpm).not.toBe(120);
    }
  );

  it('blends tempo and energy for a hybrid instead of dropping the second half', () => {
    const idea = service.applyIdea({
      prompt: 'a new song',
      genre: 'Country Trap',
      mood: 'warm',
    });

    // Country [76,118] pulled 35% toward Hip Hop [84,100].
    expect(idea.bpm).toBe(96);
    expect(idea.energy).toBe(0.64);
    expect(idea.estimatedBars).toBe(104);
  });
});
