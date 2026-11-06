import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import { ProductionTrack, ReleaseType } from '../../types/release.types';
import { CareerPipelineService } from '../../services/career-pipeline.service';
import { NotificationService } from '../../services/notification.service';
import { ArtistLifecycleService } from '../../services/artist-lifecycle.service';
import { UserProfileService } from '../../services/user-profile.service';
import { ReadinessState } from '../../types/release-readiness.types';
import { LIFECYCLE_PHASE_LABEL } from '../../types/artist-lifecycle.types';
import { CreativeSeverity } from '../../types/creative-business.types';
import { findCatalogWork } from '../../services/release-split.util';
import {
  findReleaseDateMismatch,
  isCalendarDay,
} from '../../services/release-window.util';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-release-pipeline',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './release-pipeline.component.html',
  styleUrls: ['./release-pipeline.component.css'],
})
export class ReleasePipelineComponent {
  public releaseService = inject(ReleasePipelineService);
  public career = inject(CareerPipelineService);
  private notify = inject(NotificationService);
  private router = inject(Router);
  private lifecycleService = inject(ArtistLifecycleService);
  private profileService = inject(UserProfileService);

  showNewReleaseModal = signal(false);
  newReleaseName = signal('');
  newReleaseType = signal<ReleaseType>('Album');

  /** The delivery handoff sheet. Nothing here uploads anything. */
  showHandoff = signal(false);

  /** Track the genre / mood for charter generation so we don't drift
   *  from the release's identity. Defaults are anchored on the user's
   *  first track's style so a fresh release always has a starting
   *  thesis that mirrors the music. */
  charterGenre = signal('Pop');
  charterMood = signal('pop');

  /**
   * Release readiness, scored from the release project, the catalogue and the
   * legal fields — the same assessment the lifecycle and development hub read,
   * so the workspace cannot contradict them.
   */
  lifecycle = computed(() =>
    this.lifecycleService.snapshot(
      this.profileService.profile(),
      this.releaseService.activeRelease()
    )
  );
  readiness = computed(() => this.lifecycle().releaseReadiness);

  /** The timing reading, surfaced beside the planned-date control. */
  timingCheck = computed(
    () => this.readiness().checks.find((check) => check.id === 'timing') ?? null
  );

  /**
   * What shipping this release commits the artist to in rights, schedule,
   * audience, legal, monetization and growth. It comes from the same snapshot
   * readiness does, so the workspace cannot show two accounts of the release.
   */
  creativeBridge = computed(() => this.lifecycle().creativeBridge);

  /** Draft values for the consequences the workspace can actually settle. */
  splitReferenceDraft = signal<string | null>(null);
  proNameDraft = signal('');
  proIpiDraft = signal('');
  campaignDraft = signal('');
  collaboratorsDraft = signal<string | null>(null);
  catalogWorkDraft = signal('');
  plannedDateDraft = signal<string | null>(null);
  showDateReconciliation = signal(false);
  showHistoryClearConfirmation = signal(false);

  /** Catalogue works the artist can link this release to. */
  catalogOptions = computed(
    () => this.profileService.profile().catalog ?? []
  );

  /** The catalogue work the readings use: the linked one, else the title match. */
  catalogWork = computed(() =>
    findCatalogWork(
      this.profileService.profile(),
      this.releaseService.activeRelease()
    )
  );

  /** Draft values for the delivery identifiers, keyed by field. */
  deliveryDraft = signal<{
    isrc?: string;
    upc?: string;
    releaseDate?: string;
    distributor?: string;
    platforms?: string;
  }>({});

  isrcText = computed(() => this.deliveryValue('isrc', this.catalogWork()?.isrc));
  upcText = computed(() => this.deliveryValue('upc', this.catalogWork()?.upc));
  releaseDateText = computed(() =>
    this.deliveryValue('releaseDate', this.catalogWork()?.releaseDate)
  );
  distributorText = computed(() =>
    this.deliveryValue('distributor', this.catalogWork()?.distributor)
  );
  platformsText = computed(() =>
    this.deliveryValue('platforms', this.catalogWork()?.platforms)
  );

