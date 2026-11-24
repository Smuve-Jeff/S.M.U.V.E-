import {
  GROWTH_WITHHELD,
  buildGrowthBrief,
  growthGapLabel,
  growthMonthLabel,
  trimGrowthBrief,
} from './growth-brief.util';
import type { MonthOverMonthGrowth } from './marketing.service';

const growth = (
  patch: Partial<MonthOverMonthGrowth> = {}
): MonthOverMonthGrowth => ({
  state: 'no-data',
  latestMonth: null,
  previousMonth: null,
  newPlatforms: [],
  followers: null,
  monthlyListeners: null,
  trends: [],
  recordedOnce: [],
  ...patch,
});

describe('growth brief for the model prompt', () => {
  it('reports a comparable month with its baseline, delta and platforms', () => {
    const brief = buildGrowthBrief(
      growth({
        state: 'comparable',
        latestMonth: '2026-11',
        previousMonth: '2026-10',
        followers: {
          previous: 1000,
          latest: 1200,
          delta: 200,
          percent: 20,
          platforms: 3,
        },
        trends: [
          {
            platform: 'Instagram',
            points: [
              { month: '2026-10', value: 1000 },
              { month: '2026-11', value: 1200 },
            ],
            delta: 200,
          },
        ],
      })
    );

    expect(brief).toContain('LATEST RECORDED MONTH: Nov 2026');
    expect(brief).toContain(
      'FOLLOWERS: 1,000 → 1,200 (+200, +20%) across 3 platforms recorded in both months.'
    );
    expect(brief).toContain(
      '- Instagram: Oct 2026 1,000 → Nov 2026 1,200 (+200 across the months it was actually recorded).'
    );
    // No listener total was comparable, and the brief says so instead of
    // borrowing the follower figure.
    expect(brief).toContain('MONTHLY LISTENERS: no comparable total');
    expect(brief).toContain('BINDING GROWTH RULES');
  });

  it('marks a skipped month as missing data and refuses a percentage without a baseline', () => {
    const brief = buildGrowthBrief(
      growth({
        state: 'no-baseline',
        latestMonth: '2026-11',
        previousMonth: '2026-10',
        newPlatforms: ['Instagram'],
        trends: [
          {
            platform: 'Instagram',
            points: [
              { month: '2026-08', value: 900 },
              {
                month: '2026-11',
                value: 1100,
                gapBefore: ['2026-09', '2026-10'],
              },
            ],
            delta: 200,
          },
        ],
        recordedOnce: [{ platform: 'Facebook', month: '2026-08' }],
      })
    );

    expect(brief).toContain('NO MONTH-OVER-MONTH TOTAL');
    expect(brief).toContain('has no baseline');
    expect(brief).toContain(
      '- Instagram: Aug 2026 900 → [no data for Sep–Oct 2026] → Nov 2026 1,100 (+200 across the months it was actually recorded).'
    );
    expect(brief).toContain(
      'RECORDED IN ONE MONTH ONLY (no direction, and not growth): Facebook (Aug 2026).'
    );
    expect(brief).toContain(
      'FIRST RECORDED IN Nov 2026 — a new platform is not growth: Instagram.'
    );
    // Not one invented percentage anywhere in the block.
    expect(brief).not.toMatch(/\d%/);
  });

  it('keeps its rules when the prompt budget trims the tail', () => {
    const brief = buildGrowthBrief(
      growth({
        state: 'no-baseline',
        latestMonth: '2026-11',
        previousMonth: '2026-10',
      })
    ).slice(0, 1200);

    // The prefix budget slices this block at 1200 characters; whatever falls
    // off the end, it must never be the rule that forbids a cross-gap figure.
    expect(brief).toContain('BINDING GROWTH RULES');
    expect(brief).toContain('name the missing months');
  });

  it('treats a zero baseline as no percentage rather than an infinite jump', () => {
    const brief = buildGrowthBrief(
      growth({
        state: 'comparable',
        latestMonth: '2026-11',
        previousMonth: '2026-10',
        followers: {
          previous: 0,
          latest: 50,
          delta: 50,
          percent: null,
          platforms: 1,
        },
      })
    );

    expect(brief).toContain(
      'FOLLOWERS: 0 → 50 (+50, no percentage, because the previous total was zero) across 1 platform recorded in both months.'
    );
  });

  it('refuses to supply a figure when nothing has been recorded', () => {
    const brief = buildGrowthBrief(growth());

    expect(brief).toContain('RECORDED FIGURES: none yet');
    expect(brief).toContain('BINDING GROWTH RULES');
    expect(brief).not.toContain('FOLLOWERS:');
    expect(brief).not.toContain('MONTHLY LISTENERS:');
  });

  it('bounds the platform list without dropping the rules above it', () => {
    const trends = Array.from({ length: 7 }, (_, index) => ({
      platform: `Platform ${index + 1}`,
      points: [
        { month: '2026-10', value: 100 },
        { month: '2026-11', value: 200 },
      ],
      delta: 100,
    }));

    const brief = buildGrowthBrief(
      growth({
        state: 'comparable',
        latestMonth: '2026-11',
        previousMonth: '2026-10',
        trends,
      })
    );

    expect(brief).toContain('Platform 5');
    expect(brief).not.toContain('Platform 6');
    expect(brief).toContain(
      '(+2 more platforms with recorded direction — do not guess their figures; ask which one to read.)'
    );
    expect(brief).toContain('BINDING GROWTH RULES');
  });

  it('labels months and skipped runs the way the Strategy card does', () => {
    expect(growthMonthLabel('2026-11')).toBe('Nov 2026');
    expect(growthGapLabel(['2026-10'])).toBe('Oct 2026');
    expect(growthGapLabel(['2026-09', '2026-10'])).toBe('Sep–Oct 2026');
    expect(growthGapLabel(['2025-12', '2026-01'])).toBe('Dec 2025–Jan 2026');
    expect(growthGapLabel([])).toBe('');
  });

  it('trims on a line boundary instead of splitting a platform row', () => {
    const trends = Array.from({ length: 6 }, (_, index) => ({
      platform: `Platform ${index + 1}`,
      points: [
        { month: '2026-10', value: 100 },
        { month: '2026-11', value: 200 },
      ],
      delta: 100,
    }));
    const brief = buildGrowthBrief(
      growth({
        state: 'comparable',
        latestMonth: '2026-11',
        previousMonth: '2026-10',
        trends,
      })
    );
    expect(brief.length).toBeGreaterThan(1200);

    const trimmed = trimGrowthBrief(brief, 1200);

    expect(trimmed.length).toBeLessThanOrEqual(1200);
    // Nothing falls off the front, and the cut lands exactly on a newline: the
    // model can never receive half a platform row with a figure and no month.
    expect(brief.startsWith(trimmed)).toBe(true);
    expect(brief[trimmed.length]).toBe('\n');
    const whole = brief.split('\n');
    trimmed.split('\n').forEach((line) => expect(whole).toContain(line));
    expect(trimmed).toContain('BINDING GROWTH RULES');
  });

  it('leaves a brief that fits untouched, and hard-cuts a single unbroken line', () => {
    const brief = buildGrowthBrief(growth());
    expect(trimGrowthBrief(brief, 5000)).toBe(brief);
    expect(trimGrowthBrief('x'.repeat(50), 10)).toBe('x'.repeat(10));
    expect(trimGrowthBrief(brief, 0)).toBe('');
  });

  it('carries the withheld notice for artists who do not share figures', () => {
    expect(GROWTH_WITHHELD).toContain('withheld');
    expect(GROWTH_WITHHELD).toContain('audience');
    expect(GROWTH_WITHHELD).not.toContain('FIGURES:');
  });
});
