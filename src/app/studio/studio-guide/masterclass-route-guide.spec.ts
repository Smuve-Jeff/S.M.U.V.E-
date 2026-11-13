import { WORKSPACE_REGISTRY } from "../../services/workspace-registry";
import {
  guideLessonById,
  isGuideTrackId,
} from "./studio-guide-deep-link";
import { isStudioSurfaceId } from "../studio-surfaces";
import {
  masterclassRouteTarget,
  masterclassTargetForStudioSurface,
} from "./masterclass-route-guide";

describe("Masterclass route resolver", () => {
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
