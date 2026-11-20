/**
 * Persisted data for the Lab's real 3D stage.
 *
 * A CGI layer is an ordinary overlay clip whose effects carry this scene. That
 * keeps preview, export and project persistence on the same path as every other
 * layer: the clip trims and moves on the timeline, and the scene data saves with
 * the project. The renderer is Three.js; this module is pure so the scene can be
 * validated and its camera path tested without a WebGL context.
 */

import {
  applyEasing,
  isKeyframeEasing,
  type KeyframeEasing,
} from './clip-keyframes';

export type CgiPrimitive =
  | 'cube'
  | 'sphere'
  | 'torus'
  | 'cylinder'
  | 'cone'
  | 'model';

export type CgiCameraMove =
  | 'static'
  | 'orbit-left'
  | 'orbit-right'
  | 'push-in'
  | 'crane-up';

export type CgiBackground = 'transparent' | 'dark';

export interface CgiObject {
  id: string;
  name: string;
  kind: CgiPrimitive;
  color: string;
  /** Position in scene units. The renderer lays primitives out around origin. */
  position: [number, number, number];
  /** Uniform scale for a primitive. Imported models are auto-fitted. */
  scale: number;
  /** Base clockwise spin, multiplied by the scene speed. */
  spin: number;
  /** Self-contained GLB (or embedded-resource GLTF) as a data URL. */
  modelDataUrl?: string;
  /** PBR finish for built-in primitives, 0..1. Imported models keep theirs. */
  metalness?: number;
  /** Surface roughness for built-in primitives, 0..1. */
  roughness?: number;
  /** Base glow for built-in primitives, 0..4. Keyframes override it. */
  emissive?: number;
  /** Opt-in finish for an imported model; primitives store resolved values. */
  materialPreset?: CgiMaterialPresetId;
}

export type CgiAnimationChannel =
  | 'position.x'
  | 'position.y'
  | 'position.z'
  | 'rotation.x'
  | 'rotation.y'
  | 'rotation.z'
  | 'scale'
  | 'opacity'
  | 'emissive'
  | 'camera.distance'
  | 'camera.height'
  | 'light.intensity';

/**
 * One authored value on a CGI animation track.
 *
 * Time is clip-local seconds **after trim**: the first visible frame is time 0.
 * That gives the timeline its editing contract:
 *  - moving a clip carries its animation with it;
 *  - trimming the head restarts the sequence at the new visible start;
 *  - trimming the tail only hides later keys (they are not deleted, so an undo
 *    or untrim restores them);
 *  - a split at timeline time `t` rebases the right-hand keys by
 *    `t - clip.startTime - clip.effects.trimStart`, adds a key at 0 equal to the
 *    value at the cut, and leaves the left half's later keys hidden past its
 *    shorter duration.
 *
 * Procedural motion is not keyframed, so it cannot be rebased the same way:
 * `timeOffset` and `sequenceDuration` carry scene time across a split instead
 * (see `CgiSceneSettings`), which keeps spin, float, orbit and progress-based
 * camera moves continuous at the cut.
 */
export interface CgiKeyframe {
  id: string;
  time: number;
  value: number;
  /** The curve out of this key, matching the clip keyframe vocabulary. */
  easing: KeyframeEasing;
}

export interface CgiAnimationTrack {
  /** null targets the scene (camera/light); objects use their stable id. */
  targetObjectId: string | null;
  channel: CgiAnimationChannel;
  keys: CgiKeyframe[];
}

export interface CgiAnimationSettings {
  version: 1;
  tracks: CgiAnimationTrack[];
}

export interface CgiSceneSettings {
  enabled: boolean;
  objects: CgiObject[];
  /** Last finish applied scene-wide; newly added primitives inherit it. */
  materialPreset?: CgiMaterialPresetId;
  /** Additive glow around emissive objects. Missing means enabled. */
  bloom?: boolean;
  cameraMove: CgiCameraMove;
  /** Camera distance from origin, in scene units. */
  cameraDistance: number;
  cameraHeight: number;
  fov: number;
  /** Directional key-light multiplier, 0.2..4. */
  lightIntensity: number;
  shadows: boolean;
  reflections: boolean;
  background: CgiBackground;
  /** Global object rotation speed, in radians per second. */
  spin: number;
  /**
   * Seconds of scene time that ran before this clip half became visible.
   *
   * Authored tracks are clip-local and rebased by a split, but procedural
   * motion (spin, idle float, orbit) and progress-based camera moves read
   * continuous scene time. A split writes the elapsed time onto the right
   * half's offset, so a torus keeps spinning and an orbit keeps orbiting
   * instead of snapping back to the start of the motion at the cut.
   */
  timeOffset?: number;
  /**
   * Visible length of the whole sequence this half belongs to. Both halves of
   * a split share it, so `timeOffset + clipLocalTime` maps onto one continuous
   * 0..1 camera progress and a push-in resumes where the cut left it.
   * Missing means the clip's own visible duration (the unsplit behaviour).
   */
  sequenceDuration?: number;
  /** Authored keyframes. Missing means the legacy, static scene. */
  animation?: CgiAnimationSettings;
}

