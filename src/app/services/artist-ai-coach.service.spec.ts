import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistAiCoachService } from './artist-ai-coach.service';
import { ArtistAdaptiveEngineService } from './artist-adaptive-engine.service';
import { ArtistProfileFinetuneService } from './artist-profile-finetune.service';
import { MusicalDnaService } from './musical-dna.service';
import { UserProfileService } from './user-profile.service';
import type { UserProfile } from './user-profile.service';
import { ARTIST_ROLE_IDS } from './artist-role.registry';

const profile = (overrides: Record<string, unknown> = {}): UserProfile =>
  ({
    artistName: 'North Star',
    primaryGenre: 'Country',
    profileSetupCompleted: true,
    daw: ['Reaper'],
    equipment: ['Condenser mic'],
    expertise: {
      production: 6,
      songwriting: 5,
      business: 3,
      legal: 2,
      performance: 4,
      marketing: 4,
    },
    musicalJourney: {
      signatureSound: 'Steel guitar and close-mic breath',
      productionPhilosophy: 'Leave the room in',
      songwritingProcess: 'Start with a place',
      preferredBpmRange: '90-110',
      incomeStreams: ['sync', 'bandcamp'],
      biggestChallenge: 'over-polishing',
      currentFocus: 'finish the EP',
      releaseVelocity: 'quarterly',
      primarySuccessMetric: 'repeat listeners',
      musicBlueprint: {
        signatureTension: 'home versus road',
        livedWorldDetails: 'porch light and diesel',
        vocalDelivery: 'plainspoken',
        rhythmicFeel: 'train shuffle',
        harmonicLanguage: 'open fifths',
        arrangementApproach: 'verse-forward',
        sonicNonNegotiables: 'keep the room tone',
        recordingPriorities: ['natural dynamics'],
        mixingPriorities: ['vocal depth'],
        lyricalThemes: ['distance', 'work'],
        audienceProfile: 'long-haul listeners',
        artisticIntent: 'make the ordinary feel seen',
        recognitionCue: 'the steel guitar slide',
      },
    },
    catalog: [{ id: 'w1', title: 'Diesel Light' }],
    settings: {
      security: {
        shareProfileAnswersWithAi: true,
        hideSensitiveProfileDetails: false,
      },
    },
    ...overrides,
  }) as unknown as UserProfile;

describe('ArtistAiCoachService expert panel', () => {
  let service: ArtistAiCoachService;
  let profileSignal: ReturnType<typeof signal<UserProfile>>;

  beforeEach(() => {
    profileSignal = signal<UserProfile>(profile());
    TestBed.configureTestingModule({
      providers: [
        ArtistAiCoachService,
        ArtistAdaptiveEngineService,
        ArtistProfileFinetuneService,
        MusicalDnaService,
        { provide: UserProfileService, useValue: { profile: profileSignal } },
      ],
    });
    service = TestBed.inject(ArtistAiCoachService);
  });

  it('adds engineer, teacher, coach and CEO briefs to the artist panel', () => {
    const prompts = service.coachState().personalized.coachPrompts;
    const roles = prompts.map((prompt) => prompt.role);

    expect(roles).toEqual(
      expect.arrayContaining(['engineer', 'teacher', 'coach', 'ceo'])
    );
    // The panel renders with one Angular track key per role.
    expect(new Set(roles).size).toBe(roles.length);
    // Every card names a role the shared registry owns, so a new panel role
    // cannot appear without a directive and label behind it.
    for (const role of roles) {
      expect(ARTIST_ROLE_IDS).toContain(role);
    }

    const engineer = prompts.find((prompt) => prompt.role === 'engineer')!;
    expect(engineer.title).toContain('Country');
    expect(engineer.context).toContain('Reaper');
    expect(engineer.actionItems.length).toBeGreaterThan(0);

    const teacher = prompts.find((prompt) => prompt.role === 'teacher')!;
    expect(teacher.prompt).toContain('lesson');
    expect(teacher.actionItems.at(-1)).toContain('teach it back');

    const coach = prompts.find((prompt) => prompt.role === 'coach')!;
    expect(coach.prompt).toContain('over-polishing');

    const ceo = prompts.find((prompt) => prompt.role === 'ceo')!;
    expect(ceo.prompt).toContain('sync');
    expect(ceo.context).toContain('not incorporated');
  });

  it('holds genre-specific titles and the CEO brief until the profile is committed', () => {
    profileSignal.set(
      profile({ primaryGenre: 'Hip Hop', profileSetupCompleted: false })
    );

    const prompts = service.coachState().personalized.coachPrompts;
    const engineer = prompts.find((prompt) => prompt.role === 'engineer')!;

    // The uncommitted profile still carries its default genre, so the engineer
    // brief must not be titled as if a genre had been declared.
    expect(engineer.title).not.toContain('Country');
    expect(engineer.title).not.toContain('Hip Hop');
    expect(engineer.title).toContain('signature');
    // A foundational profile gets no CEO brief built on invented revenue.
    expect(prompts.some((prompt) => prompt.role === 'ceo')).toBe(false);
  });
});
