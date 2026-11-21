import {
  latestManualByPlatform,
  mergeReportedSocial,
  mergeReportedStreaming,
  monthOverMonthGrowth,
  previousMonthOf,
} from './marketing.service';
import type {
  ManualAudienceMetric,
  SocialPlatformData,
  StreamingData,
} from '../types/marketing.types';

const metric = (
  over: Partial<ManualAudienceMetric> = {}
): ManualAudienceMetric => ({
  id: 'metric-1',
  weekOf: '2026-11-16',
  kind: 'social',
  platform: 'Instagram',
  recordedAt: '2026-11-16T12:00:00.000Z',
  ...over,
});

describe('manual audience metrics', () => {
  it('keeps the newest recorded week per platform', () => {
    const latest = latestManualByPlatform([
      metric({ weekOf: '2026-11-02', followers: 100 }),
      metric({ weekOf: '2026-11-16', followers: 300 }),
      metric({ weekOf: '2026-11-09', followers: 200 }),
    ]);

    expect(latest.get('Instagram')?.followers).toBe(300);
  });

  it('reports a weekly social entry that no account integration covers', () => {
    const linked: SocialPlatformData[] = [];
    const merged = mergeReportedSocial(linked, [
      metric({ followers: 1400, engagementRate: 3.5 }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      platform: 'Instagram',
      followers: 1400,
      engagementRate: 3.5,
      topPosts: [],
    });
  });

  it('never lets a handwritten week overwrite a linked account', () => {
    const linked: SocialPlatformData[] = [
      {
        platform: 'Instagram',
        followers: 9999,
        engagementRate: 5,
        topPosts: [],
        lastUpdated: 1,
      },
    ];
    const merged = mergeReportedSocial(linked, [
      metric({ platform: 'Instagram', followers: 12 }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].followers).toBe(9999);
  });

  describe('month over month', () => {
    const week = (weekOf: string, over: Partial<ManualAudienceMetric> = {}) =>
      metric({ weekOf, ...over });

    it('refuses a percentage when only one month is recorded', () => {
      const growth = monthOverMonthGrowth([
        week('2026-11-02', { followers: 100 }),
        week('2026-11-16', { followers: 140 }),
      ]);

      expect(growth.state).toBe('no-baseline');
      expect(growth.latestMonth).toBe('2026-11');
      expect(growth.previousMonth).toBe('2026-10');
      expect(growth.followers).toBeNull();
    });

    it('compares the latest week of each consecutive month', () => {
      const growth = monthOverMonthGrowth([
        week('2026-10-05', { followers: 100 }),
        week('2026-10-26', { followers: 120 }),
        week('2026-11-02', { followers: 150 }),
        week('2026-11-23', { followers: 180 }),
      ]);

      expect(growth.state).toBe('comparable');
      expect(growth.followers).toEqual({
        previous: 120,
        latest: 180,
        delta: 60,
        percent: 50,
        platforms: 1,
      });
    });

    it('does not compare across a month that was never recorded', () => {
      const growth = monthOverMonthGrowth([
        week('2026-01-05', { followers: 100 }),
        week('2026-03-02', { followers: 300 }),
      ]);

      expect(growth.state).toBe('no-baseline');
      expect(growth.previousMonth).toBe('2026-02');
    });

    it('reports nothing comparable when the months share no platform', () => {
      const growth = monthOverMonthGrowth([
        week('2026-10-05', { platform: 'Instagram', followers: 100 }),
        week('2026-11-02', { platform: 'TikTok', followers: 500 }),
      ]);

      expect(growth.state).toBe('nothing-comparable');
      expect(growth.newPlatforms).toEqual(['TikTok']);
      expect(growth.followers).toBeNull();
    });

    it('leaves a first-time platform out of the growth totals', () => {
      const growth = monthOverMonthGrowth([
        week('2026-10-05', { followers: 100 }),
        week('2026-11-02', { followers: 150 }),
        week('2026-11-02', { platform: 'TikTok', followers: 500 }),
      ]);

      expect(growth.followers).toEqual({
        previous: 100,
        latest: 150,
        delta: 50,
        percent: 50,
        platforms: 1,
      });
      expect(growth.newPlatforms).toEqual(['TikTok']);
    });

    it('reports the change without a percentage from a zero baseline', () => {
      const growth = monthOverMonthGrowth([
        week('2026-10-05', { followers: 0 }),
        week('2026-11-02', { followers: 40 }),
      ]);

      expect(growth.followers?.delta).toBe(40);
      expect(growth.followers?.percent).toBeNull();
    });

    it('walks calendar months across a year boundary', () => {
      expect(previousMonthOf('2026-01')).toBe('2025-12');
    });
  });

  it('fills streaming gaps without mixing social entries in', () => {
    const linked: StreamingData[] = [];
    const merged = mergeReportedStreaming(linked, [
      metric({
        kind: 'streaming',
        platform: 'Spotify',
        monthlyListeners: 85000,
        totalStreams: 1200000,
      }),
      metric({ platform: 'Instagram', followers: 400 }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      platform: 'Spotify',
      monthlyListeners: 85000,
      totalStreams: 1200000,
      playlistAdds: 0,
    });
  });
});