export interface CgiCameraPose {
  azimuth: number;
  distance: number;
  height: number;
  targetY: number;
}

export interface CgiResolvedObject {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  opacity: number;
  emissive: number;
}

export interface CgiResolvedFrame {
  objects: CgiResolvedObject[];
  cameraDistance: number;
  cameraHeight: number;
  lightIntensity: number;
  cameraPose: CgiCameraPose;
}

/** Hard ceiling for one embedded model, as a data-URL string length. */
export const MAX_CGI_MODEL_DATA_URL = 12_000_000;
/** A scene is an overlay, not a whole asset library. */
export const MAX_CGI_OBJECTS = 12;
/** Authored animation is deliberately bounded; it lives inside project JSON. */
export const MAX_CGI_ANIMATION_TRACKS = 24;
export const MAX_CGI_KEYFRAMES_PER_TRACK = 128;
export const MAX_CGI_KEYFRAME_TIME = 86_400;

/**
 * Authorable channels, labelled for the keyframe panel and bounded for project
 * JSON. `scope` decides whether a target is an object or the scene itself.
 */
export const CGI_ANIMATION_CHANNELS: {
  id: CgiAnimationChannel;
  label: string;
  scope: 'object' | 'scene';
  min: number;
  max: number;
  step: number;
}[] = [
  { id: 'position.x', label: 'Position X', scope: 'object', min: -20, max: 20, step: 0.1 },
  { id: 'position.y', label: 'Position Y', scope: 'object', min: -20, max: 20, step: 0.1 },
  { id: 'position.z', label: 'Position Z', scope: 'object', min: -20, max: 20, step: 0.1 },
  { id: 'rotation.x', label: 'Rotation X', scope: 'object', min: -1000, max: 1000, step: 0.1 },
  { id: 'rotation.y', label: 'Rotation Y', scope: 'object', min: -1000, max: 1000, step: 0.1 },
  { id: 'rotation.z', label: 'Rotation Z', scope: 'object', min: -1000, max: 1000, step: 0.1 },
  { id: 'scale', label: 'Scale', scope: 'object', min: 0.05, max: 5, step: 0.05 },
  { id: 'opacity', label: 'Opacity', scope: 'object', min: 0, max: 1, step: 0.05 },
  { id: 'emissive', label: 'Emissive', scope: 'object', min: 0, max: 4, step: 0.1 },
  { id: 'camera.distance', label: 'Camera Distance', scope: 'scene', min: 2, max: 20, step: 0.1 },
  { id: 'camera.height', label: 'Camera Height', scope: 'scene', min: -4, max: 8, step: 0.1 },
  { id: 'light.intensity', label: 'Light Intensity', scope: 'scene', min: 0.2, max: 4, step: 0.1 },
];

const CHANNEL_BY_ID = new Map(
  CGI_ANIMATION_CHANNELS.map((channel) => [channel.id, channel]),
);

export const CGI_CAMERA_MOVES: { id: CgiCameraMove; label: string }[] = [
  { id: 'static', label: 'Locked Off' },
  { id: 'orbit-left', label: 'Orbit Left' },
  { id: 'orbit-right', label: 'Orbit Right' },
  { id: 'push-in', label: 'Push In' },
  { id: 'crane-up', label: 'Crane Up' },
];

export const CGI_PRIMITIVES: { id: Exclude<CgiPrimitive, 'model'>; label: string }[] =
  [
    { id: 'torus', label: 'Chrome Torus' },
    { id: 'cube', label: 'Metal Cube' },
    { id: 'sphere', label: 'Gloss Sphere' },
    { id: 'cylinder', label: 'Brushed Cylinder' },
    { id: 'cone', label: 'Matte Cone' },
  ];

export type CgiScenePresetId =
  | 'chrome-studio'
  | 'neon-noir'
  | 'product-turntable'
  | 'kinetic-crane';

/**
 * A look preset changes the stage, not the objects: it is safe to try on an
 * authored scene without throwing away placements, colours or keyframes.
 */
export interface CgiScenePreset {
  id: CgiScenePresetId;
  label: string;
  description: string;
  patch: Partial<
    Pick<
      CgiSceneSettings,
      | 'cameraMove'
      | 'cameraDistance'
      | 'cameraHeight'
      | 'fov'
      | 'lightIntensity'
      | 'shadows'
      | 'reflections'
      | 'background'
      | 'spin'
    >
  >;
}

export type CgiMaterialPresetId =
  | 'chrome'
  | 'brushed-metal'
  | 'matte'
  | 'neon';

