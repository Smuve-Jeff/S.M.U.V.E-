import { Injectable } from '@angular/core';
import type { UserProfile, CatalogItem } from './user-profile.service';

/** How far along the artist is, judged from evidence rather than self-report. */
export type ExperienceTrack = 'emerging' | 'developing' | 'established';

/**
 * Destination families an independent artist has to exist inside.
 * - `for-artists`: the artist's own dashboards on a platform
 * - `pro`: performance-rights organisations that collect royalties
 * - `analytics`: services that measure and prove the artist's reach
 * - `delivery`: distributors that put the work on platforms in the first place
 */
export type FingerprintCategory =
  | 'delivery'
  | 'for-artists'
  | 'pro'
  | 'analytics';

export interface FingerprintDestination {
  id: string;
  category: FingerprintCategory;
  label: string;
  entity: string;
  /** Canonical entry point — the claim, sign-in, or registration page. */
  url: string;
  /** What the artist gets from it, in plain language. */
  why: string;
  /** Earliest stage where this matters. */
  stage: 'first-release' | 'early' | 'growth' | 'scale';
  /** Territories where the destination applies, when regional. */
  region?: string;
}

export interface FingerprintCoverage {
  category: FingerprintCategory;
  label: string;
  present: number;
  total: number;
  score: number;
  missing: string[];
}

export interface FingerprintReadout {
  track: ExperienceTrack;
  /** Links the artist has recorded, resolved against the registry. */
  linked: Array<{ link: { id: string; destinationId: string; url: string; verified?: boolean }; destination: FingerprintDestination | undefined }>;
  /** Links that do not match any registry entry (free-form URLs). */
  unrecognised: number;
  coverage: FingerprintCoverage[];
  overall: number;
  hasFingerprint: boolean;
  missing: FingerprintDestination[];
}

export interface FingerprintPlanStep {
  order: number;
  title: string;
  detail: string;
  destination?: FingerprintDestination;
}

export interface ReleaseHistoryEntry {
  id: string;
  title: string;
  releaseDate?: string;
  sortKey: number;
  documented: string[];
  missing: string[];
  completeness: number;
}

export interface ReleaseHistoryReport {
  releases: ReleaseHistoryEntry[];
  /** Undated works sink to the bottom and are flagged, never dropped. */
  undated: number;
  averageCompleteness: number;
  gaps: string[];
  timelineIssues: string[];
}

/**
 * Destination id → family. Exported so other services can classify a recorded
 * link without duplicating the registry or going through dependency injection.
 */
export const FINGERPRINT_CATEGORY_BY_ID: Record<string, FingerprintCategory> = {
  distrokid: 'delivery',
  tunecore: 'delivery',
  cdbaby: 'delivery',
  amuse: 'delivery',
  unitedmasters: 'delivery',
  symphonic: 'delivery',
  'spotify-for-artists': 'for-artists',
  'apple-music-for-artists': 'for-artists',
  'youtube-for-artists': 'for-artists',
  'amazon-for-artists': 'for-artists',
  'deezer-for-creators': 'for-artists',
  'tidal-artist-home': 'for-artists',
  'soundcloud-for-artists': 'for-artists',
  bandcamp: 'for-artists',
  'pandora-amp': 'for-artists',
  audiomack: 'for-artists',
  ascap: 'pro',
  bmi: 'pro',
  sesac: 'pro',
  prs: 'pro',
  gema: 'pro',
  socan: 'pro',
  sacem: 'pro',
  jasrac: 'pro',
  chartmetric: 'analytics',
  soundcharts: 'analytics',
  viberate: 'analytics',
  songstats: 'analytics',
};

const CATEGORY_LABEL: Record<FingerprintCategory, string> = {
  delivery: 'Delivery & Distribution',
  'for-artists': 'For Artists Dashboards',
  pro: 'Rights Organisations',
  analytics: 'Analytics & Proof',
};

