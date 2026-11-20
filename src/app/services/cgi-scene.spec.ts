import {
  CGI_MATERIAL_PRESETS,
  CGI_SCENE_PRESETS,
  MAX_CGI_KEYFRAME_TIME,
  MAX_CGI_KEYFRAMES_PER_TRACK,
  MAX_CGI_OBJECTS,
  applyCgiScenePreset,
  applyCgiMaterialPreset,
  applyCgiMaterialPresetToAll,
  cgiCameraPose,
  clearCgiMaterialPreset,
  cgiChannelValueAt,
  createCgiPrimitive,
  createDefaultCgiScene,
  removeCgiKeyframe,
  resolveCgiFrame,
  sanitizeCgiScene,
  setCgiKeyframe,
  splitCgiAnimationAt,
  type CgiAnimationTrack,
} from './cgi-scene';
import type { KeyframeEasing } from './clip-keyframes';

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
    expect(cube.metalness).toBe(0.72);
    expect(cube.roughness).toBe(0.22);
  });

  it('offers a matte starting finish for the cone and a brushed cylinder', () => {
    const cone = createCgiPrimitive('cone', 0);
    const cylinder = createCgiPrimitive('cylinder', 0);

    expect(cone.name).toBe('Matte Cone');
    expect(cone.metalness).toBe(0.18);
    expect(cone.roughness).toBe(0.62);
    expect(cylinder.name).toBe('Brushed Cylinder');
    expect(
      sanitizeCgiScene({ objects: [cone, cylinder] })?.objects.map(
        (object) => object.kind,
      ),
    ).toEqual(['cone', 'cylinder']);
  });

  it('keeps object ids unique so two objects cannot share one transform', () => {
    const scene = sanitizeCgiScene({
      objects: [
        { id: 'hero', kind: 'cube' },
        { id: 'hero', kind: 'sphere' },
        { kind: 'cone' },
      ],
    });

    expect(scene?.objects.map((object) => object.id)).toEqual([
      'hero',
      'hero-2',
      'cgi-object-2',
    ]);
  });

  it('clamps a restored PBR finish and defaults it for legacy objects', () => {
    const scene = sanitizeCgiScene({
      objects: [
        {
          id: 'a',
          kind: 'cube',
          metalness: 4,
          roughness: -2,
          emissive: 99,
          bloom: false,
        },
        { id: 'b', kind: 'sphere' },
      ],
    });

    expect(scene?.objects[0]).toMatchObject({
      metalness: 1,
      roughness: 0,
      emissive: 4,
      bloom: false,
    });
    expect(scene?.objects[1]).toMatchObject({
      metalness: 0.72,
      roughness: 0.22,
      emissive: 0,
    });
    expect(scene?.objects[1].bloom).toBeUndefined();
  });

  it('applies a one-click finish to a primitive and resolves its glow', () => {
    const scene = createDefaultCgiScene();

    const next = applyCgiMaterialPreset(scene, 'cgi-torus', 'neon');

    expect(next.objects[0]).toMatchObject({
      metalness: 0.14,
      roughness: 0.16,
      emissive: 0.55,
    });
    expect(resolveCgiFrame(next, 0).objects[0].emissive).toBe(0.55);
    expect(cgiChannelValueAt(next, 'cgi-torus', 'emissive', 0)).toBe(0.55);
    expect(CGI_MATERIAL_PRESETS).toHaveLength(4);
    expect(applyCgiMaterialPreset(next, 'missing', 'chrome')).toBe(next);
    expect(applyCgiMaterialPreset(next, 'cgi-torus', 'missing')).toBe(next);
    expect(scene.objects[0].emissive).toBeUndefined();
  });

  it('finishes every primitive at once and leaves imported models alone', () => {
    const scene = createDefaultCgiScene();
    scene.objects.push(createCgiPrimitive('cube', 1));
    const withModel = sanitizeCgiScene({
      ...scene,
      objects: [
        ...scene.objects,
        {
          id: 'hero',
          kind: 'model',
          modelDataUrl: 'data:model/gltf-binary;base64,AAAA',
        },
      ],
    })!;

    const next = applyCgiMaterialPresetToAll(withModel, 'matte');

    expect(next.objects[0]).toMatchObject({
      metalness: 0.08,
      roughness: 0.82,
      emissive: 0,
    });
    expect(next.objects[1]).toMatchObject({
      metalness: 0.08,
      roughness: 0.82,
      emissive: 0,
    });
    expect(next.objects[2]).toMatchObject({
      id: 'hero',
      kind: 'model',
      metalness: 0.72,
    });
    expect(next.materialPreset).toBe('matte');
    expect(applyCgiMaterialPresetToAll(withModel, 'missing')).toBe(withModel);
  });

  it('restores only known finishes and the bloom switch', () => {
    expect(
      sanitizeCgiScene({ materialPreset: 'neon' })?.materialPreset,
    ).toBe('neon');
    expect(
      sanitizeCgiScene({ materialPreset: 'glitter' })?.materialPreset,
    ).toBeUndefined();
    expect(sanitizeCgiScene({ bloom: false })?.bloom).toBe(false);
    expect(sanitizeCgiScene({ bloom: true })?.bloom).toBeUndefined();
    expect(
      sanitizeCgiScene({ bloomStrength: 4, bloomRadius: 0 }),
    ).toMatchObject({ bloomStrength: 2, bloomRadius: 0.25 });
    expect(
      sanitizeCgiScene({ bloomStrength: 0.6, bloomRadius: 1.4 }),
    ).toMatchObject({ bloomStrength: 0.6, bloomRadius: 1.4 });
    expect(
      sanitizeCgiScene({
        objects: [
          {
            id: 'hero',
            kind: 'model',
            modelDataUrl: 'data:model/gltf-binary;base64,AAAA',
            materialPreset: 'neon',
          },
        ],
      })?.objects[0].materialPreset,
    ).toBe('neon');
  });

  it('opts a model into a finish without changing its stored PBR values', () => {
    const scene = sanitizeCgiScene({
      objects: [
        {
          id: 'hero',
          kind: 'model',
          modelDataUrl: 'data:model/gltf-binary;base64,AAAA',
        },
      ],
    })!;

    const next = applyCgiMaterialPreset(scene, 'hero', 'chrome');

    expect(next.objects[0]).toMatchObject({
      kind: 'model',
      materialPreset: 'chrome',
      metalness: 0.72,
    });
    expect(clearCgiMaterialPreset(next, 'hero').objects[0].materialPreset).toBeUndefined();
  });

  it('clears the scene-wide finish used for new primitives', () => {
    const scene = applyCgiMaterialPresetToAll(
      createDefaultCgiScene(),
      'chrome',
    );

    const cleared = clearCgiMaterialPreset(scene);

    expect(scene.materialPreset).toBe('chrome');
    expect(cleared.materialPreset).toBeUndefined();
    expect(cleared.objects).toEqual(scene.objects);
    expect(clearCgiMaterialPreset(cleared)).toBe(cleared);
  });

  it('applies a stage look without disturbing objects, colours or keys', () => {
    const scene = setCgiKeyframe(
      createDefaultCgiScene(),
      'cgi-torus',
      'scale',
      1,
      1.6,
    );
    const before = JSON.stringify({
      objects: scene.objects,
      animation: scene.animation,
    });

    const next = applyCgiScenePreset(scene, 'neon-noir');

    expect(next.cameraMove).toBe('orbit-right');
    expect(next.background).toBe('dark');
    expect(next.shadows).toBe(false);
    expect(
      JSON.stringify({ objects: next.objects, animation: next.animation }),
    ).toBe(before);
    expect(applyCgiScenePreset(scene, 'missing')).toBe(scene);
    expect(CGI_SCENE_PRESETS).toHaveLength(4);
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

describe('CGI animation data', () => {
  const animatedScene = (tracks: CgiAnimationTrack[]) => {
    const scene = createDefaultCgiScene();
    scene.animation = { version: 1, tracks };
    return scene;
  };

  it('leaves a legacy scene without an animation block untouched', () => {
    const scene = sanitizeCgiScene(createDefaultCgiScene());

    expect(scene).not.toBeNull();
    expect(scene?.animation).toBeUndefined();
  });

  it('merges duplicate channel tracks, sorts keys and folds equal times', () => {
    const scene = sanitizeCgiScene({
      objects: [{ id: 'hero', kind: 'cube', name: 'Hero' }],
      animation: {
        version: 1,
        tracks: [
          {
            targetObjectId: 'hero',
            channel: 'position.x',
            keys: [
              { time: 2, value: 99, easing: 'step' },
              { time: 1, value: 3, easing: 'ease-in' },
              { time: 1, value: 4, easing: 'not-an-easing' },
            ],
          },
          {
            targetObjectId: 'hero',
            channel: 'position.x',
            keys: [{ time: 3, value: -99 }],
          },
          {
            targetObjectId: null,
            channel: 'camera.height',
            keys: [{ time: -5, value: 99, easing: 'ease-out' }],
          },
        ],
      },
    });

    expect(scene?.animation?.version).toBe(1);
    expect(scene?.animation?.tracks).toHaveLength(2);
    const position = scene?.animation?.tracks.find(
      (track) => track.channel === 'position.x',
    );
    expect(position?.targetObjectId).toBe('hero');
    expect(position?.keys.map((key) => key.time)).toEqual([1, 2, 3]);
    expect(position?.keys.map((key) => key.value)).toEqual([4, 20, -20]);
    expect(position?.keys[0].easing).toBe('linear');
    expect(position?.keys[1].easing).toBe('step');

    const light = scene?.animation?.tracks.find(
      (track) => track.channel === 'camera.height',
    );
    expect(light?.targetObjectId).toBeNull();
    expect(light?.keys[0]).toMatchObject({ time: 0, value: 8 });
  });

  it('drops deleted targets, wrong scopes and unknown channels', () => {
    const scene = sanitizeCgiScene({
      objects: [{ id: 'hero', kind: 'cube' }],
      animation: {
        version: 1,
        tracks: [
          {
            targetObjectId: 'deleted',
            channel: 'scale',
            keys: [{ time: 1, value: 2 }],
          },
          {
            targetObjectId: null,
            channel: 'scale',
            keys: [{ time: 1, value: 2 }],
          },
          {
            targetObjectId: 'hero',
            channel: 'camera.distance',
            keys: [{ time: 1, value: 8 }],
          },
          {
            targetObjectId: 'hero',
            channel: 'not.a.channel',
            keys: [{ time: 1, value: 2 }],
          },
          {
            targetObjectId: 'hero',
            channel: 'opacity',
            keys: [{ time: 'nope', value: 2 }],
          },
        ],
      },
    });

    expect(scene?.animation?.tracks).toEqual([]);
  });

  it('drops an embedded payload that is not a model data URL', () => {
    const scene = sanitizeCgiScene({
      objects: [
        {
          id: 'image',
          kind: 'model',
          modelDataUrl: 'data:image/png;base64,AAAA',
        },
        {
          id: 'gltf',
          kind: 'model',
          modelDataUrl: 'data:model/gltf+json;base64,e30=',
        },
      ],
    });

    expect(scene?.objects.map((object) => object.id)).toEqual(['gltf']);
  });

  it('gives duplicate key ids in one track unique identity', () => {
    const scene = sanitizeCgiScene({
      objects: [{ id: 'hero', kind: 'cube' }],
      animation: {
        version: 1,
        tracks: [
          {
            targetObjectId: 'hero',
            channel: 'scale',
            keys: [
              { id: 'same', time: 0, value: 1 },
              { id: 'same', time: 1, value: 2 },
            ],
          },
        ],
      },
    });

    expect(
      scene?.animation?.tracks[0].keys.map((key) => key.id),
    ).toEqual(['same', 'same-2']);
  });

  it('caps an individual track so project JSON stays bounded', () => {
    const keys = Array.from(
      { length: MAX_CGI_KEYFRAMES_PER_TRACK + 30 },
      (_, index) => ({ time: index, value: 1 }),
    );
    const scene = sanitizeCgiScene({
      objects: [{ id: 'hero', kind: 'cube' }],
      animation: {
        version: 1,
        tracks: [
          { targetObjectId: 'hero', channel: 'scale', keys },
        ],
      },
    });

    expect(scene?.animation?.tracks[0].keys).toHaveLength(
      MAX_CGI_KEYFRAMES_PER_TRACK,
    );
  });

  it('resolves the existing static scene when no channels are keyed', () => {
    const scene = createDefaultCgiScene();
    const frame = resolveCgiFrame(scene, 0, 4);

    expect(frame.objects).toHaveLength(1);
    expect(frame.objects[0].position).toEqual([0, 0, 0]);
    expect(frame.objects[0].scale).toBe(1);
    expect(frame.objects[0].opacity).toBe(1);
    expect(frame.objects[0].emissive).toBe(0);
    expect(frame.cameraDistance).toBe(6);
    expect(frame.cameraHeight).toBe(1.4);
    expect(frame.lightIntensity).toBe(1.5);
    expect(frame.cameraPose.azimuth).toBeCloseTo(0.55);
  });

  it('interpolates object channels and lets rotation override the procedural spin', () => {
    const scene = animatedScene([
      {
        targetObjectId: 'cgi-torus',
        channel: 'position.x',
        keys: [
          { id: 'a', time: 0, value: 0, easing: 'linear' },
          { id: 'b', time: 2, value: 10, easing: 'linear' },
        ],
      },
      {
        targetObjectId: 'cgi-torus',
        channel: 'scale',
        keys: [
          { id: 'c', time: 0, value: 1, easing: 'ease-in' },
          { id: 'd', time: 2, value: 2, easing: 'linear' },
        ],
      },
      {
        targetObjectId: 'cgi-torus',
        channel: 'opacity',
        keys: [
          { id: 'e', time: 0, value: 1, easing: 'linear' },
          { id: 'f', time: 2, value: 0, easing: 'linear' },
        ],
      },
      {
        targetObjectId: 'cgi-torus',
        channel: 'emissive',
        keys: [
          { id: 'g', time: 0, value: 0, easing: 'linear' },
          { id: 'h', time: 2, value: 4, easing: 'linear' },
        ],
      },
      {
        targetObjectId: 'cgi-torus',
        channel: 'rotation.y',
        keys: [
          { id: 'i', time: 0, value: 0, easing: 'linear' },
          { id: 'j', time: 2, value: Math.PI, easing: 'linear' },
        ],
      },
    ]);

    const frame = resolveCgiFrame(scene, 1, 2);

    expect(frame.objects[0].position[0]).toBeCloseTo(5);
    expect(frame.objects[0].scale).toBeCloseTo(1.25);
    expect(frame.objects[0].opacity).toBeCloseTo(0.5);
    expect(frame.objects[0].emissive).toBeCloseTo(2);
    expect(frame.objects[0].rotation[1]).toBeCloseTo(Math.PI / 2);
  });

  it('holds the first and last key outside the authored range', () => {
    const scene = animatedScene([
      {
        targetObjectId: 'cgi-torus',
        channel: 'scale',
        keys: [
          { id: 'a', time: 1, value: 1.5, easing: 'step' },
          { id: 'b', time: 2, value: 3, easing: 'linear' },
        ],
      },
    ]);

    expect(resolveCgiFrame(scene, 0).objects[0].scale).toBe(1.5);
    expect(resolveCgiFrame(scene, 1.5).objects[0].scale).toBe(1.5);
    expect(resolveCgiFrame(scene, 2).objects[0].scale).toBe(3);
    expect(resolveCgiFrame(scene, 99).objects[0].scale).toBe(3);
  });

  it('resolves scene camera and light tracks into the camera pose', () => {
    const scene = animatedScene([
      {
        targetObjectId: null,
        channel: 'camera.distance',
        keys: [
          { id: 'a', time: 0, value: 10, easing: 'linear' },
          { id: 'b', time: 2, value: 4, easing: 'linear' },
        ],
      },
      {
        targetObjectId: null,
        channel: 'camera.height',
        keys: [
          { id: 'c', time: 0, value: 0, easing: 'linear' },
          { id: 'd', time: 2, value: 4, easing: 'linear' },
        ],
      },
      {
        targetObjectId: null,
        channel: 'light.intensity',
        keys: [
          { id: 'e', time: 0, value: 1, easing: 'linear' },
          { id: 'f', time: 2, value: 3, easing: 'linear' },
        ],
      },
    ]);

    const frame = resolveCgiFrame(scene, 1, 2);

    expect(frame.cameraDistance).toBe(7);
    expect(frame.cameraHeight).toBe(2);
    expect(frame.lightIntensity).toBe(2);
    expect(frame.cameraPose.distance).toBe(7);
    expect(frame.cameraPose.height).toBe(2);
  });

  it('does not mutate the persisted scene while resolving', () => {
    const scene = animatedScene([
      {
        targetObjectId: 'cgi-torus',
        channel: 'scale',
        keys: [
          { id: 'a', time: 0, value: 1, easing: 'linear' },
          { id: 'b', time: 2, value: 2, easing: 'linear' },
        ],
      },
    ]);
    const before = JSON.stringify(scene);

    resolveCgiFrame(scene, 1, 2);

    expect(JSON.stringify(scene)).toBe(before);
  });

  it('suppresses the idle float when any position channel is keyed', () => {
    const scene = createDefaultCgiScene();
    const idle = resolveCgiFrame(scene, 1.2).objects[0].position[1];
    expect(Math.abs(idle)).toBeGreaterThan(0.001);

    scene.animation = {
      version: 1,
      tracks: [
        {
          targetObjectId: 'cgi-torus',
          channel: 'position.x',
          keys: [
            { id: 'a', time: 0, value: 0, easing: 'linear' },
            { id: 'b', time: 2, value: 2, easing: 'linear' },
          ],
        },
      ],
    };

    const keyed = resolveCgiFrame(scene, 1.2).objects[0];
    expect(keyed.position).toEqual([1.2, 0, 0]);
  });

  it('splits animation into deep-cloned halves with a right boundary key', () => {
    const animation = {
      version: 1 as const,
      tracks: [
        {
          targetObjectId: 'cgi-torus',
          channel: 'position.x' as const,
          keys: [
            { id: 'a', time: 0, value: 0, easing: 'ease-in' as const },
            { id: 'b', time: 4, value: 4, easing: 'linear' as const },
          ],
        },
      ],
    };

    const split = splitCgiAnimationAt(animation, 2)!;

    expect(split.left.tracks[0].keys.map((key) => key.value)).toEqual([0, 4]);
    expect(split.right.tracks[0].keys).toMatchObject([
      { time: 0, value: 1, easing: 'ease-in' },
      { time: 2, value: 4 },
    ]);
    expect(split.left.tracks[0].keys).not.toBe(animation.tracks[0].keys);
    expect(split.right.tracks[0].keys).not.toBe(animation.tracks[0].keys);

    split.left.tracks[0].keys[0].value = 99;
    expect(split.right.tracks[0].keys[0].value).toBe(1);
    expect(animation.tracks[0].keys[0].value).toBe(0);
  });

  it('holds the last authored value when the split is past every key', () => {
    const animation = {
      version: 1 as const,
      tracks: [
        {
          targetObjectId: 'cgi-torus',
          channel: 'scale' as const,
          keys: [{ id: 'a', time: 1, value: 2, easing: 'linear' as const }],
        },
      ],
    };

    const split = splitCgiAnimationAt(animation, 5)!;

    expect(split.right.tracks[0].keys).toMatchObject([
      { time: 0, value: 2 },
    ]);
    expect(splitCgiAnimationAt(undefined, 5)).toBeNull();
  });
});

describe('CGI split continuity data', () => {
  it('continues spin, idle float and orbit from the carried scene time', () => {
    const scene = createDefaultCgiScene();
    scene.spin = 1;
    scene.objects = [{ ...scene.objects[0], spin: 1 }];
    scene.cameraMove = 'orbit-left';

    const resumed = resolveCgiFrame({ ...scene, timeOffset: 4 }, 0, 6);
    const unsplit = resolveCgiFrame(scene, 4, 6);

    expect(resumed.objects[0].rotation[1]).toBeCloseTo(4, 6);
    expect(resumed.objects[0].rotation[1]).toBeCloseTo(
      unsplit.objects[0].rotation[1],
      6,
    );
    expect(resumed.cameraPose.azimuth).toBeCloseTo(
      unsplit.cameraPose.azimuth,
      6,
    );

    // The idle float is part of the same continuous motion.
    const plain = createDefaultCgiScene();
    const floated = resolveCgiFrame({ ...plain, timeOffset: 4 }, 0, 6);
    expect(floated.objects[0].position[1]).toBeCloseTo(
      resolveCgiFrame(plain, 4, 6).objects[0].position[1],
      6,
    );
  });

  it('keeps a progress-based camera move on the original curve', () => {
    const scene = createDefaultCgiScene();
    scene.cameraMove = 'push-in';

    const cut = resolveCgiFrame({ ...scene, timeOffset: 4, sequenceDuration: 10 }, 0, 6);
    const whole = resolveCgiFrame(scene, 4, 10);
    const resumedEnd = resolveCgiFrame(
      { ...scene, timeOffset: 4, sequenceDuration: 10 },
      6,
      6,
    );

    expect(cut.cameraPose.distance).toBeCloseTo(whole.cameraPose.distance, 6);
    expect(resumedEnd.cameraPose.distance).toBeCloseTo(
      resolveCgiFrame(scene, 10, 10).cameraPose.distance,
      6,
    );
  });

  it('sanitises the carried offset and sequence span', () => {
    const scene = sanitizeCgiScene({ timeOffset: 12, sequenceDuration: 400_000 });

    expect(scene?.timeOffset).toBe(12);
    expect(scene?.sequenceDuration).toBe(MAX_CGI_KEYFRAME_TIME);

    const cleared = sanitizeCgiScene({ timeOffset: 0, sequenceDuration: 0 });
    expect(cleared?.timeOffset).toBeUndefined();
    expect(cleared?.sequenceDuration).toBeUndefined();
  });
});

describe('CGI keyframe authoring data', () => {
  it('reads the static value until a channel is keyed', () => {
    const scene = createDefaultCgiScene();

    expect(cgiChannelValueAt(scene, null, 'camera.distance', 0)).toBe(6);
    expect(cgiChannelValueAt(scene, 'cgi-torus', 'scale', 0)).toBe(1);
    // Rotation falls back to the procedural spin angle, so a first key holds
    // the angle already on screen instead of snapping it to zero.
    expect(cgiChannelValueAt(scene, 'cgi-torus', 'rotation.y', 0)).toBe(0);
    expect(
      cgiChannelValueAt(scene, 'cgi-torus', 'rotation.y', 2),
    ).toBeCloseTo(0.7, 6);
    expect(
      cgiChannelValueAt({ ...scene, timeOffset: 2 }, 'cgi-torus', 'rotation.y', 0),
    ).toBeCloseTo(0.7, 6);
  });

  it('stores the chosen easing and falls back to the smooth default', () => {
    const scene = createDefaultCgiScene();
    const stepped = setCgiKeyframe(
      scene,
      null,
      'camera.distance',
      1,
      5,
      'step',
    );
    expect(stepped.animation!.tracks[0].keys[0].easing).toBe('step');

    const unknown = setCgiKeyframe(
      scene,
      null,
      'camera.distance',
      1,
      5,
      'bounce' as unknown as KeyframeEasing,
    );
    expect(unknown.animation!.tracks[0].keys[0].easing).toBe('ease-in-out');
  });

  it('adds a key at the playhead and replaces a key at the same time', () => {
    const scene = createDefaultCgiScene();
    const first = setCgiKeyframe(scene, 'cgi-torus', 'position.x', 2, 3);
    const track = first.animation!.tracks[0];

    expect(track.targetObjectId).toBe('cgi-torus');
    expect(track.keys).toMatchObject([{ time: 2, value: 3 }]);
    expect(cgiChannelValueAt(first, 'cgi-torus', 'position.x', 2)).toBe(3);
    expect(scene.animation).toBeUndefined();

    const replaced = setCgiKeyframe(first, 'cgi-torus', 'position.x', 2, 4);
    expect(replaced.animation!.tracks[0].keys).toMatchObject([
      { time: 2, value: 4 },
    ]);
  });

  it('clamps authored values and drops tracks for unknown targets', () => {
    const clamped = setCgiKeyframe(
      createDefaultCgiScene(),
      null,
      'light.intensity',
      0,
      99,
    );
    expect(clamped.animation!.tracks[0].keys[0].value).toBe(4);

    const orphan = setCgiKeyframe(
      createDefaultCgiScene(),
      'missing',
      'scale',
      0,
      2,
    );
    expect(orphan.animation?.tracks ?? []).toHaveLength(0);
  });

  it('removes one key, or the whole track when no key is named', () => {
    let scene = setCgiKeyframe(
      createDefaultCgiScene(),
      null,
      'camera.distance',
      0,
      6,
    );
    scene = setCgiKeyframe(scene, null, 'camera.distance', 2, 4);
    const [first] = scene.animation!.tracks[0].keys;

    const oneLeft = removeCgiKeyframe(scene, null, 'camera.distance', first.id);
    expect(oneLeft.animation!.tracks[0].keys).toMatchObject([
      { time: 2, value: 4 },
    ]);

    const cleared = removeCgiKeyframe(oneLeft, null, 'camera.distance');
    expect(cleared.animation?.tracks ?? []).toHaveLength(0);
  });
});