export interface CgiMaterialPreset {
  id: CgiMaterialPresetId;
  label: string;
  description: string;
  patch: Pick<CgiObject, 'metalness' | 'roughness' | 'emissive'>;
}

export const CGI_MATERIAL_PRESETS: readonly CgiMaterialPreset[] = [
  {
    id: 'chrome',
    label: 'Chrome',
    description: 'Mirror-like metal with tight, bright reflections.',
    patch: { metalness: 0.95, roughness: 0.08, emissive: 0 },
  },
  {
    id: 'brushed-metal',
    label: 'Brushed',
    description: 'Satin metal that keeps its shape readable.',
    patch: { metalness: 0.62, roughness: 0.42, emissive: 0 },
  },
  {
    id: 'matte',
    label: 'Matte',
    description: 'Soft, low-shine surface for product and title work.',
    patch: { metalness: 0.08, roughness: 0.82, emissive: 0 },
  },
  {
    id: 'neon',
    label: 'Neon',
    description: 'Smooth surface with a coloured glow that survives export.',
    patch: { metalness: 0.14, roughness: 0.16, emissive: 0.55 },
  },
];

export const CGI_SCENE_PRESETS: readonly CgiScenePreset[] = [
  {
    id: 'chrome-studio',
    label: 'Chrome Studio',
    description: 'Clean metal, soft shadows and a slow orbit.',
    patch: {
      cameraMove: 'orbit-left',
      cameraDistance: 6,
      cameraHeight: 1.4,
      fov: 42,
      lightIntensity: 1.5,
      shadows: true,
      reflections: true,
      background: 'transparent',
      spin: 0.35,
    },
  },
  {
    id: 'neon-noir',
    label: 'Neon Noir',
    description: 'Dark plate, hard highlights and a faster counter-orbit.',
    patch: {
      cameraMove: 'orbit-right',
      cameraDistance: 7,
      cameraHeight: 0.9,
      fov: 52,
      lightIntensity: 2.4,
      shadows: false,
      reflections: true,
      background: 'dark',
      spin: 0.55,
    },
  },
  {
    id: 'product-turntable',
    label: 'Product Turntable',
    description: 'Locked camera, tight lens and a restrained spin.',
    patch: {
      cameraMove: 'static',
      cameraDistance: 5,
      cameraHeight: 1.6,
      fov: 35,
      lightIntensity: 2.2,
      shadows: true,
      reflections: true,
      background: 'transparent',
      spin: 0.18,
    },
  },
  {
    id: 'kinetic-crane',
    label: 'Kinetic Crane',
    description: 'A rising camera with a darker stage and lively objects.',
    patch: {
      cameraMove: 'crane-up',
      cameraDistance: 7.5,
      cameraHeight: 0.4,
      fov: 55,
      lightIntensity: 1.2,
      shadows: true,
      reflections: true,
      background: 'dark',
      spin: 0.55,
    },
  },
];

const DEFAULT_COLORS = ['#38bdf8', '#f472b6', '#fbbf24', '#a78bfa'];

const num = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  Number.isFinite(value)
    ? Math.max(min, Math.min(max, value as number))
    : fallback;

const color = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;

const uniqueId = (
  value: unknown,
  fallback: string,
  used: Set<string>,
): string => {
  const base =
    typeof value === 'string' && value.trim()
      ? value.trim().slice(0, 120)
      : fallback;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
};

const tuple = (
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] => {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  return [
    num(value[0], fallback[0], -20, 20),
    num(value[1], fallback[1], -20, 20),
    num(value[2], fallback[2], -20, 20),
  ];
};

const isPrimitive = (value: unknown): value is CgiPrimitive =>
  value === 'cube' ||
  value === 'sphere' ||
  value === 'torus' ||
  value === 'cylinder' ||
  value === 'cone' ||
  value === 'model';

/**
 * Only embedded model payloads belong in this slot. A project restored with an
 * image or arbitrary data URL should fall back to a dropped model instead of
 * handing the GLTF loader bytes it cannot parse.
 */
const isModelDataUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_CGI_MODEL_DATA_URL &&
  /^data:(?:model\/gltf-binary|model\/gltf\+json|application\/(?:gltf-buffer|octet-stream|json|ld\+json))?(?:;[^,]*)?,/i.test(
    value,
  );

const isCameraMove = (value: unknown): value is CgiCameraMove =>
  CGI_CAMERA_MOVES.some((move) => move.id === value);

const isMaterialPreset = (value: unknown): value is CgiMaterialPresetId =>
  CGI_MATERIAL_PRESETS.some((preset) => preset.id === value);

const isAnimationChannel = (value: unknown): value is CgiAnimationChannel =>
  typeof value === 'string' && CHANNEL_BY_ID.has(value as CgiAnimationChannel);

function clampChannelValue(
  channel: CgiAnimationChannel,
  value: number,
): number {
  const spec = CHANNEL_BY_ID.get(channel);
  if (!spec) return value;
  return Math.max(spec.min, Math.min(spec.max, value));
}

