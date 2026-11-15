import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { SmuveMemoryService } from './smuve-memory.service';
import { LoggingService } from './logging.service';
import {
  ArtistRelationshipService,
  type RelationshipQuestion,
} from './artist-relationship.service';

describe('ArtistRelationshipService', () => {
  const profileData = signal<any>(null);
  const memoryEntries = signal<any[]>([]);
  let updateProfile: jest.Mock;

  function seedProfile(overrides: any = {}) {
    profileData.set({
      id: 'artist_1',
      artistName: 'New Artist',
      primaryGenre: '',
      musicalJourney: {},
      settings: { security: {} },
      ...(overrides.musicalJourney || overrides.settings
        ? {}
        : overrides),
      ...overrides,
      musicalJourney: {
        ...(overrides.musicalJourney ?? {}),
      },
      settings: {
        security: {},
        ...(overrides.settings ?? {}),
      },
    });
  }

  beforeEach(() => {
    profileData.set(null);
    memoryEntries.set([]);
    updateProfile = jest.fn(async (patch: any) => {
      const current = profileData() ?? {};
      profileData.set({ ...current, ...patch });
      return true;
    });

    TestBed.configureTestingModule({
      providers: [
        ArtistRelationshipService,
        {
          provide: UserProfileService,
          useValue: { profile: profileData, updateProfile },
        },
        {
          provide: SmuveMemoryService,
          useValue: { entries: memoryEntries },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
  });

  it('scores a blank profile near zero and calls the artist a stranger', () => {
    seedProfile();
    const sut = TestBed.inject(ArtistRelationshipService);
    expect(sut.completeness()).toBeLessThan(15);
    expect(sut.stage()).toBe('stranger');
  });

  it('opens the interview with the genre question', () => {
    seedProfile();
    const sut = TestBed.inject(ArtistRelationshipService);
    const next: RelationshipQuestion | null = sut.nextQuestion();
    expect(next?.id).toBe('genre');
    expect(next?.ask).toContain('genre');
  });

  it('writes an interview answer into the profile and evidences DNA', async () => {
    seedProfile();
    const sut = TestBed.inject(ArtistRelationshipService);
    const ok = await sut.answerCurrentQuestion('Drill');
    expect(ok).toBe(true);
    expect(profileData().primaryGenre).toBe('Drill');
    expect(profileData().musicalDna?.events?.length).toBe(1);
    expect(profileData().musicalDna.events[0].source).toBe('questionnaire');
    // The ladder advances past the answered rung.
    expect(sut.nextQuestion()?.id).not.toBe('genre');
  });

  it('rejects blank answers without touching the profile', async () => {
    seedProfile();
    const sut = TestBed.inject(ArtistRelationshipService);
    await expect(sut.answerCurrentQuestion('   ')).resolves.toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('deepens the stage as the profile fills and history grows', () => {
    seedProfile({
      artistName: 'Kairo',
      primaryGenre: 'Drill',
      musicalJourney: {
        experienceLevel: 'Intermediate',
        roles: ['Rapper', 'Producer'],
        musicalInfluences: ['Chief Keef'],
        currentFocus: 'Debut tape',
        biggestChallenge: 'Mixing 808s',
        preferredBpmRange: '140-150',
        songwritingStyle: 'Beat first',
        productionPhilosophy: 'Feel over perfection',
        signatureSound: 'Sliding 808s under deadpan flows',
        releaseVelocity: 'Singles monthly',
        primarySuccessMetric: 'Playlist adds',
        subgenres: ['UK drill'],
      },
    });
    memoryEntries.set([
      { id: 'm1' },
      { id: 'm2' },
      { id: 'm3' },
      { id: 'm4' },
      { id: 'm5' },
    ]);
    const sut = TestBed.inject(ArtistRelationshipService);
    expect(sut.completeness()).toBeGreaterThanOrEqual(55);
    expect(['collaborator', 'confidant']).toContain(sut.stage());
  });

  it('learns from behaviour into the DNA log', async () => {
    seedProfile({ primaryGenre: 'Drill' });
    const sut = TestBed.inject(ArtistRelationshipService);
    const ok = await sut.observe({
      dimension: 'production',
      summary: 'Finished a 12-track session at 142 BPM',
      weight: 0.4,
    });
    expect(ok).toBe(true);
    const events = profileData().musicalDna?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('behaviour');
    expect(events[0].summary).toContain('142 BPM');
  });

  it('keeps private profiles out of the brief but still names the gap', () => {
    seedProfile();
    const sut = TestBed.inject(ArtistRelationshipService);
    const brief = sut.brief();
    expect(brief).toContain('STRANGER');
    expect(brief).toContain('PRIVATE');
    expect(brief).toContain('Genre');
    expect(brief).toContain('What lane are we running in');
  });

  it('briefs a veteran with known facts and veteran pressure', () => {
    seedProfile({
      artistName: 'Kairo',
      primaryGenre: 'Drill',
      musicalJourney: {
        experienceLevel: 'Advanced',
        currentFocus: 'Debut tape',
        biggestChallenge: 'Mixing 808s',
      },
      settings: {
        security: {
          shareProfileAnswersWithAi: true,
          shareProfileInDiscovery: true,
        },
      },
    });
    const sut = TestBed.inject(ArtistRelationshipService);
    const brief = sut.brief();
    expect(brief).toContain('Genre');
    expect(brief).toContain('veteran pressure');
  });
});

describe('ArtistRelationshipService interview flow', () => {
  const profileData = signal<any>(null);
  let updateProfile: jest.Mock;

  beforeEach(() => {
    profileData.set({
      id: 'artist_1',
      artistName: 'New Artist',
      primaryGenre: '',
      musicalJourney: {},
      settings: { security: {} },
    });
    updateProfile = jest.fn(async (patch: any) => {
      const current = profileData() ?? {};
      profileData.set({ ...current, ...patch });
      return true;
    });

    TestBed.configureTestingModule({
      providers: [
        ArtistRelationshipService,
        { provide: UserProfileService, useValue: { profile: profileData, updateProfile } },
        { provide: SmuveMemoryService, useValue: { entries: signal([]) } },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    });
  });

  it('reports interview progress as rungs are filled', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    expect(sut.interviewProgress()).toEqual({ answered: 0, total: 12 });
    await sut.answerCurrentQuestion('Drill');
    expect(sut.interviewProgress().answered).toBe(1);
  });

  it('skips the current question without writing an answer', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    const skipped = sut.skipCurrentQuestion();
    expect(skipped?.id).toBe('genre');
    expect(profileData().primaryGenre).toBe('');
    expect(sut.nextQuestion()?.id).toBe('experience');
  });

  it('ends the ladder when every rung is filled', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    profileData.set({
      id: 'artist_1',
      artistName: 'Kairo',
      primaryGenre: 'Drill',
      settings: { security: {} },
      musicalJourney: {
        experienceLevel: 'Intermediate',
        roles: ['Rapper'],
        musicalInfluences: ['Chief Keef'],
        currentFocus: 'Debut tape',
        biggestChallenge: 'Mixing 808s',
        preferredBpmRange: '140-150',
        songwritingStyle: 'Beat first',
        signatureSound: 'Deadpan flows',
        collaborationGoals: ['A vocalist'],
        releaseVelocity: 'Monthly',
        musicBlueprint: { referenceTracks: ['Track A', 'Track B'] },
      },
    });
    expect(sut.nextQuestion()).toBeNull();
    expect(sut.skipCurrentQuestion()).toBeNull();
    expect(sut.interviewProgress()).toEqual({ answered: 12, total: 12 });
  });
});

describe('ArtistRelationshipService interview undo', () => {
  const profileData = signal<any>(null);
  let updateProfile: jest.Mock;

  beforeEach(() => {
    profileData.set({
      id: 'artist_1',
      artistName: 'New Artist',
      primaryGenre: '',
      musicalJourney: {},
      settings: { security: {} },
    });
    updateProfile = jest.fn(async (patch: any) => {
      const current = profileData() ?? {};
      const next = { ...current, ...patch };
      // Mirror the real service: musicalDna replaces wholesale.
      profileData.set(next);
      return true;
    });

    TestBed.configureTestingModule({
      providers: [
        ArtistRelationshipService,
        { provide: UserProfileService, useValue: { profile: profileData, updateProfile } },
        { provide: SmuveMemoryService, useValue: { entries: signal([]) } },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    });
  });

  it('reverts the field, drops the DNA event and reopens the rung', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    expect(await sut.answerCurrentQuestion('Drill', { messageId: 'note-1' })).toBe(true);
    expect(profileData().primaryGenre).toBe('Drill');
    const eventsAfter = profileData().musicalDna?.events?.length ?? 0;
    expect(eventsAfter).toBe(1);

    const undone = await sut.undoInterviewAnswer('note-1');
    expect(undone.ok).toBe(true);
    expect(profileData().primaryGenre).toBe('');
    expect(profileData().musicalDna?.events ?? []).toHaveLength(0);
    // The rung reopened — the interview asks genre again.
    expect(sut.nextQuestion()?.id).toBe('genre');
  });

  it('refuses an older note once a newer answer replaced it', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    await sut.answerCurrentQuestion('Drill', { messageId: 'note-1' });
    await sut.answerCurrentQuestion('Intermediate', { messageId: 'note-2' });

    const undone = await sut.undoInterviewAnswer('note-1');
    expect(undone.ok).toBe(false);
    expect(undone.reason).toContain('profile editor');
    // The newer truth stands.
    expect(profileData().musicalJourney.experienceLevel).toBe('Intermediate');
  });

  it('refuses when the field already moved on elsewhere', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    await sut.answerCurrentQuestion('Drill', { messageId: 'note-1' });
    profileData.set({ ...profileData(), primaryGenre: 'Hand-edited' });

    const undone = await sut.undoInterviewAnswer('note-1');
    expect(undone.ok).toBe(false);
    expect(profileData().primaryGenre).toBe('Hand-edited');
  });
});

describe('ArtistRelationshipService interview marker', () => {
  const profileData = signal<any>(null);

  beforeEach(() => {
    profileData.set({
      id: 'artist_1',
      artistName: 'New Artist',
      primaryGenre: '',
      musicalJourney: {},
      settings: { security: {} },
    });
    TestBed.configureTestingModule({
      providers: [
        ArtistRelationshipService,
        {
          provide: UserProfileService,
          useValue: { profile: profileData, updateProfile: jest.fn(async () => true) },
        },
        { provide: SmuveMemoryService, useValue: { entries: signal([]) } },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    });
  });

  it('briefs the live rung with a verbatim marker the model must echo', async () => {
    const sut = TestBed.inject(ArtistRelationshipService);
    const first = sut.nextQuestion()!;
    expect(sut.brief()).toContain(`[iq:${first.id}]`);

    await sut.answerCurrentQuestion('Drill', {});
    const second = sut.nextQuestion()!;
    expect(second.id).not.toBe(first.id);
    expect(sut.brief()).toContain(`[iq:${second.id}]`);
    expect(sut.brief()).not.toContain(`[iq:${first.id}]`);
  });
});
