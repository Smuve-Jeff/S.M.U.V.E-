import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";

import { MusicManagerService } from "../../services/music-manager.service";
import { CollaborationService } from "../../services/collaboration.service";
import { SnackbarService } from "../../services/snackbar.service";
import { AudioSessionService } from "../audio-session.service";
import { ProjectWorkspaceService } from "../project-workspace.service";
import {
  ALL_GUIDE_LESSONS,
  guideTrack,
  type GuideAutoCheckKind,
  type GuideLesson,
  type GuideTrackId,
} from "./studio-guide.data";
import { StudioGuideService } from "./studio-guide.service";

export interface GuideLessonCompletion {
  lessonId: string;
  title: string;
  trackId: GuideTrackId;
  trackLabel: string;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  completedAt: number;
}

interface GuideActionSnapshot {
  document: string;
  playing: boolean;
  recording: boolean;
  scene: boolean;
  savedAt: number;
  metadata: string;
  collaborationId: string | null;
}

/**
 * Watches the actions an artist actually performs and checks off the lesson
 * they are currently working on.
 *
 * Only the active lesson is armed. The snapshot is taken when the lesson is
 * opened, so an existing beat or an already-saved project cannot tick a lesson
 * the artist has not attempted yet. The service lives at the app root, which
 * means it keeps watching after the Masterclass overlay closes and the artist
 * is working in the real surface.
 */
@Injectable({ providedIn: "root" })
export class StudioGuideAutoCheckService {
  private readonly guide = inject(StudioGuideService);
  private readonly music = inject(MusicManagerService);
  private readonly session = inject(AudioSessionService);
  private readonly workspace = inject(ProjectWorkspaceService);
  private readonly collaboration = inject(CollaborationService);
  private readonly snackbar = inject(SnackbarService);

  private readonly activeLessonId = signal<string | null>(null);
  readonly activeLesson = computed(() => {
    const id = this.activeLessonId();
    return id ? this.lesson(id) : null;
  });

  /** The most recent automatic tick, for the guide's "checked off" banner. */
  readonly lastAutoCompleted = signal<GuideLessonCompletion | null>(null);

  /**
   * A completion earned while the overlay was closed. The guide's own banner
   * covers the open case; this signal powers the studio-wide celebration.
   */
  readonly celebration = signal<GuideLessonCompletion | null>(null);

  /** The shell/guide reports whether the Masterclass overlay is on screen. */
  private readonly guideOpen = signal(false);

  private readonly activeView = signal<string | null>(null);
  private baseline = this.snapshot();

  private readonly documentSignature = computed(() =>
    this.buildDocumentSignature(),
  );

  constructor() {
    // A real edit in the lesson's own surface.
    effect(() => {
      const lesson = this.activeLesson();
      if (!lesson) return;
      // Hash the song only while a lesson is armed. The service lives at the
      // app root and must not serialise every note edit during normal work.
      const signature = this.documentSignature();
      if (signature === this.baseline.document) return;
      if (this.activeView() !== lesson.target) return;
      this.check(lesson, "document-edited");
    });

    // Transport, recording and scene launches are transitions, never states:
    // a lesson opened while the transport is already running must not tick.
    effect(() => {
      const playing = this.session.isPlaying();
      const lesson = this.activeLesson();
      if (!lesson || !playing || this.baseline.playing) return;
      this.check(lesson, "transport-started");
    });

    effect(() => {
      const recording = this.session.isRecording();
      const lesson = this.activeLesson();
      if (!lesson || !recording || this.baseline.recording) return;
      this.check(lesson, "recording-started");
    });

    effect(() => {
      const scene = this.music.scenePlaybackActive();
      const lesson = this.activeLesson();
      if (!lesson || !scene || this.baseline.scene) return;
      this.check(lesson, "scene-launched");
    });

    effect(() => {
      const savedAt = this.workspace.lastPersistedAt();
      const lesson = this.activeLesson();
      if (!lesson || savedAt <= this.baseline.savedAt) return;
      this.check(lesson, "project-saved");
    });

    effect(() => {
      const metadata = this.metadataSignature();
      const lesson = this.activeLesson();
      if (!lesson || metadata === this.baseline.metadata) return;
      this.check(lesson, "metadata-changed");
    });

    effect(() => {
      const collaborationId =
        this.collaboration.currentSession()?.sessionId ?? null;
      const lesson = this.activeLesson();
      if (
        !lesson ||
        collaborationId === null ||
        collaborationId === this.baseline.collaborationId
      ) {
        return;
      }
      this.check(lesson, "collab-started");
    });
  }

