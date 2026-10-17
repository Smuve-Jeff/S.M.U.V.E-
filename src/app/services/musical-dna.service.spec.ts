import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MusicalDnaService } from './musical-dna.service';
import { UserProfileService } from './user-profile.service';
import { DNA_EVENT_CAP, DNA_VERSION } from '../types/musical-dna.types';
import type { UserProfile } from '../types/profile.types';

/*
 * This file pins the *facade* contract only — reading the live profile, storing
 * one learned signal, and clearing the stored log.
 *
 * The engine itself (axis scoring, drift, adaptations/protections, lesson
 * planning, the prompt context and the recency-weighted cap) is pure logic in
 * `types/musical-dna.types.ts` and is covered there in
 * `musical-dna.types.spec.ts`. Testing it again through this facade duplicated
 * coverage for methods the facade no longer exposes (`record`, `refresh`,
 * `promptBlock`, `lessons`, `protections`, `explain`) and left the suite stale
 * after the engine was moved down into the types module.
 */

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
  let service: MusicalDnaService;

  const build = () => {
    TestBed.configureTestingModule({
      providers: [
        MusicalDnaService,
        { provide: UserProfileService, useValue: { profile: profileSignal, updateProfile } },
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

  it('exposes the fingerprint the AI surfaces read straight from the reading', () => {
    const reading = service.reading();

    expect(service.signature()).toBe(reading.signature);
    expect(service.strengths()).toEqual(reading.strengths);
    expect(service.gaps()).toEqual(reading.gaps);
    expect(service.fidelity()).toBe(reading.fidelity);
    // An axis cannot be both a strength and a gap.
    expect(reading.strengths.filter((id) => reading.gaps.includes(id))).toEqual([]);
  });

  it('records a live signal and remembers it on the profile', async () => {
    await service.recordSignal({
      dimension: 'arrangement',
      summary: 'Section map approved',
      weight: 0.5,
    });

    const arrangement = service.reading().dimensions.find((d) => d.id === 'arrangement')!;
    expect(arrangement.observed).toBeGreaterThan(0);
    expect(updateProfile).toHaveBeenCalledTimes(1);

    const persisted = updateProfile.mock.calls[0][0].musicalDna;
    expect(persisted.version).toBe(DNA_VERSION);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.events[0].summary).toBe('Section map approved');
    // The reading is recomputed from the live profile, so the record path
    // stores evidence only — there is no snapshot to go stale.
    expect(service.state().version).toBe(DNA_VERSION);
    expect(service.state().events).toHaveLength(1);
  });

  it('keeps the evidence log bounded across a long session', async () => {
    for (let i = 0; i < DNA_EVENT_CAP + 5; i++) {
      await service.recordSignal({ dimension: 'production', summary: `rep ${i}` });
    }

    expect(service.state().events).toHaveLength(DNA_EVENT_CAP);
  });

  it('clears the learned log without inventing new evidence', async () => {
    await service.recordSignal({ dimension: 'harmony', summary: 'modal drift' });
    await service.resetBehaviorLog();

    const persisted = updateProfile.mock.calls.at(-1)![0].musicalDna;
    expect(persisted.version).toBe(DNA_VERSION);
    expect(persisted.events).toEqual([]);
    expect(service.state().events).toEqual([]);
  });

  it('does nothing when the profile never carried a learned log', async () => {
    await service.resetBehaviorLog();

    expect(updateProfile).not.toHaveBeenCalled();
  });
});
