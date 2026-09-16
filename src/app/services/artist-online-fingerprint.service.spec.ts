import { ArtistOnlineFingerprintService } from './artist-online-fingerprint.service';
import type { UserProfile } from '../types/profile.types';

/**
 * Two audiences matter here and must not be treated alike:
 *  - a beginner with nothing online, who needs an ordered start-here plan
 *  - an artist already on For Artists dashboards, PROs, and analytics,
 *    who needs verification and a consolidated official record
 */
describe('ArtistOnlineFingerprintService', () => {
  let service: ArtistOnlineFingerprintService;

  const blank = (): any => ({});

  beforeEach(() => {
    service = new ArtistOnlineFingerprintService();
  });

  const emergingArtist = (): any => ({
    artistName: 'First Take',
    primaryGenre: 'Hip Hop',
    catalog: [],
    officialArtistProfiles: [],
    artistIdentity: { linkedAccounts: [] },
    legalInfrastructure: { proAffiliation: 'None' },
  });

  /** Registry ids the artist actually links, so tests use real destinations. */
  const SPOTIFY = 'spotify-for-artists';
  const ASCAP = 'ascap';
  const CHARTMETRIC = 'chartmetric';
  const DISTROKID = 'distrokid';

  const establishedArtist = (): any => ({
    artistName: 'Long Player',
    primaryGenre: 'Soul',
    catalog: [
      {
        id: 'w1',
        title: 'Work One',
        releaseDate: '2021-03-04',
        releaseType: 'Single',
        isrc: 'USABC2100001',
        distributor: 'DistroKid',
        platforms: ['Spotify', 'Apple Music'],
        credits: 'Written and produced by artist',
        splitSheetRef: 'SPLIT-2021-01',
      },
      {
        id: 'w2',
        title: 'Work Two',
        releaseDate: '2022-07-09',
        releaseType: 'EP',
        isrc: 'USABC2200002',
        distributor: 'DistroKid',
        platforms: ['Spotify'],
      },
    ],
    officialArtistProfiles: [],
    artistIdentity: { linkedAccounts: [] },
    legalInfrastructure: { proAffiliation: 'ASCAP' },
    performancesPerYear: '30',
  });

  describe('experience track', () => {
    it('treats an artist with no evidence as emerging', () => {
      expect(service.track(emergingArtist())).toBe('emerging');
      expect(service.track(blank())).toBe('emerging');
      expect(service.track(null)).toBe('emerging');
    });

    it('treats a performing or releasing artist as developing', () => {
      expect(
        service.track({ ...emergingArtist(), performancesPerYear: '4' })
      ).toBe('developing');
      expect(
        service.track({ ...emergingArtist(), catalog: [{ id: 'a' }, { id: 'b' }] })
      ).toBe('developing');
    });

    it('only calls an artist established with releases, reach, and a PRO', () => {
      const profile = establishedArtist();
      profile.officialArtistProfiles = [
        { id: SPOTIFY, destinationId: SPOTIFY, url: 'https://artists.spotify.com/x' },
        { id: 'apple-music-for-artists', destinationId: 'apple-music-for-artists', url: 'https://artists.apple.com/x' },
        { id: ASCAP, destinationId: ASCAP, url: 'https://www.ascap.com/x' },
        { id: CHARTMETRIC, destinationId: CHARTMETRIC, url: 'https://chartmetric.com/x' },
      ];
      profile.catalog = [
        ...profile.catalog,
        { id: 'w3' },
        { id: 'w4' },
        { id: 'w5' },
        { id: 'w6' },
      ];
      expect(service.track(profile)).toBe('established');
    });

    /**
     * The identity service emits one candidate connector row per launch
     * platform for every artist, so that array is always full and says nothing
     * about what the artist holds. Counting it as presence made every profile at
     * least "developing" and put the beginner path out of reach.
     */
    it('is not swayed by synthesised connector rows', () => {
      const syntheticRows = {
        ...emergingArtist(),
        artistIdentity: {
          linkedAccounts: [
            { platform: 'Spotify' },
            { platform: 'YouTube' },
            { platform: 'Instagram' },
            { platform: 'TikTok' },
            { platform: 'SoundCloud' },
            { platform: 'Apple Music' },
          ],
        },
      };

      expect(service.track(syntheticRows)).toBe('emerging');

      // Recorded, confirmed links are what move the track.
      const withVerifiedLinks = {
        ...emergingArtist(),
        officialArtistProfiles: [
          {
            id: SPOTIFY,
            destinationId: SPOTIFY,
            url: 'https://artists.spotify.com/x',
            verified: true,
          },
          {
            id: CHARTMETRIC,
            destinationId: CHARTMETRIC,
            url: 'https://chartmetric.com/x',
            verified: true,
          },
        ],
      };
      expect(service.track(withVerifiedLinks)).toBe('developing');
    });

    it('does not treat a self-declared PRO value of "None" as evidence', () => {
      expect(
        service.track({
          ...emergingArtist(),
          legalInfrastructure: { proAffiliation: 'None' },
        })
      ).toBe('emerging');
    });
  });

  describe('readout', () => {
    it('reports no fingerprint and full absence for a beginner', () => {
      const readout = service.readout(emergingArtist());
      expect(readout.hasFingerprint).toBe(false);
      expect(readout.overall).toBe(0);
      expect(readout.linked).toEqual([]);
      expect(readout.missing.length).toBe(service.destinations.length);
      expect(readout.coverage.every((entry) => entry.present === 0)).toBe(true);
    });

    it('counts declared links per category and overall', () => {
      const profile: any = establishedArtist();
      profile.officialArtistProfiles = [
        { id: SPOTIFY, destinationId: SPOTIFY, url: 'https://artists.spotify.com/x' },
        { id: ASCAP, destinationId: ASCAP, url: 'https://www.ascap.com/x' },
      ];
      const readout = service.readout(profile);

      expect(readout.hasFingerprint).toBe(true);
      expect(readout.overall).toBe(
        Math.round((2 / service.destinations.length) * 100)
      );

      const forArtists = readout.coverage.find((entry) => entry.category === 'for-artists');
      const pro = readout.coverage.find((entry) => entry.category === 'pro');
      expect(forArtists?.present).toBe(1);
      expect(pro?.present).toBe(1);
      expect(forArtists?.missing).not.toContain('Spotify for Artists');
    });

    it('flags links that are not in the registry instead of dropping them', () => {
      const profile: any = emergingArtist();
      profile.officialArtistProfiles = [
        { id: 'mystery', destinationId: 'mystery-platform', url: 'https://example.com' },
      ];
      const readout = service.readout(profile);
      expect(readout.linked.length).toBe(1);
      expect(readout.unrecognised).toBe(1);
      expect(readout.coverage.every((entry) => entry.present === 0)).toBe(true);
      // An unrecognised link still proves something exists online.
      expect(readout.hasFingerprint).toBe(true);
    });

    it('survives hostile profile shapes without throwing', () => {
      expect(() => service.readout({ catalog: 'nope' } as any)).not.toThrow();
      expect(() => service.readout({ officialArtistProfiles: 42 } as any)).not.toThrow();
      expect(() => service.history({ catalog: null } as any)).not.toThrow();
      expect(() => service.plan(undefined)).not.toThrow();
    });
  });

  describe('links', () => {
    it('adds a link once and updates it on repeat', () => {
      const start = emergingArtist() as UserProfile;
      const once = service.upsertLink(start, SPOTIFY, 'https://artists.spotify.com/a', true);
      expect(once.officialArtistProfiles?.length).toBe(1);
      expect(once.officialArtistProfiles?.[0].verified).toBe(true);

      const twice = service.upsertLink(once, SPOTIFY, 'https://artists.spotify.com/b');
      expect(twice.officialArtistProfiles?.length).toBe(1);
      expect(twice.officialArtistProfiles?.[0].url).toBe('https://artists.spotify.com/b');
      expect(twice.officialArtistProfiles?.[0].verified).toBe(false);
    });

    it('labels the link from the registry, not from user input', () => {
      const next = service.upsertLink(
        emergingArtist() as UserProfile,
        SPOTIFY,
        'https://artists.spotify.com/a'
      );
      expect(next.officialArtistProfiles?.[0].label).toBe(
        service.destination(SPOTIFY)?.label
      );
      expect(next.officialArtistProfiles?.[0].label).toBe('Spotify for Artists');
    });

    it('removes by destination and leaves other links intact', () => {
      let profile = emergingArtist() as UserProfile;
      profile = service.upsertLink(profile, SPOTIFY, 'https://artists.spotify.com/a');
      profile = service.upsertLink(profile, ASCAP, 'https://www.ascap.com/x');

      const next = service.removeLink(profile, SPOTIFY);
      expect(next.officialArtistProfiles?.length).toBe(1);
      expect(next.officialArtistProfiles?.[0].destinationId).toBe(ASCAP);
    });

    it('never mutates the profile it was handed', () => {
      const profile = emergingArtist() as UserProfile;
      const snapshot = JSON.stringify(profile);
      service.upsertLink(profile, SPOTIFY, 'https://artists.spotify.com/a');
      service.removeLink(profile, SPOTIFY);
      expect(JSON.stringify(profile)).toBe(snapshot);
    });
  });

  describe('plan', () => {
    it('gives a beginner an ordered, actionable plan', () => {
      const plan = service.plan(emergingArtist());
      expect(plan.length).toBeGreaterThan(0);
      plan.forEach((step, index) => {
        expect(step.order).toBe(index + 1);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.detail.length).toBeGreaterThan(0);
      });
      // No step should demand something a beginner cannot do this week.
      expect(plan.length).toBeLessThanOrEqual(6);
    });

    it('starts a beginner at a cost-free delivery destination', () => {
      const first = service.plan(emergingArtist())[0];
      expect(first?.destination?.category).toBe('delivery');
      // A first step an artist with no income can actually take today.
      expect(['amuse', DISTROKID]).toContain(first?.destination?.id);
    });

    it('switches to consolidation once links and releases exist', () => {
      const profile: any = establishedArtist();
      profile.officialArtistProfiles = [
        { id: SPOTIFY, destinationId: SPOTIFY, url: 'https://artists.spotify.com/x' },
        { id: ASCAP, destinationId: ASCAP, url: 'https://www.ascap.com/x' },
      ];
      const plan = service.plan(profile);
      const titles = plan.map((step) => step.title.toLowerCase()).join(' ');
      expect(titles).toMatch(/verif|consolidat|analytic|document/);
    });

    it('does not repeat the same step twice', () => {
      const titles = service.plan(emergingArtist()).map((step) => step.title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  });

  describe('official music history', () => {
    it('orders works newest first and keeps undated works visible', () => {
      const profile: any = {
        catalog: [
          { id: 'u', title: 'Undated' },
          { id: 'old', title: 'Old', releaseDate: '2019-01-01' },
          { id: 'new', title: 'New', releaseDate: '2024-05-05' },
        ],
      };
      const report = service.history(profile);
      expect(report.releases.map((entry) => entry.id)).toEqual(['new', 'old', 'u']);
      expect(report.undated).toBe(1);
    });

    it('scores documentation per work and lists what is missing', () => {
      const report = service.history(establishedArtist());
      const complete = report.releases.find((entry) => entry.id === 'w1')!;
      const partial = report.releases.find((entry) => entry.id === 'w2')!;

      expect(complete.completeness).toBe(100);
      expect(complete.missing).toEqual([]);
      expect(partial.completeness).toBeLessThan(100);
      expect(partial.missing).toContain('ownership reference');
      expect(report.averageCompleteness).toBe(
        Math.round((complete.completeness + partial.completeness) / 2)
      );
    });

    it('accepts an ISRC or a UPC as proof of identification', () => {
      const report = service.history({
        catalog: [{ id: 'x', title: 'X', upc: '012345678905' }],
      } as any);
      expect(report.releases[0].missing).not.toContain('ISRC or UPC');
    });

    it('reports a clean timeline for a well-ordered catalogue', () => {
      const report = service.history(establishedArtist());
      expect(report.timelineIssues).toEqual([]);
      // Gaps are the documentation still missing across the whole catalogue.
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.gaps).toEqual(expect.arrayContaining(['ownership reference']));
    });

    it('reports no gaps once every work is fully documented', () => {
      const report = service.history({
        catalog: [
          {
            id: 'done',
            title: 'Done',
            releaseDate: '2024-01-01',
            releaseType: 'Single',
            isrc: 'USABC2400001',
            distributor: 'DistroKid',
            platforms: ['Spotify'],
            credits: 'Written by the artist',
            splitSheetRef: 'SPLIT-2024-01',
          },
        ],
      } as any);
      expect(report.gaps).toEqual([]);
      expect(report.averageCompleteness).toBe(100);
    });

    it('flags repeated titles rather than silently merging them', () => {
      const report = service.history({
        catalog: [
          { id: 'a', title: 'Same Name', releaseDate: '2023-01-01' },
          { id: 'b', title: 'Same Name', releaseDate: '2023-06-01' },
        ],
      } as any);
      expect(report.timelineIssues.join(' ')).toMatch(/repeated titles/i);
      expect(report.releases.length).toBe(2);
    });

    it('returns an empty, safe report for an artist with no works', () => {
      const report = service.history(emergingArtist());
      expect(report.releases).toEqual([]);
      expect(report.averageCompleteness).toBe(0);
      expect(report.undated).toBe(0);
      expect(report.timelineIssues).toEqual([]);
    });
  });
});
