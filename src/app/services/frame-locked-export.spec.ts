import {
  createFrameLockPlan,
  frameProgressPercent,
  frameTimeSeconds,
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

  it('clamps malformed rates and reports frame-count progress', () => {
    const plan = createFrameLockPlan(2, Number.NaN);

    expect(plan.fps).toBe(30);
    expect(plan.totalFrames).toBe(60);
    expect(frameProgressPercent(plan, 0)).toBe(0);
    expect(frameProgressPercent(plan, 60)).toBe(100);
    expect(frameProgressPercent(plan, 999)).toBe(100);
  });
});
