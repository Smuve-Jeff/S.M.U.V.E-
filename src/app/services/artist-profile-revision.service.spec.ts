import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import {
  ArtistProfileRevisionService,
  profileRevisionLine,
} from './artist-profile-revision.service';

const baseProfile = {
  id: 'artist-1',
  artistName: 'North Star',
  primaryGenre: 'Ambient',
  profileSetupCompleted: true,
  expertise: { production: 4, marketing: 2 },
  catalog: [
    { id: 'w1', title: 'Window Light', releaseDate: '2025-02-01' },
    { id: 'w2', title: 'Room Tone', releaseDate: '2025-08-01' },
  ],
  musicalJourney: {
    subgenres: ['drone', 'field recording'],
    musicalInfluences: ['minimalism', 'gospel'],
    signatureSound: 'tape hiss and bowed metal',
    currentFocus: 'finish the EP',
    primarySuccessMetric: 'repeat listeners',
    musicBlueprint: {
      vocalDelivery: 'whispered',
      rhythmicFeel: 'breathing pulse',
      harmonicLanguage: 'open fifths',
      arrangementApproach: 'slow reveal',
      sonicNonNegotiables: 'keep the room tone',
      lyricalThemes: ['distance', 'care'],
      referenceTracks: ['Brian Eno — Music for Airports'],
    },
  },
} as unknown as UserProfile;

describe('ArtistProfileRevisionService', () => {
  let service: ArtistProfileRevisionService;
  let profileSignal: ReturnType<typeof signal<UserProfile>>;

  beforeEach(() => {
    localStorage.clear();
    profileSignal = signal<UserProfile>(baseProfile);
    TestBed.configureTestingModule({
      providers: [
        ArtistProfileRevisionService,
        { provide: UserProfileService, useValue: { profile: profileSignal } },
      ],
    });
    service = TestBed.inject(ArtistProfileRevisionService);
  });

  it('establishes a baseline without claiming the first read is a revision', () => {
    expect(service.takeChanges()).toBeNull();
    expect(service.takeChanges()).toBeNull();
  });

  it('reports a changed musical signal with the exact before and after', () => {
    service.takeChanges();
    profileSignal.set({
      ...baseProfile,
      musicalJourney: {
        ...(baseProfile as any).musicalJourney,
        signatureSound: 'warped tape 808s with choir pads',
      },
    } as UserProfile);

    const revision = service.takeChanges();

    expect(revision?.changes).toEqual([
      {
        label: 'signature sound',
        from: 'tape hiss and bowed metal',
        to: 'warped tape 808s with choir pads',
      },
    ]);
    expect(revision?.summary).toContain('signature sound');
    // Consumed exactly once.
    expect(service.takeChanges()).toBeNull();
  });

  it('reports a cleared answer instead of silently dropping it', () => {
    service.takeChanges();
    profileSignal.set({
      ...baseProfile,
      musicalJourney: {
        ...(baseProfile as any).musicalJourney,
        currentFocus: '',
      },
    } as UserProfile);

    const revision = service.takeChanges();

    expect(revision?.changes).toContainEqual({
      label: 'current focus',
      from: 'finish the EP',
      to: '',
    });
  });

  it('ignores a reordered list but notices a changed reference', () => {
    service.takeChanges();
    profileSignal.set({
      ...baseProfile,
      musicalJourney: {
        ...(baseProfile as any).musicalJourney,
        musicBlueprint: {
          ...(baseProfile as any).musicalJourney.musicBlueprint,
          lyricalThemes: ['care', 'distance'],
        },
      },
    } as UserProfile);
    expect(service.takeChanges()).toBeNull();

    profileSignal.set({
      ...baseProfile,
      musicalJourney: {
        ...(baseProfile as any).musicalJourney,
        musicBlueprint: {
          ...(baseProfile as any).musicalJourney.musicBlueprint,
          referenceTracks: [
            'Brian Eno — Music for Airports',
            'Arthur Russell — World of Echo',
          ],
        },
      },
    } as UserProfile);
    const revision = service.takeChanges();
    expect(revision?.changes).toContainEqual({
      label: 'reference tracks',
      from: 'Brian Eno — Music for Airports',
      to: 'Brian Eno — Music for Airports, Arthur Russell — World of Echo',
    });
  });

  it('names newly added works instead of only changing a count', () => {
    service.takeChanges();
    profileSignal.set({
      ...baseProfile,
      catalog: [
        ...(baseProfile as any).catalog,
        { id: 'w3', title: 'Train Platform', releaseDate: '2026-01-10' },
      ],
    } as UserProfile);

    const revision = service.takeChanges();

    expect(revision?.changes).toContainEqual({
      label: 'catalogue',
      from: '2 works',
      to: '3 works — added Train Platform',
    });
  });

  it('notices a profile committed in another session', () => {
    service.takeChanges();
    profileSignal.set({
      ...baseProfile,
      profileSetupCompleted: false,
      musicalJourney: {
        ...(baseProfile as any).musicalJourney,
        signatureSound: 'first take, no signature',
      },
    } as UserProfile);

    // A fresh instance reads the persisted baseline, not in-memory state.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ArtistProfileRevisionService,
        { provide: UserProfileService, useValue: { profile: profileSignal } },
      ],
    });
    service = TestBed.inject(ArtistProfileRevisionService);
    const revision = service.takeChanges();

    expect(revision?.changes.map((change) => change.label)).toEqual(
      expect.arrayContaining(['signature sound', 'questionnaire'])
    );
    expect(revision?.changes.find((change) => change.label === 'questionnaire')).toEqual({
      label: 'questionnaire',
      from: 'complete',
      to: 'in progress',
    });
  });

  it('peeks without consuming and renders a bounded, evidence-only receipt', () => {
    service.takeChanges();
    profileSignal.set({
      ...baseProfile,
      musicalJourney: {
        ...(baseProfile as any).musicalJourney,
        signatureSound: 'new signature',
        currentFocus: 'new focus',
      },
    } as UserProfile);

    const peeked = service.peekChanges();
    expect(peeked?.changes).toHaveLength(2);
    // Peek did not consume: the next read still returns the revision.
    expect(service.takeChanges()?.changes).toHaveLength(2);

    const line = profileRevisionLine(peeked!);
    expect(line).toContain('PROFILE REVISION');
    expect(line).toContain('signature sound: “tape hiss and bowed metal” → “new signature”');
    expect(line).toContain('current focus: “finish the EP” → “new focus”');
    expect(line).toContain('Judge the next move against this version');
  });
});
