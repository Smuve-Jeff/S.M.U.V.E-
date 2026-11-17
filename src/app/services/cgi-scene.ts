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

export type CgiPrimitive = 'cube' | 'sphere' | 'torus' | 'model';

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

const CHANNEL_SPECS: {
  id: CgiAnimationChannel;
  scope: 'object' | 'scene';
  min: number;
  max: number;
}[] = [
  { id: 'position.x', scope: 'object', min: -20, max: 20 },
  { id: 'position.y', scope: 'object', min: -20, max: 20 },
  { id: 'position.z', scope: 'object', min: -20, max: 20 },
  { id: 'rotation.x', scope: 'object', min: -1000, max: 1000 },
  { id: 'rotation.y', scope: 'object', min: -1000, max: 1000 },
  { id: 'rotation.z', scope: 'object', min: -1000, max: 1000 },
  { id: 'scale', scope: 'object', min: 0.05, max: 5 },
  { id: 'opacity', scope: 'object', min: 0, max: 1 },
  { id: 'emissive', scope: 'object', min: 0, max: 4 },
  { id: 'camera.distance', scope: 'scene', min: 2, max: 20 },
  { id: 'camera.height', scope: 'scene', min: -4, max: 8 },
  { id: 'light.intensity', scope: 'scene', min: 0.2, max: 4 },
];

const CHANNEL_BY_ID = new Map(
  CHANNEL_SPECS.map((channel) => [channel.id, channel]),
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
  value === 'model';

const isCameraMove = (value: unknown): value is CgiCameraMove =>
  CGI_CAMERA_MOVES.some((move) => move.id === value);

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
        id:
          typeof key.id === 'string' && key.id.trim()
            ? key.id.trim().slice(0, 120)
            : `cgi-kf-${trackIndex}-${keyIndex}`,
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
  };
  return {
    id: `cgi-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: labels[kind],
    kind,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    position: [0, 0, 0],
    scale: 1,
    spin: index % 2 === 0 ? 1 : -1,
  };
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
  const objects = Array.isArray(raw.objects)
    ? (raw.objects as unknown[])
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === 'object',
        )
        .map((entry, index): CgiObject | null => {
          const candidate = entry as Partial<CgiObject>;
          if (!isPrimitive(candidate.kind)) return null;
          const modelDataUrl =
            typeof candidate.modelDataUrl === 'string' &&
            candidate.modelDataUrl.startsWith('data:') &&
            candidate.modelDataUrl.length <= MAX_CGI_MODEL_DATA_URL
              ? candidate.modelDataUrl
              : undefined;
          if (candidate.kind === 'model' && !modelDataUrl) return null;
          return {
            id:
              typeof candidate.id === 'string' && candidate.id.trim()
                ? candidate.id.trim().slice(0, 120)
                : `cgi-object-${index}`,
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
            ...(modelDataUrl ? { modelDataUrl } : {}),
          };
        })
        .filter((entry): entry is CgiObject => entry !== null)
        .slice(0, MAX_CGI_OBJECTS)
    : defaults.objects;

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
 * single source of truth preview, export and tests will share once the
 * renderer is wired to it. `clipLocalTime` must already exclude the clip's
 * trimStart, matching the value used by `paintFrame`.
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
      : object.position[1] + Math.sin(time * 0.8 + index) * 0.035;

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
          object.spin * scene.spin * time,
        ),
        valueFor(object.id, 'rotation.z', 0),
      ],
      scale: valueFor(object.id, 'scale', object.scale),
      opacity: valueFor(object.id, 'opacity', 1),
      emissive: valueFor(object.id, 'emissive', 0),
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
  const progress = safeDuration > 0 ? time / safeDuration : 0;

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
      time,
      progress,
    ),
  };
}