  /** A field shows its draft while edited, otherwise what the work records. */
  private deliveryValue(
    key: 'isrc' | 'upc' | 'releaseDate' | 'distributor' | 'platforms',
    recorded: string | string[] | undefined
  ): string {
    const draft = this.deliveryDraft()[key];
    if (draft !== undefined) return draft;
    return Array.isArray(recorded) ? recorded.join(', ') : (recorded ?? '');
  }

  setDeliveryDraft(
    key: 'isrc' | 'upc' | 'releaseDate' | 'distributor' | 'platforms',
    value: string
  ): void {
    this.deliveryDraft.update((draft) => ({ ...draft, [key]: value }));
  }

  /**
   * Records the delivery identifiers the readiness check keeps naming. Blank
   * fields are left as they are, and nothing is defaulted, so a gap stays a gap
   * until the artist states the value.
   */
  async saveDeliveryMetadata(): Promise<void> {
    const platforms = this.platformsText()
      .split(',')
      .map((platform) => platform.trim())
      .filter(Boolean);

    const result = await this.releaseService.recordDeliveryMetadata({
      isrc: this.isrcText(),
      upc: this.upcText(),
      releaseDate: this.releaseDateText(),
      distributor: this.distributorText(),
      platforms,
    });

    this.deliveryDraft.set({});
    if (!result) return;

    this.notify.show(
      result.recorded.length
        ? `Recorded ${result.recorded.join(', ')} on the catalogue work. Anything left blank is still reported as a gap.`
        : 'Nothing was entered, so nothing was recorded.',
      result.recorded.length ? 'info' : 'warning'
    );
  }

  /** The linked work, when the release points at one that still exists. */
  linkedCatalogWork = computed(() => {
    const id = this.releaseService.activeRelease()?.catalogWorkId;
    if (!id) return null;
    return this.catalogOptions().find((work) => work.id === id) ?? null;
  });

  /**
   * The split field shows the draft while it is being edited, and otherwise the
   * reference already recorded for this release — including one adopted from the
   * catalogue — so confirming coverage is an edit away.
   */
  splitReferenceText = computed(() => {
    const draft = this.splitReferenceDraft();
    if (draft !== null) return draft;
    return this.releaseService.activeRelease()?.splitSheetRef ?? '';
  });

  /** The collaborator field shows the draft while it is being edited. */
  collaboratorsText = computed(() => {
    const draft = this.collaboratorsDraft();
    if (draft !== null) return draft;
    return (
      this.releaseService.activeRelease()?.credits?.collaborators ?? []
    ).join(', ');
  });

  /** The planned-date field shows its draft while edited, else the record. */
  plannedDateText = computed(() => {
    const draft = this.plannedDateDraft();
    if (draft !== null) return draft;
    return this.releaseService.activeRelease()?.plannedReleaseDate ?? '';
  });

  /** The recorded dates only, never an unsaved draft. */
  plannedDateMismatch = computed(() =>
    findReleaseDateMismatch(
      this.releaseService.activeRelease()?.plannedReleaseDate,
      this.catalogWork()?.releaseDate
    )
  );

  /** This release's reconciliation entries, newest first. */
  reconciliationHistory = computed(() => {
    const release = this.releaseService.activeRelease();
    if (!release) return [];
    return this.releaseService
      .reconciliationHistory()
      .filter((entry) => entry.releaseId === release.id);
  });

  /** The newest reconciliation that has not been restored or invalidated. */
  dateReconciliationUndo = computed(
    () =>
      this.reconciliationHistory().find(
        (entry) => !entry.restoredAt && !entry.unavailableReason
      ) ?? null
  );

  /** Campaigns the artist has already built; only these can be attached. */
  campaignOptions = computed(
    () => this.profileService.profile().marketingCampaigns ?? []
  );

  /**
   * The attached campaign, resolved against the campaigns that still exist. A
   * release pointing at a deleted campaign resolves to null rather than to a
   * plan the artist no longer has.
   */
  attachedCampaign = computed(() => {
    const id = this.releaseService.activeRelease()?.marketingCampaignId;
    if (!id) return null;
    return this.campaignOptions().find((campaign) => campaign.id === id) ?? null;
  });

  /** True while the release has no campaign the profile can actually back. */
  needsCampaign = computed(
    () => !!this.releaseService.activeRelease() && !this.attachedCampaign()
  );

