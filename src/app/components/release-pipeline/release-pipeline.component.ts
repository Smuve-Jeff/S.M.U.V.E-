import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import { ProductionTrack, ReleaseType } from '../../types/release.types';
import { Router } from '@angular/router';

@Component({
  selector: 'app-release-pipeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './release-pipeline.component.html',
  styleUrls: ['./release-pipeline.component.css']
})
export class ReleasePipelineComponent {
  public releaseService = inject(ReleasePipelineService);
  private router = inject(Router);

  showNewReleaseModal = signal(false);
  newReleaseName = signal('');
  newReleaseType = signal<ReleaseType>('Album');

  distributionProgress = signal(0);
  isDistributing = signal(false);

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
}
