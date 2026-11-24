import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistIdentityService } from './artist-identity.service';
import { UserProfileService } from './user-profile.service';
import { OfflineSyncService } from './offline-sync.service';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { initialProfile } from '../types/profile.types';

describe('ArtistIdentityService genre hold', () => {
  let service: ArtistIdentityService;

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const profileOf = (overrides: Record<string, unknown>) => ({
    ...clone(initialProfile),
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ArtistIdentityService,
        {
          provide: UserProfileService,
          useValue: { profile: signal(profileOf({})) },
        },
        { provide: OfflineSyncService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: DatabaseService, useValue: {} },
      ],
    });
    service = TestBed.inject(ArtistIdentityService);
  });

  it('does not put the untouched default genre in the identity graph', () => {
    const snapshot = service.buildIdentitySnapshot(
      profileOf({ artistName: 'Named Artist' }) as any
    );

    expect(snapshot.core.genres).not.toContain('Hip Hop');
  });

  it('keeps the committed genre in the identity graph', () => {
    const snapshot = service.buildIdentitySnapshot(
      profileOf({
        artistName: 'Named Artist',
        primaryGenre: 'Country',
        profileSetupCompleted: true,
      }) as any
    );

    expect(snapshot.core.genres).toContain('Country');
  });
});