  /**
   * True while the release has no split, or has one that was confirmed against
   * a different collaborator list. A split recorded for a duo does not cover the
   * third person who joined afterwards, so the field comes back rather than the
   * reading staying settled.
   */
  needsSplitReference = computed(() => {
    const release = this.releaseService.activeRelease();
    if (!release) return false;
    if (!(release.splitSheetRef || '').trim()) return true;

    const collaborators = release.credits?.collaborators ?? [];
    if (!collaborators.length) return false;

    const confirmedFor = release.splitSheetFor ?? null;
    if (!confirmedFor) return true;

    const confirmed = confirmedFor.map((name) =>
      (name || '').trim().toLowerCase()
    );
    return collaborators.some(
      (name) => !confirmed.includes((name || '').trim().toLowerCase())
    );
  });

  /** True while the release has no PRO/IPI pair to collect through. */
  needsProRegistration = computed(() => {
    const release = this.releaseService.activeRelease();
    if (!release) return false;
    return !(
      (release.credits?.proName || '').trim() &&
      (release.credits?.proIpi || '').trim()
    );
  });

  /** Delivery is impossible while a blocking check is unmet. */
  canLaunch = computed(() => this.readiness().blockingGaps.length === 0);

  /** Exposed for the template, which cannot read module-scope constants. */
  readonly LIFECYCLE_PHASE_LABEL = LIFECYCLE_PHASE_LABEL;

  readinessLabel(state: ReadinessState): string {
    switch (state) {
      case 'ready':
        return 'Ready to push';
      case 'almost':
        return 'Deliverable, campaign weak';
      case 'not-ready':
        return 'Not ready';
      default:
        return 'Not assessed';
    }
  }

  readinessTone(state: ReadinessState): string {
    switch (state) {
      case 'ready':
        return 'text-emerald-400';
      case 'almost':
        return 'text-amber-400';
      case 'not-ready':
        return 'text-rose-400';
      default:
        return 'text-slate-400';
    }
  }

  /**
   * Replaces the collaborator list. The recorded split is deliberately left
   * untouched: if the new lineup is not named in it, the rights reading says so
   * instead of the app quietly widening the split's coverage.
   */
  async saveCollaborators(): Promise<void> {
    const release = this.releaseService.activeRelease();
    if (!release) return;

    const names = this.collaboratorsText()
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    await this.releaseService.updateCollaborators(names);
    this.collaboratorsDraft.set(null);
    this.notify.show(
      names.length
        ? `Collaborators recorded (${names.length}). Any split on file is checked against this list.`
        : 'Collaborator list cleared. This release now reads as a solo credit.',
      'info'
    );
  }

  /**
   * Records the artist's intended date. It feeds the timing score and the
   * market ticker; it is not the distributor-facing date on the catalogue work.
   * Clearing the field removes the planned window rather than storing a blank.
   */
  async savePlannedReleaseDate(): Promise<void> {
    const date = this.plannedDateText().trim();
    if (date && !isCalendarDay(date)) {
      this.notify.show(
        'Enter a real calendar date in YYYY-MM-DD form (for example 2026-03-14), or clear the field to remove the planned window.',
        'warning'
      );
      return;
    }

    await this.releaseService.setPlannedReleaseDate(date);
    this.plannedDateDraft.set(null);
    this.showDateReconciliation.set(false);
    this.notify.show(
      date
        ? 'Planned date recorded. Timing is scored from the runway to this date; it is not a distributor-confirmed date.'
        : 'Planned date cleared. Timing falls back to the catalogue date when one is recorded.',
      'info'
    );
  }

  /** Opens the confirmation; this click never writes to the catalogue. */
  requestDateReconciliation(): void {
    if (!this.plannedDateMismatch()) return;
    this.showDateReconciliation.set(true);
  }

  cancelDateReconciliation(): void {
    this.showDateReconciliation.set(false);
  }

  /**
   * The confirmed write. It copies only the recorded planned date onto the
   * catalogue work, leaving the planned date and every other field untouched.
   */
  async confirmDateReconciliation(): Promise<void> {
    const result = await this.releaseService.copyPlannedDateToCatalogue();
    this.showDateReconciliation.set(false);
    if (!result) {
      this.notify.show(
        'Nothing was changed — a planned date and a catalogue work are both required.',
        'warning'
      );
      return;
    }

    this.notify.show(
      `Catalogue date updated to ${result.date}. The planned date is unchanged; an undo is available below.`,
      'info'
    );
  }

