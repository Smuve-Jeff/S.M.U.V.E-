import {
  MAX_CGI_OBJECTS,
  cgiCameraPose,
  createCgiPrimitive,
  createDefaultCgiScene,
  sanitizeCgiScene,
} from './cgi-scene';

describe('CGI scene data', () => {
  it('creates a renderable default scene', () => {
    const scene = createDefaultCgiScene();

    expect(scene.enabled).toBe(true);
    expect(scene.objects).toHaveLength(1);
    expect(scene.objects[0].kind).toBe('torus');
    expect(scene.cameraMove).toBe('orbit-left');
    expect(scene.shadows).toBe(true);
    expect(scene.reflections).toBe(true);
    expect(scene.background).toBe('transparent');
  });

  it('creates a primitive with the requested kind and a stable colour slot', () => {
    const cube = createCgiPrimitive('cube', 1);

    expect(cube.kind).toBe('cube');
    expect(cube.name).toBe('Metal Cube');
    expect(cube.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(cube.position).toEqual([0, 0, 0]);
    expect(cube.spin).toBe(-1);
  });

  it('rejects absent or non-object scene data', () => {
    expect(sanitizeCgiScene(null)).toBeNull();
    expect(sanitizeCgiScene('scene')).toBeNull();
    expect(sanitizeCgiScene(false)).toBeNull();
  });

  it('clamps restored values and drops unusable objects', () => {
    const scene = sanitizeCgiScene({
      enabled: false,
      objects: [
        {
          id: ' cube ',
          name: 'Hero Cube',
          kind: 'cube',
          color: '#FF0000',
          position: [99, -99, 2],
          scale: 99,
          spin: -99,
        },
        { kind: 'model' },
        { kind: 'not-a-primitive' },
      ],
      cameraMove: 'warp-speed',
      cameraDistance: 999,
      cameraHeight: -99,
      fov: 1,
      lightIntensity: 999,
      shadows: false,
      reflections: false,
      background: 'dark',
      spin: 99,
    });

    expect(scene).not.toBeNull();
    expect(scene?.enabled).toBe(false);
    expect(scene?.objects).toHaveLength(1);
    expect(scene?.objects[0]).toMatchObject({
      id: 'cube',
      name: 'Hero Cube',
      kind: 'cube',
      color: '#ff0000',
      position: [20, -20, 2],
      scale: 5,
      spin: -8,
    });
    expect(scene?.cameraMove).toBe('orbit-left');
    expect(scene?.cameraDistance).toBe(20);
    expect(scene?.cameraHeight).toBe(-4);
    expect(scene?.fov).toBe(20);
    expect(scene?.lightIntensity).toBe(4);
    expect(scene?.shadows).toBe(false);
    expect(scene?.reflections).toBe(false);
    expect(scene?.background).toBe('dark');
    expect(scene?.spin).toBe(4);
  });

  it('keeps a bounded embedded model and caps the object list', () => {
    const objects = Array.from({ length: MAX_CGI_OBJECTS + 4 }, (_, index) => ({
      id: `cube-${index}`,
      name: `Cube ${index}`,
      kind: 'cube',
    }));
    objects[0] = {
      id: 'model',
      name: 'Imported',
      kind: 'model',
      modelDataUrl: 'data:model/gltf-binary;base64,AAAA',
    } as (typeof objects)[number];
    objects[1] = {
      id: 'oversized',
      name: 'Too big',
      kind: 'model',
      modelDataUrl: `data:model/gltf-binary;base64,${'A'.repeat(
        12_000_001,
      )}`,
    } as (typeof objects)[number];

    const scene = sanitizeCgiScene({ objects });

    expect(scene?.objects).toHaveLength(MAX_CGI_OBJECTS);
    expect(scene?.objects[0].modelDataUrl).toBe(
      'data:model/gltf-binary;base64,AAAA',
    );
    expect(scene?.objects.some((object) => object.id === 'oversized')).toBe(
      false,
    );
  });

  it('drives an orbit from clip time and clamps camera progress', () => {
    const first = cgiCameraPose(
      { cameraMove: 'orbit-left', cameraDistance: 6, cameraHeight: 1.4 },
      0,
      0,
    );
    const later = cgiCameraPose(
      { cameraMove: 'orbit-left', cameraDistance: 6, cameraHeight: 1.4 },
      4,
      0.4,
    );

    expect(first.azimuth).toBe(0.55);
    expect(later.azimuth).toBeGreaterThan(first.azimuth);
    expect(later.distance).toBe(6);
    expect(later.height).toBe(1.4);
  });

  it('pushes the camera in across the clip without overshooting', () => {
    const start = cgiCameraPose(
      { cameraMove: 'push-in', cameraDistance: 6, cameraHeight: 1.4 },
      0,
      -1,
    );
    const end = cgiCameraPose(
      { cameraMove: 'push-in', cameraDistance: 6, cameraHeight: 1.4 },
      10,
      2,
    );

    expect(start.distance).toBeCloseTo(8.1);
    expect(end.distance).toBeCloseTo(4.8);
    expect(end.targetY).toBe(0.1);
  });
});
