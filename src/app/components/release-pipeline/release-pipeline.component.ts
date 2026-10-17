import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import { ProductionTrack, ReleaseProject, ReleaseType } from '../../types/release.types';
import { CareerPipelineService } from '../../services/career-pipeline.service';
import { NotificationService } from '../../services/notification.service';
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

  showNewReleaseModal = signal(false);
  newReleaseName = signal('');
  newReleaseType = signal<ReleaseType>('Album');

  distributionProgress = signal(0);
  isDistributing = signal(false);

  /** Track the genre / mood for charter generation so we don't drift
   *  from the release's identity. Defaults are anchored on the user's
   *  first track's style so a fresh release always has a starting
   *  thesis that mirrors the music. */
  charterGenre = signal('Pop');
  charterMood = signal('pop');

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

  async triggerDistribution() {
    this.isDistributing.set(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        this.releaseService.updateStatus('Released');
        setTimeout(() => this.isDistributing.set(false), 2000);
      }
      this.distributionProgress.set(progress);
    }, 500);
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
