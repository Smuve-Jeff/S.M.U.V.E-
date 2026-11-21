import { Injectable, inject, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';
import {
  ManualAudienceMetric,
  ManualSocialPlatformId,
  ManualStreamingPlatformId,
  MarketingCampaign,
  SocialPlatformData,
  StreamingData,
} from '../types/marketing.types';

export const MANUAL_SOCIAL_PLATFORMS: ManualSocialPlatformId[] = [
  'Instagram',
  'TikTok',
  'Facebook',
  'YouTube',
];

export const MANUAL_STREAMING_PLATFORMS: ManualStreamingPlatformId[] = [
  'Spotify',
  'Apple Music',
  'SoundCloud',
];

/** The most recent recorded week for each platform. */
export function latestManualByPlatform(
  metrics: ManualAudienceMetric[]
): Map<string, ManualAudienceMetric> {
  const latest = new Map<string, ManualAudienceMetric>();
  for (const entry of metrics) {
    const current = latest.get(entry.platform);
    if (!current || entry.weekOf > current.weekOf) latest.set(entry.platform, entry);
  }
  return latest;
}

const recordedAt = (entry: ManualAudienceMetric): number => {
  const parsed = Date.parse(entry.recordedAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Linked account figures win; a weekly handwritten entry fills the platforms no
 * integration reports. Nothing is invented and nothing is overwritten.
 */
export function mergeReportedSocial(
  linked: SocialPlatformData[],
  manual: ManualAudienceMetric[]
): SocialPlatformData[] {
  const reported = new Set(linked.map((entry) => entry.platform));
  const additions = [...latestManualByPlatform(manual).values()]
    .filter(
      (entry) =>
        entry.kind === 'social' &&
        !reported.has(entry.platform as SocialPlatformData['platform'])
    )
    .map<SocialPlatformData>((entry) => ({
      platform: entry.platform as SocialPlatformData['platform'],
      followers: entry.followers ?? 0,
      engagementRate: entry.engagementRate ?? 0,
      topPosts: [],
      lastUpdated: recordedAt(entry),
    }));
  return [...linked, ...additions];
}

export function mergeReportedStreaming(
  linked: StreamingData[],
  manual: ManualAudienceMetric[]
): StreamingData[] {
  const reported = new Set(linked.map((entry) => entry.platform));
  const additions = [...latestManualByPlatform(manual).values()]
    .filter(
      (entry) =>
        entry.kind === 'streaming' &&
        !reported.has(entry.platform as StreamingData['platform'])
    )
    .map<StreamingData>((entry) => ({
      platform: entry.platform as StreamingData['platform'],
      monthlyListeners: entry.monthlyListeners ?? 0,
      totalStreams: entry.totalStreams ?? 0,
      topTracks: [],
      playlistAdds: 0,
      lastUpdated: recordedAt(entry),
    }));
  return [...linked, ...additions];
}

export type GrowthState =
  | 'no-data'
  /** Nothing recorded in the previous calendar month. */
  | 'no-baseline'
  /** Both months have figures, but no platform was recorded in both. */
  | 'nothing-comparable'
  | 'comparable';

export interface AudienceTrend {
  previous: number;
  latest: number;
  delta: number;
  /** Null when the previous total is zero — a percentage there is invented. */
  percent: number | null;
  /** Platforms recorded in both months, which is what the totals compare. */
  platforms: number;
}

/** One platform's own figures, month by month — never mixed into a shared total. */
export interface PlatformTrend {
  platform: string;
  /** Oldest first, one point per month that recorded this platform. */
  points: { month: string; value: number }[];
  /** Latest month minus first, across every month recorded. */
  delta: number;
}

export interface MonthOverMonthGrowth {
  state: GrowthState;
  latestMonth: string | null;
  previousMonth: string | null;
  /** Platforms seen only in the latest month; never counted as growth. */
  newPlatforms: string[];
  followers: AudienceTrend | null;
  monthlyListeners: AudienceTrend | null;
  /**
   * Every platform's direction across all of its recorded months, largest move
   * first. A gap month simply drops out of that platform's line, so direction
   * is still visible when no month-over-month total is honest to report.
   */
  trends: PlatformTrend[];
}

const monthOf = (weekOf: string): string =>
  /^\d{4}-\d{2}/.test(weekOf) ? weekOf.slice(0, 7) : '';

/** The calendar month before `month` (`YYYY-MM`), never a "previous entry". */
export function previousMonthOf(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const previous = new Date(Date.UTC(year, index - 2, 1));
  return `${previous.getUTCFullYear()}-${String(
    previous.getUTCMonth() + 1
  ).padStart(2, '0')}`;
}

/** The figure each kind of entry contributes to the growth card. */
const metricValue = (entry: ManualAudienceMetric): number | undefined =>
  entry.kind === 'social' ? entry.followers : entry.monthlyListeners;

const trendFor = (
  kind: ManualAudienceMetric['kind'],
  latest: Map<string, ManualAudienceMetric>,
  previous: Map<string, ManualAudienceMetric>
): AudienceTrend | null => {
  // Like-for-like only: both months must record the same platform.
  const comparable = [...latest.keys()].filter(
    (platform) =>
      latest.get(platform)!.kind === kind &&
      previous.get(platform)?.kind === kind
  );
  if (!comparable.length) return null;

  const sum = (month: Map<string, ManualAudienceMetric>) =>
    comparable.reduce(
      (total, platform) => total + (metricValue(month.get(platform)!) ?? 0),
      0
    );
  const previousTotal = sum(previous);
  const latestTotal = sum(latest);
  const delta = latestTotal - previousTotal;

  return {
    previous: previousTotal,
    latest: latestTotal,
    delta,
    // Growth from zero has no meaningful percentage.
    percent:
      previousTotal > 0
        ? Math.round((delta / previousTotal) * 1000) / 10
        : null,
    platforms: comparable.length,
  };
};

const platformTrends = (
  byMonth: Map<string, Map<string, ManualAudienceMetric>>
): PlatformTrend[] => {
  const rows = new Map<string, PlatformTrend>();
  for (const month of [...byMonth.keys()].sort()) {
    for (const [platform, entry] of byMonth.get(month)!) {
      const value = metricValue(entry);
      if (value === undefined) continue;
      const row = rows.get(platform) ?? { platform, points: [], delta: 0 };
      row.points.push({ month, value });
      rows.set(platform, row);
    }
  }
  // One point has no direction; a platform measured once stays off the list.
  const trends = [...rows.values()].filter((row) => row.points.length > 1);
  for (const trend of trends) {
    const last = trend.points[trend.points.length - 1];
    trend.delta = last.value - trend.points[0].value;
  }
  return trends.sort(
    (a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) ||
      a.platform.localeCompare(b.platform)
  );
};

/**
 * Month-over-month growth from the artist's weekly entries.
 *
 * Each month contributes its latest recorded week per platform, so a month with
 * four entries is not counted four times. The comparison is always against the
 * previous calendar month, not merely the previous entry: January and March are
 * not "growth" when February was never recorded.
 */
export function monthOverMonthGrowth(
  metrics: ManualAudienceMetric[]
): MonthOverMonthGrowth {
  const byMonth = new Map<string, Map<string, ManualAudienceMetric>>();
  for (const entry of metrics) {
    const month = monthOf(entry.weekOf);
    if (!month) continue;
    const platforms = byMonth.get(month) ?? new Map<string, ManualAudienceMetric>();
    const current = platforms.get(entry.platform);
    if (!current || entry.weekOf > current.weekOf) {
      platforms.set(entry.platform, entry);
    }
    byMonth.set(month, platforms);
  }

  const latestMonth = [...byMonth.keys()].sort().pop();
  if (!latestMonth) {
    return {
      state: 'no-data',
      latestMonth: null,
      previousMonth: null,
      newPlatforms: [],
      followers: null,
      monthlyListeners: null,
      trends: [],
    };
  }

  const trends = platformTrends(byMonth);
  const previousMonth = previousMonthOf(latestMonth);
  const latest = byMonth.get(latestMonth)!;
  const previous = byMonth.get(previousMonth);
  const newPlatforms = [...latest.keys()]
    .filter((platform) => !previous?.has(platform))
    .sort();

  if (!previous) {
    return {
      state: 'no-baseline',
      latestMonth,
      previousMonth,
      newPlatforms,
      followers: null,
      monthlyListeners: null,
      trends,
    };
  }

  const followers = trendFor('social', latest, previous);
  const monthlyListeners = trendFor('streaming', latest, previous);

  return {
    state:
      followers || monthlyListeners ? 'comparable' : 'nothing-comparable',
    latestMonth,
    previousMonth,
    newPlatforms,
    followers,
    monthlyListeners,
    trends,
  };
}

@Injectable({
  providedIn: 'root',
})
export class MarketingService {
  private profileService = inject(UserProfileService);
  private artistIdentityService = inject(ArtistIdentityService);

  campaigns = computed(
    () => this.profileService.profile().marketingCampaigns || []
  );

  /**
   * Weekly figures the artist recorded by hand, newest week first.
   *
   * These exist so Strategy can report a real audience with no OAuth, no API
   * key, and no invented fallback: the artist reads the number off the platform
   * and types it in.
   */
  manualMetrics = computed<ManualAudienceMetric[]>(() =>
    [...(this.profileService.profile().manualAudienceMetrics || [])].sort(
      (a, b) => b.weekOf.localeCompare(a.weekOf)
    )
  );

  hasManualMetrics = computed(() => this.manualMetrics().length > 0);

  /** Latest month against the previous calendar month, or an honest refusal. */
  monthOverMonth = computed(() => monthOverMonthGrowth(this.manualMetrics()));

  /**
   * Platform data as recorded, or nothing at all.
   *
   * Linked accounts come first. A platform with no integration falls back to
   * the artist's latest weekly entry for it. This used to fall back to
   * hardcoded figures (12.5K Instagram followers, 85K Spotify listeners) which
   * every artist saw as their own performance; an empty list is the truth until
   * the artist records something.
   */
  socialData = computed(() =>
    mergeReportedSocial(
      this.artistIdentityService.getSocialPlatformData(),
      this.manualMetrics()
    )
  );

  streamingData = computed(() =>
    mergeReportedStreaming(
      this.artistIdentityService.getStreamingPlatformData(),
      this.manualMetrics()
    )
  );

  /** True once any real platform figure exists to report. */
  hasAudienceData = computed(
    () => this.socialData().length > 0 || this.streamingData().length > 0
  );

  /**
   * Store one week's figures. Re-recording the same platform and week replaces
   * that entry instead of stacking a second opinion on top of it.
   */
  async recordManualMetric(
    input: Omit<ManualAudienceMetric, 'id' | 'recordedAt'>
  ): Promise<boolean> {
    const weekOf = String(input.weekOf || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return false;

    const counts = [
      input.followers,
      input.engagementRate,
      input.monthlyListeners,
      input.totalStreams,
    ];
    const valid = counts.every(
      (value) =>
        value === undefined ||
        (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    );
    if (!valid || !counts.some((value) => value !== undefined)) return false;
    if (input.engagementRate !== undefined && input.engagementRate > 100) {
      return false;
    }

    const entry: ManualAudienceMetric = {
      ...input,
      weekOf,
      id: `metric-${input.kind}-${input.platform
        .replace(/\s+/g, '-')
        .toLowerCase()}-${weekOf}`,
      note: input.note?.trim() || undefined,
      recordedAt: new Date().toISOString(),
    };
    const remaining = this.manualMetrics().filter(
      (existing) =>
        existing.platform !== entry.platform || existing.weekOf !== entry.weekOf
    );
    return this.profileService.updateProfile({
      manualAudienceMetrics: [entry, ...remaining],
    });
  }

  async removeManualMetric(id: string): Promise<boolean> {
    const current = this.manualMetrics();
    const next = current.filter((entry) => entry.id !== id);
    if (next.length === current.length) return false;
    return this.profileService.updateProfile({ manualAudienceMetrics: next });
  }

  async createCampaign(
    campaign: Omit<MarketingCampaign, 'id'>
  ): Promise<boolean> {
    const newCampaign: MarketingCampaign = {
      ...campaign,
      id: `camp-${Date.now()}`,
    };

    const currentProfile = this.profileService.profile();
    return this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: [
        ...(currentProfile.marketingCampaigns || []),
        newCampaign,
      ],
    });
  }

  async updateCampaign(
    updatedCampaign: MarketingCampaign
  ): Promise<boolean> {
    const currentProfile = this.profileService.profile();
    const updatedCampaigns = (currentProfile.marketingCampaigns || []).map(
      (c) => (c.id === updatedCampaign.id ? updatedCampaign : c)
    );

    return this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: updatedCampaigns,
    });
  }

  async deleteCampaign(campaignId: string): Promise<boolean> {
    const currentProfile = this.profileService.profile();
    const filteredCampaigns = (currentProfile.marketingCampaigns || []).filter(
      (c) => c.id !== campaignId
    );

    return this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: filteredCampaigns,
    });
  }
}
