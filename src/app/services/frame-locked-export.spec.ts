import {
  createFrameLockPlan,
  frameDurationMicros,
  frameKeyInterval,
  frameProgressPercent,
  frameTimeSeconds,
  frameTimestampMicros,
} from './frame-locked-export';

describe('frame-locked export schedule', () => {
  it('turns a five-second delivery into exactly 150 frames at 30fps', () => {
    const plan = createFrameLockPlan(5, 30);

    expect(plan.totalFrames).toBe(150);
    expect(plan.frameIntervalMs).toBeCloseTo(1000 / 30);
    expect(frameTimeSeconds(plan, 0)).toBe(0);
    expect(frameTimeSeconds(plan, 149)).toBeCloseTo(149 / 30);
    // The last slot stays inside the requested window.
    expect(frameTimeSeconds(plan, 999)).toBe(5);
  });

  it('rounds a short tail up to one frame instead of exporting nothing', () => {
    const plan = createFrameLockPlan(0.05, 30);

    expect(plan.totalFrames).toBe(2);
    expect(frameProgressPercent(plan, 1)).toBe(50);
  });

  it('stamps every encoded frame from its slot, with no accumulated drift', () => {
    const plan = createFrameLockPlan(10, 30);

    expect(frameTimestampMicros(plan, 0)).toBe(0);
    expect(frameTimestampMicros(plan, 1)).toBe(33_333);
    expect(frameTimestampMicros(plan, 29)).toBe(966_667);
    expect(frameTimestampMicros(plan, 30)).toBe(1_000_000);
    expect(frameTimestampMicros(plan, 299)).toBe(9_966_667);
    // The interval is uniform all the way to the tail (no 33.3µs creep).
    expect(frameTimestampMicros(plan, 30) - frameTimestampMicros(plan, 29)).toBe(
      33_333,
    );
    expect(frameDurationMicros(plan)).toBe(33_333);
    expect(frameKeyInterval(plan)).toBe(60);
  });

  it('clamps malformed rates and reports frame-count progress', () => {
    const plan = createFrameLockPlan(2, Number.NaN);

    expect(plan.fps).toBe(30);
    expect(plan.totalFrames).toBe(60);
    expect(frameProgressPercent(plan, 0)).toBe(0);
    expect(frameProgressPercent(plan, 60)).toBe(100);
    expect(frameProgressPercent(plan, 999)).toBe(100);
  });
});
