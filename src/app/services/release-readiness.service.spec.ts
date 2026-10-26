import { ReleaseReadinessService } from './release-readiness.service';
import type { UserProfile } from './user-profile.service';
import type { ProductionTrack, ReleaseProject } from '../types/release.types';

/**
 * The service's contract is as much about what it refuses to score as what it
 * scores: no DSP, royalty, or audience feed is connected, so "unknown" must
 * never be reported as a number.
 */
describe('ReleaseReadinessService', () => {
  let service: ReleaseReadinessService;

  beforeEach(() => {
    service = new ReleaseReadinessService();
  });

  const profile = (overrides: Record<string, unknown> = {}): UserProfile =>
    ({
      artistName: 'North Star',
      proName: 'ASCAP',
      proIpi: '0011223344',
      legalInfrastructure: { hasStandardSplitSheet: 'In Use' },
      marketingCampaigns: [{ id: 'camp-1', name: 'Window Push' }],
      catalog: [
        {
          id: 'w1',
          title: 'Window Light',
          isrc: 'US-AAA-25-00001',
          upc: '00123456789012',
          releaseDate: '2025-02-01',
          distributor: 'DistroKid',
          platforms: ['Spotify', 'Apple Music'],
          splitSheetRef: 'SPLIT-2025-01',
        },
      ],
      ...overrides,
    }) as unknown as UserProfile;

  const finishedTrack = (title: string): ProductionTrack => ({
    id: `trk-${title}`,
    title,
    status: 'Completed',
    stages: {
      instrumental: 'Completed',
      lyrics: 'Completed',
      vocals: 'Completed',
      mixing: 'Completed',
      mastering: 'Completed',
    },
  });

  const release = (overrides: Partial<ReleaseProject> = {}): ReleaseProject => ({
    id: 'rel-1',
    name: 'Window Light',
    type: 'Single',
    description: 'One quiet single about leaving.',
    status: 'Planning',
    tracks: [finishedTrack('Window Light')],
    artworkUrl: 'https://cdn.example/art.png',
    credits: {
      artistName: 'North Star',
      proName: 'ASCAP',
      proIpi: '0011223344',
      collaborators: [],
    },
    marketingCampaignId: 'camp-1',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  it('reports nothing to judge when there is no release', () => {
    const readiness = service.assess(profile(), null);

    expect(readiness.status).toBe('no-release');
    expect(readiness.state).toBe('insufficient-data');
    expect(readiness.overallScore).toBeNull();
    expect(readiness.checks).toEqual([]);
    expect(readiness.verdict).toContain('No release is in the pipeline');
  });

  it('treats missing track data as unknown, not as a zero', () => {
    const readiness = service.assess(
      profile(),
      release({ tracks: [], description: '', artworkUrl: undefined })
    );
    const production = readiness.checks.find((c) => c.id === 'production')!;

    expect(production.score).toBeNull();
    expect(production.state).toBe('insufficient-data');
    expect(production.provenance).toBe('missing');
    // The unscored check is left out of the average instead of counted as 0.
    const scored = readiness.checks.filter((c) => c.score !== null);
    const mean = Math.round(
      scored.reduce((sum, c) => sum + (c.score ?? 0), 0) / scored.length
    );
    expect(readiness.overallScore).toBe(mean);
  });

  it('scores a fully documented release as ready', () => {
    const readiness = service.assess(profile(), release());

    expect(readiness.status).toBe('assessed');
    expect(readiness.state).toBe('ready');
    expect(readiness.overallScore).toBe(100);
    expect(readiness.blockingGaps).toEqual([]);
    expect(readiness.verdict).toContain('deliverable');
    expect(readiness.verdict).toContain('Market timing could not be assessed');
  });

  it('names the blocking gap instead of saying "not ready"', () => {
    const readiness = service.assess(
      profile(),
      release({ artworkUrl: undefined })
    );

    expect(readiness.state).toBe('not-ready');
    expect(readiness.blockingGaps).toContain(
      'Complete the cover artwork on the release.'
    );
    expect(readiness.verdict).toContain('not ready to push');
  });

  it('cannot verify a release that has no catalogue entry', () => {
    const readiness = service.assess(
      profile({ catalog: [] }),
      release({ name: 'Untitled Demo' })
    );
    const metadata = readiness.checks.find((c) => c.id === 'metadata')!;

    expect(metadata.provenance).toBe('inferred');
    expect(metadata.gaps.join(' ')).toContain('isrc');
    expect(readiness.provenanceNotes.join(' ')).toContain(
      'No catalogue work is linked'
    );
  });

  it('verifies metadata when the catalogue holds the identifiers', () => {
    const metadata = service
      .assess(profile(), release())
      .checks.find((c) => c.id === 'metadata')!;

    expect(metadata.provenance).toBe('verified');
    expect(metadata.score).toBe(100);
  });

  it('requires a split document once collaborators exist', () => {
    const base: any = profile({
      legalInfrastructure: { hasStandardSplitSheet: 'Never' },
    });
    // Strip the catalogue's split reference too: this artist has no split
    // document anywhere, which is what the check is meant to catch.
    const withoutSplits = service.assess(
      {
        ...base,
        catalog: base.catalog.map((work: any) => ({ ...work, splitSheetRef: undefined })),
      } as UserProfile,
      release({
        credits: {
          artistName: 'North Star',
          proName: 'ASCAP',
          proIpi: '0011223344',
          collaborators: ['Rae'],
        },
      })
    );
    const rights = withoutSplits.checks.find((c) => c.id === 'rights')!;

    expect(rights.score).toBe(67);
    expect(rights.gaps.join(' ')).toContain('splits');
    expect(withoutSplits.state).toBe('not-ready');
  });

  it('reads a release through its linked work even when the titles differ', () => {
    const readiness = service.assess(
      profile(),
      release({ name: 'Window Light (Single Edit)', catalogWorkId: 'w1' })
    );
    const metadata = readiness.checks.find((c) => c.id === 'metadata')!;

    expect(metadata.provenance).toBe('verified');
    expect(metadata.score).toBe(100);
  });

  it('does not count a campaign that no longer exists', () => {
    const readiness = service.assess(
      profile({ marketingCampaigns: [] }),
      release()
    );
    const campaign = readiness.checks.find((c) => c.id === 'campaign')!;

    expect(campaign.state).toBe('not-ready');
    expect(campaign.gaps.join(' ')).toContain('not in the profile any more');
    expect(campaign.evidence.join(' ')).toContain('camp-1');
  });

  it('accepts a split reference recorded on the release itself', () => {
    const base: any = profile({
      legalInfrastructure: { hasStandardSplitSheet: 'Never' },
      catalog: [],
    });

    const readiness = service.assess(
      base,
      release({
        splitSheetRef: 'splits/window-light-v2.pdf',
        credits: {
          artistName: 'North Star',
          proName: 'ASCAP',
          proIpi: '0011223344',
          collaborators: ['Rae'],
        },
      })
    );
    const rights = readiness.checks.find((c) => c.id === 'rights')!;

    expect(rights.score).toBe(100);
    expect(rights.gaps).toEqual([]);
    expect(rights.evidence.join(' ')).toContain('splits/window-light-v2.pdf');
  });

  it('calls a deliverable release "almost" when the campaign is missing', () => {
    const readiness = service.assess(
      profile(),
      release({ marketingCampaignId: undefined })
    );

    expect(readiness.state).toBe('almost');
    expect(readiness.overallScore).toBe(75);
    expect(readiness.verdict).toContain('campaign behind it is not in place');
  });

  it('never scores market timing', () => {
    const readiness = service.assess(profile(), release());
    const timing = readiness.checks.find((c) => c.id === 'timing')!;

    expect(timing.score).toBeNull();
    expect(timing.state).toBe('insufficient-data');
    expect(timing.blocking).toBe(false);
    // The documented date is surfaced as evidence, not as a timing verdict.
    expect(timing.evidence.join(' ')).toContain('2025-02-01');
  });

  it('never claims a sampled platform signal', () => {
    const readiness = service.assess(profile(), release());

    readiness.checks.forEach((check) => {
      expect(check.provenance).not.toBe('sampled');
    });
    expect(readiness.provenanceNotes.join(' ')).toContain(
      'No distributor, DSP, royalty, or analytics feed'
    );
  });

  it('handles a null profile without inventing catalogue data', () => {
    const readiness = service.assess(null, release());

    const metadata = readiness.checks.find((c) => c.id === 'metadata')!;
    expect(metadata.provenance).toBe('inferred');
    expect(readiness.blockingGaps.length).toBeGreaterThan(0);
  });
});
