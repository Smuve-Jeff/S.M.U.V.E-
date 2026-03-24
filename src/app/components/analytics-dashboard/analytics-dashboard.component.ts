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

  superfans = signal<Superfan[]>([
    { name: 'Alex M.', streams: 450, location: 'London', status: 'Active' },
    { name: 'Sarah J.', streams: 380, location: 'New York', status: 'Rising' },
    { name: 'Dmitri K.', streams: 295, location: 'Berlin', status: 'Active' },
  ]);

  engagementTactics = [
    "Run a 'Behind the Scenes' stream for your top 50 listeners.",
    "Send a personalized thank you video to this month's top streamer.",
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
