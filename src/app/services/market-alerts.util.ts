import type { UserProfile } from './user-profile.service';
import type { ReleaseProject } from '../types/release.types';
import type { ArtistLifecycleSnapshot } from '../types/artist-lifecycle.types';
import type { MarketAlert } from '../types/ai.types';
import { findCatalogWork } from './release-split.util';
import {
  findReleaseDateMismatch,
  releaseDateMismatchMessage,
} from './release-window.util';

/**
 * A market alert is a standing condition the artist can act on, not a change
 * notification (that is `ArtistLifecycleAlertService`). Every alert below is
 * derived from evidence the profile or the lifecycle already holds:
 *
 *  - release readiness checks, blocking gaps and the campaign check,
 *  - the release's planned date, falling back to the linked work's date,
 *  - lifecycle phases that are blocked, and profile/pathway mismatches,
 *  - the pathway's next move when nothing is anomalous.
 *
 * No distributor, DSP, royalty or audience feed is connected, so nothing here
 * claims delivery status, streams, revenue or campaign performance. A missing
 * value produces a gap, never an invented number or date.
 */

const MARKET_PHASES = ['release', 'growth', 'business', 'money'] as const;
const MAX_MARKET_ALERTS = 4;
const SOON_DAYS = 14;

const SEVERITY_RANK: Record<MarketAlert['severity'], number> = {
  Critical: 0,
  Warning: 1,
  Info: 2,
};