  /** Restores the date the newest confirmed reconciliation overwrote. */
  async undoDateReconciliation(): Promise<void> {
    const undo = this.dateReconciliationUndo();
    if (!undo) {
      this.notify.show(
        'There is no recent catalogue date change to undo.',
        'warning'
      );
      return;
    }
    await this.restoreHistoryEntry(undo.id);
  }

  /** Restores one history entry after the service re-checks its safety. */
  async restoreHistoryEntry(id: string): Promise<void> {
    const entry = this.reconciliationHistory().find((item) => item.id === id);
    const result = await this.releaseService.restoreReconciliation(id);

    if (result === 'restored') {
      this.notify.show(
        entry?.previousCatalogueDate
          ? `Catalogue date restored to ${entry.previousCatalogueDate}.`
          : 'Catalogue date removed; it was unrecorded before that reconciliation.',
        'info'
      );
      return;
    }
    if (result === 'date-changed') {
      this.notify.show(
        'The catalogue date has changed since that reconciliation, so it was not overwritten.',
        'warning'
      );
      return;
    }
    if (result === 'work-missing') {
      this.notify.show(
        'The catalogue work is no longer in the profile, so there was nothing to restore.',
        'warning'
      );
      return;
    }
    this.notify.show(
      'That date change is no longer available to restore.',
      'warning'
    );
  }

  /** Opens the history clear confirmation; this click deletes nothing. */
  requestHistoryClear(): void {
    if (!this.reconciliationHistory().length) return;
    this.showHistoryClearConfirmation.set(true);
  }

  cancelHistoryClear(): void {
    this.showHistoryClearConfirmation.set(false);
  }

  /** Clears this release's local history without touching any date. */
  confirmHistoryClear(): void {
    const cleared = this.releaseService.clearPlannedDateReconciliationHistory();
    this.showHistoryClearConfirmation.set(false);

    if (!cleared) {
      this.notify.show(
        'There was no reconciliation history for this release to clear.',
        'warning'
      );
      return;
    }

    this.notify.show(
      `Reconciliation history for this release cleared (${cleared} ${
        cleared === 1 ? 'entry' : 'entries'
      }). Catalogue dates and the planned date were not changed.`,
      'info'
    );
  }

  /** Timestamps are shown as recorded; older migrated records have none. */
  formatReconciliationTimestamp(value?: string): string {
    if (!value) return 'Time not recorded';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString()
      : 'Time not recorded';
  }

  reconciliationUnavailableLabel(
    reason?: 'work-missing' | 'date-changed'
  ): string {
    if (reason === 'work-missing') {
      return 'Not restored: the catalogue work is no longer in the profile.';
    }
    if (reason === 'date-changed') {
      return 'Not restored: the catalogue date changed again after this entry.';
    }
    return '';
  }

  /**
   * Stores the split reference the artist supplies. The reference is the whole
   * artefact: nothing is uploaded, and readiness reads it as the artist's own
   * statement rather than a verified document.
   */
  async recordSplitReference(): Promise<void> {
    const reference = this.splitReferenceText().trim();
    if (!reference) {
      this.notify.show(
        'Enter the split document reference before recording it.',
        'warning'
      );
      return;
    }
    await this.releaseService.recordSplitReference(reference);
    this.splitReferenceDraft.set(null);
    this.notify.show(
      'Split reference recorded. S.M.U.V.E. stores the reference and cannot verify the document itself.',
      'info'
    );
  }

  /**
   * Points the release at a campaign the artist already built. Nothing is
   * created here: the workspace only records which existing plan this release
   * belongs to.
   */
  async attachCampaign(): Promise<void> {
    const id = this.campaignDraft();
    if (!id) {
      this.notify.show('Select a campaign before attaching it.', 'warning');
      return;
    }
    await this.releaseService.attachCampaign(id);
    this.campaignDraft.set('');
    this.notify.show(
      'Campaign attached. Readiness now counts it as the plan behind this release.',
      'info'
    );
  }

