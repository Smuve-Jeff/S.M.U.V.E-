import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComposerUplinkService } from '../composer/composer-uplink.service';
import { ArtistAdaptiveEngineService } from './artist-adaptive-engine.service';
import { ArtistIdentityService } from './artist-identity.service';
import { SocialNetworkingService } from './social-networking.service';
import { readArtistProfile } from './artist-profile-read';
import { buildArtistMusicContext } from '../types/profile.types';
import {
  UserProfileService,
  initialProfile,
  UserProfile,
} from './user-profile.service';
import { OfflineSyncService } from './offline-sync.service';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { PeerNetworkingService } from './peer-networking.service';
import { ChallengeInboxService } from './challenge-inbox.service';
import { TokenService } from './token.service';

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    connected: true,
    on: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

/**
 * The genre hold is only real if every surface that claims to know the
 * artist's genre makes the same call. This contract pins the read-back, the
 * adaptive engine, the composer gate, the identity graph, social presence and
 * the AI prompt to one profile, in both states: uncommitted with the untouched
 * default, then committed with a declared genre.
 */
describe('Genre hold contract', () => {
  let profile: ReturnType<typeof signal<UserProfile>>;
  let engine: ArtistAdaptiveEngineService;
  let composer: ComposerUplinkService;
  let identity: ArtistIdentityService;
  let social: SocialNetworkingService;

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  beforeEach(() => {
    const seeded = clone(initialProfile);
    seeded.artistName = 'Named Artist';
    seeded.settings.security = {
      ...seeded.settings.security,
      shareProfileAnswersWithAi: true,
      shareProfileInDiscovery: true,
    };
    profile = signal(seeded);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ArtistIdentityService,
        { provide: UserProfileService, useValue: { profile } },
        { provide: OfflineSyncService, useValue: {} },
        {
          provide: LoggingService,
          useValue: {
            log: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
        { provide: DatabaseService, useValue: {} },
        {
          provide: PeerNetworkingService,
          useValue: { handleSignal: jest.fn() },
        },
        {
          provide: ChallengeInboxService,
          useValue: {
            bindSocket: jest.fn(),
            markFriendRequestsRead: jest.fn(),
            removeFriendRequestsFrom: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: { jwtToken: signal<string | null>(null) },
        },
      ],
    });

    engine = TestBed.inject(ArtistAdaptiveEngineService);
    composer = TestBed.inject(ComposerUplinkService);
    identity = TestBed.inject(ArtistIdentityService);
    social = TestBed.inject(SocialNetworkingService);
    TestBed.flushEffects();
  });

  /** Every surface, read from the same current profile. */
  const surfaces = () => {
    const current = profile();
    return {
      read: readArtistProfile(current),
      adaptation: engine.adaptationState(),
      gate: composer.gate(),
      identityGenres: identity.buildIdentitySnapshot(current).core.genres ?? [],
      presence: (social as any).presenceMetadata() as {
        primaryGenre?: string;
      },
      prompt: buildArtistMusicContext(current),
    };
  };

  it('agrees on held and committed genre for the same profile', () => {
    const held = surfaces();

    expect(held.read.genre).toBe('');
    expect(held.adaptation.genreAdviceHeld).toBe(true);
    expect(held.gate.genre).toBeNull();
    expect(held.gate.genreLabel).toBe('Not declared yet');
    expect(held.identityGenres).toEqual([]);
    expect(held.presence.primaryGenre).toBeUndefined();
    expect(held.prompt).toContain('- Genre: Not declared yet');
    expect(held.prompt).not.toContain('Genre: Hip Hop');

    profile.update((current) => ({
      ...current,
      primaryGenre: 'Country',
      profileSetupCompleted: true,
      musicalJourney: {
        ...current.musicalJourney,
        signatureSound: 'steel guitar and dry snares',
      },
    }));

    const committed = surfaces();

    expect(committed.read.genre).toBe('Country');
    expect(committed.adaptation.genreAdviceHeld).toBe(false);
    expect(committed.adaptation.genreProfile.label).toContain('Country');
    expect(committed.gate.genre).not.toBeNull();
    expect(committed.gate.genre?.label).toContain('Country');
    expect(committed.gate.ready).toBe(true);
    expect(committed.identityGenres).toContain('Country');
    expect(committed.presence.primaryGenre).toBe('Country');
    expect(committed.prompt).toContain('- Genre: Country');
  });
});
