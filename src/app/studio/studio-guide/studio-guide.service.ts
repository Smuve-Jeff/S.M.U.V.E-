import { Injectable, computed, signal } from "@angular/core";

import {
  ALL_GUIDE_LESSONS,
  GUIDE_TRACKS,
  guideTrackProgress,
  type GuideTrack,
  type GuideTrackId,
} from "./studio-guide.data";

/** Persisted progress for the Masterclass. One array of lesson ids. */
export const GUIDE_PROGRESS_STORAGE_KEY = "smuve.studio.guide.progress.v1";

function readCompletedLessons(): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(GUIDE_PROGRESS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    // Corrupt or refused storage must never block the guide from opening.
    return new Set<string>();
  }
}

/**
 * Tracks which Masterclass lessons an artist has finished.
 *
 * Progress is deliberately local and low-stakes: losing it costs a few ticks,
 * not a project. A failed write is still surfaced through `storageError` so the
 * UI can say "progress may reset" instead of pretending it saved.
 */
@Injectable({ providedIn: "root" })
export class StudioGuideService {
  private readonly completedIds = signal<ReadonlySet<string>>(
    readCompletedLessons(),
  );

  /** Set when this device refuses to persist guide progress. */
  readonly storageError = signal<string | null>(null);

  readonly totalLessons = ALL_GUIDE_LESSONS.length;

  readonly completedCount = computed(
    () =>
      ALL_GUIDE_LESSONS.filter((lesson) =>
        this.completedIds().has(lesson.id),
      ).length,
  );

  /** Completed ids in curriculum order, with unknown values filtered out. */
  readonly completedLessonIds = computed(() =>
    ALL_GUIDE_LESSONS.filter((lesson) => this.completedIds().has(lesson.id)).map(
      (lesson) => lesson.id,
    ),
  );

  readonly totalPercent = computed(() =>
    this.totalLessons
      ? Math.round((this.completedCount() / this.totalLessons) * 100)
      : 0,
  );

  readonly allComplete = computed(
    () => this.completedCount() === this.totalLessons,
  );

  isComplete(lessonId: string): boolean {
    return this.completedIds().has(lessonId);
  }

  complete(lessonId: string): void {
    if (this.completedIds().has(lessonId)) return;
    const next = new Set(this.completedIds());
    next.add(lessonId);
    this.commit(next);
  }

  /**
   * Add progress learned from another device.
   *
   * Union rather than replace: a lesson finished offline on this device must
   * survive a remote profile that is one sync behind. Unknown ids are ignored
   * so a hand-edited profile cannot grow the completion count past the course.
   */
  mergeCompleted(lessonIds: readonly string[]): void {
    if (!lessonIds.length) return;
    const known = new Set(ALL_GUIDE_LESSONS.map((lesson) => lesson.id));
    const next = new Set(this.completedIds());
    let changed = false;
    for (const lessonId of lessonIds) {
      if (!known.has(lessonId) || next.has(lessonId)) continue;
      next.add(lessonId);
      changed = true;
    }
    if (changed) this.commit(next);
  }

  uncomplete(lessonId: string): void {
    if (!this.completedIds().has(lessonId)) return;
    const next = new Set(this.completedIds());
    next.delete(lessonId);
    this.commit(next);
  }

  toggle(lessonId: string): void {
    if (this.isComplete(lessonId)) {
      this.uncomplete(lessonId);
    } else {
      this.complete(lessonId);
    }
  }

  /** Clear one path without touching the other two. */
  resetTrack(trackId: GuideTrackId): void {
    const track = GUIDE_TRACKS.find((entry) => entry.id === trackId);
    if (!track) return;
    const lessonIds = new Set(track.lessons.map((lesson) => lesson.id));
    const next = new Set(
      [...this.completedIds()].filter((id) => !lessonIds.has(id)),
    );
    this.commit(next);
  }

  resetAll(): void {
    this.commit(new Set<string>());
  }

  progressFor(track: GuideTrack): {
    done: number;
    total: number;
    percent: number;
  } {
    return guideTrackProgress(track, (lessonId) =>
      this.completedIds().has(lessonId),
    );
  }

  /** The first unfinished lesson in a path, or the first lesson when done. */
  nextLesson(track: GuideTrack) {
    return (
      track.lessons.find((lesson) => !this.completedIds().has(lesson.id)) ??
      track.lessons[0]
    );
  }

  private commit(next: Set<string>): void {
    this.completedIds.set(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        GUIDE_PROGRESS_STORAGE_KEY,
        JSON.stringify([...next]),
      );
      if (this.storageError()) this.storageError.set(null);
    } catch {
      this.storageError.set(
        "Progress could not be saved on this device. Finished lessons may reset after a reload.",
      );
    }
  }
}
