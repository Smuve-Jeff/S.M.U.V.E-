import { Injectable, inject, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';
import { MarketingCampaign } from '../types/marketing.types';

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
   * Platform data as recorded, or nothing at all.
   *
   * These used to fall back to hardcoded figures (12.5K Instagram followers,
   * 85K Spotify listeners, 1.2M streams on a track the artist never released),
   * which every artist saw as their own performance. An empty list is the truth
   * until an analytics source is connected; the UI states that instead of
   * quoting invented numbers into a campaign budget.
   */
  socialData = computed(() => this.artistIdentityService.getSocialPlatformData());

  streamingData = computed(() =>
    this.artistIdentityService.getStreamingPlatformData()
  );

  /** True once any real platform figure exists to report. */
  hasAudienceData = computed(
    () =>
      this.socialData().length > 0 ||
      this.streamingData().length > 0
  );

  async createCampaign(campaign: Omit<MarketingCampaign, 'id'>): Promise<void> {
    const newCampaign: MarketingCampaign = {
      ...campaign,
      id: `camp-${Date.now()}`,
    };

    const currentProfile = this.profileService.profile();
    await this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: [
        ...(currentProfile.marketingCampaigns || []),
        newCampaign,
      ],
    });
  }

  async updateCampaign(updatedCampaign: MarketingCampaign): Promise<void> {
    const currentProfile = this.profileService.profile();
    const updatedCampaigns = (currentProfile.marketingCampaigns || []).map(
      (c) => (c.id === updatedCampaign.id ? updatedCampaign : c)
    );

    await this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: updatedCampaigns,
    });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    const currentProfile = this.profileService.profile();
    const filteredCampaigns = (currentProfile.marketingCampaigns || []).filter(
      (c) => c.id !== campaignId
    );

    await this.profileService.updateProfile({
      ...currentProfile,
      marketingCampaigns: filteredCampaigns,
    });
  }

  getProjections(budget: number, platform: string) {
    // High-fidelity simulation logic
    const multiplier =
      platform === 'TikTok' ? 25 : platform === 'Instagram' ? 15 : 10;
    return {
      reach: budget * multiplier,
      conversions: Math.floor(budget * 0.15),
      engagement: Math.floor(budget * 0.5),
    };
  }
}
