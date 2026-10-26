import { Injectable, inject, signal } from '@angular/core';
import { UserProfile, UserProfileService } from './user-profile.service';
import {
  ReleaseProject,
  ProductionTrack,
  ReleaseType,
} from '../types/release.types';
import { LoggingService } from './logging.service';
import {
  findCatalogWork,
  normalizeReleaseTitle,
  withAdoptedSplit,
} from './release-split.util';
import { CatalogItem } from '../types/profile.types';

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
      // Adoption is in-memory only: the reference is written to the release on
      // its next save, never as a side effect of loading. The bridge resolves
      // the same reference itself, so the two surfaces cannot disagree.
      this.activeRelease.set(withAdoptedSplit(profile, current) ?? current);
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
      // The split is confirmed against the collaborators known right now, so a
      // later addition can be reported as uncovered instead of assumed in.
      splitSheetFor: [...(current.credits?.collaborators ?? [])],
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /**
   * Replaces the collaborator list. Changing it does not silently refresh the
   * split reference: an existing split then covers only the names it was
   * recorded against, which is what the rights reading reports.
   */
  async updateCollaborators(names: string[]): Promise<void> {
    const current = this.activeRelease();
    if (!current) return;

    const seen = new Set<string>();
    const collaborators: string[] = [];
    for (const raw of names ?? []) {
      const name = (raw || '').trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      collaborators.push(name);
    }

    const updated: ReleaseProject = {
      ...current,
      credits: { ...current.credits, collaborators },
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /** Links this release to the catalogue work it actually is. */
  async linkCatalogWork(workId: string): Promise<void> {
    const current = this.activeRelease();
    const id = (workId || '').trim();
    if (!current || !id) return;

    const updated: ReleaseProject = {
      ...current,
      catalogWorkId: id,
      updatedAt: Date.now(),
    };

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /**
   * Creates the catalogue work for this release when the profile holds none,
   * then links the release to it.
   *
   * Only fields the release actually records are carried over: title, artist
   * credit, release type, and a split reference if one was recorded. Identifiers,
   * dates, distributor, and platforms are left absent rather than filled with
   * plausible values, so the readiness checks keep reporting them as gaps.
   *
   * When a work already matches, nothing is created — the release is linked to
   * the work that exists instead.
   */
  async createCatalogWorkFromRelease(): Promise<
    { workId: string; created: boolean } | null
  > {
    const current = this.activeRelease();
    if (!current) return null;

    const profile = this.profileService.profile();
    const existing = findCatalogWork(profile, current);
    if (existing?.id) {
      if (current.catalogWorkId !== existing.id) {
        await this.linkCatalogWork(existing.id);
      }
      return { workId: existing.id, created: false };
    }

    const work = this.buildCatalogWork(current);

    const linked: ReleaseProject = {
      ...current,
      catalogWorkId: work.id,
      updatedAt: Date.now(),
    };

    this.activeRelease.set(linked);
    await this.profileService.updateProfile({
      ...profile,
      catalog: [...(profile.catalog ?? []), work],
      knowledgeBase: {
        ...profile.knowledgeBase,
        currentRelease: linked,
      } as any,
    });
    this.logger.info('ReleasePipeline: Created a catalogue work for the release');

    return { workId: work.id, created: true };
  }

  /**
   * Records the delivery identifiers a distributor requires onto the release's
   * catalogue work, creating that work when the profile holds none and linking
   * the release to it either way.
   *
   * Only fields the artist filled in are written: a blank input leaves the
   * existing value alone rather than erasing it, and nothing is defaulted, so a
   * gap stays a gap until the artist states the value.
   */
  async recordDeliveryMetadata(patch: {
    isrc?: string;
    upc?: string;
    releaseDate?: string;
    distributor?: string;
    platforms?: string[];
  }): Promise<{ workId: string; recorded: string[] } | null> {
    const current = this.activeRelease();
    if (!current) return null;

    const profile = this.profileService.profile();
    // No work yet: build one here so the identifiers land in a single write
    // together with the link, rather than creating an empty work first.
    const existing = findCatalogWork(profile, current);
    const work = existing?.id ? existing : this.buildCatalogWork(current);

    const next: CatalogItem = { ...work };
    const recorded: string[] = [];
    const assign = (
      label: string,
      value: string | undefined,
      key: 'isrc' | 'upc' | 'releaseDate' | 'distributor'
    ) => {
      const trimmed = (value || '').trim();
      if (!trimmed) return;
      next[key] = trimmed;
      recorded.push(label);
    };

    assign('ISRC', patch.isrc, 'isrc');
    assign('UPC', patch.upc, 'upc');
    assign('release date', patch.releaseDate, 'releaseDate');
    assign('distributor', patch.distributor, 'distributor');

    const platforms = (patch.platforms ?? [])
      .map((platform) => (platform || '').trim())
      .filter(Boolean);
    if (platforms.length) {
      next.platforms = platforms;
      recorded.push('platforms');
    }

    if (!recorded.length) return { workId: work.id, recorded };

    next.updatedAt = new Date().toISOString();
    const linked: ReleaseProject = {
      ...current,
      catalogWorkId: work.id,
      updatedAt: Date.now(),
    };
    this.activeRelease.set(linked);
    await this.profileService.updateProfile({
      ...profile,
      catalog: existing?.id
        ? (profile.catalog ?? []).map((entry) =>
            entry.id === work.id ? next : entry
          )
        : [...(profile.catalog ?? []), next],
      knowledgeBase: {
        ...profile.knowledgeBase,
        currentRelease: linked,
      } as any,
    });
    this.logger.info(
      `ReleasePipeline: Recorded delivery metadata (${recorded.join(', ')})`
    );

    return { workId: work.id, recorded };
  }

  /**
   * A catalogue work built only from what the release records. Identifiers,
   * dates, distributor, platforms, genre, and credits are left absent — filling
   * them with plausible values would be a lie the readings would then trust.
   */
  private buildCatalogWork(release: ReleaseProject): CatalogItem {
    const now = new Date().toISOString();
    const work: CatalogItem = {
      id: `cat-${Date.now()}`,
      title: (release.name || '').trim(),
      artist: (release.credits?.artistName || '').trim() || undefined,
      releaseType: release.type,
      status: release.status,
      createdAt: now,
      updatedAt: now,
    };
    const split = (release.splitSheetRef || '').trim();
    if (split) work.splitSheetRef = split;
    return work;
  }

  /** Drops the link; readings fall back to matching the title again. */
  async unlinkCatalogWork(): Promise<void> {
    const current = this.activeRelease();
    if (!current || !current.catalogWorkId) return;

    const updated: ReleaseProject = { ...current, updatedAt: Date.now() };
    delete updated.catalogWorkId;

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
      catalog: this.withCatalogueSplit(profile, release),
      knowledgeBase: {
        ...profile.knowledgeBase,
        currentRelease: release,
      } as any,
    });
  }

  /**
   * Mirrors a recorded split reference onto the catalogue work for this release,
   * so the two surfaces do not hold different versions of one rights fact. The
   * work is the linked one when the artist linked it, otherwise the title match.
   * It only ever writes a reference the artist supplied: a release with no split
   * leaves the catalogue alone, and no work is created when nothing matches.
   */
  private withCatalogueSplit(
    profile: UserProfile,
    release: ReleaseProject
  ): UserProfile['catalog'] {
    const catalog = profile.catalog ?? [];
    const reference = (release.splitSheetRef || '').trim();
    if (!reference || !catalog.length) return catalog;

    // A linked release writes to the work it points at. Without a link the app
    // writes to every title match, which is all it could do before linking.
    const linkedId = (release.catalogWorkId || '').trim();
    const target = normalizeReleaseTitle(release.name);
    if (!linkedId && !target) return catalog;

    let changed = false;
    const next = catalog.map((work) => {
      const isTarget = linkedId
        ? work.id === linkedId
        : normalizeReleaseTitle(work.title) === target;
      if (!isTarget) return work;
      if ((work.splitSheetRef || '').trim() === reference) return work;
      changed = true;
      return {
        ...work,
        splitSheetRef: reference,
        updatedAt: new Date().toISOString(),
      };
    });

    return changed ? next : catalog;
  }
}
