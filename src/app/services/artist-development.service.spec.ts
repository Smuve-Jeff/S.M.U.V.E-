import { TestBed } from '@angular/core/testing';
import { ArtistDevelopmentService } from './artist-development.service';
import { UserProfileService } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';

describe('ArtistDevelopmentService (dev-hub)', () => {
  let sut: ArtistDevelopmentService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        ArtistDevelopmentService,
        {
          provide: UserProfileService,
          useValue: {
            profile: () => ({
              profileSetupCompleted: true,
              musicalJourney: { summary: 'came up playing keys' },
            }),
          },
        },
        { provide: ArtistIdentityService, useValue: {} },
      ],
    });
    sut = TestBed.inject(ArtistDevelopmentService);
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  it('upserts a PRO registration by organization (add + replace)', () => {
    sut.addProRegistration({
      organization: 'BMI',
      membershipId: 'MEM-1',
      ipiNumber: 'IPI-1',
      caeNumber: '',
      publisher: '',
      publisherIpi: '',
      registrationDate: '2026-01-01',
      status: 'active',
      territories: ['Worldwide'],
    });
    sut.addProRegistration({
      organization: 'BMI',
      membershipId: 'MEM-2',
      ipiNumber: 'IPI-2',
      caeNumber: '',
      publisher: '',
      publisherIpi: '',
      registrationDate: '2026-02-01',
      status: 'pending',
      territories: ['US'],
    });
    expect(sut.proRegistrations().length).toBe(1);
    expect(sut.proRegistrations()[0].membershipId).toBe('MEM-2');

    sut.removeProRegistration('BMI');
    expect(sut.proRegistrations().length).toBe(0);
  });

  it('appends work registrations with auto ISWC when missing', () => {
    sut.addWorkRegistration({
      iswc: 'T-123456789',
      title: 'Anthem',
      role: 'Writer',
      sharePercentage: 100,
      registrationDate: '2026-01-01',
      registeredWith: ['BMI'],
    });
    expect(sut.workRegistrations().length).toBe(1);
    expect(sut.workRegistrations()[0].title).toBe('Anthem');
  });

  it('seeds default social accounts and connect/disconnect toggles them', () => {
    sut.loadAll();
    expect(sut.socialAccounts().length).toBe(sut.SOCIAL_PLATFORMS.length);
    expect(sut.socialAccounts().every((a) => !a.connected)).toBe(true);

    const idx = sut.SOCIAL_PLATFORMS.findIndex(
      (p) => p.platform === 'Instagram'
    );
    sut.connectSocialAccount(idx, 'artist_handle', 'https://instagram.com/x');
    expect(sut.socialAccounts()[idx].connected).toBe(true);
    expect(sut.socialAccounts()[idx].handle).toBe('artist_handle');

    sut.disconnectSocialAccount(idx);
    expect(sut.socialAccounts()[idx].connected).toBe(false);
    expect(sut.socialAccounts()[idx].handle).toBe('');
  });

  it('scanFingerprint scores a complete profile and clears the scanning flag', async () => {
    sut.loadAll(); // seeds default social accounts
    sut.addProRegistration({
      organization: 'ASCAP',
      membershipId: 'M1',
      ipiNumber: '',
      caeNumber: '',
      publisher: '',
      publisherIpi: '',
      registrationDate: '2026-01-01',
      status: 'active',
      territories: ['Worldwide'],
    });
    sut.connectSocialAccount(0, 'ig', 'https://ig.com/x');
    sut.connectSocialAccount(1, 'tt', 'https://tt.com/x');
    sut.connectSocialAccount(2, 'yt', 'https://yt.com/x');

    jest.useFakeTimers();
    const promise = sut.scanFingerprint();
    expect(sut.isScanning()).toBe(true);
    jest.advanceTimersByTime(1500);
    const fp = await promise;

    expect(sut.isScanning()).toBe(false);
    expect(fp.completeness).toBeGreaterThan(0);
    expect(fp.platformsConnected).toBe(3);
    expect(fp.trustScore).toBeGreaterThanOrEqual(0);
    expect(fp.trustScore).toBeLessThanOrEqual(100);
    expect(fp.lastScan).toBeTruthy();
    // Profile is complete + PRO registered → those checklist items are done.
    const profileItem = fp.improvementChecklist.find((c) =>
      c.item.includes('Complete artist profile setup')
    );
    expect(profileItem?.completed).toBe(true);
    const proItem = fp.improvementChecklist.find((c) =>
      c.item.includes('Register with a PRO')
    );
    expect(proItem?.completed).toBe(true);
    // With 3 platforms connected there is no low-presence risk flag.
    expect(fp.riskFlags.some((f) => f.includes('Low social media presence'))).toBe(
      false
    );
  });

  it('catalog add/select/remove and track-stage cycling stay in sync', () => {
    const id = sut.generateReleaseId();
    expect(id).toMatch(/^rel_/);

    sut.addRelease({
      id,
      name: 'Debut EP',
      type: 'EP',
      description: '',
      status: 'Planning',
      tracks: [
        {
          id: 'trk-1',
          title: 'First',
          status: 'Pending',
          stages: {
            instrumental: 'Pending',
            lyrics: 'Pending',
            vocals: 'Pending',
            mixing: 'Pending',
            mastering: 'Pending',
          },
        },
      ],
      credits: { artistName: 'Artist', collaborators: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      artworkUrl: '',
      visualsUrl: '',
    });

    sut.selectRelease(id);
    expect(sut.selectedRelease()?.name).toBe('Debut EP');

    sut.updateTrackStatus(id, 'trk-1', 'lyrics', 'In Progress');
    expect(sut.selectedRelease()?.tracks[0].stages.lyrics).toBe('In Progress');

    sut.removeRelease(id);
    expect(sut.catalog().length).toBe(0);
    expect(sut.selectedRelease()).toBeNull();
  });

  it('loadAll restores persisted registrations and defaults socials otherwise', () => {
    sut.addProRegistration({
      organization: 'SESAC',
      membershipId: 'S1',
      ipiNumber: '',
      caeNumber: '',
      publisher: '',
      publisherIpi: '',
      registrationDate: '2026-01-01',
      status: 'active',
      territories: ['Worldwide'],
    });

    const reloaded = TestBed.inject(ArtistDevelopmentService);
    reloaded.loadAll();
    expect(reloaded.proRegistrations().length).toBe(1);
    expect(reloaded.proRegistrations()[0].organization).toBe('SESAC');
    // No stored socials → the default platform list is seeded.
    expect(reloaded.socialAccounts().length).toBe(reloaded.SOCIAL_PLATFORMS.length);
  });
});