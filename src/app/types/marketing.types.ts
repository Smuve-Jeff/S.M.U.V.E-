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
  budget: number;
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
