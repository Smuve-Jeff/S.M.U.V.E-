import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MusicalDnaService } from './musical-dna.service';
import { UserProfileService } from './user-profile.service';
import { SmuveKnowledgeEngine } from './smuve-knowledge-engine';
import { LoggingService } from './logging.service';
import { DNA_EVENT_CAP, createInitialMusicalDnaState } from '../types/musical-dna.types';
import type { UserProfile } from '../types/profile.types';

const NOW = Date.UTC(2026, 0, 15);

const baseProfile = (): UserProfile =>
  ({
    artistName: 'North Star',
    primaryGenre: 'Ambient',
    musicalJourney: {
      songwritingStyle: 'Fragments into a single arc',
      musicalInfluences: [],
      subgenres: [],
      musicBlueprint: { rhythmicFeel: 'Slow and untethered' },
    },
    settings: {
      studio: { defaultQuantize: '1/16', autoMixEnabled: false },
      audio: {},
      dj: { crossfaderCurve: 'power' },
    },
    catalog: [],
    recommendationHistory: [],
    expertise: {},
  }) as unknown as UserProfile;

describe('MusicalDnaService', () => {
  let profileSignal: ReturnType<typeof signal<UserProfile>>;
  let updateProfile: jest.Mock;
  let getByCategory: jest.Mock;
  let warn: jest.Mock;
  let service: MusicalDnaService;

  const build = () => {
    TestBed.configureTestingModule({
      providers: [
        MusicalDnaService,
        { provide: UserProfileService, useValue: { profile: profileSignal, updateProfile } },
        { provide: SmuveKnowledgeEngine, useValue: { getByCategory } },
        { provide: LoggingService, useValue: { warn } },
      ],
    });
    service = TestBed.inject(MusicalDnaService);
  };

  beforeEach(() => {
    profileSignal = signal<UserProfile>(baseProfile());
    updateProfile = jest.fn(async (patch: Partial<UserProfile>) => {
      profileSignal.set({ ...profileSignal(), ...patch });
      return profileSignal();
    });
    getByCategory = jest.fn(() => []);
    warn = jest.fn();
    build();
  });

  it('reads the live profile without any cached snapshot', () => {
    expect(service.reading().dimensions).toHaveLength(8);
    expect(service.signature()).toContain('Rhythm & Groove');

    // A profile mutation is reflected immediately — no invalidation needed.
    profileSignal.set({
      ...profileSignal(),
      catalog: [
        { id: 'a', bpm: 120, key: 'F minor', releaseType: 'Single' },
        { id: 'b', bpm: 128, key: 'A minor', releaseType: 'EP' },
      ],
    } as unknown as UserProfile);

    const rhythm = service.reading().dimensions.find((d) => d.id === 'rhythm')!;
    expect(rhythm.observed).toBeGreaterThan(0);
  });

  it('learns a recorded signal and remembers it on the profile', async () => {
    const reading = await service.record({
      dimension: 'arrangement',
      summary: 'Section map approved',
      weight: 0.5,
    });

    expect(reading.dimensions.find((d) => d.id === 'arrangement')!.observed).toBeGreaterThan(0);
    expect(updateProfile).toHaveBeenCalledTimes(1);

    const persisted = updateProfile.mock.calls[0][0].musicalDna;
    expect(persisted.events).toHaveLength(1);
    expect(persisted.events[0].summary).toBe('Section map approved');
    expect(persisted.lastReading).toBeDefined();
    expect(persisted.version).toBe(1);
    // The stored snapshot is available to any surface that wants it.
    expect(service.state().events).toHaveLength(1);
  });

  it('surfaces the learned signal through the prompt block', async () => {
    await service.record({ dimension: 'audience', summary: 'first 100 listeners mapped', weight: 0.4 });

    expect(service.promptBlock()).toContain('Live signal: first 100 listeners mapped');
  });

  it('never lets a persistence failure break the reporting surface', async () => {
    updateProfile.mockRejectedValueOnce(new Error('offline'));

    await expect(
      service.record({ dimension: 'sonics', summary: 'tone locked' }),
    ).resolves.toBeDefined();
    expect(warn).toHaveBeenCalled();
  });

  it('refreshes a snapshot from the current profile', async () => {
    await service.refresh();

    const persisted = updateProfile.mock.calls[0][0].musicalDna;
    expect(persisted.version).toBe(1);
    expect(persisted.lastReading.dimensions).toHaveLength(8);
    // Refreshing must not invent evidence.
    expect(persisted.events).toEqual([]);
  });

  it('resets the learned log', async () => {
    await service.record({ dimension: 'harmony', summary: 'modal drift' });
    await service.reset();

    const persisted = updateProfile.mock.calls.at(-1)![0].musicalDna;
    expect(persisted.version).toBe(createInitialMusicalDnaState().version);
    expect(persisted.events).toEqual([]);
    expect(persisted.lastReading).toBeUndefined();
    expect(service.state().events).toEqual([]);
  });

  it('teaches from the app knowledge base when an entry matches the weak axis', async () => {
    getByCategory.mockReturnValue([
      { id: 'prod-01', title: 'Gain Staging Fundamentals', actionRequired: 'Set all faders to -6dB.' },
    ]);

    const lessons = service.lessons();

    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].action).toBe('Set all faders to -6dB.');
  });

  it('falls back to the axis coach when the knowledge base has nothing', () => {
    const lessons = service.lessons();

    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l) => l.action.length > 0)).toBe(true);
  });

  it('still teaches when the knowledge base throws', () => {
    getByCategory.mockImplementation(() => {
      throw new Error('kb offline');
    });

    expect(service.lessons().length).toBeGreaterThan(0);
  });

  it('exposes the rules it must not break and explains any axis', async () => {
    profileSignal.set({
      ...profileSignal(),
      musicalJourney: {
        ...profileSignal().musicalJourney,
        musicBlueprint: {
          rhythmicFeel: 'Slow and untethered',
          sonicNonNegotiables: 'No bright digital top end',
        },
      },
      settings: {
        ...profileSignal().settings,
        studio: { ...profileSignal().settings.studio, autoMixEnabled: true },
      },
    } as unknown as UserProfile);

    expect(service.protections().map((p) => p.id)).toContain('protect-sonic-non-negotiables');

    const rhythm = service.explain('rhythm');
    expect(rhythm?.label).toBe('Rhythm & Groove');
    expect(rhythm?.evidence.length).toBeGreaterThan(0);
    expect(service.explain('melody')).not.toBeNull();
  });

  it('keeps the evidence log bounded across a long session', async () => {
    for (let i = 0; i < DNA_EVENT_CAP + 5; i++) {
      await service.record({ dimension: 'production', summary: `rep ${i}` });
    }

    expect(service.state().events).toHaveLength(DNA_EVENT_CAP);
  });
});
