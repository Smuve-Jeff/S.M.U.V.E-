import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { SmuveCareerDirectorService } from './smuve-career-director.service';
import { UserProfileService } from './user-profile.service';
import { ArtistProfileFinetuneService } from './artist-profile-finetune.service';
import { SpeechSynthesisService } from './speech-synthesis.service';

const knowledge = {
  genre: '',
  sonic: { subgenres: [], influences: [] },
  pathway: {},
  operations: { catalogSize: 0 },
  business: { streams: [] },
  presence: { track: 'emerging', coverage: 0 },
};

describe('SmuveCareerDirectorService', () => {
  let service: SmuveCareerDirectorService;
  let events: Subject<unknown>;
  let speech: { speak: jest.Mock };

  beforeEach(() => {
    events = new Subject<unknown>();
    speech = { speak: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: { events, url: '/hub' },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile: () => ({
              artistName: 'Test Artist',
              primaryGenre: 'trap',
              settings: {
                ai: { aiProfanityEnabled: true, commanderPersona: 'S.M.U.V.E. Prime' },
                security: {
                  shareProfileAnswersWithAi: true,
                  hideSensitiveProfileDetails: false,
                },
              },
              musicalJourney: {},
            }),
          },
        },
        {
          provide: ArtistProfileFinetuneService,
          useValue: { knowledge: () => knowledge },
        },
        { provide: SpeechSynthesisService, useValue: speech },
      ],
    });
    service = TestBed.inject(SmuveCareerDirectorService);
  });

  it('follows the artist as the route changes', () => {
    expect(service.currentSurface()).toBe('overview');

    events.next(new NavigationEnd(1, '/mixer', '/mixer'));
    expect(service.currentSurface()).toBe('mixing');
    expect(service.surfaceIntel().surfaceLabel).toBe('Mix Bus');

    events.next(new NavigationEnd(2, '/legal', '/legal'));
    expect(service.currentSurface()).toBe('legal');
    expect(service.surfaceIntel().surfaceLabel).toBe('Legal Desk');

    events.next(new NavigationEnd(3, '/case-file', '/case-file'));
    expect(service.currentSurface()).toBe('case-file');
    expect(service.surfaceIntel().surfaceLabel).toBe('Case File');
  });

  it('owns a real Promotion lens instead of collapsing it into marketing', () => {
    const intel = service.surfaceIntel('promotion');
    expect(intel.surfaceLabel).toBe('Promotion');
    expect(intel.currency).toContain('qualified attention');
    expect(service.suggestedPrompts('promotion').length).toBeGreaterThan(0);
  });

  it('returns the workspace that owns each room for case-file jumps', () => {
    expect(service.homeRouteFor('mixing')).toBe('/mixer');
    expect(service.homeRouteFor('legal')).toBe('/business-suite');
    expect(service.homeRouteFor('case-file')).toBe('/case-file');
    expect(service.homeRouteFor('community')).toBe('/networking');
  });

  it('announces a room in one of that room’s voices, with shape-shifting on', () => {
    const presence = service.announce('legal');

    expect(speech.speak).toHaveBeenCalledTimes(1);
    const [line, options] = speech.speak.mock.calls[0];
    expect(line).toBe(presence.line);
    expect(options.shapeShift).toBe(true);
    expect([
      'Baritone Authority (Male)',
      'Androgynous Oracle',
      'Mezzo Strategist (Female)',
    ]).toContain(presence.archetype);
  });
});