/** First usable timestamp from the evidence, never a fabricated time. */
function timestampOf(
  ...candidates: Array<string | number | null | undefined>
): number {
  for (const candidate of candidates) {
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return candidate;
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return Date.now();
}

/** Nearest catalogue work whose recorded date is still in the future. */
function nextCatalogueWindow(
  catalog: UserProfile['catalog'],
  now: number
): {
  id: string;
  title: string;
  releaseDate: string;
  updatedAt?: string;
} | null {
  const dated = (catalog || [])
    .map((item) => ({
      item,
      at: item?.releaseDate ? Date.parse(item.releaseDate) : NaN,
    }))
    .filter((entry) => Number.isFinite(entry.at) && entry.at > now)
    .sort((a, b) => a.at - b.at);

  const next = dated[0]?.item;
  if (!next?.releaseDate) return null;
  return {
    id: String(next.id || next.title || 'work'),
    title: String(next.title || 'Untitled work'),
    releaseDate: next.releaseDate,
    updatedAt: next.updatedAt,
  };
}

export function buildMarketAlerts(
  profile: UserProfile | null | undefined,
  snapshot: ArtistLifecycleSnapshot | null | undefined,
  now: number = Date.now()
): MarketAlert[] {
  if (!profile || !snapshot) return [];

  const release =
    ((profile.knowledgeBase as { currentRelease?: ReleaseProject } | undefined)
      ?.currentRelease as ReleaseProject | undefined) ?? null;
  const readiness = snapshot.releaseReadiness;
  const generatedAt = timestampOf(
    snapshot.generatedAt,
    profile.lastGeneratedAt,
    now
  );

  const alerts: MarketAlert[] = [];
  const messages = new Set<string>();
  const push = (alert: MarketAlert) => {
    // The same gap can be reachable from two sources; report it once.
    if (messages.has(alert.message)) return;
    messages.add(alert.message);
    alerts.push(alert);
  };

  if (release) {
    const releaseAt = timestampOf(release.updatedAt, generatedAt, now);
    const work = findCatalogWork(profile, release);

    if (readiness.status === 'assessed' && readiness.state === 'not-ready') {
      push({
        id: `market-release-${release.id}-blocked`,
        title: `Release window blocked — ${release.name}`,
        message: readiness.verdict,
        severity: 'Critical',
        timestamp: releaseAt,
        category: 'Release',
      });
    }

    const planned = (release.plannedReleaseDate || '').trim();
    const catalogue = (work?.releaseDate || '').trim();
    const date = planned || catalogue;
    const source = planned ? 'planned release date' : 'catalogue release date';
    const parsedDate = date ? Date.parse(date) : NaN;

    const mismatch = findReleaseDateMismatch(planned, catalogue);
    if (mismatch) {
      push({
        id: `market-release-${release.id}-date-mismatch`,
        title: `Release dates disagree — ${release.name}`,
        message: releaseDateMismatchMessage(mismatch),
        severity: 'Warning',
        timestamp: timestampOf(
          mismatch.plannedAt,
          mismatch.catalogueAt,
          work?.updatedAt,
          releaseAt
        ),
        category: 'Release',
      });
    }

    if (date && Number.isFinite(parsedDate)) {
      const days = Math.ceil((parsedDate - now) / 86_400_000);
      if (parsedDate > now) {
        const windowId = planned
          ? `market-window-release-${release.id}`
          : `market-window-${work?.id ?? release.id}`;
        const runway =
          days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
        push({
          id: windowId,
          title: `Release window — ${work?.title || release.name}`,
          message: `${planned ? 'Planned date' : 'Catalogue date'} ${date} (${runway}). ${readiness.verdict}`,
          // A near window is worth surfacing even when delivery is ready.
          severity:
            readiness.state === 'not-ready' || days <= SOON_DAYS
              ? 'Warning'
              : 'Info',
          timestamp: timestampOf(date, work?.updatedAt, releaseAt),
          category: 'Release',
        });
      } else if (release.status !== 'Released') {
        // A date in the past on an unreleased project is a data problem the
        // artist can see and fix; it is not a delivered release.
        push({
          id: `market-release-${release.id}-past-date`,
          title: `Release date already passed — ${release.name}`,
          message: `The ${source} records ${date}, but the release project is still ${release.status}.`,
          severity: 'Warning',
          timestamp: timestampOf(date, work?.updatedAt, releaseAt),
          category: 'Release',
        });
      }
    } else if (date) {
      push({
        id: `market-release-${release.id}-invalid-date`,
        title: `Release date is not readable — ${release.name}`,
        message: `The ${source} "${date}" cannot be read as a calendar date.`,
        severity: 'Warning',
        timestamp: releaseAt,
        category: 'Release',
      });
    } else {
      push({
        id: `market-release-${release.id}-undated`,
        title: `No release window recorded — ${release.name}`,
        message:
          'The release has no planned date and no dated catalogue entry, so its launch window cannot be tracked.',
        severity: 'Warning',
        timestamp: releaseAt,
        category: 'Release',
      });
    }

    const campaign = readiness.checks?.find(
      (check) => check.id === 'campaign'
    );
    // When delivery itself is blocked the campaign is not the headline; the
    // critical alert already names the blocking gap.
    if (
      readiness.state !== 'not-ready' &&
      campaign?.state === 'not-ready' &&
      campaign.gaps?.length
    ) {
      push({
        id: `market-release-${release.id}-campaign`,
        title: `No live campaign — ${release.name}`,
        message: campaign.gaps[0],
        severity: 'Warning',
        timestamp: releaseAt,
        category: 'Marketing',
      });
    }
  } else {
    const upcoming = nextCatalogueWindow(profile.catalog ?? [], now);
    if (upcoming) {
      push({
        id: `market-window-${upcoming.id}`,
        title: `Scheduled release window — ${upcoming.title}`,
        message: `The catalogue records ${upcoming.releaseDate} as this work's release date.`,
        severity: 'Info',
        timestamp: timestampOf(
          upcoming.releaseDate,
          upcoming.updatedAt,
          generatedAt
        ),
        category: 'Release',
      });
    } else if (
      (profile.catalog?.length ?? 0) > 0 ||
      snapshot.overallScore > 0 ||
      Boolean(snapshot.nextBestMove)
    ) {
      // A profile with no recorded activity does not need a standing alert.
      push({
        id: 'market-release-none',
        title: 'No release window active',
        message: readiness.verdict,
        severity: 'Info',
        timestamp: generatedAt,
        category: 'Release',
      });
    }
  }

  // A blocked lifecycle phase is the strongest market signal: the pathway
  // already names the steps holding it up.
  const blockingPhase = MARKET_PHASES.map((id) =>
    snapshot.phases?.find((phase) => phase.id === id)
  ).find((phase) => phase?.status === 'at-risk');
  if (blockingPhase) {
    const blockers = blockingPhase.blockedBy?.length
      ? blockingPhase.blockedBy
      : blockingPhase.gaps;
    if (blockers?.length) {
      push({
        id: `market-lifecycle-${blockingPhase.id}-blocked`,
        title: `${blockingPhase.label} is blocking market progress`,
        message: `Waiting on ${blockers.slice(0, 2).join('; ')}.`,
        severity: 'Warning',
        timestamp: generatedAt,
        category: 'Lifecycle',
      });
    }
  }

  const mismatch = snapshot.risks?.find((risk) => risk.kind === 'mismatch');
  if (mismatch) {
    push({
      id: 'market-lifecycle-mismatch',
      title: 'Profile and pathway disagree',
      message: mismatch.message,
      severity: 'Warning',
      timestamp: generatedAt,
      category: 'Lifecycle',
    });
  }

  // Nothing blocking: still give the ticker the one move the pathway ranked
  // first (or an explicit all-clear), so the strip is useful instead of blank.
  // Informational windows and the no-release state are not anomalies, so they
  // do not suppress the move.
  const hasAnomaly = alerts.some((alert) => alert.severity !== 'Info');
  if (!hasAnomaly) {
    const move = snapshot.nextBestMove;
    const moveId = move ? `market-lifecycle-move-${move.id}` : '';
    if (move && !alerts.some((alert) => alert.id === moveId)) {
      push({
        id: moveId,
        title: `Next market move — ${move.title}`,
        message: move.why,
        severity: 'Info',
        timestamp: generatedAt,
        category: 'Lifecycle',
      });
    } else if (!alerts.length) {
      push({
        id: 'market-lifecycle-clear',
        title: 'No blocking market signals',
        message: `The pathway is ${snapshot.overallScore}% evidenced (${snapshot.overallProvenance}); no release or lifecycle gap is flagged.`,
        severity: 'Info',
        timestamp: generatedAt,
        category: 'Lifecycle',
      });
    }
  }

  return alerts
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.timestamp - a.timestamp
    )
    .slice(0, MAX_MARKET_ALERTS);
}
