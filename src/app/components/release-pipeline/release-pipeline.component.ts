import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import { ProductionTrack, ReleaseProject, ReleaseType } from '../../types/release.types';
import { CareerPipelineService } from '../../services/career-pipeline.service';
import { NotificationService } from '../../services/notification.service';
import { ArtistLifecycleService } from '../../services/artist-lifecycle.service';
import { UserProfileService } from '../../services/user-profile.service';
import { ReadinessState } from '../../types/release-readiness.types';
import { LIFECYCLE_PHASE_LABEL } from '../../types/artist-lifecycle.types';
import { CreativeSeverity } from '../../types/creative-business.types';
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

  /**
   * What shipping this release commits the artist to in rights, schedule,
   * audience, legal, monetization and growth. It comes from the same snapshot
   * readiness does, so the workspace cannot show two accounts of the release.
   */
  creativeBridge = computed(() => this.lifecycle().creativeBridge);

  /** Draft values for the consequences the workspace can actually settle. */
  splitReferenceDraft = signal('');
  proNameDraft = signal('');
  proIpiDraft = signal('');
  campaignDraft = signal('');
  collaboratorsDraft = signal<string | null>(null);

  /** The collaborator field shows the draft while it is being edited. */
  collaboratorsText = computed(() => {
    const draft = this.collaboratorsDraft();
    if (draft !== null) return draft;
    return (
      this.releaseService.activeRelease()?.credits?.collaborators ?? []
    ).join(', ');
  });

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
   * Stores the split reference the artist supplies. The reference is the whole
   * artefact: nothing is uploaded, and readiness reads it as the artist's own
   * statement rather than a verified document.
   */
  async recordSplitReference(): Promise<void> {
    const reference = this.splitReferenceDraft().trim();
    if (!reference) {
      this.notify.show(
        'Enter the split document reference before recording it.',
        'warning'
      );
      return;
    }
    await this.releaseService.recordSplitReference(reference);
    this.splitReferenceDraft.set('');
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
    this.releaseService.initializeRelease(name, type);
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

  completeStage(trackId: string, stage: any) {
    this.releaseService.updateTrackStage(trackId, stage, 'Completed');
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
    const works = this.profileService.profile().catalog ?? [];
    const target = (release.name || '').trim().toLowerCase();
    const work =
      works.find(
        (item) => (item.title || '').trim().toLowerCase() === target
      ) ?? null;
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
