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