  /** Arm a lesson and snapshot the project so only new actions count. */
  track(lesson: GuideLesson | null | undefined): void {
    if (!lesson) {
      this.clear();
      return;
    }
    if (this.guide.isComplete(lesson.id)) {
      this.clear(lesson.id);
      return;
    }
    if (this.activeLessonId() === lesson.id) return;

    this.baseline = this.snapshot();
    this.activeLessonId.set(lesson.id);
  }

  /** Tell the tracker which real surface is on screen. */
  noteActiveView(view: string): void {
    this.activeView.set(view);
  }

  /** Open/close state decides whether completion gets a full celebration. */
  noteGuideOpen(open: boolean): void {
    this.guideOpen.set(open);
    if (open) this.celebration.set(null);
  }

  dismissCelebration(): void {
    this.celebration.set(null);
  }

  /**
   * Report an action that has no central observable signal (a starter load, a
   * finished audio export). The active lesson decides whether it counts.
   */
  noteAction(action: GuideAutoCheckKind): void {
    const lesson = this.activeLesson();
    if (!lesson) return;
    this.check(lesson, action);
  }

  /** Stop watching one lesson, or every lesson when no id is passed. */
  clear(lessonId?: string): void {
    if (!lessonId || this.activeLessonId() === lessonId) {
      this.activeLessonId.set(null);
    }
  }

  dismissRecent(): void {
    this.lastAutoCompleted.set(null);
  }

  private check(lesson: GuideLesson, action: GuideAutoCheckKind): void {
    if (lesson.autoCheck !== action) return;
    if (this.guide.isComplete(lesson.id)) {
      this.clear(lesson.id);
      return;
    }

    this.guide.complete(lesson.id);
    const track = guideTrack(lesson.track);
    const index = track.lessons.findIndex((entry) => entry.id === lesson.id);
    const laterLessons = [
      ...track.lessons.slice(index + 1),
      ...track.lessons.slice(0, Math.max(0, index)),
    ];
    const next =
      laterLessons.find(
        (entry) => entry.id !== lesson.id && !this.guide.isComplete(entry.id),
      ) ?? null;
    const completion: GuideLessonCompletion = {
      lessonId: lesson.id,
      title: lesson.title,
      trackId: lesson.track,
      trackLabel: track.label,
      nextLessonId: next?.id ?? null,
      nextLessonTitle: next?.title ?? null,
      completedAt: Date.now(),
    };
    this.lastAutoCompleted.set(completion);
    if (!this.guideOpen()) this.celebration.set(completion);
    this.snackbar.success(
      `Studio Guide · “${lesson.title}” checked off automatically`,
    );
    this.clear(lesson.id);
  }

  private snapshot(): GuideActionSnapshot {
    return {
      document: this.buildDocumentSignature(),
      playing: this.session.isPlaying(),
      recording: this.session.isRecording(),
      scene: this.music.scenePlaybackActive(),
      savedAt: this.workspace.lastPersistedAt(),
      metadata: this.metadataSignature(),
      collaborationId: this.collaboration.currentSession()?.sessionId ?? null,
    };
  }

  private metadataSignature(): string {
    return JSON.stringify(this.workspace.metadata() ?? null);
  }

  /**
   * A compact signature of everything a lesson can edit: notes and drum steps,
   * clips, mixer levels, inserts, plugins, patterns and synth parameters.
   */
  private buildDocumentSignature(): string {
    const tracks = this.music.tracks();
    try {
      return JSON.stringify(
        tracks.map((track) => ({
          id: track.id,
          notes: track.notes ?? [],
          steps: track.steps ?? [],
          clips: track.clips ?? [],
          gain: track.gain,
          pan: track.pan,
          sendA: track.sendA,
          sendB: track.sendB,
          fx: track.fxSlots ?? [],
          plugins: track.pluginIds ?? [],
          muted: track.muted,
          soloed: track.soloed,
          synth: track.synthParams ?? null,
        })),
      );
    } catch {
      // A non-serialisable custom parameter must not stop the guide from
      // tracking edits; a count still changes when tracks are added/removed.
      return `tracks:${tracks.length}`;
    }
  }

  private lesson(id: string): GuideLesson | null {
    return ALL_GUIDE_LESSONS.find((lesson) => lesson.id === id) ?? null;
  }
}
