import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ComposerUplinkService } from './composer-uplink.service';
import { ArtistAdaptiveEngineService } from '../services/artist-adaptive-engine.service';
import { readArtistProfile } from '../services/artist-profile-read';
import {
  UserProfileService,
  initialProfile,
  UserProfile,
} from '../services/user-profile.service';

/**
 * The composer gate, the profile read-back and the adaptive engine all have to
 * agree on when an artist's genre is a real answer. A named but uncommitted
 * profile with the untouched default genre is exactly the case where they used
 * to disagree, so it is pinned here.
 */
describe('ComposerUplinkService genre hold', () => {
  let service: ComposerUplinkService;
  let engine: ArtistAdaptiveEngineService;
  let profile: ReturnType<typeof signal<UserProfile>>;

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  beforeEach(() => {
    const seeded = clone(initialProfile);
    seeded.settings.security = {
      ...seeded.settings.security,
      shareProfileAnswersWithAi: true,
    };
    profile = signal(seeded);

    TestBed.configureTestingModule({
      providers: [{ provide: UserProfileService, useValue: { profile } }],
    });

    service = TestBed.inject(ComposerUplinkService);
    engine = TestBed.inject(ArtistAdaptiveEngineService);
  });

  it('holds the default genre in the gate and the read-back for a named, uncommitted artist', () => {
    profile.update((current) => ({ ...current, artistName: 'Named Artist' }));

    const gate = service.gate();
    expect(gate.ready).toBe(false);
    expect(gate.blockers.map((blocker) => blocker.id)).toContain('interview');
    // It must not claim the genre cannot be read: it can, the answer is just
    // not committed yet.
    expect(gate.blockers.map((blocker) => blocker.id)).not.toContain(
      'genre-unresolved'
    );
    expect(gate.genre).toBeNull();
    expect(gate.genreLabel).toBe('Not declared yet');

    expect(readArtistProfile(profile()).genre).toBe('');
    expect(engine.adaptationState().genreAdviceHeld).toBe(true);
  });

  it('opens the gate and the read-back together once the interview is committed', () => {
    profile.update((current) => ({
      ...current,
      artistName: 'Named Artist',
      primaryGenre: 'Hip Hop',
      profileSetupCompleted: true,
      musicalJourney: {
        ...current.musicalJourney,
        signatureSound: 'warm synth stacks and dry drums',
      },
    }));

    const gate = service.gate();
    expect(gate.ready).toBe(true);
    expect(gate.genre).not.toBeNull();
    expect(gate.genreLabel).toBe(gate.genre?.label);

    expect(readArtistProfile(profile()).genre).toBe('Hip Hop');
    expect(engine.adaptationState().genreAdviceHeld).toBe(false);
  });
});
