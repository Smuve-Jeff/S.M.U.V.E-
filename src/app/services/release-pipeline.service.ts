import { Injectable, computed, inject, signal } from '@angular/core';
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
import { isCalendarDay } from './release-window.util';
import { CatalogItem } from '../types/profile.types';

export const PLANNED_DATE_RECONCILIATION_STORAGE_KEY =
  'smuve_planned_date_reconciliation_history';
export const LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY =
  'smuve_last_planned_date_reconciliation';
export const PLANNED_DATE_RECONCILIATION_HISTORY_LIMIT = 12;

export interface PlannedDateReconciliation {
  id: string;
  releaseId: string;
  workId: string;
  workTitle: string;
  plannedDate: string;
  previousCatalogueDate?: string;
  /** When this write happened; absent on entries migrated from the old record. */
  appliedAt?: string;
  /** Set when the artist restored this entry. */
  restoredAt?: string;
  /** Why this entry can no longer be restored. */
  unavailableReason?: 'work-missing' | 'date-changed';
}

export type PlannedDateUndoResult =
  | 'restored'
  | 'no-reconciliation'
  | 'work-missing'
  | 'date-changed';

@Injectable({
  providedIn: 'root',
})
export class ReleasePipelineService {
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);

  activeRelease = signal<ReleaseProject | null>(null);

  /**
   * Date reconciliations, newest first. This is browser-local editorial
   * history: it records what the artist changed, not a platform fact.
   */
  readonly reconciliationHistory = signal<PlannedDateReconciliation[]>([]);

  /** The newest entry that can still be restored. */
  readonly lastPlannedDateReconciliation = computed(
    () =>
      this.reconciliationHistory().find(
        (entry) => !entry.restoredAt && !entry.unavailableReason
      ) ?? null
  );

  constructor() {
    // History is a browser-local affordance: it should survive a reload.
    this.reconciliationHistory.set(this.loadReconciliationHistory());
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
   * Records the artist's intended release date. It drives the timing reading
   * and the market ticker; it is not copied to the catalogue, because the
   * distributor-facing date is a separate fact recorded on the work itself.
   * An empty value clears the planned window.
   */
  async setPlannedReleaseDate(date: string): Promise<void> {
    const current = this.activeRelease();
    if (!current) return;

    const plannedReleaseDate = (date || '').trim();
    if (plannedReleaseDate && !isCalendarDay(plannedReleaseDate)) return;
    const updated: ReleaseProject = { ...current, updatedAt: Date.now() };
    if (plannedReleaseDate) updated.plannedReleaseDate = plannedReleaseDate;
    else delete updated.plannedReleaseDate;

    this.activeRelease.set(updated);
    await this.saveToProfile(updated);
  }

  /**
   * Copies the recorded planned date onto the catalogue work the readiness
   * reading uses. This is the only write that makes the artist's target and the
   * distributor-facing date agree; the workspace only calls it after an
   * explicit confirmation. Nothing is created when no work matches.
   */
  async copyPlannedDateToCatalogue(): Promise<{
    workId: string;
    date: string;
  } | null> {
    const current = this.activeRelease();
    const planned = (current?.plannedReleaseDate || '').trim();
    if (!current || !planned || !isCalendarDay(planned)) {
      return null;
    }

    const profile = this.profileService.profile();
    const work = findCatalogWork(profile, current);
    if (!work?.id) return null;

    const previousCatalogueDate = (work.releaseDate || '').trim() || undefined;
    const next: CatalogItem = {
      ...work,
      releaseDate: planned,
      updatedAt: new Date().toISOString(),
    };
    await this.profileService.updateProfile({
      ...profile,
      catalog: (profile.catalog ?? []).map((entry) =>
        entry.id === work.id ? next : entry
      ),
    });

    this.rememberReconciliation({
      releaseId: current.id,
      workId: work.id,
      workTitle: work.title || current.name,
      plannedDate: planned,
      previousCatalogueDate,
    });
    this.logger.info(
      `ReleasePipeline: Copied planned date ${planned} to catalogue work ${work.id}`
    );
    return { workId: work.id, date: planned };
  }

  /**
   * Restores the catalogue date the last reconciliation overwrote. It refuses
   * to write if the work is gone or its date has changed again since the
   * reconciliation, so an undo cannot clobber a newer edit.
   */
  async undoPlannedDateReconciliation(): Promise<PlannedDateUndoResult> {
    const undo = this.lastPlannedDateReconciliation();
    if (!undo) return 'no-reconciliation';
    return this.restoreReconciliation(undo.id);
  }

  /**
   * Restores one recorded reconciliation. The entry stays in history with its
   * outcome, so a restore is reviewable rather than silently deleting the
   * record. It refuses to write if the work is gone or its date changed since
   * that reconciliation, so an old entry cannot clobber a newer edit.
   */
  async restoreReconciliation(id: string): Promise<PlannedDateUndoResult> {
    const current = this.activeRelease();
    const undo = this.reconciliationHistory().find((entry) => entry.id === id);
    if (
      !current ||
      !undo ||
      undo.releaseId !== current.id ||
      undo.restoredAt ||
      undo.unavailableReason
    ) {
      return 'no-reconciliation';
    }

    const profile = this.profileService.profile();
    const work = (profile.catalog ?? []).find(
      (entry) => entry.id === undo.workId
    );
    if (!work) {
      this.recordReconciliationOutcome(undo.id, 'work-missing');
      return 'work-missing';
    }

    if ((work.releaseDate || '').trim() !== undo.plannedDate) {
      this.recordReconciliationOutcome(undo.id, 'date-changed');
      return 'date-changed';
    }

    const restored: CatalogItem = {
      ...work,
      updatedAt: new Date().toISOString(),
    };
    if (undo.previousCatalogueDate) {
      restored.releaseDate = undo.previousCatalogueDate;
    } else {
      delete restored.releaseDate;
    }

    await this.profileService.updateProfile({
      ...profile,
      catalog: (profile.catalog ?? []).map((entry) =>
        entry.id === undo.workId ? restored : entry
      ),
    });
    this.recordReconciliationOutcome(undo.id, 'restored');
    this.logger.info(
      `ReleasePipeline: Restored catalogue date ${undo.previousCatalogueDate ?? '(unrecorded)'} on ${undo.workId}`
    );
    return 'restored';
  }

  /**
   * Clears this release's local reconciliation history. Other releases keep
   * theirs, and no catalogue or planned date is written: clearing history is
   * editorial housekeeping, not a date change.
   */
  clearPlannedDateReconciliationHistory(): number {
    const current = this.activeRelease();
    if (!current) return 0;

    const before = this.reconciliationHistory().length;
    this.reconciliationHistory.update((history) =>
      history.filter((entry) => entry.releaseId !== current.id)
    );
    const cleared = before - this.reconciliationHistory().length;
    if (!cleared) return 0;

    this.persistReconciliationHistory();
    this.logger.info(
      `ReleasePipeline: Cleared ${cleared} planned-date reconciliation entries for ${current.id}`
    );
    return cleared;
  }

  /** Adds a timestamped entry, keeping only the most recent history. */
  private rememberReconciliation(
    entry: Omit<PlannedDateReconciliation, 'id' | 'appliedAt'>
  ): void {
    const record: PlannedDateReconciliation = {
      ...entry,
      id: this.createReconciliationId(),
      appliedAt: new Date().toISOString(),
    };
    this.reconciliationHistory.update((history) =>
      [record, ...history].slice(0, PLANNED_DATE_RECONCILIATION_HISTORY_LIMIT)
    );
    this.persistReconciliationHistory();
  }

  /** Records how an entry ended without removing it from history. */
  private recordReconciliationOutcome(
    id: string,
    outcome: 'restored' | 'work-missing' | 'date-changed'
  ): void {
    this.reconciliationHistory.update((history) =>
      history.map((entry) => {
        if (entry.id !== id) return entry;
        if (outcome === 'restored') {
          return { ...entry, restoredAt: new Date().toISOString() };
        }
        return { ...entry, unavailableReason: outcome };
      })
    );
    this.persistReconciliationHistory();
  }

  private createReconciliationId(): string {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `recon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
  }

  private persistReconciliationHistory(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const history = this.reconciliationHistory();
      if (!history.length) {
        localStorage.removeItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
        JSON.stringify(history)
      );
    } catch {
      // Storage can be blocked or full; the in-memory history still works.
    }
  }

  /** Reads usable history, migrating the previous single record once. */
  private loadReconciliationHistory(): PlannedDateReconciliation[] {
    try {
      if (typeof localStorage === 'undefined') return [];

      const raw = localStorage.getItem(
        PLANNED_DATE_RECONCILIATION_STORAGE_KEY
      );
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const history = parsed
            .map((entry) => this.normalizeReconciliation(entry))
            .filter(
              (entry): entry is PlannedDateReconciliation => entry !== null
            )
            .slice(0, PLANNED_DATE_RECONCILIATION_HISTORY_LIMIT);
          if (history.length) return history;
        }
        localStorage.removeItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY);
      }

      const legacyRaw = localStorage.getItem(
        LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY
      );
      if (!legacyRaw) return [];
      const legacy = JSON.parse(legacyRaw) as Partial<PlannedDateReconciliation> | null;
      localStorage.removeItem(LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY);
      if (!legacy) return [];

      const migrated = this.normalizeReconciliation({
        ...legacy,
        id:
          legacy.id ??
          `legacy-${legacy.workId ?? 'work'}-${legacy.releaseId ?? 'release'}`,
      });
      if (!migrated) return [];

      // Persist immediately so the migrated entry survives this reload even
      // before the artist changes another date.
      localStorage.setItem(
        PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
        JSON.stringify([migrated])
      );
      return [migrated];
    } catch {
      return [];
    }
  }

  /** Accepts only well-formed records; corrupt or stale data is ignored. */
  private normalizeReconciliation(
    value: unknown
  ): PlannedDateReconciliation | null {
    const parsed = value as Partial<PlannedDateReconciliation> | null;
    const isDate = (input: unknown) =>
      typeof input === 'string' && Number.isFinite(Date.parse(input));
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      !parsed.id.trim() ||
      typeof parsed.releaseId !== 'string' ||
      !parsed.releaseId.trim() ||
      typeof parsed.workId !== 'string' ||
      !parsed.workId.trim() ||
      typeof parsed.workTitle !== 'string' ||
      typeof parsed.plannedDate !== 'string' ||
      !isDate(parsed.plannedDate) ||
      (parsed.previousCatalogueDate !== undefined &&
        typeof parsed.previousCatalogueDate !== 'string') ||
      (parsed.appliedAt !== undefined && !isDate(parsed.appliedAt)) ||
      (parsed.restoredAt !== undefined && !isDate(parsed.restoredAt)) ||
      (parsed.unavailableReason !== undefined &&
        parsed.unavailableReason !== 'work-missing' &&
        parsed.unavailableReason !== 'date-changed')
    ) {
      return null;
    }

    return {
      id: parsed.id,
      releaseId: parsed.releaseId,
      workId: parsed.workId,
      workTitle: parsed.workTitle,
      plannedDate: parsed.plannedDate,
      previousCatalogueDate: parsed.previousCatalogueDate || undefined,
      ...(parsed.appliedAt ? { appliedAt: parsed.appliedAt } : {}),
      ...(parsed.restoredAt ? { restoredAt: parsed.restoredAt } : {}),
      ...(parsed.unavailableReason
        ? { unavailableReason: parsed.unavailableReason }
        : {}),
    };
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
