import {
  BAR_RING_RADIUS,
  BASE_FLOOR_RADIUS,
  DEFAULT_ORBIT_RADIUS,
  INNER_BAR_RING_RADIUS,
  MAX_ORBIT_RADIUS,
  MIN_ORBIT_RADIUS,
  orbitLimitsFor,
  stageBarRings,
  stageCameraDistance,
  stageFloorScale,
  stageFogRange,
} from "./stage-framing";

/** A tall humanoid, normalized to the stage's 2.65-unit performer height. */
const humanoid = { x: 1.72, y: 2.65, z: 1.02 };
/** A sofa: nearly three times wider than tall once its height is normalized. */
const sofa = { x: 7.71, y: 2.65, z: 4.25 };
const FOV = 40;
const TALL_STAGE = 0.55;

describe("stageCameraDistance", () => {
  it("frames a tall performer by its height", () => {
    const distance = stageCameraDistance(humanoid, FOV, 1);
    const expected =
      (humanoid.y * 1.14) / 2 / Math.tan((FOV * Math.PI) / 360) +
      humanoid.z / 2;
    expect(distance).toBeCloseTo(expected, 5);
    expect(distance).toBeLessThan(DEFAULT_ORBIT_RADIUS);
  });

  it("is limited by a narrow stage rather than the performer's height", () => {
    expect(stageCameraDistance(humanoid, FOV, TALL_STAGE)).toBeGreaterThan(
      stageCameraDistance(humanoid, FOV, 1),
    );
  });

  it("pulls back much further for a wide performer", () => {
    const tall = stageCameraDistance(humanoid, FOV, TALL_STAGE);
    const wide = stageCameraDistance(sofa, FOV, TALL_STAGE);
    expect(wide).toBeGreaterThan(tall * 3);
  });

  it("uses the footprint diagonal so the model stays whole while it orbits", () => {
    const flat = { x: 6, y: 1, z: 0 };
    const deep = { x: 6, y: 1, z: 2 };
    expect(stageCameraDistance(deep, FOV, 1.6)).toBeGreaterThan(
      stageCameraDistance(flat, FOV, 1.6),
    );
  });

  it("needs more distance on a narrower stage", () => {
    expect(stageCameraDistance(sofa, FOV, 0.5)).toBeGreaterThan(
      stageCameraDistance(sofa, FOV, 1.4),
    );
  });

  it("falls back to zero for missing bounds", () => {
    expect(stageCameraDistance({ x: 0, y: 0, z: 0 }, FOV, 1)).toBe(0);
    expect(stageCameraDistance({ x: NaN, y: 1, z: 1 }, FOV, 1)).toBe(0);
    expect(stageCameraDistance(sofa, 0, 1)).toBe(0);
  });

  it("treats a broken aspect as square", () => {
    expect(stageCameraDistance(sofa, FOV, Number.NaN)).toBeCloseTo(
      stageCameraDistance(sofa, FOV, 1),
      5,
    );
  });
});

describe("orbitLimitsFor", () => {
  it("keeps the stage's familiar zoom range for the built-in performer", () => {
    expect(orbitLimitsFor(DEFAULT_ORBIT_RADIUS)).toEqual({
      min: MIN_ORBIT_RADIUS,
      max: MAX_ORBIT_RADIUS,
    });
  });

  it("lets an artist zoom out and back in around a wide performer", () => {
    const frame = stageCameraDistance(sofa, FOV, TALL_STAGE);
    const limits = orbitLimitsFor(frame);
    expect(limits.max).toBeGreaterThan(frame);
    expect(limits.min).toBeGreaterThan(MIN_ORBIT_RADIUS);
    expect(limits.min).toBeLessThan(frame);
  });
});

describe("stageFloorScale", () => {
  it("keeps the designed floor for the built-in performer", () => {
    expect(stageFloorScale(null)).toBe(1);
    expect(stageFloorScale(humanoid)).toBe(1);
  });

  it("grows the floor past a wide performer's furthest corner", () => {
    const wide = { x: 7.36, y: 2.65, z: 3.44 };
    const reach = Math.hypot(wide.x, wide.z) / 2;
    const scale = stageFloorScale(wide);

    expect(scale).toBeGreaterThan(1);
    expect(BASE_FLOOR_RADIUS * scale).toBeGreaterThan(reach);
  });

  it("stops growing once the disc outgrows the frame", () => {
    expect(stageFloorScale({ x: 60, y: 2.65, z: 10 })).toBe(5);
  });
});

describe("stageBarRings", () => {
  it("leaves the bars at their designed radii for the built-in performer", () => {
    const builtIn = stageBarRings(null);
    expect(builtIn.inner).toBeCloseTo(INNER_BAR_RING_RADIUS, 6);
    expect(builtIn.outer).toBeCloseTo(BAR_RING_RADIUS, 6);

    const human = stageBarRings(humanoid, 1);
    expect(human.inner).toBeCloseTo(INNER_BAR_RING_RADIUS, 6);
    expect(human.outer).toBeCloseTo(BAR_RING_RADIUS, 6);
  });

  it("moves both rings clear of a wide performer", () => {
    const rings = stageBarRings(sofa, stageFloorScale(sofa));
    const reach = Math.hypot(sofa.x, sofa.z) / 2;

    expect(rings.inner).toBeGreaterThan(reach);
    expect(rings.outer).toBeGreaterThan(rings.inner);
  });

  it("keeps the outer ring on the floor disc", () => {
    const floorScale = stageFloorScale(sofa);
    const rings = stageBarRings(sofa, floorScale);

    expect(rings.outer).toBeLessThan(BASE_FLOOR_RADIUS * floorScale);
  });

  it("keeps the two rings' designed gap", () => {
    const rings = stageBarRings(sofa, stageFloorScale(sofa));

    expect(rings.outer - rings.inner).toBeCloseTo(
      BAR_RING_RADIUS - INNER_BAR_RING_RADIUS,
      6,
    );
  });

  it("follows a floor that grew for a smaller model", () => {
    const rings = stageBarRings(humanoid, 2);

    expect(rings.inner).toBeCloseTo(INNER_BAR_RING_RADIUS * 2, 6);
    expect(rings.outer).toBeCloseTo(BAR_RING_RADIUS * 2, 6);
  });

  it("keeps the rings on a floor that stopped growing", () => {
    const huge = { x: 60, y: 2.65, z: 10 };
    const rings = stageBarRings(huge, stageFloorScale(huge));

    expect(rings.outer).toBeLessThanOrEqual(BASE_FLOOR_RADIUS * 5);
    expect(rings.inner).toBeLessThan(rings.outer);
  });
});

describe("stageFogRange", () => {
  it("leaves the default stage depth untouched", () => {
    expect(stageFogRange(DEFAULT_ORBIT_RADIUS)).toEqual({ near: 7, far: 22 });
  });

  it("moves the fog behind a pulled-back performer without passing the far plane", () => {
    const frame = stageCameraDistance(sofa, FOV, TALL_STAGE);
    const range = stageFogRange(frame);
    expect(range.near).toBeGreaterThan(frame * 0.9);
    expect(range.far).toBeLessThanOrEqual(78);
    expect(range.far).toBeGreaterThan(range.near);
  });
});
