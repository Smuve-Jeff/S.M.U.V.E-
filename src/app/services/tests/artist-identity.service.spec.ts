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

  /**
   * Guards. The identity graph used to manufacture verification: it marked
   * Spotify and YouTube OFFICIAL for every artist, derived follower counts,
   * stream totals and post engagement from the catalogue size, and generated
   * placeholder ISRC/UPC codes. Every one of those is a claim the app had no
   * basis for, and all of them reached the artist as their own numbers.
   */
  describe('guards', () => {
    const claimed = (url: string, destinationId: string) => ({
      ...profile,
      officialArtistProfiles: [
        { id: destinationId, destinationId, url, verified: true },
      ],
    });

    it('never claims a connector the artist has not recorded', () => {
      const snapshot = service.buildIdentitySnapshot(profile as any);

      expect(snapshot.linkedAccounts.every((account) => !account.isOfficial)).toBe(
        true
      );
      expect(
        snapshot.linkedAccounts.every((account) => account.status !== 'linked')
      ).toBe(true);
      expect(
        snapshot.linkedAccounts.every(
          (account) => account.verificationTier === 'UNVERIFIED' ||
            account.verificationTier === 'CLAIMED'
        )
      ).toBe(true);
      // Each unclaimed row says so, rather than reporting a healthy connector.
      snapshot.linkedAccounts.forEach((account) => {
        expect(account.health.status).toBe('down');
        expect(account.health.latencyMs).toBe(0);
        expect(account.health.lastSyncAt).toBeUndefined();
        expect(account.health.errorMessage).toContain('not claimed');
      });
    });

    it('invents no audience metrics and no sync timestamps', () => {
      const snapshot = service.buildIdentitySnapshot(profile as any);

      snapshot.linkedAccounts.forEach((account) => {
        expect(account.metrics.followers).toBeUndefined();
        expect(account.metrics.monthlyListeners).toBeUndefined();
        expect(account.metrics.totalStreams).toBeUndefined();
        expect(account.metrics.playlistAdds).toBeUndefined();
        expect(account.metrics.engagementRate).toBeUndefined();
        expect(account.metrics.avgViews).toBeUndefined();
        expect(account.linkedAt).toBe(0);
      });

      const matrix = service.getConnectorMatrix(snapshot);
      expect(matrix.length).toBeGreaterThan(0);
      matrix.forEach((row) => {
        expect(row.followersOrListeners).toBe(0);
        expect(row.audience).toBe('not claimed');
        expect(row.connected).toBe(false);
      });

      // The marketing figures read from the same rows, so they carry nothing.
      expect(service.getSocialPlatformData(snapshot)).toEqual([]);
      expect(service.getStreamingPlatformData(snapshot)).toEqual([]);
    });

    it('generates no placeholder release identifiers', () => {
      const snapshot = service.buildIdentitySnapshot(profile as any);

      expect(snapshot.works.length).toBe(2);
      snapshot.works.forEach((work) => {
        expect(work.isrc).toBeUndefined();
        expect(work.upc).toBeUndefined();
      });
      // With nothing documented, catalogue completeness is honestly zero.
      expect(snapshot.fingerprint.catalogCompletenessScore).toBe(0);
    });

    it('claims only the connector the artist actually recorded', () => {
      const withSpotify = claimed(
        'https://artists.spotify.com/artist/novaflux',
        'spotify-for-artists'
      );
      const snapshot = service.buildIdentitySnapshot(withSpotify as any);

      const spotify = snapshot.linkedAccounts.find(
        (account) => account.platform === 'Spotify'
      )!;
      expect(spotify.status).toBe('linked');
      expect(spotify.isOfficial).toBe(true);
      expect(spotify.verificationTier).toBe('TRUSTED');
      expect(spotify.linkedAt).toBeGreaterThan(0);
      expect(spotify.health.status).toBe('healthy');
      expect(spotify.health.errorMessage).toBeUndefined();

      const youtube = snapshot.linkedAccounts.find(
        (account) => account.platform === 'YouTube'
      )!;
      expect(youtube.isOfficial).toBe(false);
      expect(youtube.status).not.toBe('linked');

      // One claimed surface out of six is what the consistency score reports.
      expect(snapshot.fingerprint.platformConsistencyScore).toBe(17);
      expect(
        service.getConnectorMatrix(snapshot).find(
          (row) => row.connector === 'Spotify'
        )?.audience
      ).toBe('no source connected');
    });

    it('does not treat an unverified link as a claim', () => {
      const unverified = {
        ...profile,
        officialArtistProfiles: [
          {
            id: 'spotify-for-artists',
            destinationId: 'spotify-for-artists',
            url: 'https://artists.spotify.com/artist/novaflux',
            verified: false,
          },
        ],
      };

      const snapshot = service.buildIdentitySnapshot(unverified as any);
      expect(
        snapshot.linkedAccounts.every((account) => account.isOfficial === false)
      ).toBe(true);
    });
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
      expect.any(Object),
      'artist-7'
    );
    expect(updated.artistIdentity?.sync.pendingTasks[0].connectorId).toBe(
      'Spotify'
    );
  });
});
