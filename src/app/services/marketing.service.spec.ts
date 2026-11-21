import {
  latestManualByPlatform,
  mergeReportedSocial,
  mergeReportedStreaming,
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
