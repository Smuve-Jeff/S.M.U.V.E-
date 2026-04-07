import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ArtistIdentityService } from '../artist-identity.service';
import { UserProfileService } from '../user-profile.service';
import { OfflineSyncService } from '../offline-sync.service';
import { LoggingService } from '../logging.service';
import { DatabaseService } from '../database.service';
import { createInitialArtistIdentity } from '../../types/artist-identity.types';

describe('ArtistIdentityService', () => {
  let service: ArtistIdentityService;
  let databaseMock: {
    saveArtistIdentity: jest.Mock;
    apiUrl: string;
  };
  let offlineSyncMock: {
    queueConnectorSync: jest.Mock;
  };

  const profile = {
    id: 'artist-7',
    artistName: 'Nova Flux',
    primaryGenre: 'Electronic',
    website: 'https://novaflux.example.com',
    proName: 'Nova Flux',
    proIpi: '123456789',
    catalog: [
      { id: 'trk-1', title: 'Gravity Loop', metadata: {} },
      { id: 'trk-2', title: 'Night Driver', metadata: {} },
    ],
    marketingCampaigns: [],
    artistIdentity: createInitialArtistIdentity('Nova Flux', 'Electronic'),
  };

  beforeEach(() => {
    databaseMock = {
      saveArtistIdentity: jest.fn().mockResolvedValue(undefined),
      apiUrl: 'https://smuve.example/api',
    };
    offlineSyncMock = {
      queueConnectorSync: jest.fn().mockResolvedValue('sync-job-1'),
    };

    TestBed.configureTestingModule({
      providers: [
        ArtistIdentityService,
        {
          provide: UserProfileService,
          useValue: {
            profile: signal(profile),
          },
        },
        { provide: OfflineSyncService, useValue: offlineSyncMock },
        {
          provide: LoggingService,
          useValue: { warn: jest.fn(), info: jest.fn() },
        },
        { provide: DatabaseService, useValue: databaseMock },
      ],
    });

    service = TestBed.inject(ArtistIdentityService);
  });

  it('builds a connector-backed identity snapshot', () => {
    const snapshot = service.buildIdentitySnapshot(profile as any);

    expect(snapshot.linkedAccounts.length).toBe(6);
    expect(snapshot.fingerprint.trustScore).toBeGreaterThan(0);
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
    expect(snapshot.works.length).toBe(2);
  });

  it('persists a refreshed identity graph', async () => {
    const refreshed = await service.refreshIdentityGraph(profile as any);

    expect(databaseMock.saveArtistIdentity).toHaveBeenCalled();
    expect(refreshed.artistIdentity?.sync.lastFullRefreshAt).toBeDefined();
    expect(refreshed.artistIdentity?.auditTrail.length).toBeGreaterThan(0);
  });

  it('queues connector refresh jobs and tracks them on the profile', async () => {
    const updated = await service.queueConnectorRefresh(
      'Spotify',
      profile as any
    );

    expect(offlineSyncMock.queueConnectorSync).toHaveBeenCalledWith(
      'Spotify',
      'https://smuve.example/api/identity/artist-7/connectors/Spotify/sync',
      expect.any(Object)
    );
    expect(updated.artistIdentity?.sync.pendingTasks[0].connectorId).toBe(
      'Spotify'
    );
  });
});
