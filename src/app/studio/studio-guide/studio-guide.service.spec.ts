import {
  GUIDE_PROGRESS_STORAGE_KEY,
  StudioGuideService,
} from "./studio-guide.service";
import { GUIDE_TRACKS } from "./studio-guide.data";

describe("StudioGuideService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with no completed lessons", () => {
    const service = new StudioGuideService();

    expect(service.completedCount()).toBe(0);
    expect(service.totalPercent()).toBe(0);
    expect(service.isComplete(GUIDE_TRACKS[0].lessons[0].id)).toBe(false);
  });

  it("marks lessons complete, persists them, and derives path progress", () => {
    const service = new StudioGuideService();
    const track = GUIDE_TRACKS[0];
    const first = track.lessons[0];

    service.complete(first.id);

    expect(service.isComplete(first.id)).toBe(true);
    expect(service.progressFor(track).done).toBe(1);
    expect(service.totalPercent()).toBeGreaterThan(0);
    expect(
      JSON.parse(
        window.localStorage.getItem(GUIDE_PROGRESS_STORAGE_KEY) ?? "[]",
      ),
    ).toContain(first.id);

    const restored = new StudioGuideService();
    expect(restored.isComplete(first.id)).toBe(true);
  });

  it("toggles a lesson back off and resets only one path", () => {
    const service = new StudioGuideService();
    const [firstTrack, secondTrack] = GUIDE_TRACKS;
    const first = firstTrack.lessons[0];
    const other = secondTrack.lessons[0];

    service.complete(first.id);
    service.complete(other.id);
    service.toggle(first.id);
    expect(service.isComplete(first.id)).toBe(false);
    expect(service.isComplete(other.id)).toBe(true);

    service.complete(first.id);
    service.resetTrack(firstTrack.id);

    expect(service.progressFor(firstTrack).done).toBe(0);
    expect(service.isComplete(other.id)).toBe(true);
  });

  it("returns the first unfinished lesson, then falls back to lesson one", () => {
    const service = new StudioGuideService();
    const track = GUIDE_TRACKS[0];

    expect(service.nextLesson(track).id).toBe(track.lessons[0].id);

    for (const lesson of track.lessons) service.complete(lesson.id);

    expect(service.nextLesson(track).id).toBe(track.lessons[0].id);
  });

  it("merges progress from another device without dropping local ticks", () => {
    const service = new StudioGuideService();
    const [firstTrack, secondTrack] = GUIDE_TRACKS;
    const local = firstTrack.lessons[0].id;
    const remote = secondTrack.lessons[0].id;

    service.complete(local);
    service.mergeCompleted([remote, "not-a-lesson", remote]);

    expect(service.isComplete(local)).toBe(true);
    expect(service.isComplete(remote)).toBe(true);
    expect(service.completedCount()).toBe(2);
    expect(service.completedLessonIds()).toEqual([
      local,
      ...GUIDE_TRACKS[1].lessons
        .slice(0, 1)
        .map((lesson) => lesson.id),
    ]);
  });

  it("clears everything on resetAll", () => {
    const service = new StudioGuideService();
    service.complete(GUIDE_TRACKS[0].lessons[0].id);
    service.complete(GUIDE_TRACKS[1].lessons[0].id);

    service.resetAll();

    expect(service.completedCount()).toBe(0);
    expect(window.localStorage.getItem(GUIDE_PROGRESS_STORAGE_KEY)).toBe("[]");
  });
});
