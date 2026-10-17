import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AnalyticsDashboardComponent } from './analytics-dashboard.component';
import { AnalyticsService } from '../../services/analytics.service';
import { UserProfileService } from '../../services/user-profile.service';

describe('AnalyticsDashboardComponent', () => {
  const createComponent = async (
    overrides: Partial<AnalyticsService> = {}
  ) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AnalyticsDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AnalyticsService, useValue: overrides },
        {
          provide: UserProfileService,
          useValue: { profile: signal({ artistName: 'Nova' }) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AnalyticsDashboardComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    };
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  /**
   * This page used to report 125,430 streams, 8,420 followers and 4.8%
   * engagement for every artist, next to a "Live Intelligence Feed" badge, with
   * two of the three tiles hardcoded in the template — one of them printing a
   * stray ",120". It also named three invented superfans. None of it came from
   * anywhere, and an artist prices a release on numbers like these.
   */
  describe('honesty about missing data', () => {
    it('states that no source is connected instead of reporting figures', async () => {
      const service = new AnalyticsService();
      const { component, text } = await createComponent({
        hasLiveData: service.hasLiveData,
        metrics: service.metrics,
        streams: service.streams,
        revenue: service.revenue,
        monthlyListeners: service.monthlyListeners,
      });

      expect(component.hasLiveData()).toBe(false);
      expect(text()).toContain('No analytics source connected');
      expect(text()).toContain('Estimated or invented totals get spent against');

      // The tiles read as unknown, not as somebody else's numbers.
      expect(text()).toContain('—');
      expect(text()).not.toContain('125,430');
      expect(text()).not.toContain('12.5K');
      expect(text()).not.toContain(',120');
      expect(text()).not.toContain('+12.4%');
      expect(text()).not.toContain('+8.2%');
      expect(text()).not.toContain('-2.1%');
    });

    it('names no superfans it cannot evidence', async () => {
      const service = new AnalyticsService();
      const { component, text } = await createComponent({
        hasLiveData: service.hasLiveData,
        metrics: service.metrics,
        streams: service.streams,
        revenue: service.revenue,
        monthlyListeners: service.monthlyListeners,
      });

      expect(component.superfans()).toEqual([]);
      expect(text()).not.toContain('Alex M.');
      expect(text()).not.toContain('Dmitri K.');
      expect(text()).toContain('No listener records yet');
    });

    it('reports the figures once a real source supplies them', async () => {
      const live = new AnalyticsService();
      live.streams.set({
        label: 'Total Streams',
        value: 4200,
        trend: 6.5,
        history: [3900, 4200],
        source: 'connected',
      });

      const { component, text } = await createComponent({
        hasLiveData: live.hasLiveData,
        metrics: live.metrics,
        streams: live.streams,
        revenue: live.revenue,
        monthlyListeners: live.monthlyListeners,
      });

      expect(component.hasLiveData()).toBe(true);
      expect(text()).toContain('4,200');
      expect(text()).toContain('+6.5%');
      expect(text()).not.toContain('No analytics source connected');
    });
  });

  describe('AnalyticsService', () => {
    it('starts with nothing to report', () => {
      const service = new AnalyticsService();

      expect(service.hasLiveData()).toBe(false);
      expect(service.overallGrowth()).toBe(0);
      service.metrics().forEach((metric) => {
        expect(metric.source).toBe('sample');
        expect(metric.value).toBe(0);
        expect(metric.history).toEqual([]);
      });
    });

    it('averages growth across connected metrics only', () => {
      const service = new AnalyticsService();
      service.streams.set({
        label: 'Total Streams',
        value: 100,
        trend: 10,
        history: [],
        source: 'connected',
      });
      service.followers.set({
        label: 'Followers',
        value: 5,
        trend: 20,
        history: [],
        source: 'connected',
      });

      expect(service.hasLiveData()).toBe(true);
      expect(service.overallGrowth()).toBe(15);
    });
  });
});
