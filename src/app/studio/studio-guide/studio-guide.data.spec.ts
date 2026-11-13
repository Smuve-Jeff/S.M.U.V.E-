import {
  ALL_GUIDE_LESSONS,
  GUIDE_AUTO_CHECKS,
  GUIDE_AUTO_CHECK_LABELS,
  GUIDE_GLOSSARY,
  GUIDE_SHORTCUTS,
  GUIDE_SURFACE_ATLAS,
  GUIDE_TRACKS,
  guideTrack,
  guideTrackProgress,
} from "./studio-guide.data";
import { STUDIO_SURFACES, isStudioSurfaceId } from "../studio-surfaces";
import { WORKSPACE_REGISTRY } from "../../services/workspace-registry";

/**
 * The Masterclass is content, and content drifts. These assertions make the
 * guide's two promises executable:
 *
 *  1. Every Studio surface has exactly one atlas entry — no surface can ship
 *     without documentation.
 *  2. Every lesson points at a real surface, has real steps, and keeps its ids
 *     unique so progress cannot collide across paths.
 */
describe("Studio Masterclass content", () => {
  it("documents every Studio surface exactly once", () => {
    const catalogueIds = STUDIO_SURFACES.map((surface) => surface.id).sort();
    const atlasIds = GUIDE_SURFACE_ATLAS.map((entry) => entry.id).sort();

    expect(atlasIds).toEqual(catalogueIds);
    expect(new Set(atlasIds).size).toBe(atlasIds.length);
  });

  it("keeps atlas entries useful, not placeholders", () => {
    for (const entry of GUIDE_SURFACE_ATLAS) {
      expect(isStudioSurfaceId(entry.id)).toBe(true);
      expect(entry.what.trim().length).toBeGreaterThan(20);
      expect(entry.features.length).toBeGreaterThanOrEqual(3);
      expect(entry.gestures.length).toBeGreaterThanOrEqual(2);
      expect(entry.proTip.trim().length).toBeGreaterThan(15);
    }
  });

  it("defines four distinct paths with real lessons", () => {
    expect(GUIDE_TRACKS.map((track) => track.id)).toEqual([
      "first-loop",
      "full-song",
      "mastery",
      "whole-app",
    ]);
    for (const track of GUIDE_TRACKS) {
      expect(track.lessons.length).toBeGreaterThanOrEqual(8);
      expect(track.label.trim().length).toBeGreaterThan(2);
      expect(track.outcome.trim().length).toBeGreaterThan(10);
    }
  });

  it("keeps every lesson actionable and correctly targeted", () => {
    const lessonIds = ALL_GUIDE_LESSONS.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);

    for (const lesson of ALL_GUIDE_LESSONS) {
      expect(lesson.title.trim().length).toBeGreaterThan(3);
      expect(lesson.goal.trim().length).toBeGreaterThan(10);
      expect(lesson.plain.trim().length).toBeGreaterThan(20);
      expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
      expect(lesson.controls.length).toBeGreaterThanOrEqual(2);
      expect(lesson.proTip.trim().length).toBeGreaterThan(15);
      expect(lesson.minutes).toBeGreaterThan(0);
      // A lesson teaches exactly one real destination: a Studio surface or a
      // whole-application route. It may not be decorative or ambiguous.
      expect(!!lesson.target !== !!lesson.workspace).toBe(true);
      if (lesson.target) expect(isStudioSurfaceId(lesson.target)).toBe(true);
    }
  });

  it("gives every lesson the target it says it opens", () => {
    const routes = new Set(WORKSPACE_REGISTRY.map((entry) => entry.routePath));
    for (const lesson of ALL_GUIDE_LESSONS) {
      expect(lesson.action.trim().length).toBeGreaterThan(3);
      if (lesson.target) {
        expect(
          STUDIO_SURFACES.some((entry) => entry.id === lesson.target),
        ).toBe(true);
      } else {
        expect(lesson.workspace).toBeDefined();
        expect(routes.has(lesson.workspace!.path)).toBe(true);
        expect(lesson.workspace!.label.trim().length).toBeGreaterThan(2);
        expect(lesson.workspace!.description.trim().length).toBeGreaterThan(20);
        expect(lesson.workspace!.icon.trim().length).toBeGreaterThan(2);
      }
    }
  });

  it("maps automatic checks to real lessons and labelled actions", () => {
    const byId = new Map(ALL_GUIDE_LESSONS.map((lesson) => [lesson.id, lesson]));
    const entries = Object.entries(GUIDE_AUTO_CHECKS);

    expect(entries.length).toBeGreaterThanOrEqual(20);
    for (const [lessonId, kind] of entries) {
      const lesson = byId.get(lessonId);
      expect(lesson).toBeDefined();
      expect(kind).toBeDefined();
      if (!lesson || !kind) continue;
      expect(lesson.autoCheck).toBe(kind);
      expect(GUIDE_AUTO_CHECK_LABELS[kind].length).toBeGreaterThan(10);
    }
  });

  it("has a glossary and shortcut sheet that are not empty", () => {
    expect(GUIDE_GLOSSARY.length).toBeGreaterThanOrEqual(20);
    expect(GUIDE_SHORTCUTS.length).toBeGreaterThanOrEqual(8);
    for (const entry of GUIDE_GLOSSARY) {
      expect(entry.term.trim().length).toBeGreaterThan(1);
      expect(entry.plain.trim().length).toBeGreaterThan(10);
    }
  });

  it("computes path progress from completion without exceeding 100%", () => {
    const track = guideTrack("first-loop");
    expect(guideTrackProgress(track, () => false)).toEqual({
      done: 0,
      total: track.lessons.length,
      percent: 0,
    });
    expect(guideTrackProgress(track, () => true)).toEqual({
      done: track.lessons.length,
      total: track.lessons.length,
      percent: 100,
    });
  });
});
