import {
  ALL_GUIDE_LESSONS,
  guideTrack,
  type GuideLesson,
  type GuideTrackId,
} from "./studio-guide.data";

/** The stable data a shell needs to open a specific Masterclass lesson. */
export interface MasterclassRouteTarget {
  lessonId: string;
  track: GuideTrackId;
  lessonTitle: string;
  trackLabel: string;
}

/** Routes that should not advertise the Masterclass action. */
const HIDDEN_ROUTES = new Set([
  "",
  "login",
  "reset-password",
  "guest-access",
  "masterclass",
]);

/** Direct workspace chapters from the complete-app guide. */
const ROUTE_CHAPTERS: Record<string, string> = {
  hub: "app-hub",
  studio: "app-studio",
  "studio-classic": "app-studio",
  academy: "app-create",
  "adaptive-profile": "app-career",
  "artist-coach": "app-career",
  "artist-development": "app-career",
  analytics: "app-career",
  career: "app-career",
  "case-file": "app-career",
  strategy: "app-career",
  "command-center": "app-intelligence",
  "neural-foundry": "app-intelligence",
  composer: "app-create",
  compose: "app-create",
  cowrite: "app-network",
  "image-video-lab": "app-lab",
  "image-editor": "app-lab",
  "video-editor": "app-lab",
  inbox: "app-network",
  "knowledge-base": "app-business",
  "lyric-editor": "app-create",
  networking: "app-network",
  practice: "app-create",
  produce: "app-create",
  products: "app-business",
  profile: "app-system",
  projects: "app-workflow",
  "release-pipeline": "app-business",
  "remix-arena": "app-network",
  settings: "app-system",
  store: "app-business",
  "tha-spot": "app-spot",
  "gaming-hub": "app-spot",
  timeline: "app-system",
  toolkit: "app-business",
  "business-suite": "app-business",
  "business-pipeline": "app-business",
  cloud: "app-system",
  journey: "app-system",
  "onboarding": "app-system",
  "dev-hub": "app-shell",
  artist: "app-career",
};

/** Standalone routes that are also real Studio surfaces. */
const SURFACE_ROUTES: Record<string, string> = {
  "canvas-piano-roll": "piano-roll",
  dj: "dj",
  decks: "dj",
  "drum-machine": "drum-machine",
  mastering: "mastering",
  mixer: "mixer",
  performance: "performance",
  "piano-roll": "piano-roll",
  turntable: "dj",
  "vocal-suite": "vocal-suite",
};

function toTarget(lesson: GuideLesson): MasterclassRouteTarget {
  return {
    lessonId: lesson.id,
    track: lesson.track,
    lessonTitle: lesson.title,
    trackLabel: guideTrack(lesson.track).label,
  };
}

function lessonById(id: string | undefined): GuideLesson | null {
  if (!id) return null;
  return ALL_GUIDE_LESSONS.find((lesson) => lesson.id === id) ?? null;
}

/**
 * The best lesson for a Studio surface. The curriculum has more surfaces than
 * lessons, so a documented surface without a dedicated lesson falls back to
 * the whole-app Studio chapter rather than failing the action.
 */
export function masterclassTargetForStudioSurface(
  surface: string | null | undefined,
): MasterclassRouteTarget | null {
  if (surface) {
    const lesson = ALL_GUIDE_LESSONS.find(
      (candidate) => candidate.target === surface,
    );
    if (lesson) return toTarget(lesson);
  }
  return lessonById("app-studio")
    ? toTarget(lessonById("app-studio")!)
    : null;
}

/**
 * Resolve `/mixer`, `/lyric-editor`, `/studio?view=mixer`, or any other routed
 * workspace into a shareable Masterclass lesson. Unknown routes fall back to
 * the shell orientation lesson, so every workspace has a teaching entry point.
 */
export function masterclassRouteTarget(
  url: string,
): MasterclassRouteTarget | null {
  const [pathPart, queryPart = ""] = (url || "").split("?");
  const root = pathPart.replace(/^\/+/, "").split("/")[0].toLowerCase();
  if (HIDDEN_ROUTES.has(root)) return null;

  const params = new URLSearchParams(queryPart);

  if (root === "studio" || root === "studio-classic") {
    return masterclassTargetForStudioSurface(params.get("view"));
  }

  const surface = SURFACE_ROUTES[root];
  if (surface) return masterclassTargetForStudioSurface(surface);

  const chapter = lessonById(ROUTE_CHAPTERS[root]);
  if (chapter) return toTarget(chapter);

  return lessonById("app-shell")
    ? toTarget(lessonById("app-shell")!)
    : toTarget(ALL_GUIDE_LESSONS[0]);
}
