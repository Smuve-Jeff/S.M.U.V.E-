export interface CampaignMetrics {
  reach: number;
  impressions: number;
  engagement: number;
  conversions: number;
  spend: number;
  roi: number;
  ctr: number; // Click-through rate
  cpc: number; // Cost per click
}

export interface SocialPlatformData {
  platform: 'Instagram' | 'TikTok' | 'Facebook' | 'X' | 'YouTube';
  followers: number;
  engagementRate: number;
  topPosts: { id: string; likes: number; shares: number; comments: number }[];
  lastUpdated: number;
}

export interface StreamingData {
  platform: 'Spotify' | 'Apple Music' | 'Tidal' | 'SoundCloud';
  monthlyListeners: number;
  totalStreams: number;
  topTracks: { id: string; title: string; streams: number }[];
  playlistAdds: number;
  lastUpdated: number;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  status: 'Draft' | 'Active' | 'Paused' | 'Completed';
  startDate: string;
  endDate?: string;
  /**
   * Spend the artist has allocated. `undefined` means no budget has been set —
   * it is never filled with a plausible figure, and it is not the same as the
   * artist deliberately allocating 0.
   */
  budget?: number;
  targetAudience: string;
  goals: string[];
  platforms: ('Instagram' | 'TikTok' | 'Facebook' | 'Spotify' | 'YouTube')[];
  metrics: CampaignMetrics;
  notes?: string;
  strategyLevel: 'Modern Professional' | 'Aggressive High Energy';
}

export interface MarketingAnalytics {
  totalReach: number;
  totalConversions: number;
  averageEngagement: number;
  socialPresence: SocialPlatformData[];
  streamingStats: StreamingData[];
  recentCampaigns: MarketingCampaign[];
}

/** Platforms an artist can report by hand — no integration required. */
export type ManualSocialPlatformId = 'Instagram' | 'TikTok' | 'Facebook' | 'YouTube';
export type ManualStreamingPlatformId = 'Spotify' | 'Apple Music' | 'SoundCloud';

/**
 * One week's figures, typed in by the artist.
 *
 * This is evidence, not an estimate: the artist read the number off the app and
 * recorded it. The week it describes is stored alongside it so growth stays
 * comparable and a stale week is visibly stale.
 */
export interface ManualAudienceMetric {
  id: string;
  /** Monday of the week described, `YYYY-MM-DD`. */
  weekOf: string;
  kind: 'social' | 'streaming';
  platform: ManualSocialPlatformId | ManualStreamingPlatformId;
  followers?: number;
  engagementRate?: number;
  monthlyListeners?: number;
  totalStreams?: number;
  note?: string;
  recordedAt: string;
}
