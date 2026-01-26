import { Injectable, signal, computed } from '@angular/core';

export interface GrowthMetric {
  label: string;
  value: number;
  trend: number; // percentage change
  history: number[]; // last 7 days/months
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  streams = signal<GrowthMetric>({
    label: 'Total Streams',
    value: 125430,
    trend: 12.5,
    history: [10000, 15000, 12000, 18000, 25000, 22000, 23430],
  });

  followers = signal<GrowthMetric>({
    label: 'Followers',
    value: 8420,
    trend: 5.2,
    history: [7000, 7200, 7500, 7800, 8000, 8200, 8420],
  });

  engagement = signal<GrowthMetric>({
    label: 'Engagement Rate',
    value: 4.8,
    trend: -1.2,
    history: [5.0, 5.2, 5.1, 4.9, 4.7, 4.8, 4.8],
  });

  overallGrowth = computed(() => {
    const s = this.streams().trend;
    const f = this.followers().trend;
    const e = this.engagement().trend;
    return (s + f + e) / 3;
  });

  getGenreBreakdown() {
    return [
      { name: 'Hip Hop', percentage: 45 },
      { name: 'R&B', percentage: 30 },
      { name: 'Electronic', percentage: 15 },
      { name: 'Other', percentage: 10 },
    ];
  }
}
