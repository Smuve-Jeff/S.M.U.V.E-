import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { GUIDE_TRACKS } from "./studio-guide.data";
import { StudioGuideAutoCheckService } from "./studio-guide.auto-check.service";
import { StudioGuideService } from "./studio-guide.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { CollaborationService } from "../../services/collaboration.service";
import { SnackbarService } from "../../services/snackbar.service";
import { AudioSessionService } from "../audio-session.service";
import { ProjectWorkspaceService } from "../project-workspace.service";

describe("StudioGuideAutoCheckService", () => {
  let service: StudioGuideAutoCheckService;
  let guide: {
    isComplete: jest.Mock<boolean, [string]>;
    complete: jest.Mock<void, [string]>;
  };
  let snackbar: { success: jest.Mock<void, [string]> };
  let music: {
    tracks: ReturnType<typeof signal<unknown[]>>;
    scenePlaybackActive: ReturnType<typeof signal<boolean>>;
  };
  let session: {
    isPlaying: ReturnType<typeof signal<boolean>>;
    isRecording: ReturnType<typeof signal<boolean>>;
  };
  let workspace: {
    lastPersistedAt: ReturnType<typeof signal<number>>;
    metadata: ReturnType<typeof signal<unknown>>;
  };
  let collaboration: {
    currentSession: ReturnType<typeof signal<unknown>>;
  };

  beforeEach(() => {
    guide = {
      isComplete: jest.fn(() => false),
      complete: jest.fn(),
    };
    snackbar = { success: jest.fn() };
    music = { tracks: signal([]), scenePlaybackActive: signal(false) };
    session = { isPlaying: signal(false), isRecording: signal(false) };
    workspace = {
      lastPersistedAt: signal(0),
      metadata: signal(null),
    };
    collaboration = { currentSession: signal(null) };

    TestBed.configureTestingModule({
      providers: [
        { provide: StudioGuideService, useValue: guide },
        { provide: MusicManagerService, useValue: music },
        { provide: AudioSessionService, useValue: session },
        { provide: ProjectWorkspaceService, useValue: workspace },
        { provide: CollaborationService, useValue: collaboration },
        { provide: SnackbarService, useValue: snackbar },
      ],
    });

    service = TestBed.runInInjectionContext(
      () => new StudioGuideAutoCheckService(),
    );
  });

  it("checks the armed transport lesson when the transport starts", () => {
    const lesson = GUIDE_TRACKS[0].lessons.find(
      (entry) => entry.id === "loop-sound",
    )!;

    service.track(lesson);
    service.noteAction("transport-started");

    expect(guide.complete).toHaveBeenCalledWith("loop-sound");
    expect(snackbar.success).toHaveBeenCalledWith(
      expect.stringContaining("checked off automatically"),
    );
    expect(service.activeLesson()).toBeNull();
    expect(service.celebration()).toMatchObject({
      lessonId: "loop-sound",
      trackId: "first-loop",
      nextLessonId: "loop-groove",
    });
  });

  it("holds the celebration while the guide is open and keeps the event for its banner", () => {
    const lesson = GUIDE_TRACKS[0].lessons.find(
      (entry) => entry.id === "loop-sound",
    )!;

    service.noteGuideOpen(true);
    service.track(lesson);
    service.noteAction("transport-started");

    expect(service.celebration()).toBeNull();
    expect(service.lastAutoCompleted()?.lessonId).toBe("loop-sound");

    service.noteGuideOpen(false);
    expect(service.celebration()).toBeNull();
  });

  it("does not check a lesson from an unrelated action", () => {
    const lesson = GUIDE_TRACKS[0].lessons.find(
      (entry) => entry.id === "loop-save",
    )!;

    service.track(lesson);
    service.noteAction("transport-started");

    expect(guide.complete).not.toHaveBeenCalled();
    expect(service.activeLesson()?.id).toBe("loop-save");
  });

  it("checks a document-edit lesson only in its target surface", async () => {
    const lesson = GUIDE_TRACKS[0].lessons.find(
      (entry) => entry.id === "loop-drums",
    )!;
    const editedTrack = {
      id: "track-1",
      notes: [],
      steps: [],
      clips: [],
      gain: 0.8,
      pan: 0,
      sendA: 0,
      sendB: 0,
      fxSlots: [],
      pluginIds: [],
      muted: false,
      soloed: false,
      synthParams: null,
    };

    service.track(lesson);
    service.noteActiveView("drum-machine");
    music.tracks.set([editedTrack]);
    await TestBed.flushEffects();

    expect(guide.complete).toHaveBeenCalledWith("loop-drums");
  });

  it("ignores a document edit made in a different surface", async () => {
    const lesson = GUIDE_TRACKS[0].lessons.find(
      (entry) => entry.id === "loop-drums",
    )!;

    service.track(lesson);
    service.noteActiveView("mixer");
    music.tracks.set([
      {
        id: "track-1",
        notes: [],
        steps: [],
        clips: [],
        gain: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
        fxSlots: [],
        pluginIds: [],
        muted: false,
        soloed: false,
        synthParams: null,
      },
    ]);
    await TestBed.flushEffects();

    expect(guide.complete).not.toHaveBeenCalled();
  });

  it("does not arm a lesson that is already complete", () => {
    guide.isComplete.mockReturnValue(true);
    const lesson = GUIDE_TRACKS[0].lessons[0];

    service.track(lesson);

    expect(service.activeLesson()).toBeNull();
  });
});
