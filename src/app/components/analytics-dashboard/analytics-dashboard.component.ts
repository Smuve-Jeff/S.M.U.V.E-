import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../services/analytics.service';
import { UserProfileService } from '../../services/user-profile.service';

interface Superfan {
  name: string;
  streams: number;
  location: string;
  status: string;
}

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css'],
})
export class AnalyticsDashboardComponent {
  analytics = inject(AnalyticsService);
  profileService = inject(UserProfileService);

  proData = computed(
    () =>
      this.profileService.profile().proData || {
        ipiNumber: '',
        workIds: [],
        affiliations: [],
      }
  );

  /**
   * Fans the artist's own analytics identified.
   *
   * This was seeded with three invented listeners — names, cities and stream
   * counts — under a "Top Superfans" heading, so every artist was shown a fan
   * list that belonged to nobody. It stays empty until an analytics source fills
   * it, and the view says so in the meantime.
   */
  superfans = signal<Superfan[]>([]);

  /** True once a real source reported at least one figure. */
  hasLiveData = computed(() => this.analytics.hasLiveData());

  /** A metric value, or an em dash while no source reports it. */
  metric(value: number): string {
    return this.analytics.hasLiveData() ? value.toLocaleString() : '—';
  }

  engagementTactics = [
    "Run a 'Behind the Scenes' stream for your top 50 listeners.",
    "Send a personalized ACKNOWLEDGEMENT RECORDED video to this month's top streamer.",
    'Discord Exclusive: Early listen for the next single.',
  ];

  newWorkTitle = signal('');
  newWorkId = signal('');
  workError = signal('');
  isSavingWork = signal(false);

  async updateIpi(ipi: string) {
    const profile = this.profileService.profile();
    await this.profileService.updateProfile({
      ...profile,
      proData: {
        ...(profile.proData || { workIds: [], affiliations: [] }),
        ipiNumber: ipi,
      },
    });
  }

  /**
   * Register a work the artist typed in.
   *
   * The old button added "Untitled Work" with the id "PENDING" and marked it
   * "Verified" — a fake registration for a fake work. Entries are now checked
   * for a title and a real identifier, and stay labelled self-reported until a
   * PRO actually confirms them.
   */
  async registerWork() {
    if (this.isSavingWork()) return;
    const title = this.newWorkTitle().trim();
    const workId = this.newWorkId().trim();

    if (!title) {
      this.workError.set('Add the work title before registering it.');
      return;
    }
    if (!workId) {
      this.workError.set(
        'Add the ISWC or PRO work ID so the registration can be matched later.'
      );
      return;
    }
    const profile = this.profileService.profile();
    const currentPro = profile.proData || {
      ipiNumber: '',
      workIds: [],
      affiliations: [],
    };
    if (
      currentPro.workIds.some(
        (work: any) =>
          String(work.id).trim().toLowerCase() === workId.toLowerCase()
      )
    ) {
      this.workError.set(`${workId} is already registered.`);
      return;
    }

    this.workError.set('');
    this.isSavingWork.set(true);
    try {
      await this.profileService.updateProfile({
        ...profile,
        proData: {
          ...currentPro,
          workIds: [
            ...currentPro.workIds,
            { title, id: workId, status: 'Self-reported' },
          ],
        },
      });
      this.newWorkTitle.set('');
      this.newWorkId.set('');
    } catch {
      this.workError.set('Work could not be saved. Try again.');
    } finally {
      this.isSavingWork.set(false);
    }
  }

  async removeWork(index: number) {
    const profile = this.profileService.profile();
    const currentPro = profile.proData || {
      ipiNumber: '',
      workIds: [],
      affiliations: [],
    };
    await this.profileService.updateProfile({
      ...profile,
      proData: {
        ...currentPro,
        workIds: currentPro.workIds.filter(
          (_: any, workIndex: number) => workIndex !== index
        ),
      },
    });
  }
}