/** Sort, fold equal-time keys (last wins), and bound one track. */
function normalizeCgiKeys(keys: CgiKeyframe[]): CgiKeyframe[] {
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  const out: CgiKeyframe[] = [];
  for (const key of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.time - key.time) < 1e-6) {
      out[out.length - 1] = key;
    } else {
      out.push(key);
    }
  }
    return out.slice(0, MAX_CGI_KEYFRAMES_PER_TRACK);
}

/**
 * Validate authored animation against the scene it belongs to. Tracks that
 * point at deleted objects, use the wrong scope, or carry no usable keys are
 * dropped; duplicate target/channel tracks are merged so evaluation has one
 * ordered key list per channel.
 */
function sanitizeCgiAnimation(
  value: unknown,
  objectIds: ReadonlySet<string>,
): CgiAnimationSettings | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') {
    return { version: 1, tracks: [] };
  }
  const rawTracks = (value as Partial<CgiAnimationSettings>).tracks;
  if (!Array.isArray(rawTracks)) return { version: 1, tracks: [] };

  const merged = new Map<string, CgiAnimationTrack>();
  // Keys from merged duplicate tracks share this set too, so a remount can
  // always target one row without deleting its twin.
  const usedKeyIds = new Set<string>();
  rawTracks.forEach((entry, trackIndex) => {
    if (!entry || typeof entry !== 'object') return;
    const candidate = entry as Partial<CgiAnimationTrack>;
    if (!isAnimationChannel(candidate.channel)) return;
    const spec = CHANNEL_BY_ID.get(candidate.channel)!;

    const rawTarget =
      typeof candidate.targetObjectId === 'string' &&
      candidate.targetObjectId.trim()
        ? candidate.targetObjectId.trim().slice(0, 120)
        : null;
    if (spec.scope === 'scene') {
      if (rawTarget !== null) return;
    } else if (!rawTarget || !objectIds.has(rawTarget)) {
      return;
    }

    const keys: CgiKeyframe[] = [];
    const rawKeys = Array.isArray(candidate.keys) ? candidate.keys : [];
    rawKeys.forEach((rawKey, keyIndex) => {
      if (!rawKey || typeof rawKey !== 'object') return;
      const key = rawKey as Partial<CgiKeyframe>;
      if (!Number.isFinite(key.time) || !Number.isFinite(key.value)) return;
      keys.push({
        id: uniqueId(
          key.id,
          `cgi-kf-${trackIndex}-${keyIndex}`,
          usedKeyIds,
        ),
        time: Math.max(
          0,
          Math.min(MAX_CGI_KEYFRAME_TIME, key.time as number),
        ),
        value: clampChannelValue(candidate.channel, key.value as number),
        easing: isKeyframeEasing(key.easing) ? key.easing : 'linear',
      });
    });

    const normalized = normalizeCgiKeys(keys);
    if (!normalized.length) return;
    const mapKey = `${rawTarget ?? ''}|${candidate.channel}`;
    const existing = merged.get(mapKey);
    if (existing) {
      existing.keys = normalizeCgiKeys([...existing.keys, ...normalized]);
    } else {
      merged.set(mapKey, {
        targetObjectId: rawTarget,
        channel: candidate.channel,
        keys: normalized,
      });
    }
  });

  const tracks = [...merged.values()].sort(
    (a, b) =>
      (a.targetObjectId ?? '').localeCompare(b.targetObjectId ?? '') ||
      a.channel.localeCompare(b.channel),
  );

  return {
    version: 1,
    tracks: tracks.slice(0, MAX_CGI_ANIMATION_TRACKS),
  };
}

export function createDefaultCgiScene(): CgiSceneSettings {
  return {
    enabled: true,
    objects: [
      {
        id: 'cgi-torus',
        name: 'Chrome Torus',
        kind: 'torus',
        color: '#38bdf8',
        position: [0, 0, 0],
        scale: 1,
        spin: 1,
      },
    ],
    cameraMove: 'orbit-left',
    cameraDistance: 6,
    cameraHeight: 1.4,
    fov: 42,
    lightIntensity: 1.5,
    shadows: true,
    reflections: true,
    background: 'transparent',
    spin: 0.35,
  };
}