  async detachCampaign(): Promise<void> {
    await this.releaseService.detachCampaign();
    this.notify.show(
      'Campaign detached. The release no longer reads as having a campaign behind it.',
      'info'
    );
  }

  /** Records the PRO and IPI this release will collect performance royalties through. */
  async recordProRegistration(): Promise<void> {
    const proName = this.proNameDraft().trim();
    const proIpi = this.proIpiDraft().trim();
    if (!proName || !proIpi) {
      this.notify.show(
        'A PRO and an IPI are both needed before the registration can be recorded.',
        'warning'
      );
      return;
    }
    await this.releaseService.recordProRegistration(proName, proIpi);
    this.proNameDraft.set('');
    this.proIpiDraft.set('');
    this.notify.show(
      'PRO and IPI recorded on the release. S.M.U.V.E. cannot confirm the registration with the PRO — no PRO feed is connected.',
      'info'
    );
  }

  creativeLabel(severity: CreativeSeverity): string {
    switch (severity) {
      case 'blocking':
        return 'Settle first';
      case 'watch':
        return 'Weigh it';
      case 'clear':
        return 'Clear';
      default:
        return 'Unknown';
    }
  }

  creativeTone(severity: CreativeSeverity): string {
    switch (severity) {
      case 'blocking':
        return 'text-rose-300';
      case 'watch':
        return 'text-amber-300';
      case 'clear':
        return 'text-emerald-300';
      default:
        return 'text-slate-400';
    }
  }

  /** Convenience: the active release's most-recently-generated charter. */
  activeCharter = computed(() => {
    const release = this.releaseService.activeRelease();
    if (!release) return null;
    return this.career.charterFor(release.id) ?? this.career.latestCharter();
  });

  startNewRelease(name: string, type: ReleaseType) {
    const title = (name || '').trim();
    if (!title) {
      this.notify.show(
        'Give the release a title before initializing the pipeline.',
        'warning'
      );
      return;
    }
    void this.releaseService.initializeRelease(title, type);
    this.showNewReleaseModal.set(false);
  }

  addTrack(title: string) {
    if (!title) return;
    this.releaseService.addTrack(title);
  }

  navigateToStage(track: ProductionTrack, stage: string) {
    if (stage === 'lyrics') {
      this.router.navigate(['/lyric-editor']);
    } else {
      this.router.navigate(['/studio']);
    }
  }

  /**
   * Advances a stage through the artist's own status vocabulary. Nothing here
   * verifies the work: production readiness reads these flags as artist-stated
   * and reports them that way.
   */
  async cycleStage(track: ProductionTrack, stage: string): Promise<void> {
    const key = stage as keyof ProductionTrack['stages'];
    const statuses: ProductionTrack['status'][] = [
      'Pending',
      'In Progress',
      'Completed',
    ];
    const current = track.stages[key] ?? 'Pending';
    const index = Math.max(0, statuses.indexOf(current));
    const next = statuses[(index + 1) % statuses.length];

    await this.releaseService.updateTrackStage(track.id, key, next);
    this.notify.show(
      next === 'Completed'
        ? `${stage} marked complete for "${track.title}" — your own confirmation, not a verified export.`
        : `${stage} set to ${next} for "${track.title}".`,
      'info'
    );
  }

  /**
   * Links this release to its catalogue work, so a renamed release keeps its
   * identifiers, date, distributor, and split reference.
   */
  async linkCatalogWork(): Promise<void> {
    const id = this.catalogWorkDraft();
    if (!id) {
      this.notify.show('Select a catalogue work before linking it.', 'warning');
      return;
    }
    await this.releaseService.linkCatalogWork(id);
    this.catalogWorkDraft.set('');
    this.notify.show(
      'Release linked to its catalogue work. Every reading now uses that work, whatever the release is called.',
      'info'
    );
  }

  /**
   * Creates the catalogue work from what the release already records, then
   * links it. Nothing unrecorded is filled in, so the metadata gaps stay visible
   * and the confirmation says so.
   */
  async createCatalogWork(): Promise<void> {
    const result = await this.releaseService.createCatalogWorkFromRelease();
    if (!result) return;

    this.notify.show(
      result.created
        ? 'Catalogue work created from this release and linked. Identifiers, date, and distributor are still unrecorded, so readiness keeps asking for them.'
        : 'Linked to the catalogue work that already matches this release.',
      'info'
    );
  }

