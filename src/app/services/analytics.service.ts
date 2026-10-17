import { Injectable, signal, computed } from '@angular/core';

/** Where a figure came from. S.M.U.V.E. never presents an estimate as a fact. */
export type MetricSource = 'sample' | 'connected';

export interface GrowthMetric {
  label: string;
  value: number;
  /** Percentage change against the previous period. */
  trend: number;
  /** Last few periods, oldest first. Empty until a source reports them. */
  history: number[];
  source: MetricSource;
}

/**
 * An empty metric. The dashboard renders "—" rather than a number while a
 * metric has no source, so these zeros are never shown as the artist's data.
 */
const unknownMetric = (label: string): GrowthMetric => ({
  label,
  value: 0,
  trend: 0,
  history: [],
  source: 'sample',
});

/**
 * Platform analytics for the artist.
 *
 * These signals used to be seeded with 125,430 streams, 8,420 followers and a
 * 4.8% engagement rate, and `getGenreBreakdown()` returned a fixed audience
 * split. Every artist saw the same figures as their own performance, next to a
 * "Live Intelligence Feed" badge. Nothing writes them yet, so they now start
 * empty and say so; an analytics integration sets a metric with
 * `source: 'connected'` and the dashboard starts reporting it.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  streams = signal<GrowthMetric>(unknownMetric('Total Streams'));

  followers = signal<GrowthMetric>(unknownMetric('Followers'));

  engagement = signal<GrowthMetric>(unknownMetric('Engagement Rate'));

  monthlyListeners = signal<GrowthMetric>(unknownMetric('Monthly Listeners'));

  revenue = signal<GrowthMetric>(unknownMetric('Est. Revenue'));

  /** Every reported metric, so a view can iterate them. */
  readonly metrics = computed<GrowthMetric[]>(() => [
    this.streams(),
    this.followers(),
    this.engagement(),
    this.monthlyListeners(),
    this.revenue(),
  ]);

  /** True once a real analytics source has supplied at least one figure. */
  readonly hasLiveData = computed(() =>
    this.metrics().some((metric) => metric.source === 'connected')
  );

  overallGrowth = computed(() => {
    const live = this.metrics().filter(
      (metric) => metric.source === 'connected'
    );
    if (live.length === 0) return 0;
    return live.reduce((sum, metric) => sum + metric.trend, 0) / live.length;
  });
}
