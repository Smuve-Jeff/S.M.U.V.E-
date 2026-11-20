import { WORKSPACE_REGISTRY } from "../../services/workspace-registry";
import {
  ALL_GUIDE_LESSONS,
  GUIDE_TRACKS,
} from "./studio-guide.data";
import {
  guideLessonById,
  isGuideTrackId,
} from "./studio-guide-deep-link";
import { isStudioSurfaceId } from "../studio-surfaces";
import {
  MASTERCLASS_CHAPTER_TARGETS,
  MASTERCLASS_SURFACE_TARGETS,
} from "./masterclass-route-targets";
import {
  masterclassRouteTarget,
  masterclassTargetForStudioSurface,
} from "./masterclass-route-guide";

describe("Masterclass route resolver", () => {
  it("keeps the lightweight target map in sync with the curriculum", () => {
    for (const target of [
      ...Object.values(MASTERCLASS_CHAPTER_TARGETS),
      ...Object.values(MASTERCLASS_SURFACE_TARGETS),
    ]) {
      const lesson = ALL_GUIDE_LESSONS.find(
        (candidate) => candidate.id === target.lessonId,
      );
      expect(lesson).toBeDefined();
      expect(lesson!.title).toBe(target.lessonTitle);
      expect(lesson!.track).toBe(target.track);
      expect(GUIDE_TRACKS.find((track) => track.id === lesson!.track)?.label).toBe(
        target.trackLabel,
      );
    }

    for (const [surface, target] of Object.entries(
      MASTERCLASS_SURFACE_TARGETS,
    )) {
      expect(
        ALL_GUIDE_LESSONS.find((lesson) => lesson.target === surface)?.id,
      ).toBe(target.lessonId);
    }
  });

  it("resolves a Studio surface deep link to that surface's lesson", () => {
    const target = masterclassRouteTarget("/studio?view=mixer");

    expect(target).not.toBeNull();
    expect(guideLessonById(target!.lessonId)?.target).toBe("mixer");
    expect(isGuideTrackId(target!.track)).toBe(true);
  });

  it("resolves a standalone Studio surface route", () => {
    const target = masterclassRouteTarget("/piano-roll");

    expect(target).not.toBeNull();
    expect(guideLessonById(target!.lessonId)?.target).toBe("piano-roll");
  });

  it("maps whole-application workspaces to their real chapter", () => {
    expect(masterclassRouteTarget("/academy")?.lessonId).toBe("app-create");
    expect(masterclassRouteTarget("/academy?program=acting")?.lessonId).toBe(
      "app-create"
    );
    expect(masterclassRouteTarget("/songwriting")?.lessonId).toBe("app-create");
    expect(masterclassRouteTarget("/songwriting/pad")?.lessonId).toBe(
      "app-create"
    );
    expect(masterclassRouteTarget("/songwriting/cowrite")?.lessonId).toBe(
      "app-create"
    );
    expect(masterclassRouteTarget("/lyric-editor")?.lessonId).toBe("app-create");
    expect(masterclassRouteTarget("/release-pipeline")?.lessonId).toBe(
      "app-business",
    );
    expect(masterclassRouteTarget("/settings")?.lessonId).toBe("app-system");
    expect(masterclassRouteTarget("/command-center")?.lessonId).toBe(
      "app-intelligence",
    );
  });

  it("falls back to the shell orientation for an unknown workspace", () => {
    expect(masterclassRouteTarget("/an-unmapped-room")?.lessonId).toBe(
      "app-shell",
    );
  });

  it("does not advertise the action on auth, guest, or the Masterclass itself", () => {
    expect(masterclassRouteTarget("/login")).toBeNull();
    expect(masterclassRouteTarget("/reset-password?token=x")).toBeNull();
    expect(masterclassRouteTarget("/guest-access")).toBeNull();
    expect(masterclassRouteTarget("/masterclass?guide=atlas")).toBeNull();
    expect(masterclassRouteTarget("")).toBeNull();
  });

  it("returns a real lesson for every navigable registry workspace", () => {
    for (const workspace of WORKSPACE_REGISTRY) {
      if (workspace.mode === "login" || workspace.mode === "masterclass") {
        continue;
      }
      const target = masterclassRouteTarget(workspace.routePath);
      expect(target).not.toBeNull();
      expect(guideLessonById(target!.lessonId)).not.toBeNull();
      expect(target!.lessonTitle.length).toBeGreaterThan(3);
    }
  });

  it("resolves every advertised Studio surface to a usable lesson", () => {
    const surfaces = [
      "piano-roll",
      "mixer",
      "drum-machine",
      "performance",
      "mastering",
      "dj",
      "vocal-suite",
    ];

    for (const surface of surfaces) {
      const target = masterclassTargetForStudioSurface(surface);
      expect(target).not.toBeNull();
      expect(isStudioSurfaceId(surface)).toBe(true);
      expect(guideLessonById(target!.lessonId)).not.toBeNull();
    }
  });
});