  async unlinkCatalogWork(): Promise<void> {
    await this.releaseService.unlinkCatalogWork();
    this.notify.show(
      'Link removed. Readings fall back to matching the release title.',
      'info'
    );
  }

  /**
   * The exact package a distributor needs, pulled from the release project and
   * the matching catalogue record. Fields the artist has not recorded stay
   * `null` — filling them with plausible values would be the same lie as the
   * fake progress bar this replaced.
   */
  deliveryPackage = computed(() => {
    const release = this.releaseService.activeRelease();
    if (!release) return null;
    const work = findCatalogWork(this.profileService.profile(), release);
    return {
      release: release.name,
      type: release.type,
      artist: release.credits?.artistName ?? null,
      tracks: release.tracks.map((track) => track.title),
      isrc: work?.isrc ?? null,
      upc: work?.upc ?? null,
      releaseDate: work?.releaseDate ?? null,
      distributor: work?.distributor ?? null,
      platforms: work?.platforms ?? [],
      artwork: release.artworkUrl ?? null,
      readiness: this.readiness().overallScore,
    };
  });

  /**
   * Opens the handoff sheet. S.M.U.V.E. has no distributor connection, so this
   * cannot deliver a release — it packages what the artist must upload and
   * records only what the artist confirms.
   */
  openHandoff(): void {
    if (!this.canLaunch()) {
      this.notify.show(
        'Clear the blocking readiness gaps before handing this release off.',
        'warning'
      );
      return;
    }
    this.showHandoff.set(true);
  }

  closeHandoff(): void {
    this.showHandoff.set(false);
  }

  copyDeliveryPackage(): void {
    const pack = this.deliveryPackage();
    if (!pack) return;
    this.copyText(JSON.stringify(pack, null, 2));
  }

  /** Status moves only on an explicit artist statement, never on a timer. */
  async markSubmittedToDistributor(): Promise<void> {
    await this.releaseService.updateStatus('Distributing');
    this.showHandoff.set(false);
    this.notify.show(
      'Recorded as submitted to your distributor. S.M.U.V.E. cannot confirm delivery — no distributor feed is connected.',
      'info'
    );
  }

  async markLiveOnDsps(): Promise<void> {
    await this.releaseService.updateStatus('Released');
    this.showHandoff.set(false);
    this.notify.show(
      'Marked live — artist-confirmed. No DSP or analytics feed verified this.',
      'info'
    );
  }

  // ============================================================
  //  Sprint B4 — Career Pipeline UI surface
  // ============================================================

  /**
   * Build (or re-build) the CareerCharter for the active release. Uses
   * a stable default artist name — release credits override it if the
   * profile has been wired in by the time this is called.
   */
  async buildCareerCharter(): Promise<void> {
    const release = this.releaseService.activeRelease();
    if (!release) {
      this.notify.show(
        'Initialize a release first — the charter belongs to a release row.',
        'warning'
      );
      return;
    }
    const artistName =
      (release as any).credits?.artistName?.trim() || 'Artist';
    try {
      await this.career.buildCharter(
        release,
        this.charterGenre(),
        this.charterMood(),
        artistName
      );
      this.notify.show(
        `Career charter drafted for "${release.name}". Review and commit when ready.`,
        'success'
      );
    } catch (e: any) {
      this.notify.show(
        `Charter build failed: ${e?.message || 'unknown'}`,
        'warning'
      );
    }
  }

  async commitCareerCharter(): Promise<void> {
    const charter = this.activeCharter();
    if (!charter) {
      this.notify.show(
        'Generate a charter first before committing.',
        'warning'
      );
      return;
    }
    await this.career.commitCharter(charter.id);
  }

  copyText(text: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      this.notify.show(
        'Clipboard access denied — copy manually.',
        'warning'
      );
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => this.notify.show('Copied to clipboard.', 'success'))
      .catch(() => this.notify.show('Clipboard write failed.', 'warning'));
  }

  /** Convenience for the template — true when there's a draft charter to show. */
  hasCharter(): boolean {
    return !!this.activeCharter();
  }
}
