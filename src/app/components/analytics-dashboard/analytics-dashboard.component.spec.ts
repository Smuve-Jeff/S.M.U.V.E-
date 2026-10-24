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
    const analytics =
      Object.keys(overrides).length > 0 ? overrides : new AnalyticsService();
    const profile = signal<any>({
      artistName: 'Nova',
      proData: { ipiNumber: '', workIds: [], affiliations: [] },
    });
    const updateProfile = jest.fn(async (patch: any) => {
      profile.update((current) => ({ ...current, ...patch }));
    });
    await TestBed.configureTestingModule({
      imports: [AnalyticsDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AnalyticsService, useValue: analytics },
        {
          provide: UserProfileService,
          useValue: { profile, updateProfile },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AnalyticsDashboardComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      profile,
      updateProfile,
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

  /**
   * "+ Register Work" used to add an "Untitled Work" with the id "PENDING"
   * and stamp it "Verified" — a fake registration for a work nobody entered.
   */
  describe('PRO work registry', () => {
    it('starts empty and says so instead of inventing a work', async () => {
      const { component, text } = await createComponent();

      expect(component.proData().workIds).toEqual([]);
      expect(text()).toContain('No works registered yet');
      expect(text()).not.toContain('Untitled Work');
      expect(text()).not.toContain('PENDING');
    });

    it('requires a title and a work ID before registering', async () => {
      const { component, updateProfile } = await createComponent();

      await component.registerWork();
      expect(component.workError()).toContain('title');

      component.newWorkTitle.set('Midnight Run');
      await component.registerWork();
      expect(component.workError()).toContain('ISWC or PRO work ID');
      expect(updateProfile).not.toHaveBeenCalled();
    });

    it('registers the work as self-reported, not verified', async () => {
      const { component, fixture, profile, text } = await createComponent();

      component.newWorkTitle.set('Midnight Run');
      component.newWorkId.set('T-1234567890');
      await component.registerWork();
      fixture.detectChanges();

      expect(profile().proData.workIds).toEqual([
        { title: 'Midnight Run', id: 'T-1234567890', status: 'Self-reported' },
      ]);
      expect(component.newWorkTitle()).toBe('');
      expect(component.newWorkId()).toBe('');
      expect(text()).toContain('Midnight Run');
      expect(text()).toContain('Self-reported');
      expect(text()).not.toContain('Verified');
    });

    it('refuses a duplicate work ID', async () => {
      const { component, updateProfile } = await createComponent();

      component.newWorkTitle.set('Midnight Run');
      component.newWorkId.set('T-1234567890');
      await component.registerWork();

      component.newWorkTitle.set('Midnight Run (Remix)');
      component.newWorkId.set('t-1234567890');
      await component.registerWork();

      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(component.workError()).toContain('already registered');
    });

    it('removes a work while keeping the IPI number', async () => {
      const { component, profile } = await createComponent();
      profile.update((current: any) => ({
        ...current,
        proData: {
          ipiNumber: '00123456789',
          affiliations: [],
          workIds: [
            { title: 'One', id: 'A1', status: 'Self-reported' },
            { title: 'Two', id: 'A2', status: 'Self-reported' },
          ],
        },
      }));

      await component.removeWork(0);

      expect(profile().proData.workIds).toEqual([
        { title: 'Two', id: 'A2', status: 'Self-reported' },
      ]);
      expect(profile().proData.ipiNumber).toBe('00123456789');
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
