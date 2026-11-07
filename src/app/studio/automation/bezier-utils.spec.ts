import { bezierInterpolate, BezierPresets } from "./bezier-utils";

/**
 * The presets are surfaced in the automation editor, so their `value` fields
 * are fractions of the segment's rise. These tests pin the shape each label
 * promises; a preset that eases the wrong way looks identical on screen until
 * the lane is played back.
 */
describe("bezierInterpolate", () => {
  const at = (ratio: number, handles = BezierPresets.easeInOut) =>
    bezierInterpolate(0, 0, 4, 1, ratio, handles);

  it("anchors both ends instead of pinning the curve to its start", () => {
    expect(at(0)).toBeCloseTo(0, 5);
    expect(at(1)).toBeCloseTo(1, 5);
    // A normalised lookup used to keep the lane at its start value until the
    // endpoint branch snapped it to the end.
    expect(at(0.9)).toBeGreaterThan(0.8);
  });

  it("draws a straight line with the linear preset", () => {
    expect(at(0.25, BezierPresets.linear)).toBeCloseTo(0.25, 3);
    expect(at(0.5, BezierPresets.linear)).toBeCloseTo(0.5, 3);
    expect(at(0.75, BezierPresets.linear)).toBeCloseTo(0.75, 3);
  });

  it("eases out quickly from the start", () => {
    expect(at(0.25, BezierPresets.easeOut)).toBeGreaterThan(0.5);
    expect(at(0.75, BezierPresets.easeOut)).toBeGreaterThan(0.9);
  });

  it("eases in slowly and accelerates", () => {
    expect(at(0.25, BezierPresets.easeIn)).toBeLessThan(0.1);
    expect(at(0.75, BezierPresets.easeIn)).toBeLessThan(0.5);
    expect(at(0.5, BezierPresets.easeIn)).toBeLessThan(0.5);
  });

  it("eases in and out symmetrically around the midpoint", () => {
    expect(at(0.5)).toBeCloseTo(0.5, 2);
    const early = at(0.25);
    const late = at(0.75);
    expect(early).toBeCloseTo(1 - late, 2);
    expect(early).toBeLessThan(0.25);
    expect(late).toBeGreaterThan(0.75);
  });
});