const REGISTRY: FingerprintDestination[] = [
  // ── Delivery ──────────────────────────────────────────────────────────
  { id: 'distrokid', category: 'delivery', label: 'DistroKid', entity: 'DistroKid', url: 'https://distrokid.com', why: 'Cheapest path to every major store with yearly pricing.', stage: 'first-release' },
  { id: 'tunecore', category: 'delivery', label: 'TuneCore', entity: 'TuneCore', url: 'https://www.tunecore.com', why: 'Straightforward delivery with publishing administration add-ons.', stage: 'early' },
  { id: 'cdbaby', category: 'delivery', label: 'CD Baby', entity: 'CD Baby', url: 'https://cdbaby.com', why: 'One-time fee per release and long-running store coverage.', stage: 'early' },
  { id: 'amuse', category: 'delivery', label: 'Amuse', entity: 'Amuse', url: 'https://www.amuse.io', why: 'Free tier for a first release while the artist gets organised.', stage: 'first-release' },
  { id: 'unitedmasters', category: 'delivery', label: 'UnitedMasters', entity: 'UnitedMasters', url: 'https://unitedmasters.com', why: 'Delivery plus brand-partnership access.', stage: 'growth' },
  { id: 'symphonic', category: 'delivery', label: 'Symphonic', entity: 'Symphonic Distribution', url: 'https://symphonic.com', why: 'Label-services delivery once a catalogue exists.', stage: 'growth' },

  // ── For Artists dashboards ───────────────────────────────────────────
  { id: 'spotify-for-artists', category: 'for-artists', label: 'Spotify for Artists', entity: 'Spotify', url: 'https://artists.spotify.com', why: 'Pitch editorial, claim your profile, read playlist and listener data.', stage: 'first-release' },
  { id: 'apple-music-for-artists', category: 'for-artists', label: 'Apple Music for Artists', entity: 'Apple Music', url: 'https://artists.apple.com', why: 'Control artwork and bio, and see Shazam and Apple analytics.', stage: 'early' },
  { id: 'youtube-for-artists', category: 'for-artists', label: 'YouTube for Artists', entity: 'YouTube', url: 'https://studio.youtube.com', why: 'Manage the official artist channel and content claims.', stage: 'early' },
  { id: 'amazon-for-artists', category: 'for-artists', label: 'Amazon Music for Artists', entity: 'Amazon Music', url: 'https://artists.amazonmusic.com', why: 'Profile edits plus Alexa and voice-request data.', stage: 'growth' },
  { id: 'deezer-for-creators', category: 'for-artists', label: 'Deezer for Creators', entity: 'Deezer', url: 'https://creators.deezer.com', why: 'Profile control and audience data outside the US-first platforms.', stage: 'growth' },
  { id: 'tidal-artist-home', category: 'for-artists', label: 'TIDAL Artist Home', entity: 'TIDAL', url: 'https://artists.tidal.com', why: 'Hi-fi audience profile and credit corrections.', stage: 'growth' },
  { id: 'soundcloud-for-artists', category: 'for-artists', label: 'SoundCloud for Artists', entity: 'SoundCloud', url: 'https://artists.soundcloud.com', why: 'Fans, feedback, and distribution from the same upload.', stage: 'first-release' },
  { id: 'bandcamp', category: 'for-artists', label: 'Bandcamp', entity: 'Bandcamp', url: 'https://bandcamp.com', why: 'Direct-to-fan sales where the artist keeps the relationship.', stage: 'first-release' },
  { id: 'pandora-amp', category: 'for-artists', label: 'Pandora AMP', entity: 'Pandora', url: 'https://amp.pandora.com', why: 'Artist audio messaging and station analytics.', stage: 'scale', region: 'US' },
  { id: 'audiomack', category: 'for-artists', label: 'Audiomack', entity: 'Audiomack', url: 'https://audiomack.com', why: 'Free hosting with strong presence in hip hop and afrobeats.', stage: 'early' },

  // ── Rights organisations ─────────────────────────────────────────────
  { id: 'ascap', category: 'pro', label: 'ASCAP', entity: 'ASCAP', url: 'https://www.ascap.com', why: 'Collect performance royalties for writer and publisher shares.', stage: 'first-release', region: 'US' },
  { id: 'bmi', category: 'pro', label: 'BMI', entity: 'BMI', url: 'https://www.bmi.com', why: 'Performance royalties with a straightforward writer sign-up.', stage: 'first-release', region: 'US' },
  { id: 'sesac', category: 'pro', label: 'SESAC', entity: 'SESAC', url: 'https://www.sesac.com', why: 'Invitation-based PRO with boutique writer support.', stage: 'growth', region: 'US' },
  { id: 'prs', category: 'pro', label: 'PRS for Music', entity: 'PRS', url: 'https://www.prsformusic.com', why: 'UK performance and mechanical royalties collection.', stage: 'early', region: 'UK' },
  { id: 'gema', category: 'pro', label: 'GEMA', entity: 'GEMA', url: 'https://www.gema.de', why: 'German writers and publishers royalty collection.', stage: 'early', region: 'DE' },
  { id: 'socan', category: 'pro', label: 'SOCAN', entity: 'SOCAN', url: 'https://www.socan.ca', why: 'Canadian performance, reproduction, and sync royalties.', stage: 'early', region: 'CA' },
  { id: 'sacem', category: 'pro', label: 'SACEM', entity: 'SACEM', url: 'https://www.sacem.fr', why: 'French authors, composers, and publishers collection.', stage: 'early', region: 'FR' },
  { id: 'jasrac', category: 'pro', label: 'JASRAC', entity: 'JASRAC', url: 'https://www.jasrac.or.jp', why: 'Japanese rights collection and licensing.', stage: 'growth', region: 'JP' },

  // ── Analytics & proof ────────────────────────────────────────────────
  { id: 'chartmetric', category: 'analytics', label: 'Chartmetric', entity: 'Chartmetric', url: 'https://chartmetric.com', why: 'Cross-platform artist and playlist tracking in one place.', stage: 'growth' },
  { id: 'soundcharts', category: 'analytics', label: 'Soundcharts', entity: 'Soundcharts', url: 'https://www.soundcharts.com', why: 'Radio, chart, and playlist monitoring for release campaigns.', stage: 'growth' },
  { id: 'viberate', category: 'analytics', label: 'Viberate', entity: 'Viberate', url: 'https://www.viberate.com', why: 'Free artist profile analytics with booking and playlist context.', stage: 'early' },
  { id: 'songstats', category: 'analytics', label: 'Songstats', entity: 'Songstats', url: 'https://songstats.com', why: 'Per-release performance notifications and shareable reports.', stage: 'growth' },
];

