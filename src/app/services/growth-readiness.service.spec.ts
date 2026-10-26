import { TestBed } from '@angular/core/testing';
import { GrowthReadinessService } from './growth-readiness.service';
import { initialProfile } from './user-profile.service';
import type { UserProfile } from '../types/profile.types';

/**
 * The point of this model is what it refuses to say: no listener counts, no
 * conversion rate, no percentage standing in for a missing dimension.
 */
describe('GrowthReadinessService', () => {
  let service: GrowthReadinessService;

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const dimension = (value: UserProfile, id: string) =>
    service.assess(value).dimensions.find((entry) => entry.id === id)!;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GrowthReadinessService] });
    service = TestBed.inject(GrowthReadinessService);
  });

  it('reports every dimension as missing on an empty record, with no score', () => {
    const readiness = service.assess(profile());

    expect(readiness.total).toBe(6);
    expect(readiness.evidenced).toBe(0);
    expect(readiness.partial).toBe(0);
    expect(readiness.dimensions.every((entry) => entry.state === 'missing')).toBe(true);
    expect(readiness.notes[0]).toContain('No listener, follower, or conversion feed');
    expect(readiness.notes[1]).toContain('reported as missing');
    // A score is exactly what this model must not invent.
    expect('score' in readiness).toBe(false);
    expect(readiness.dimensions.every((entry) => !('score' in entry))).toBe(true);
  });

  it('counts only the evidence that is actually recorded', () => {
    const readiness = service.assess(
      profile({
        website: 'https://nova.example',
        pressGallery: ['press-01.png'],
        performancesPerYear: '18',
        touringDetails: { isTourReady: 'Regional Ready', regions: ['Midwest'], hasBackline: 'Yes' } as any,
        musicalJourney: {
          ...initialProfile.musicalJourney,
          contentStrategy: 'weekly studio notes',
          collaborationGoals: 'a live drummer and a mix engineer',
          musicBlueprint: {
            ...initialProfile.musicalJourney.musicBlueprint,
            audienceProfile: 'Late-night deep listeners',
          },
        },
      } as UserProfile)
    );

    expect(readiness.evidenced).toBe(6);
    expect(readiness.partial).toBe(0);
    expect(dimension(profile({ website: 'https://nova.example' }), 'owned-channel').evidence[0]).toBe(
      'https://nova.example'
    );
    expect(readiness.notes.some((note) => note.includes('half recorded'))).toBe(false);
  });

  it('names the rented platform when there is no channel the artist owns', () => {
    const entry = dimension(
      profile({
        officialArtistProfiles: [
          { id: 'spotify-for-artists', destinationId: 'spotify-for-artists', url: 'https://artists.spotify.com/x', verified: true },
          { id: 'distrokid', destinationId: 'distrokid', url: 'https://distrokid.com/x' },
        ] as any,
      }),
      'owned-channel'
    );

    expect(entry.state).toBe('partial');
    expect(entry.evidence[0]).toContain('2 official profiles recorded, 1 verified');
    expect(entry.evidence[0]).toContain('none is a channel you own');
    expect(entry.gap).toContain('one sign-up field');
  });

  it('splits live readiness into the half that is recorded', () => {
    const played = dimension(profile({ performancesPerYear: '12' }), 'live');
    expect(played.state).toBe('partial');
    expect(played.evidence).toEqual(['12 performances per year recorded.']);
    expect(played.gap).toContain('how ready the live show is');

    const ready = dimension(
      profile({ touringDetails: { isTourReady: 'Regional Ready' } as any }),
      'live'
    );
    expect(ready.state).toBe('partial');
    expect(ready.evidence).toEqual(['Tour readiness: Regional Ready.']);
    expect(ready.gap).toContain('Play one small room');
  });

  it('treats an unreadable performance figure as nothing recorded', () => {
    const entry = dimension(profile({ performancesPerYear: 'a few' }), 'live');

    expect(entry.state).toBe('missing');
    expect(entry.evidence).toEqual([]);
  });

  it('ignores whitespace-only answers instead of counting them as declared', () => {
    const entry = dimension(
      profile({
        website: '   ',
        musicalJourney: {
          ...initialProfile.musicalJourney,
          musicBlueprint: {
            ...initialProfile.musicalJourney.musicBlueprint,
            audienceProfile: '',
          },
        },
      } as UserProfile),
      'audience'
    );

    expect(entry.state).toBe('missing');
    expect(entry.gap).toContain('who the music is for');
  });

  it('survives a profile with no nested objects', () => {
    expect(() => service.assess({ primaryGenre: 'Hip Hop' } as UserProfile)).not.toThrow();
    expect(service.assess(null).dimensions).toHaveLength(6);
  });
});