export function createCgiPrimitive(
  kind: Exclude<CgiPrimitive, 'model'>,
  index: number,
): CgiObject {
  const labels: Record<Exclude<CgiPrimitive, 'model'>, string> = {
    torus: 'Chrome Torus',
    cube: 'Metal Cube',
    sphere: 'Gloss Sphere',
    cylinder: 'Brushed Cylinder',
    cone: 'Matte Cone',
  };
  return {
    id: `cgi-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: labels[kind],
    kind,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    position: [0, 0, 0],
    scale: 1,
    spin: index % 2 === 0 ? 1 : -1,
    metalness: kind === 'cone' ? 0.18 : 0.72,
    roughness: kind === 'cone' ? 0.62 : 0.22,
    emissive: 0,
  };
}

/**
 * Apply one of the stage looks without touching the authored objects or their
 * keyframes. Unknown ids are a no-op, so a restored project cannot be broken by
 * an old preset name.
 */
export function applyCgiScenePreset(
  scene: CgiSceneSettings,
  presetId: string,
): CgiSceneSettings {
  const preset = CGI_SCENE_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return scene;
  return sanitizeCgiScene({ ...scene, ...preset.patch }) ?? scene;
}

/**
 * Apply a finish to one built-in primitive. Imported models keep their own
 * materials, and unknown ids/objects are a no-op so a restored project stays
 * intact.
 */
export function applyCgiMaterialPreset(
  scene: CgiSceneSettings,
  objectId: string,
  presetId: string,
): CgiSceneSettings {
  const preset = CGI_MATERIAL_PRESETS.find((entry) => entry.id === presetId);
  const object = scene.objects.find((entry) => entry.id === objectId);
  if (!preset || !object) return scene;
  return (
    sanitizeCgiScene({
      ...scene,
      objects: scene.objects.map((entry) => {
        if (entry.id !== objectId) return entry;
        return entry.kind === 'model'
          ? { ...entry, materialPreset: preset.id }
          : { ...entry, ...preset.patch };
      }),
    }) ?? scene
  );
}

export function clearCgiMaterialPreset(
  scene: CgiSceneSettings,
  objectId?: string,
): CgiSceneSettings {
  if (!objectId) {
    if (!scene.materialPreset) return scene;
    const next = { ...scene };
    delete next.materialPreset;
    return next;
  }
  const object = scene.objects.find((entry) => entry.id === objectId);
  if (!object?.materialPreset) return scene;
  return {
    ...scene,
    objects: scene.objects.map((entry) => {
      if (entry.id !== objectId) return entry;
      const next = { ...entry };
      delete next.materialPreset;
      return next;
    }),
  };
}

/**
 * Apply one finish to every built-in primitive at once. Imported models keep
 * their own materials, and scenes with nothing to finish are returned untouched.
 */
export function applyCgiMaterialPresetToAll(
  scene: CgiSceneSettings,
  presetId: string,
): CgiSceneSettings {
  const preset = CGI_MATERIAL_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return scene;
  return (
    sanitizeCgiScene({
      ...scene,
      materialPreset: preset.id,
      objects: scene.objects.map((entry) => {
        if (entry.kind !== 'model') return { ...entry, ...preset.patch };
        return entry.materialPreset
          ? { ...entry, materialPreset: preset.id }
          : entry;
      }),
    }) ?? scene
  );
}

/**
 * Coerce a restored/older scene into a renderable shape. Invalid objects are
 * dropped rather than guessed at, and oversized embedded models are refused so
 * a project cannot carry an unbounded string into the renderer.
 */
export function sanitizeCgiScene(value: unknown): CgiSceneSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<CgiSceneSettings>;
  const defaults = createDefaultCgiScene();
  const usedObjectIds = new Set<string>();
  const objects = Array.isArray(raw.objects)
    ? (raw.objects as unknown[])
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === 'object',
        )
        .map((entry, index): CgiObject | null => {
          const candidate = entry as Partial<CgiObject>;
          if (!isPrimitive(candidate.kind)) return null;
          const modelDataUrl = isModelDataUrl(candidate.modelDataUrl)
            ? candidate.modelDataUrl
            : undefined;
          if (candidate.kind === 'model' && !modelDataUrl) return null;
          return {
            id: uniqueId(candidate.id, `cgi-object-${index}`, usedObjectIds),
            name:
              typeof candidate.name === 'string' && candidate.name.trim()
                ? candidate.name.trim().slice(0, 120)
                : candidate.kind,
            kind: candidate.kind,
            color: color(
              candidate.color,
              DEFAULT_COLORS[index % DEFAULT_COLORS.length],
            ),
            position: tuple(candidate.position, [0, 0, 0]),
            scale: num(candidate.scale, 1, 0.05, 5),
            spin: num(candidate.spin, 1, -8, 8),
            metalness: num(candidate.metalness, 0.72, 0, 1),
            roughness: num(candidate.roughness, 0.22, 0, 1),
            emissive: num(candidate.emissive, 0, 0, 4),
            ...(candidate.kind === 'model' && isMaterialPreset(candidate.materialPreset)
              ? { materialPreset: candidate.materialPreset }
              : {}),
            ...(modelDataUrl ? { modelDataUrl } : {}),
          };
        })
        .filter((entry): entry is CgiObject => entry !== null)
        .slice(0, MAX_CGI_OBJECTS)
    : defaults.objects;

  // Split continuity: scene seconds already elapsed, and the visible span of
  // the whole sequence this half belongs to.
  const timeOffset = num(raw.timeOffset, 0, 0, MAX_CGI_KEYFRAME_TIME);
  const sequenceDuration = num(
    raw.sequenceDuration,
    0,
    0,
    MAX_CGI_KEYFRAME_TIME,
  );

  const animation = sanitizeCgiAnimation(
    (raw as { animation?: unknown }).animation,
    new Set(objects.map((object) => object.id)),
  );

  return {
    enabled: raw.enabled !== false,
    objects,
    cameraMove: isCameraMove(raw.cameraMove) ? raw.cameraMove : defaults.cameraMove,
    cameraDistance: num(raw.cameraDistance, defaults.cameraDistance, 2, 20),
    cameraHeight: num(raw.cameraHeight, defaults.cameraHeight, -4, 8),
    fov: num(raw.fov, defaults.fov, 20, 90),
    lightIntensity: num(raw.lightIntensity, defaults.lightIntensity, 0.2, 4),
    shadows: raw.shadows !== false,
    reflections: raw.reflections !== false,
    background: raw.background === 'dark' ? 'dark' : 'transparent',
    spin: num(raw.spin, defaults.spin, -4, 4),
    ...(isMaterialPreset(raw.materialPreset)
      ? { materialPreset: raw.materialPreset }
      : {}),
    ...(raw.bloom === false ? { bloom: false } : {}),
    ...(timeOffset > 0 ? { timeOffset } : {}),
    ...(sequenceDuration > 0 ? { sequenceDuration } : {}),
    ...(animation ? { animation } : {}),
  };
}

/**
 * Deterministic camera path for a clip. `progress` is 0..1 across the clip;
 * orbiting still uses absolute clip time so a loop reads as continuous motion.
 */
export function cgiCameraPose(
  scene: Pick<CgiSceneSettings, 'cameraMove' | 'cameraDistance' | 'cameraHeight'>,
  clipLocalTime: number,
  progress: number,
): CgiCameraPose {
  const t = Math.max(0, Math.min(1, progress));
  const time = Math.max(0, clipLocalTime);
  let azimuth = 0.55;
  let distance = scene.cameraDistance;
  let height = scene.cameraHeight;
  let targetY = 0;

  switch (scene.cameraMove) {
    case 'orbit-left':
      azimuth = 0.55 + time * 0.45;
      break;
    case 'orbit-right':
      azimuth = 0.55 - time * 0.45;
      break;
    case 'push-in':
      distance = scene.cameraDistance * (1.35 - 0.55 * t);
      targetY = 0.1;
      break;
    case 'crane-up':
      height = scene.cameraHeight + 2.6 * t;
      targetY = 0.15;
      break;
    case 'static':
    default:
      break;
  }

  return { azimuth, distance, height, targetY };
}

/** Hold the first/last value and ease between the two surrounding keys. */
function evaluateCgiTrack(
  keys: CgiKeyframe[],
  clipLocalTime: number,
): number | undefined {
  if (!keys.length) return undefined;
  const time = Math.max(0, clipLocalTime);
  if (time <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.time) return last.value;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const from = keys[index];
    const to = keys[index + 1];
    if (time < from.time || time > to.time) continue;
    const span = to.time - from.time;
    const progress = span <= 0 ? 1 : (time - from.time) / span;
    return from.value + (to.value - from.value) * applyEasing(progress, from.easing);
  }
  return last.value;
}

/**
 * Split authored animation at a visible clip-local time. The left side keeps
 * every key (later keys are hidden by the shorter clip); the right side gets
 * deep-cloned, rebased keys plus a boundary key at 0 so the cut is seamless.
 * Returns null when the clip had no animation block at all.
 */
export function splitCgiAnimationAt(
  animation: CgiAnimationSettings | undefined,
  splitLocalTime: number,
): { left: CgiAnimationSettings; right: CgiAnimationSettings } | null {
  if (!animation) return null;
  const split = Math.max(
    0,
    Number.isFinite(splitLocalTime) ? splitLocalTime : 0,
  );
  const leftTracks: CgiAnimationTrack[] = [];
  const rightTracks: CgiAnimationTrack[] = [];

  animation.tracks.forEach((track, trackIndex) => {
    if (!track.keys.length) return;
    leftTracks.push({
      targetObjectId: track.targetObjectId,
      channel: track.channel,
      keys: normalizeCgiKeys(track.keys.map((key) => ({ ...key }))),
    });

    const boundaryValue = evaluateCgiTrack(track.keys, split);
    if (boundaryValue === undefined) return;
    const shifted: CgiKeyframe[] = track.keys
      .filter((key) => key.time >= split - 1e-6)
      .map((key) => ({
        ...key,
        time: Math.max(0, key.time - split),
      }));
    if (!shifted.some((key) => key.time < 1e-6)) {
      shifted.push({
        id: `cgi-kf-split-${trackIndex}-${track.channel}`,
        time: 0,
        value: boundaryValue,
        easing: easingAtCgiTime(track.keys, split),
      });
    }
    rightTracks.push({
      targetObjectId: track.targetObjectId,
      channel: track.channel,
      keys: normalizeCgiKeys(shifted),
    });
  });

  return {
    left: { version: 1, tracks: leftTracks },
    right: { version: 1, tracks: rightTracks },
  };
}

/** The value a channel shows when it has no authored keys. */
function staticCgiChannelValue(
  scene: CgiSceneSettings,
  targetObjectId: string | null,
  channel: CgiAnimationChannel,
  clipLocalTime: number,
): number {
  const object = targetObjectId
    ? scene.objects.find((entry) => entry.id === targetObjectId)
    : undefined;
  const offset =
    typeof scene.timeOffset === 'number' && Number.isFinite(scene.timeOffset)
      ? Math.max(0, scene.timeOffset)
      : 0;
  const elapsed =
    Math.max(0, Number.isFinite(clipLocalTime) ? clipLocalTime : 0) + offset;
  switch (channel) {
    case 'position.x':
      return object?.position[0] ?? 0;
    case 'position.y':
      return object?.position[1] ?? 0;
    case 'position.z':
      return object?.position[2] ?? 0;
    // The first rotation key must hold the angle already on screen, not snap
    // the object back to zero, so this mirrors the renderer's procedural spin.
    case 'rotation.y':
      return object ? object.spin * scene.spin * elapsed : 0;
    case 'rotation.x':
    case 'rotation.z':
      return 0;
    case 'scale':
      return object?.scale ?? 1;
    case 'opacity':
      return 1;
    case 'emissive':
      return object?.emissive ?? 0;
    case 'camera.distance':
      return scene.cameraDistance;
    case 'camera.height':
      return scene.cameraHeight;
    case 'light.intensity':
      return scene.lightIntensity;
  }
}

/**
 * The channel's effective value at a visible clip-local time: the authored
 * curve where one exists, otherwise the static scene value. The keyframe panel
 * seeds its value field from this, so adding a key holds the picture instead of
 * jumping it.
 */
export function cgiChannelValueAt(
  scene: CgiSceneSettings,
  targetObjectId: string | null,
  channel: CgiAnimationChannel,
  time: number,
): number {
  const track = (scene.animation?.tracks ?? []).find(
    (entry) =>
      entry.targetObjectId === targetObjectId && entry.channel === channel,
  );
  const authored = track
    ? evaluateCgiTrack(track.keys, Math.max(0, Number.isFinite(time) ? time : 0))
    : undefined;
  return clampChannelValue(
    channel,
    authored ??
      staticCgiChannelValue(scene, targetObjectId, channel, time),
  );
}

/**
 * Write one authored key at a visible clip-local time and return the sanitised
 * scene. A key already at that time is replaced rather than stacked, and the
 * sanitizer enforces target, scope, per-track cap and value bounds, so the
 * panel cannot emit a scene that a project reload would later truncate.
 *
 * `easing` is the curve leaving this key; ease-in-out is the smooth default the
 * stage has always used.
 */
export function setCgiKeyframe(
  scene: CgiSceneSettings,
  targetObjectId: string | null,
  channel: CgiAnimationChannel,
  time: number,
  value: number,
  easing: KeyframeEasing = 'ease-in-out',
): CgiSceneSettings {
  const tracks = (scene.animation?.tracks ?? []).map((track) => ({
    targetObjectId: track.targetObjectId,
    channel: track.channel,
    keys: track.keys.map((key) => ({ ...key })),
  }));
  const at = Math.max(0, Number.isFinite(time) ? time : 0);
  const key: CgiKeyframe = {
    id: `cgi-kf-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    time: at,
    value: Number.isFinite(value) ? value : 0,
    easing: isKeyframeEasing(easing) ? easing : 'ease-in-out',
  };
  const track = tracks.find(
    (entry) =>
      entry.targetObjectId === targetObjectId && entry.channel === channel,
  );
  if (track) {
    track.keys = normalizeCgiKeys([
      ...track.keys.filter((entry) => Math.abs(entry.time - at) >= 1e-6),
      key,
    ]);
  } else {
    tracks.push({ targetObjectId, channel, keys: [key] });
  }
  return (
    sanitizeCgiScene({ ...scene, animation: { version: 1, tracks } }) ?? scene
  );
}