/**
 * Governs the artist's official online presence.
 *
 * Two very different users share this service:
 * - an artist with **no** online fingerprint yet, who needs an ordered plan
 *   that starts at delivery and ends at analytics, and
 * - an artist who **already** exists online, whose links must be recorded,
 *   verified, consolidated, and turned into an organised release history.
 */
@Injectable({ providedIn: 'root' })
export class ArtistOnlineFingerprintService {
  readonly destinations = REGISTRY;

  destination(id: string): FingerprintDestination | undefined {
    return REGISTRY.find((entry) => entry.id === id);
  }

  destinationsByCategory(category: FingerprintCategory): FingerprintDestination[] {
    return REGISTRY.filter((entry) => entry.category === category);
  }

  get categories(): Array<{ id: FingerprintCategory; label: string }> {
    return (Object.keys(CATEGORY_LABEL) as FingerprintCategory[]).map((id) => ({
      id,
      label: CATEGORY_LABEL[id],
    }));
  }

  /**
   * Judges the artist's stage from evidence, so a beginner is not treated like
   * a catalogue owner and an established artist is not sent back to basics.
   */
  track(profile: UserProfile | null | undefined): ExperienceTrack {
    const p: any = profile || {};
    const releases = Array.isArray(p.catalog) ? p.catalog.length : 0;
    const links = Array.isArray(p.officialArtistProfiles) ? p.officialArtistProfiles.length : 0;
    const accounts = Array.isArray(p.artistIdentity?.linkedAccounts)
      ? p.artistIdentity.linkedAccounts.length
      : 0;
    const hasPro =
      typeof p.legalInfrastructure?.proAffiliation === 'string' &&
      p.legalInfrastructure.proAffiliation !== 'None' &&
      p.legalInfrastructure.proAffiliation.trim().length > 0;
    // Resolution confidence is normalised 0–1 by ArtistIdentityService.
    const official = this.atLeast(p.artistIdentity?.resolution?.confidenceScore, 0.5);
    const shows = Number.parseInt(String(p.performancesPerYear ?? ''), 10);

    const evidence = releases + links + accounts + (hasPro ? 1 : 0) + (official ? 1 : 0);
    const performing = Number.isFinite(shows) && shows > 0;

    if (releases >= 6 && (links + accounts) >= 4 && hasPro) return 'established';
    if (releases >= 2 || (links + accounts) >= 2 || evidence >= 3 || performing) return 'developing';
    return 'emerging';
  }

