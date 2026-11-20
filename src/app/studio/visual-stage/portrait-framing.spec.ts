import {
  portraitCameraDistance,
  type PortraitExtents,
} from "./portrait-framing";

const FOV = 32;
const halfTan = (fov: number) => Math.tan((fov * Math.PI) / 180 / 2);

/** Half of the frame's height/width at the model's centre plane. */
const visibleHalfExtent = (extents: PortraitExtents, distance: number) =>
  (distance - extents.z / 2) * halfTan(FOV);

describe("portraitCameraDistance", () => {
  it("fits a tall, narrow character without cropping its head or feet", () => {
    const extents = { x: 0.5, y: 2.65, z: 0.4 };
    const distance = portraitCameraDistance(extents, FOV);

    expect(visibleHalfExtent(extents, distance)).toBeGreaterThanOrEqual(
      extents.y / 2,
    );
  });

  it("fits a wide, low character instead of only measuring its height", () => {
    const extents = { x: 3, y: 0.6, z: 0.5 };
    const distance = portraitCameraDistance(extents, FOV);

    // Framing from height alone would clip a 3-unit span badly.
    expect(visibleHalfExtent(extents, distance)).toBeGreaterThanOrEqual(
      extents.x / 2,
    );
    expect(distance).toBeGreaterThan(
      portraitCameraDistance({ x: 0.6, y: 0.6, z: 0.5 }, FOV),
    );
  });

  it("keeps margin around the bounds on every shape it frames", () => {
    const shapes: PortraitExtents[] = [
      { x: 0.4, y: 3.4, z: 0.4 },
      { x: 2.2, y: 0.8, z: 1.9 },
      { x: 1.1, y: 1.1, z: 1.1 },
    ];

    for (const extents of shapes) {
      const distance = portraitCameraDistance(extents, FOV);
      const half = Math.max(extents.y, extents.x) / 2;
      expect(visibleHalfExtent(extents, distance)).toBeGreaterThan(half);
    }
  });

  it("stands further back for a deeper model so its front never clips", () => {
    const shallow = portraitCameraDistance({ x: 1, y: 2, z: 0.2 }, FOV);
    const deep = portraitCameraDistance({ x: 1, y: 2, z: 2 }, FOV);

    expect(deep - shallow).toBeCloseTo(0.9, 5);
  });

  it("falls back to the nearest usable distance for degenerate bounds", () => {
    expect(portraitCameraDistance({ x: 0, y: 0, z: 0 }, FOV)).toBe(0.6);
    expect(portraitCameraDistance({ x: NaN, y: 1, z: 1 }, FOV)).toBe(0.6);
  });

  it("clamps an enormous model to the camera's practical range", () => {
    expect(portraitCameraDistance({ x: 600, y: 600, z: 600 }, FOV)).toBe(50);
  });
});
