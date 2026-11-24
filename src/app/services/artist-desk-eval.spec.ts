import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistProfileFinetuneService } from './artist-profile-finetune.service';
import { UserProfileService } from './user-profile.service';
import type { UserProfile } from './user-profile.service';
import { ARTIST_ROLE_IDS } from './artist-role.registry';

/**
 * Deterministic desk fixtures. These are not model calls: they pin the brief
 * every desk would send, so a profile-logic change that silently collapses the
 * twelve voices into one generic answer fails in CI.
 */
const deskFixture = {
  artistName: 'North Star',
  primaryGenre: 'Ambient',
  profileSetupCompleted: true,
  brandVoices: ['intimate', 'cinematic'],
  strategicGoals: ['sync placements'],
  skills: ['Producer'],
  equipment: ['Portable recorder', 'Condenser mic'],
  daw: ['Reaper'],
  services: ['Bandcamp'],
  expertise: {
    production: 7,
    songwriting: 6,
    business: 3,
    legal: 2,
    performance: 4,
    marketing: 5,
  },
  proName: 'ASCAP',
  proIpi: '0011223344',
  settings: {
    security: {
      shareProfileAnswersWithAi: true,
      hideSensitiveProfileDetails: false,
    },
  },
} as unknown as UserProfile;

describe('Artist desk eval fixtures', () => {
  let service: ArtistProfileFinetuneService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ArtistProfileFinetuneService,
        {
          provide: UserProfileService,
          useValue: { profile: signal(deskFixture) },
        },
      ],
    });
    service = TestBed.inject(ArtistProfileFinetuneService);
  });

  it('gives every role a distinct, evidence-shaped brief', () => {
    const directives = ARTIST_ROLE_IDS.map(
      (role) => service.directiveFor(role).directive
    );

    expect(new Set(directives).size).toBe(ARTIST_ROLE_IDS.length);
    for (const role of ARTIST_ROLE_IDS) {
      const brief = service.directiveFor(role);
      expect(brief.directive.length).toBeGreaterThan(40);
      expect(brief.tips.length).toBeGreaterThan(0);
      expect(brief.guardrails.length).toBeGreaterThan(0);
      expect(brief.directive).not.toContain('undefined');
      expect(brief.directive).not.toContain('null');
    }
  });

  it('keeps every role anchored to the artist rather than a genre template', () => {
    for (const role of ARTIST_ROLE_IDS) {
      const text = [
        service.directiveFor(role).directive,
        ...service.directiveFor(role).tips,
      ].join(' ');

      // Reference tracks are learning references, never imitation targets.
      expect(text.toLowerCase()).not.toContain('sound exactly like');
      expect(text.toLowerCase()).not.toContain('copy this artist');
    }
  });
});
