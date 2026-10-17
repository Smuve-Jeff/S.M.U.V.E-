import { Injectable, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import {
  ReleaseProject,
  ProductionTrack,
  ReleaseType,
} from '../types/release.types';
import { LoggingService } from './logging.service';
import { MarketingService } from './marketing.service';

@Injectable({
  providedIn: 'root',
})
export class ReleasePipelineService {
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);
  private marketingService = inject(MarketingService);

  activeRelease = signal<ReleaseProject | null>(null);

  constructor() {
    this.loadActiveRelease();
  }

  private loadActiveRelease() {
    const profile = this.profileService.profile();
    const current = (profile.knowledgeBase as any).currentRelease;
    if (current) {
      this.activeRelease.set(current);
    }
  }

  async initializeRelease(name: string, type: ReleaseType): Promise<void> {
    const profile = this.profileService.profile();
    const newRelease: ReleaseProject = {
      id: `rel-${Date.now()}`,
      name,
      type,
      description: '',
      status: 'Planning',
      tracks: [],
      credits: {
        artistName: profile.artistName || 'Artist',
        proName: profile.proName,
        proIpi: profile.proIpi,
        collaborators: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.activeRelease.set(newRelease);
    await this.saveToProfile(newRelease);
    this.logger.info('ReleasePipeline: Initialized new release', name);
  }

  async addTrack(title: string): Promise<void> {
    const current = this.activeRelease();
    if (!current) return;

    const newTrack: ProductionTrack = {
      id: `trk-${Date.now()}`,
      title,
      status: 'Pending',
      stages: {
        instrumental: 'Pending',
        lyrics: 'Pending',
        vocals: 'Pending',
        mixing: 'Pending',
        mastering: 'Pending',
      },
    };

    const updated = {
      ...current,
      tracks: [...current.tracks, newTrack],
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  async updateTrackStage(
    trackId: string,
    stage: keyof ProductionTrack['stages'],
    status: ProductionTrack['status']
  ): Promise<void> {
    const current = this.activeRelease();
    if (!current) return;

    const updatedTracks = current.tracks.map((t) => {
      if (t.id === trackId) {
        const newStages = { ...t.stages, [stage]: status };
        const allCompleted = Object.values(newStages).every(
          (s) => s === 'Completed'
        );
        return {
          ...t,
          stages: newStages,
          status: (allCompleted ? 'Completed' : 'In Progress') as any,
        };
      }
      return t;
    });

    const updated = {
      ...current,
      tracks: updatedTracks,
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  async updateStatus(status: ReleaseProject['status']): Promise<void> {
    const current = this.activeRelease();
    if (!current) return;

    const updated = {
      ...current,
      status,
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);

    if (status === 'Released') {
      await this.triggerMarketing();
    }
  }

  private async triggerMarketing() {
    const current = this.activeRelease();
    if (!current) return;

    this.logger.info(
      'ReleasePipeline: Triggering S.M.U.V.E. Marketing Campaign'
    );
    await this.marketingService.createCampaign({
      name: `Global Push: ${current.name}`,
      status: 'Active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 1500,
      targetAudience: 'Global',
      goals: ['Streaming Growth', 'Fan Engagement'],
      platforms: ['TikTok', 'Instagram', 'Spotify'],
      strategyLevel: 'Aggressive High Energy',
      metrics: {
        reach: 0,
        impressions: 0,
        engagement: 0,
        conversions: 0,
        spend: 0,
        roi: 0,
        ctr: 0,
        cpc: 0,
      },
    });
  }

  private async saveToProfile(release: ReleaseProject) {
    const profile = this.profileService.profile();
    await this.profileService.updateProfile({
      ...profile,
      knowledgeBase: {
        ...profile.knowledgeBase,
        currentRelease: release,
      } as any,
    });
  }
}
