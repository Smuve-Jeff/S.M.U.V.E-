import { buildMarketAlerts } from './market-alerts.util';
import type { UserProfile } from './user-profile.service';
import type { ReleaseProject } from '../types/release.types';
import type { ArtistLifecycleSnapshot } from '../types/artist-lifecycle.types';
import type { ReleaseReadiness } from '../types/release-readiness.types';

const NOW = Date.parse('2026-06-01T00:00:00.000Z');

const release = (overrides: Partial<ReleaseProject> = {}): ReleaseProject =>
  ({
    id: 'rel-1',
    name: 'Window Light',
    type: 'Single',
    description: 'One quiet single about leaving.',
    status: 'Planning',
    tracks: [],
    credits: { artistName: 'North Star', collaborators: [] },
    createdAt: 1,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }) as ReleaseProject;

const readiness = (
  overrides: Partial<ReleaseReadiness> = {}
): ReleaseReadiness => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  status: 'assessed',
  releaseId: 'rel-1',
  releaseName: 'Window Light',
  state: 'not-ready',
  overallScore: 42,
  checks: [],
  blockingGaps: ['Finish "Window Light" through mastering.'],
  verdict:
    'This release is not ready to push: Finish "Window Light" through mastering.',
  provenanceNotes: [],
  ...overrides,
});

const snapshot = (
  overrides: Partial<ArtistLifecycleSnapshot> = {}
): ArtistLifecycleSnapshot =>
  ({
    generatedAt: '2026-01-01T00:00:00.000Z',
    overallScore: 60,
    overallProvenance: 'inferred',
    phases: [],
    tasks: [],
    recommendations: [],
    nextBestMove: null,
    supportingMoves: [],
    risks: [],
    releaseReadiness: readiness(),
    ...overrides,
  }) as ArtistLifecycleSnapshot;

const profile = (overrides: Record<string, unknown> = {}): UserProfile =>
  ({
    artistName: 'North Star',
    catalog: [],
    knowledgeBase: {},
    lastGeneratedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as UserProfile;

const phase = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'release',
    label: 'Release',
    areas: ['release'],
    status: 'at-risk',
    score: 20,
    provenance: 'inferred',
    completed: 1,
    total: 5,
    confirmed: [],
    gaps: ['Master the single.'],
    blockedBy: ['Register the work with a PRO.'],
    ...overrides,
  }) as any;

