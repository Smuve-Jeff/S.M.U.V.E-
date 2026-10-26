import { TestBed } from '@angular/core/testing';
import { CreativeBusinessBridgeService } from './creative-business-bridge.service';
import { UserProfile } from './user-profile.service';
import { ReleaseProject } from '../types/release.types';
import { CREATIVE_DIMENSION_ORDER } from '../types/creative-business.types';

/**
 * The bridge exists so the advisor can answer "what does this creative decision
 * commit me to". These tests hold it to the one standard that makes that answer
 * usable: every consequence quotes a field, and a dimension with no recorded
 * fact is never reported as clear.
 */
describe('CreativeBusinessBridgeService', () => {
  let service: CreativeBusinessBridgeService;

  const track = (title: string) => ({
    id: `trk-${title}`,
    title,
    status: 'Completed' as const,
    stages: {
      instrumental: 'Completed' as const,
      lyrics: 'Completed' as const,
      vocals: 'Completed' as const,
      mixing: 'Completed' as const,
      mastering: 'Completed' as const,
    },
  });

  const release = (overrides: Partial<ReleaseProject> = {}): ReleaseProject => ({
    id: 'rel-1',
    name: 'Window Light',
    type: 'Single',
    description: 'One quiet single about leaving.',
    status: 'Admin',
    tracks: [track('Window Light')],
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

  const profile = (overrides: Record<string, unknown> = {}): UserProfile =>
    ({
      artistName: 'North Star',
      proName: 'ASCAP',
      proIpi: '0011223344',
      musicalJourney: {
        releaseVelocity: 'Frequent',
        contentStrategy: 'Documentary clips between releases.',
        incomeStreams: ['Streaming', 'Shows'],
        musicBlueprint: { audienceProfile: 'Late-night listeners who replay songs.' },
      },
      legalInfrastructure: {
        hasRegisteredWorks: true,
        proAffiliation: 'ASCAP',
        hasStandardSplitSheet: 'In Use',
        isIncorporated: true,
        trademarkStatus: 'Registered',
      },
      officialArtistProfiles: [
        { id: 'l1', destinationId: 'spotify', label: 'Spotify', url: 'https://spotify.example/north', verified: true },
      ],
      marketingCampaigns: [{ id: 'camp-1', name: 'Window Push' }],
      catalog: [],
      ...overrides,
    }) as unknown as UserProfile;

  const byDimension = (bridge: ReturnType<CreativeBusinessBridgeService['assess']>, id: string) =>
    bridge.consequences.find((entry) => entry.dimension === id)!;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CreativeBusinessBridgeService);
  });

  it('translates nothing when there is no release in the pipeline', () => {
    const bridge = service.assess(profile(), null);

    expect(bridge.status).toBe('no-release');
    expect(bridge.consequences).toEqual([]);
    expect(bridge.blocking).toEqual([]);
    expect(bridge.headline).toContain('No release');
  });

  it('always reports all six dimensions in a fixed order', () => {
    const bridge = service.assess(profile(), release());

    expect(bridge.consequences.map((entry) => entry.dimension)).toEqual(
      CREATIVE_DIMENSION_ORDER
    );
    expect(bridge.consequences).toHaveLength(CREATIVE_DIMENSION_ORDER.length);
  });

  it('quotes evidence for every consequence it reports', () => {
    const bridge = service.assess(profile(), release());

    for (const entry of bridge.consequences) {
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.observation.trim().length).toBeGreaterThan(0);
      expect(entry.consequence.trim().length).toBeGreaterThan(0);
      expect(entry.decision.trim().length).toBeGreaterThan(0);
    }
  });

  it('calls undocumented collaborator shares a blocking exposure', () => {
    const bridge = service.assess(
      profile({ legalInfrastructure: { hasStandardSplitSheet: 'Never', isIncorporated: true, trademarkStatus: 'Registered' } }),
      release({
        credits: {
          artistName: 'North Star',
          collaborators: ['Blue Nine', 'Weiss'],
        },
      })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('blocking');
    expect(rights.observation).toContain('2 collaborators');
    expect(rights.evidence.join(' ')).toContain('collaborators = 2');
    expect(bridge.blocking).toEqual(['rights']);
    expect(bridge.headline).toContain('Rights');
  });

  it('treats a split reference on the release as verified, not merely stated', () => {
    const bridge = service.assess(
      profile({
        catalog: [{ id: 'w1', title: 'Window Light', splitSheetRef: 'splits-window-light.pdf' }],
      }),
      release({ credits: { artistName: 'North Star', collaborators: ['Blue Nine'] } })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('clear');
    expect(rights.provenance).toBe('verified');
    expect(rights.evidence.join(' ')).toContain('splits-window-light.pdf');
    expect(bridge.blocking).toEqual([]);
  });

  it('reads a split reference recorded on the release itself', () => {
    const bridge = service.assess(
      profile({
        catalog: [{ id: 'w1', title: 'Window Light' }],
      }),
      release({
        splitSheetRef: 'splits/window-light-v2.pdf',
        splitSheetFor: ['Blue Nine'],
        credits: { artistName: 'North Star', collaborators: ['Blue Nine'] },
      })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('clear');
    expect(rights.provenance).toBe('verified');
    expect(rights.evidence.join(' ')).toContain('release.splitSheetRef');
    expect(rights.evidence.join(' ')).not.toContain('[].splitSheetRef');
  });

  it('blocks a split that does not name a collaborator who joined later', () => {
    const bridge = service.assess(
      profile(),
      release({
        splitSheetRef: 'splits/window-light-v2.pdf',
        splitSheetFor: ['Blue Nine'],
        credits: {
          artistName: 'North Star',
          collaborators: ['Blue Nine', 'Weiss'],
        },
      })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('blocking');
    expect(rights.observation).toContain('Weiss');
    expect(rights.evidence.join(' ')).toContain('Not named in the split: Weiss');
  });

  it('clears a split confirmed against the whole lineup', () => {
    const bridge = service.assess(
      profile(),
      release({
        splitSheetRef: 'splits/window-light-v2.pdf',
        splitSheetFor: ['Blue Nine', 'weiss'],
        credits: {
          artistName: 'North Star',
          collaborators: ['Blue Nine', 'Weiss'],
        },
      })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('clear');
    expect(rights.provenance).toBe('verified');
  });

  it('will not vouch for a split with no record of who it covers', () => {
    const bridge = service.assess(
      profile(),
      release({
        splitSheetRef: 'splits/window-light-v2.pdf',
        credits: { artistName: 'North Star', collaborators: ['Blue Nine'] },
      })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('watch');
    expect(rights.provenance).toBe('inferred');
    expect(rights.evidence.join(' ')).toContain('splitSheetFor is empty');
  });

  it('separates a split habit from a split that exists for this release', () => {
    const bridge = service.assess(
      profile({ legalInfrastructure: { hasStandardSplitSheet: 'In Use', isIncorporated: true, trademarkStatus: 'Registered' } }),
      release({ credits: { artistName: 'North Star', collaborators: ['Blue Nine'] } })
    );

    const rights = byDimension(bridge, 'rights');
    expect(rights.severity).toBe('watch');
    expect(rights.consequence).toContain('split habit is not a split');
  });

  it('reports audience fit as unknown rather than clear when no audience is recorded', () => {
    const bridge = service.assess(
      profile({ musicalJourney: { releaseVelocity: 'Frequent', musicBlueprint: { audienceProfile: '' } } }),
      release()
    );

    const audience = byDimension(bridge, 'audience');
    expect(audience.severity).toBe('unknown');
    expect(audience.provenance).toBe('missing');
    expect(bridge.unclear).toContain('audience');
    expect(bridge.headline).toContain('cannot be judged');
  });

  it('flags a project-sized release against a cadence the artist described as occasional', () => {
    const bridge = service.assess(
      profile({ musicalJourney: { releaseVelocity: 'Occasional', musicBlueprint: { audienceProfile: 'Night listeners.' } } }),
      release({ type: 'Album', tracks: [track('One'), track('Two'), track('Three')] })
    );

    const schedule = byDimension(bridge, 'schedule');
    expect(schedule.severity).toBe('watch');
    expect(schedule.observation).toContain('a 3-track Album');
    expect(schedule.evidence.join(' ')).toContain('releaseVelocity = "Occasional"');
  });

  it('does not judge timing when no cadence is recorded', () => {
    const bridge = service.assess(
      profile({ musicalJourney: { releaseVelocity: 'Unspecified', musicBlueprint: { audienceProfile: 'Night listeners.' } } }),
      release()
    );

    const schedule = byDimension(bridge, 'schedule');
    expect(schedule.severity).toBe('unknown');
    expect(bridge.unclear).toContain('schedule');
  });

  it('explains unregistered royalties instead of assuming they will arrive', () => {
    const bridge = service.assess(
      profile({ proName: '', proIpi: '' }),
      release({ credits: { artistName: 'North Star', collaborators: [] } })
    );

    const money = byDimension(bridge, 'monetization');
    expect(money.severity).toBe('watch');
    expect(money.consequence).toContain('no account to land in');
  });

  it('does not treat a deleted campaign as a plan behind the release', () => {
    const bridge = service.assess(
      profile({ marketingCampaigns: [] }),
      release()
    );

    const money = byDimension(bridge, 'monetization');
    expect(money.severity).toBe('watch');
    expect(money.observation).toContain('no longer exists');
    expect(money.evidence.join(' ')).toContain('camp-1');
  });

  it('marks a release with rights and a campaign as monetization-clear', () => {
    const bridge = service.assess(profile(), release());

    expect(byDimension(bridge, 'monetization').severity).toBe('clear');
  });

  it('describes personal liability without offering legal advice', () => {
    const bridge = service.assess(
      profile({ legalInfrastructure: { isIncorporated: false, trademarkStatus: 'None' } }),
      release({ credits: { artistName: 'North Star', collaborators: ['Blue Nine'] } })
    );

    const legal = byDimension(bridge, 'legal');
    expect(legal.severity).toBe('watch');
    expect(legal.consequence).toContain('attach to the artist rather than to a company');
    expect(bridge.provenanceNotes.join(' ')).toContain('not legal, tax, or financial advice');
  });

  it('separates an owned destination from a rented one', () => {
    const rented = service.assess(
      profile({ officialArtistProfiles: [] }),
      release()
    );
    const owned = service.assess(profile(), release());

    expect(byDimension(rented, 'growth').severity).toBe('watch');
    expect(byDimension(rented, 'growth').consequence).toContain('does not control');
    expect(byDimension(owned, 'growth').severity).toBe('clear');
    expect(byDimension(owned, 'growth').observation).toContain('1 official link');
  });

  it('says when no catalogue entry matched, instead of inventing one', () => {
    const bridge = service.assess(
      profile({ catalog: [{ id: 'w9', title: 'Something Else', splitSheetRef: 'x.pdf' }] }),
      release()
    );

    expect(bridge.provenanceNotes.join(' ')).toContain(
      'No catalogue entry matched this release name'
    );
    expect(byDimension(bridge, 'rights').provenance).not.toBe('verified');
  });
});
