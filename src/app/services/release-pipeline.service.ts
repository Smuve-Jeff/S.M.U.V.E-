import { Injectable, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import {
  ReleaseProject,
  ProductionTrack,
  ReleaseType,
} from '../types/release.types';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class ReleasePipelineService {
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);

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

  /**
   * Records the split document for this release. Only the reference is stored:
   * S.M.U.V.E. never holds the document, so this is the artist's statement and
   * readiness reads it as such.
   */
  async recordSplitReference(reference: string): Promise<void> {
    const current = this.activeRelease();
    const trimmed = (reference || '').trim();
    if (!current || !trimmed) return;

    const updated: ReleaseProject = {
      ...current,
      splitSheetRef: trimmed,
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /**
   * Points the release at a campaign the artist already built. Readiness and
   * the creative-to-business bridge both read this reference, so attaching is
   * what makes "this release has a campaign behind it" true.
   */
  async attachCampaign(campaignId: string): Promise<void> {
    const current = this.activeRelease();
    const id = (campaignId || '').trim();
    if (!current || !id) return;

    const updated: ReleaseProject = {
      ...current,
      marketingCampaignId: id,
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /** Removes the campaign reference without touching the campaign itself. */
  async detachCampaign(): Promise<void> {
    const current = this.activeRelease();
    if (!current || !current.marketingCampaignId) return;

    const updated: ReleaseProject = { ...current, updatedAt: Date.now() };
    delete updated.marketingCampaignId;

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /** Records the PRO and IPI the release will collect through. */
  async recordProRegistration(proName: string, proIpi: string): Promise<void> {
    const current = this.activeRelease();
    const name = (proName || '').trim();
    const ipi = (proIpi || '').trim();
    if (!current || !name || !ipi) return;

    const updated: ReleaseProject = {
      ...current,
      credits: { ...current.credits, proName: name, proIpi: ipi },
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

    /*
     * Marking a release live used to create a "Global Push" campaign on its own:
     * $1,500 budget, a 30-day window, and invented goals and platforms. None of
     * that came from the artist, so the campaign is not created here. A campaign
     * carries money and a strategy, and both have to be the artist's own entries
     * in the marketing workspace.
     */
    if (status === 'Released') {
      this.logger.info(
        'ReleasePipeline: Release marked live. No campaign was created — a campaign needs the artist\'s own budget and platforms.'
      );
    }
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
