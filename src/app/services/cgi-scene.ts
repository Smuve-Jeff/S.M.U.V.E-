/**
 * Persisted data for the Lab's real 3D stage.
 *
 * A CGI layer is an ordinary overlay clip whose effects carry this scene. That
 * keeps preview, export and project persistence on the same path as every other
 * layer: the clip trims and moves on the timeline, and the scene data saves with
 * the project. The renderer is Three.js; this module is pure so the scene can be
 * validated and its camera path tested without a WebGL context.
 */

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
}

export interface CgiCameraPose {
  azimuth: number;
  distance: number;
  height: number;
  targetY: number;
}

/** Hard ceiling for one embedded model, as a data-URL string length. */
export const MAX_CGI_MODEL_DATA_URL = 12_000_000;
/** A scene is an overlay, not a whole asset library. */
export const MAX_CGI_OBJECTS = 12;

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
