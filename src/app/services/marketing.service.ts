import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { MarketingCampaign, SocialPlatformData, StreamingData } from '../types/marketing.types';

@Injectable({
  providedIn: 'root'
})
export class MarketingService {
  private profileService = inject(UserProfileService);

  campaigns = computed(() => this.profileService.profile().marketingCampaigns || []);

  socialData = signal<SocialPlatformData[]>([
    {
      platform: 'Instagram',
      followers: 12500,
      engagementRate: 4.2,
      topPosts: [
        { id: 'ig-1', likes: 1200, shares: 45, comments: 88 },
        { id: 'ig-2', likes: 980, shares: 32, comments: 45 }
      ],
      lastUpdated: Date.now()
    },
    {
      platform: 'TikTok',
      followers: 45000,
      engagementRate: 8.5,
      topPosts: [
        { id: 'tk-1', likes: 15000, shares: 1200, comments: 450 },
        { id: 'tk-2', likes: 8500, shares: 600, comments: 230 }
      ],
      lastUpdated: Date.now()
    }
  ]);

  streamingData = signal<StreamingData[]>([
    {
      platform: 'Spotify',
      monthlyListeners: 85000,
      totalStreams: 1200000,
      topTracks: [
        { id: 'sp-1', title: 'Neon Nights', streams: 450000 },
        { id: 'sp-2', title: 'Cyber Pulse', streams: 320000 }
      ],
      playlistAdds: 1250,
      lastUpdated: Date.now()
    },
    {
      platform: 'Apple Music',
      monthlyListeners: 32000,
      totalStreams: 450000,
      topTracks: [
        { id: 'am-1', title: 'Neon Nights', streams: 180000 }
      ],
      playlistAdds: 450,
      lastUpdated: Date.now()
    }
  ]);

  async createCampaign(campaign: Omit<MarketingCampaign, 'id'>): Promise<void> {
    const newCampaign: MarketingCampaign = {
      ...campaign,
      id: `camp-${Date.now()}`
    };

    const currentProfile = this.profileService.profile();
    await this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: [...(currentProfile.marketingCampaigns || []), newCampaign]
    });
  }

  async updateCampaign(updatedCampaign: MarketingCampaign): Promise<void> {
    const currentProfile = this.profileService.profile();
    const updatedCampaigns = (currentProfile.marketingCampaigns || []).map(c =>
      c.id === updatedCampaign.id ? updatedCampaign : c
    );

    await this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: updatedCampaigns
    });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    const currentProfile = this.profileService.profile();
    const filteredCampaigns = (currentProfile.marketingCampaigns || []).filter(c => c.id !== campaignId);

    await this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: filteredCampaigns
    });
  }

  getProjections(budget: number, platform: string) {
    // High-fidelity simulation logic
    const multiplier = platform === 'TikTok' ? 25 : platform === 'Instagram' ? 15 : 10;
    return {
      reach: budget * multiplier,
      conversions: Math.floor(budget * 0.15),
      engagement: Math.floor(budget * 0.5)
    };
  }
}