  private atLeast(value: unknown, minimum: number): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
  }

  /** Full readout of what exists online, what is missing, and by category. */
  readout(profile: UserProfile | null | undefined): FingerprintReadout {
    const p: any = profile || {};
    const links: any[] = Array.isArray(p.officialArtistProfiles)
      ? p.officialArtistProfiles
      : [];

    const linked = links.map((link) => ({
      link,
      destination: this.destination(String(link?.destinationId || '')),
    }));
    const unrecognised = linked.filter((entry) => !entry.destination).length;
    const presentIds = new Set(
      linked.map((entry) => entry.destination?.id).filter(Boolean) as string[]
    );

    const coverage = (Object.keys(CATEGORY_LABEL) as FingerprintCategory[]).map(
      (category) => {
        const all = this.destinationsByCategory(category);
        const present = all.filter((entry) => presentIds.has(entry.id)).length;
        return {
          category,
          label: CATEGORY_LABEL[category],
          present,
          total: all.length,
          score: all.length ? Math.round((present / all.length) * 100) : 0,
          missing: all.filter((entry) => !presentIds.has(entry.id)).map((entry) => entry.label),
        };
      }
    );

    const declared = linked.filter((entry) => entry.destination);
    const possible = REGISTRY.length;
    const overall = possible
      ? Math.round((declared.length / possible) * 100)
      : 0;
    const missing = REGISTRY.filter((entry) => !presentIds.has(entry.id));

    return {
      track: this.track(profile),
      linked,
      unrecognised,
      coverage,
      overall,
      hasFingerprint: links.length > 0,
      missing,
    };
  }

  /** Add or update a recorded link without duplicating the same destination. */
  upsertLink(
    profile: UserProfile,
    destinationId: string,
    url: string,
    verified = false
  ): UserProfile {
    const destination = this.destination(destinationId);
    const label = destination?.label ?? destinationId;
    const trimmed = String(url || '').trim();
    const existing = Array.isArray(profile.officialArtistProfiles)
      ? profile.officialArtistProfiles
      : [];
    const index = existing.findIndex(
      (link) => link.destinationId === destinationId || link.id === destinationId
    );

    const next = [...existing];
    if (index >= 0) {
      next[index] = { ...next[index], url: trimmed, verified, label };
    } else {
      next.push({
        id: destinationId,
        destinationId,
        label,
        url: trimmed,
        verified,
        addedAt: Date.now(),
      });
    }

    return { ...profile, officialArtistProfiles: next };
  }

  removeLink(profile: UserProfile, destinationId: string): UserProfile {
    const existing = Array.isArray(profile.officialArtistProfiles)
      ? profile.officialArtistProfiles
      : [];
    return {
      ...profile,
      officialArtistProfiles: existing.filter(
        (link) => link.destinationId !== destinationId && link.id !== destinationId
      ),
    };
  }

  /**
   * Ordered plan. Beginners start at delivery; artists already online start by
   * verifying and consolidating what they own.
   */
  plan(profile: UserProfile | null | undefined): FingerprintPlanStep[] {
    const readout = this.readout(profile);
    const steps: FingerprintPlanStep[] = [];
    let order = 1;

    if (readout.track === 'emerging') {
      steps.push({
        order: order++,
        title: 'Put one finished song out through a distributor',
        detail:
          'Nothing else in this list can happen until a release exists. Delivery is step one, not a milestone you reach later.',
        destination: this.destination('amuse') ?? this.destination('distrokid'),
      });
      steps.push({
        order: order++,
        title: 'Claim your artist dashboard the day the release goes live',
        detail:
          'The dashboard is where you pitch playlists and correct metadata. Claim it before anyone else can.',
        destination: this.destination('spotify-for-artists'),
      });
      steps.push({
        order: order++,
        title: 'Register as a writer with a rights organisation',
        detail:
          'Performance money is collected through a PRO, not through the store. Signing up is free and does not require a catalogue.',
        destination: this.destination('ascap') ?? this.destination('prs'),
      });
    } else {
      const unverified = readout.linked.filter(
        (entry) => entry.destination && !entry.link?.verified
      );
      if (unverified.length) {
        steps.push({
          order: order++,
          title: `Verify ${unverified.length} recorded link${unverified.length > 1 ? 's' : ''}`,
          detail:
            'An unverified link cannot be used as ownership evidence. Confirm each one is the artist’s official account and mark it verified.',
        });
      }
      const byCategory = (category: FingerprintCategory) =>
        readout.coverage.find((entry) => entry.category === category);
      if (!byCategory('pro')?.present) {
        steps.push({
          order: order++,
          title: 'Affiliate with a rights organisation',
          detail:
            'Released music without a PRO affiliation is uncollected money.',
          destination: this.destination('ascap') ?? this.destination('prs'),
        });
      }
      if (!byCategory('analytics')?.present) {
        steps.push({
          order: order++,
          title: 'Set up one analytics source',
          detail:
            'Pick a single measurement tool and use it for every release so growth is comparable over time.',
          destination: this.destination('viberate') ?? this.destination('chartmetric'),
        });
      }
    }

    const undocumented = this.history(profile).gaps;
    if (undocumented.length) {
      steps.push({
        order: order++,
        title: 'Document the release history',
        detail: `S.M.U.V.E. still needs ${undocumented.slice(0, 3).join(', ')}. A first catalogue release should be fully documented within a week of going live.`,
      });
    }

    const dashboards = readout.coverage.find((entry) => entry.category === 'for-artists');
    if (dashboards && dashboards.present > 0 && dashboards.score < 40) {
      steps.push({
        order: order++,
        title: 'Claim the remaining platform dashboards',
        detail:
          'Every store the music is live on should have a claimed artist profile, or the metadata stays out of the artist’s control.',
        destination: this.destination('apple-music-for-artists'),
      });
    }

    return steps;
  }

  /**
   * Organises the official music history: chronological releases, metadata
   * completeness per work, and integrity problems in the timeline.
   */
  history(profile: UserProfile | null | undefined): ReleaseHistoryReport {
    const p: any = profile || {};
    const catalog: CatalogItem[] = Array.isArray(p.catalog) ? p.catalog : [];

    const releases: ReleaseHistoryEntry[] = catalog.map((item) => {
      const documented: string[] = [];
      const missing: string[] = [];
      const check = (label: string, ok: boolean) => (ok ? documented : missing).push(label);

      check('release date', Boolean(item.releaseDate));
      check('release type', Boolean(item.releaseType));
      check('ISRC or UPC', Boolean(item.isrc || item.upc));
      check('distributor', Boolean(item.distributor));
      check('platforms', Array.isArray(item.platforms) && item.platforms.length > 0);
      check('credits', Boolean(item.credits));
      check('ownership reference', Boolean(item.splitSheetRef));

      const total = documented.length + missing.length;
      return {
        id: item.id,
        title: item.title,
        releaseDate: item.releaseDate,
        sortKey: this.toTimestamp(item.releaseDate),
        documented,
        missing,
        completeness: total ? Math.round((documented.length / total) * 100) : 0,
      };
    });

    // Undated works sort last rather than disappearing.
    const sorted = [...releases].sort(
      (a, b) => (b.sortKey || 0) - (a.sortKey || 0)
    );
    const undated = releases.filter((entry) => !entry.releaseDate).length;
    const averageCompleteness = releases.length
      ? Math.round(
          releases.reduce((sum, entry) => sum + entry.completeness, 0) / releases.length
        )
      : 0;

    const gaps = Array.from(
      new Set(releases.flatMap((entry) => entry.missing))
    );

    const timelineIssues: string[] = [];
    if (undated > 0 && catalog.length > 0) {
      timelineIssues.push(
        `${undated} of ${catalog.length} works have no release date, so the timeline cannot be ordered.`
      );
    }
    const withDates = releases.filter((entry) => entry.releaseDate);
    const futureDated = withDates.filter((entry) => entry.sortKey > Date.now());
    if (futureDated.length) {
      timelineIssues.push(
        `${futureDated.length} work(s) carry a future release date — confirm they are scheduled, not mistyped.`
      );
    }
    const duplicateTitles = this.duplicates(catalog.map((item) => item.title));
    if (duplicateTitles.length) {
      timelineIssues.push(
        `Repeated titles found (${duplicateTitles.join(', ')}) — label versions so the history stays unambiguous.`
      );
    }

    return { releases: sorted, undated, averageCompleteness, gaps, timelineIssues };
  }

  private toTimestamp(value?: string): number {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private duplicates(titles: string[]): string[] {
    const seen = new Map<string, number>();
    for (const title of titles) {
      const key = String(title || '').trim().toLowerCase();
      if (!key) continue;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    return [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([title]) => title);
  }
}