/**
 * Remove one key, or the whole track when no key id is given, and return the
 * sanitised scene. Empty tracks are dropped so the panel and project JSON stay
 * free of dead animation rows.
 */
export function removeCgiKeyframe(
  scene: CgiSceneSettings,
  targetObjectId: string | null,
  channel: CgiAnimationChannel,
  keyId: string | null = null,
): CgiSceneSettings {
  const tracks = (scene.animation?.tracks ?? [])
    .map((track) => {
      if (
        track.targetObjectId !== targetObjectId ||
        track.channel !== channel
      ) {
        return track;
      }
      return {
        ...track,
        keys: keyId ? track.keys.filter((key) => key.id !== keyId) : [],
      };
    })
    .filter((track) => track.keys.length > 0);
  return (
    sanitizeCgiScene({ ...scene, animation: { version: 1, tracks } }) ?? scene
  );
}

/** Easing of the segment that contains `time`, used by the right boundary key. */
function easingAtCgiTime(
  keys: CgiKeyframe[],
  time: number,
): KeyframeEasing {
  let easing: KeyframeEasing = keys[0]?.easing ?? 'linear';
  for (const key of keys) {
    if (key.time > time) break;
    easing = key.easing;
  }
  return easing;
}

/**
 * Resolve the authored CGI values at a visible clip-local time. This is the
 * single source of truth preview, export and tests share. `clipLocalTime` must
 * already exclude the clip's trimStart, matching the value used by
 * `paintFrame`.
 *
 * Authored tracks evaluate on clip-local time (a split rebases their keys).
 * Procedural motion and progress-based camera moves evaluate on continuous
 * scene time instead: `timeOffset` carries the time that ran before this half
 * became visible, so splitting a clip never restarts its spin, float, orbit or
 * push-in.
 *
 * A channel with no track keeps the scene's existing static/procedural
 * behaviour, including the idle float and spin. A rotation.y track replaces
 * the procedural spin; any position track suppresses the idle float so an
 * authored position is not displaced by the garnish.
 */
