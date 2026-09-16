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

  async addWorkId(title: string, id: string) {
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
        workIds: [...currentPro.workIds, { title, id, status: 'Verified' }],
      },
    });
  }

  getMathMax(arr: number[]): number {
    if (!arr.length) return 1;
    const max = Math.max(...arr);
    return max > 0 ? max : 1;
  }
}
