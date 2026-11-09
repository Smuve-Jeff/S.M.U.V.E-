/**
 * Serializable Director shot-plan data.
 *
 * The console's plan is written into a saved Cinema project, so its types and
 * validation live in a pure module. Both the engine snapshot and the Director
 * service can depend on it without importing each other.
 */

/** Shot sizes the director knows how to stage. */
export const SHOT_SIZES = [
  'establishing',
  'wide',
  'medium',
  'close',
  'insert',
  'b-roll',
  'performance',
  'lip-sync',
  'transition',
] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

/** One planned shot in a S.M.U.V.E shot list. */
export interface ShotPlanShot {
  index: number;
  title: string;
  description: string;
  size: ShotSize;
  /** Length expressed in bars — the unit a music-video cut is built in. */
  bars: number;
  /** Resolved timeline placement, derived from the section map. */
  startTime: number;
  durationSeconds: number;
  /** Section or act this shot belongs to. */
  section: string;
  /** Director v2: the styled concept still for this shot, once generated. */
  conceptImageUrl?: string;
  /** Director v2: the animated video for this shot, once rendered. */
  videoUrl?: string;
}

/**
 * What the answering call actually was. Carried with the plan so a restored
 * shot list can still name the model and latency instead of degrading to a
 * generic "AI DIRECTED".
 */
export interface ShotPlanCall {
  model: string;
  attempts: number;
  latencyMs: number;
}

export interface ShotPlan {
  title: string;
  logline: string;
  editorial: string[];
  shots: ShotPlanShot[];
  /** Where the plan actually came from — never claim S.M.U.V.E authored a local plan. */
  origin: 'smuve' | 'local';
  /** The call that produced a directed plan, carried with it for attribution. */
  call?: ShotPlanCall;
}

/** A shot list and the brief it was directed from, saved with a project. */
export interface DirectorShotPlan {
  brief: string;
  plan: ShotPlan;
}

const MAX_BRIEF_LENGTH = 2_000;
const MAX_PLAN_SHOTS = 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Validate a stored shot list before it reaches the console.
 *
 * A project written by an older build, or edited outside the app, must either
 * restore as a plan the console can render or not restore at all. Shots are
 * re-indexed sequentially so per-shot media controls and styling always target
 * exactly one shot.
 */
export function sanitizeShotPlan(value: unknown): ShotPlan | null {
  if (!isRecord(value)) return null;

  const title = nonEmptyString(value.title);
  const logline = nonEmptyString(value.logline);
  if (!title || !logline) return null;

  const rawShots = Array.isArray(value.shots) ? value.shots : [];
  const shots: ShotPlanShot[] = [];

  for (const raw of rawShots) {
    if (!isRecord(raw)) continue;
    const shotTitle = nonEmptyString(raw.title);
    const description = nonEmptyString(raw.description);
    const startTime =
      typeof raw.startTime === 'number' && Number.isFinite(raw.startTime)
        ? raw.startTime
        : Number.NaN;
    const durationSeconds =
      typeof raw.durationSeconds === 'number' &&
      Number.isFinite(raw.durationSeconds)
        ? raw.durationSeconds
        : Number.NaN;

    if (
      !shotTitle ||
      !description ||
      !Number.isFinite(startTime) ||
      !Number.isFinite(durationSeconds) ||
      startTime < 0 ||
      durationSeconds <= 0
    ) {
      continue;
    }

    const size = SHOT_SIZES.includes(raw.size as ShotSize)
      ? (raw.size as ShotSize)
      : 'wide';
    const rawBars =
      typeof raw.bars === 'number' && Number.isFinite(raw.bars)
        ? raw.bars
        : 1;
    const conceptImageUrl = nonEmptyString(raw.conceptImageUrl);
    const videoUrl = nonEmptyString(raw.videoUrl);

    shots.push({
      index: shots.length + 1,
      title: shotTitle,
      description,
      size,
      bars: Math.max(1, Math.min(64, Math.round(rawBars))),
      startTime,
      durationSeconds,
      section: nonEmptyString(raw.section) ?? 'Coverage',
      ...(conceptImageUrl ? { conceptImageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
    });
    if (shots.length >= MAX_PLAN_SHOTS) break;
  }

  if (shots.length === 0) return null;

  const editorial = Array.isArray(value.editorial)
    ? value.editorial
        .map((line) => nonEmptyString(line))
        .filter((line): line is string => !!line)
        .slice(0, 6)
    : [];

  const call = sanitizeShotPlanCall(value.call);
  return {
    title,
    logline,
    editorial,
    shots,
    origin: value.origin === 'smuve' ? 'smuve' : 'local',
    ...(call ? { call } : {}),
  };
}

/** A stored call is only useful when its model and numbers are readable. */
function sanitizeShotPlanCall(value: unknown): ShotPlanCall | undefined {
  if (!isRecord(value)) return undefined;
  const model = nonEmptyString(value.model);
  if (
    !model ||
    typeof value.attempts !== 'number' ||
    !Number.isFinite(value.attempts) ||
    typeof value.latencyMs !== 'number' ||
    !Number.isFinite(value.latencyMs)
  ) {
    return undefined;
  }
  return {
    model,
    attempts: Math.max(1, Math.round(value.attempts)),
    latencyMs: Math.max(0, value.latencyMs),
  };
}

/** Validate the plan-and-brief record a project carries. */
export function sanitizeDirectorShotPlan(
  value: unknown
): DirectorShotPlan | null {
  if (!isRecord(value)) return null;
  const plan = sanitizeShotPlan(value.plan);
  if (!plan) return null;
  const brief = typeof value.brief === 'string' ? value.brief.trim() : '';
  return {
    brief: brief.slice(0, MAX_BRIEF_LENGTH),
    plan,
  };
}