export function resolveCgiFrame(
  scene: CgiSceneSettings,
  clipLocalTime: number,
  duration = 0,
): CgiResolvedFrame {
  const time = Math.max(
    0,
    Number.isFinite(clipLocalTime) ? clipLocalTime : 0,
  );
  const safeDuration =
    Number.isFinite(duration) && duration > 0 ? duration : 0;
  const offset =
    typeof scene.timeOffset === 'number' && Number.isFinite(scene.timeOffset)
      ? Math.max(0, scene.timeOffset)
      : 0;
  const elapsed = time + offset;
  const span =
    typeof scene.sequenceDuration === 'number' &&
    Number.isFinite(scene.sequenceDuration) &&
    scene.sequenceDuration > 0
      ? scene.sequenceDuration
      : safeDuration;
  const tracks = new Map(
    (scene.animation?.tracks ?? []).map((track) => [
      `${track.targetObjectId ?? ''}|${track.channel}`,
      track,
    ]),
  );
  const trackFor = (
    targetObjectId: string | null,
    channel: CgiAnimationChannel,
  ): CgiAnimationTrack | undefined =>
    tracks.get(`${targetObjectId ?? ''}|${channel}`);
  const valueFor = (
    targetObjectId: string | null,
    channel: CgiAnimationChannel,
    fallback: number,
  ): number => {
    const track = trackFor(targetObjectId, channel);
    if (!track) return fallback;
    const evaluated = evaluateCgiTrack(track.keys, time);
    return evaluated === undefined
      ? fallback
      : clampChannelValue(channel, evaluated);
  };

  const objects = scene.objects.map((object, index): CgiResolvedObject => {
    const hasPositionTrack =
      !!trackFor(object.id, 'position.x') ||
      !!trackFor(object.id, 'position.y') ||
      !!trackFor(object.id, 'position.z');
    const baseY = hasPositionTrack
      ? object.position[1]
      : object.position[1] + Math.sin(elapsed * 0.8 + index) * 0.035;

    return {
      id: object.id,
      position: [
        valueFor(object.id, 'position.x', object.position[0]),
        valueFor(object.id, 'position.y', baseY),
        valueFor(object.id, 'position.z', object.position[2]),
      ],
      rotation: [
        valueFor(object.id, 'rotation.x', 0),
        valueFor(
          object.id,
          'rotation.y',
          object.spin * scene.spin * elapsed,
        ),
        valueFor(object.id, 'rotation.z', 0),
      ],
      scale: valueFor(object.id, 'scale', object.scale),
      opacity: valueFor(object.id, 'opacity', 1),
      emissive: valueFor(object.id, 'emissive', object.emissive ?? 0),
    };
  });

  const cameraDistance = valueFor(
    null,
    'camera.distance',
    scene.cameraDistance,
  );
  const cameraHeight = valueFor(null, 'camera.height', scene.cameraHeight);
  const lightIntensity = valueFor(
    null,
    'light.intensity',
    scene.lightIntensity,
  );
  const progress = span > 0 ? elapsed / span : 0;

  return {
    objects,
    cameraDistance,
    cameraHeight,
    lightIntensity,
    cameraPose: cgiCameraPose(
      {
        cameraMove: scene.cameraMove,
        cameraDistance,
        cameraHeight,
      },
      elapsed,
      progress,
    ),
  };
}