describe('buildMarketAlerts', () => {
  it('flags a blocked release window as critical', () => {
    const alerts = buildMarketAlerts(
      profile({ knowledgeBase: { currentRelease: release() } }),
      snapshot(),
      NOW
    );

    expect(alerts[0]).toMatchObject({
      id: 'market-release-rel-1-blocked',
      severity: 'Critical',
      category: 'Release',
      message: readiness().verdict,
      timestamp: 1_700_000_000_000,
    });
  });

  it('reports an active release with no dated catalogue entry instead of inventing a date', () => {
    const alerts = buildMarketAlerts(
      profile({ knowledgeBase: { currentRelease: release() } }),
      snapshot(),
      NOW
    );

    const undated = alerts.find(
      (alert) => alert.id === 'market-release-rel-1-undated'
    );
    expect(undated).toMatchObject({
      severity: 'Warning',
      message: expect.stringContaining('no dated catalogue entry'),
    });
    expect(alerts.every((alert) => !/\d{4}-\d{2}-\d{2}/.test(alert.message))).toBe(
      true
    );
  });

  it('surfaces a real future catalogue date as the release window', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: { currentRelease: release() },
        catalog: [
          {
            id: 'w1',
            title: 'Window Light',
            releaseDate: '2026-07-01',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
      snapshot(),
      NOW
    );

    expect(alerts.find((alert) => alert.id === 'market-window-w1')).toMatchObject({
      severity: 'Warning',
      category: 'Release',
      message: expect.stringContaining('Catalogue date 2026-07-01'),
      timestamp: Date.parse('2026-07-01'),
    });
  });

  it('uses the planned date ahead of a different catalogue date', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: {
          currentRelease: release({ plannedReleaseDate: '2026-07-01' }),
        },
        catalog: [
          { id: 'w1', title: 'Window Light', releaseDate: '2026-08-01' },
        ],
      }),
      snapshot(),
      NOW
    );

    expect(
      alerts.find((alert) => alert.id === 'market-window-release-rel-1')
    ).toMatchObject({
      message: expect.stringContaining('Planned date 2026-07-01'),
      timestamp: Date.parse('2026-07-01'),
    });
    expect(alerts.some((alert) => alert.id === 'market-window-w1')).toBe(false);
  });

  it('warns when the planned and catalogue dates disagree', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: {
          currentRelease: release({ plannedReleaseDate: '2026-07-01' }),
        },
        catalog: [
          { id: 'w1', title: 'Window Light', releaseDate: '2026-08-01' },
        ],
      }),
      snapshot(),
      NOW
    );

    expect(
      alerts.find((alert) => alert.id === 'market-release-rel-1-date-mismatch')
    ).toMatchObject({
      severity: 'Warning',
      category: 'Release',
      message: expect.stringContaining('differs from the catalogue date'),
    });
  });

  it('tracks a planned window even when no catalogue work exists', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: {
          currentRelease: release({ plannedReleaseDate: '2026-07-01' }),
        },
        catalog: [],
      }),
      snapshot(),
      NOW
    );

    expect(
      alerts.find((alert) => alert.id === 'market-window-release-rel-1')
    ).toBeDefined();
    expect(alerts.some((alert) => alert.id.includes('undated'))).toBe(false);
  });

  it('warns about an imminent planned window even when delivery is ready', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: {
          currentRelease: release({ plannedReleaseDate: '2026-06-08' }),
        },
        catalog: [],
      }),
      snapshot({
        releaseReadiness: readiness({ state: 'ready', overallScore: 100 }),
      }),
      NOW
    );

    expect(
      alerts.find((alert) => alert.id === 'market-window-release-rel-1')
    ).toMatchObject({
      severity: 'Warning',
      message: expect.stringContaining('in 7 days'),
    });
  });

  it('flags a past catalogue date on an unreleased project', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: { currentRelease: release() },
        catalog: [{ id: 'w1', title: 'Window Light', releaseDate: '2026-05-01' }],
      }),
      snapshot(),
      NOW
    );

    expect(alerts.find((alert) => alert.id === 'market-release-rel-1-past-date'))
      .toMatchObject({
        severity: 'Warning',
        message: expect.stringContaining('still Planning'),
      });
  });

  it('does not call an already-released project overdue', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: {
          currentRelease: release({ status: 'Released' }),
        },
        catalog: [{ id: 'w1', title: 'Window Light', releaseDate: '2026-05-01' }],
      }),
      snapshot({ releaseReadiness: readiness({ state: 'ready', overallScore: 100 }) }),
      NOW
    );

    expect(
      alerts.some((alert) => alert.id.includes('past-date') || alert.id.includes('undated'))
    ).toBe(false);
  });

  it('reports the campaign gap only when delivery itself is not blocked', () => {
    const campaignCheck = {
      id: 'campaign',
      label: 'Campaign',
      blocking: false,
      state: 'not-ready',
      score: 0,
      provenance: 'inferred',
      evidence: [],
      gaps: ['Attach a campaign so the release has a plan beyond delivery.'],
    } as any;

    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: { currentRelease: release() },
        catalog: [{ id: 'w1', title: 'Window Light', releaseDate: '2026-07-01' }],
      }),
      snapshot({
        releaseReadiness: readiness({
          state: 'almost',
          overallScore: 90,
          checks: [campaignCheck],
        }),
      }),
      NOW
    );

    expect(alerts.find((alert) => alert.id === 'market-release-rel-1-campaign'))
      .toMatchObject({
        category: 'Marketing',
        severity: 'Warning',
        message: campaignCheck.gaps[0],
      });
    expect(alerts.some((alert) => alert.id.includes('-blocked'))).toBe(false);
  });

  it('turns a blocked lifecycle phase into a warning with its blockers', () => {
    const alerts = buildMarketAlerts(
      profile(),
      snapshot({ phases: [phase()], overallScore: 40 }),
      NOW
    );

    expect(alerts.find((alert) => alert.id === 'market-lifecycle-release-blocked'))
      .toMatchObject({
        severity: 'Warning',
        category: 'Lifecycle',
        message: expect.stringContaining('Register the work with a PRO'),
      });
  });

  it('reports a profile/pathway mismatch as a lifecycle warning', () => {
    const alerts = buildMarketAlerts(
      profile(),
      snapshot({
        risks: [
          {
            kind: 'mismatch',
            phase: 'growth',
            message: 'The profile claims an audience the pathway has no evidence for.',
            provenance: 'inferred',
          },
        ],
      }),
      NOW
    );

    expect(alerts.find((alert) => alert.id === 'market-lifecycle-mismatch'))
      .toMatchObject({
        severity: 'Warning',
        message: 'The profile claims an audience the pathway has no evidence for.',
      });
  });

  it('adds the pathway move when nothing is blocking', () => {
    const alerts = buildMarketAlerts(
      profile(),
      snapshot({
        overallScore: 0,
        nextBestMove: {
          id: 'move-1',
          phase: 'release',
          title: 'Register the single',
          action: 'Register it',
          why: 'No release can be delivered without a registered work.',
          provenance: 'missing',
        },
      }),
      NOW
    );

    // The no-release state is an informational alert, so it does not hide the
    // move the pathway already ranked first.
    expect(alerts).toHaveLength(2);
    expect(alerts.find((alert) => alert.id === 'market-lifecycle-move-move-1'))
      .toMatchObject({
        severity: 'Info',
        message: 'No release can be delivered without a registered work.',
      });
  });

  it('states an explicit all-clear rather than returning an empty ticker', () => {
    const alerts = buildMarketAlerts(
      profile(),
      snapshot({ overallScore: 0, nextBestMove: null }),
      NOW
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 'market-lifecycle-clear',
      severity: 'Info',
      message: expect.stringContaining('0% evidenced (inferred)'),
    });
  });

  it('schedules a future catalogue window when no release project exists', () => {
    const alerts = buildMarketAlerts(
      profile({
        catalog: [
          { id: 'w2', title: 'Late Bloom', releaseDate: '2026-08-01' },
        ],
      }),
      snapshot({ overallScore: 0 }),
      NOW
    );

    expect(alerts.find((alert) => alert.id === 'market-window-w2')).toMatchObject({
      severity: 'Info',
      title: 'Scheduled release window — Late Bloom',
    });
    expect(alerts.some((alert) => alert.id === 'market-release-none')).toBe(false);
  });

  it('sorts critical alerts first and caps the strip at four', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: { currentRelease: release() },
        catalog: [{ id: 'w1', title: 'Window Light', releaseDate: '2026-07-01' }],
      }),
      snapshot({
        phases: [phase(), phase({ id: 'growth', label: 'Growth' })],
        risks: [
          {
            kind: 'mismatch',
            phase: null,
            message: 'Profile and pathway disagree about the audience.',
            provenance: 'inferred',
          },
        ],
      }),
      NOW
    );

    expect(alerts).toHaveLength(4);
    expect(alerts[0].severity).toBe('Critical');
    expect(alerts[0].id).toBe('market-release-rel-1-blocked');
  });

  it('stays honest about a documented, dated, campaign-backed release', () => {
    const alerts = buildMarketAlerts(
      profile({
        knowledgeBase: { currentRelease: release() },
        catalog: [{ id: 'w1', title: 'Window Light', releaseDate: '2026-07-01' }],
      }),
      snapshot({
        releaseReadiness: readiness({
          state: 'ready',
          overallScore: 100,
          checks: [
            {
              id: 'campaign',
              label: 'Campaign',
              blocking: false,
              state: 'ready',
              score: 100,
              provenance: 'inferred',
              evidence: ['Campaign "Window Push" is attached.'],
              gaps: [],
            } as any,
          ],
        }),
      }),
      NOW
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: 'market-window-w1', severity: 'Info' });
    expect(alerts.some((alert) => alert.severity !== 'Info')).toBe(false);
  });

  it('returns nothing without a profile or snapshot', () => {
    expect(buildMarketAlerts(null, snapshot(), NOW)).toEqual([]);
    expect(buildMarketAlerts(profile(), null, NOW)).toEqual([]);
  });
});
