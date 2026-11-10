import {
  ALL_GUIDE_LESSONS,
  GUIDE_TRACKS,
  type GuideLesson,
  type GuideTrackId,
} from "./studio-guide.data";

/** The three Masterclass tabs. */
export type GuideTab = "learn" | "atlas" | "words";

export interface GuideDeepLinkState {
  tab: GuideTab;
  track: GuideTrackId;
  lessonId: string | null;
}

/**
 * Resolve a lesson id from the URL. A lesson is stronger than a path: if the
 * two disagree, the lesson's own path wins so the shared link always lands on
 * the lesson the sender meant.
 */
export function guideLessonById(id: string | null): GuideLesson | null {
  if (!id) return null;
  return ALL_GUIDE_LESSONS.find((lesson) => lesson.id === id) ?? null;
}

export function isGuideTrackId(
  value: string | null,
): value is GuideTrackId {
  return !!value && GUIDE_TRACKS.some((track) => track.id === value);
}

/**
 * Parse `?guide=` and `?lesson=` into a deterministic guide state.
 *
 * Accepted `guide` values:
 *  - a path id: `first-loop`, `full-song`, `mastery`
 *  - a tab: `learn`, `atlas`, `words`
 *  - `1` / `true` for the learning tab
 *
 * `?lesson=` may stand alone (`?guide=1&lesson=loop-drums`) and always selects
 * the learning tab.
 */
export function parseGuideDeepLink(
  guide: string | null,
  lesson: string | null,
): GuideDeepLinkState | null {
  const requestedLesson = guideLessonById(lesson);
  if (requestedLesson) {
    return {
      tab: "learn",
      track: requestedLesson.track,
      lessonId: requestedLesson.id,
    };
  }

  if (!guide) return null;
  const token = guide.trim().toLowerCase();
  if (token === "atlas" || token === "words") {
    return { tab: token, track: "first-loop", lessonId: null };
  }

  if (["1", "true", "yes", "learn", "guide"].includes(token)) {
    return { tab: "learn", track: "first-loop", lessonId: null };
  }

  if (isGuideTrackId(token)) {
    return { tab: "learn", track: token, lessonId: null };
  }

  return null;
}

/** Build the two query params for the current guide state. */
export function guideDeepLinkParams(
  tab: GuideTab,
  track: GuideTrackId,
  lessonId: string | null,
): { guide: string; lesson: string | null } {
  // The atlas and words tabs do not carry a lesson. Honor an explicit tab
  // before looking at a lesson left over from the previous view.
  if (tab !== "learn") {
    return { guide: tab, lesson: null };
  }
  const lesson = guideLessonById(lessonId);
  if (lesson) {
    return { guide: lesson.track, lesson: lesson.id };
  }
  return { guide: track, lesson: null };
}
