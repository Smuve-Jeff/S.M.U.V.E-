import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import { CommonModule } from "@angular/common";

import { studioSurface, type StudioSurfaceId } from "../studio-surfaces";
import {
  GUIDE_AUTO_CHECK_LABELS,
  GUIDE_GLOSSARY,
  GUIDE_SHORTCUTS,
  GUIDE_SURFACE_ATLAS,
  GUIDE_TRACKS,
  guideTrack,
  type GuideLesson,
  type GuideSurfaceEntry,
  type GuideTrack,
  type GuideTrackId,
} from "./studio-guide.data";
import {
  guideLessonById,
  isGuideTrackId,
  type GuideTab,
} from "./studio-guide-deep-link";
import { StudioGuideAutoCheckService } from "./studio-guide.auto-check.service";
import { StudioGuideService } from "./studio-guide.service";
import { StudioGuideSyncService } from "./studio-guide-sync.service";

export type { GuideTab } from "./studio-guide-deep-link";

/** The shareable state of the guide: what the shell mirrors into the URL. */
export interface GuideStateChange {
  tab: GuideTab;
  track: GuideTrackId;
  lessonId: string | null;
}

/**
 * Studio Masterclass — a full-screen, in-Studio tutorial.
 *
 * The guide never touches view state or the song document itself. It emits
 * `openSurface` for the shell to handle (the shell already owns every view
 * swap and its beginner-mode gate) and `startRecipe` for a starter groove, so
 * the tutorial and the real Studio cannot drift into two navigation systems.
 *
 * Deep links arrive as inputs from the shell rather than being read here: the
 * shell remains the only component that writes the URL.
 */
@Component({
  selector: "app-studio-guide",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./studio-guide.component.html",
  styleUrls: ["./studio-guide.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioGuideComponent {
  readonly guide = inject(StudioGuideService);
  readonly autoCheck = inject(StudioGuideAutoCheckService);
  readonly sync = inject(StudioGuideSyncService);
  private readonly destroyRef = inject(DestroyRef);

  /** Close the guide and return to the studio canvas. */
  readonly close = output<void>();
  /** Ask the shell to open a real Studio surface. */
  readonly openSurface = output<StudioSurfaceId>();
  /** Ask the shell to load a one-tap starter (it owns the snapshot guard). */
  readonly startRecipe = output<string>();
  /** Report a path/lesson change so the shell can keep the URL shareable. */
  readonly stateChange = output<GuideStateChange>();

  /** Shell-owned deep-link request. Null means "use the current state". */
  readonly requestedTab = input<GuideTab | null>(null, { alias: "tab" });
  readonly requestedTrack = input<GuideTrackId | null>(null, {
    alias: "track",
  });
  readonly requestedLesson = input<string | null>(null, {
    alias: "lesson",
  });

  readonly tracks = GUIDE_TRACKS;
  readonly atlas = GUIDE_SURFACE_ATLAS;
  readonly glossary = GUIDE_GLOSSARY;
  readonly shortcuts = GUIDE_SHORTCUTS;

  readonly tab = signal<GuideTab>("learn");
  readonly selectedTrackId = signal<GuideTrackId>("first-loop");
  readonly openLessonId = signal<string | null>(null);
  readonly openSurfaceId = signal<string | null>(null);
  readonly atlasQuery = signal("");
  readonly atlasGroup = signal<string>("all");
  readonly linkCopied = signal(false);

  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly selectedTrack = computed(() => guideTrack(this.selectedTrackId()));

  readonly atlasGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const entry of GUIDE_SURFACE_ATLAS) {
      counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    }
    return [
      { id: "all", label: "All controls", count: GUIDE_SURFACE_ATLAS.length },
      ...[...counts.entries()].map(([label, count]) => ({
        id: label,
        label,
        count,
      })),
    ];
  });

  readonly filteredAtlas = computed<GuideSurfaceEntry[]>(() => {
    const query = this.atlasQuery().trim().toLowerCase();
    const group = this.atlasGroup();
    return GUIDE_SURFACE_ATLAS.filter((entry) => {
      if (group !== "all" && entry.group !== group) return false;
      if (!query) return true;
      const haystack = [
        entry.group,
        studioSurface(entry.id)?.label ?? entry.id,
        entry.what,
        ...entry.features,
        ...entry.gestures,
        entry.proTip,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  constructor() {
    this.autoCheck.noteGuideOpen(true);

    effect(() => {
      const tab = this.requestedTab();
      const track = this.requestedTrack();
      const lessonId = this.requestedLesson();
      untracked(() => this.applyDeepLink(tab, track, lessonId));
    });

    const first = this.guide.nextLesson(this.selectedTrack());
    this.openLessonId.set(first.id);
    this.autoCheck.track(first);

    this.destroyRef.onDestroy(() => {
      if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
      // Completions earned after this point happen in the real Studio and get
      // the celebration toast instead of the in-guide banner.
      this.autoCheck.noteGuideOpen(false);
    });
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.close.emit();
  }

  selectTab(tab: GuideTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    if (tab === "learn") {
      const open = this.selectedTrack().lessons.find(
        (lesson) =>
          lesson.id === this.openLessonId() && !this.guide.isComplete(lesson.id),
      );
      const next = open ?? this.guide.nextLesson(this.selectedTrack());
      this.openLessonId.set(next.id);
      this.autoCheck.track(next);
    } else {
      // Reading the atlas or glossary must never tick a lesson because the
      // artist happened to press Play in the background.
      this.autoCheck.clear();
    }
    this.emitState();
  }

  selectTrack(id: GuideTrackId): void {
    this.selectedTrackId.set(id);
    const next = this.guide.nextLesson(guideTrack(id));
    this.openLessonId.set(next.id);
    this.autoCheck.track(next);
    this.emitState();
  }

  toggleLesson(id: string): void {
    if (this.openLessonId() === id) {
      this.openLessonId.set(null);
      this.emitState();
      return;
    }

    this.openLessonId.set(id);
    const lesson = this.selectedTrack().lessons.find((entry) => entry.id === id);
    if (lesson) this.autoCheck.track(lesson);
    this.emitState();
  }

  isLessonOpen(id: string): boolean {
    return this.openLessonId() === id;
  }

  toggleDone(lesson: GuideLesson): void {
    const wasDone = this.guide.isComplete(lesson.id);
    this.guide.toggle(lesson.id);
    if (wasDone) {
      this.autoCheck.track(lesson);
    } else {
      this.autoCheck.clear(lesson.id);
    }
  }

  completeAndNext(lesson: GuideLesson): void {
    this.guide.complete(lesson.id);
    this.autoCheck.clear(lesson.id);
    const track = guideTrack(lesson.track);
    const index = track.lessons.findIndex((entry) => entry.id === lesson.id);
    const next =
      track.lessons
        .slice(index + 1)
        .find((entry) => !this.guide.isComplete(entry.id)) ??
      track.lessons.find((entry) => !this.guide.isComplete(entry.id));
    this.openLessonId.set(next?.id ?? null);
    if (next) this.autoCheck.track(next);
    this.emitState();
  }

  resetTrack(track: GuideTrack): void {
    this.guide.resetTrack(track.id);
    const next = track.lessons[0] ?? null;
    this.openLessonId.set(next?.id ?? null);
    if (next) this.autoCheck.track(next);
    this.emitState();
  }

  startFirstLesson(): void {
    const next = this.guide.nextLesson(this.selectedTrack());
    this.openLessonId.set(next.id);
    this.autoCheck.track(next);
    this.emitState();
  }

  openTarget(target: StudioSurfaceId, lesson?: GuideLesson): void {
    if (lesson) this.autoCheck.track(lesson);
    this.openSurface.emit(target);
  }

  startGroove(): void {
    const groove = this.selectedTrack().lessons.find(
      (lesson) => lesson.id === "loop-groove",
    );
    if (groove) this.autoCheck.track(groove);
    this.startRecipe.emit("house");
  }

  surfaceLabel(id: StudioSurfaceId): string {
    return studioSurface(id)?.label ?? id;
  }

  surfaceIcon(id: StudioSurfaceId): string {
    return studioSurface(id)?.icon ?? "widgets";
  }

  autoCheckLabel(lesson: GuideLesson): string {
    return lesson.autoCheck ? GUIDE_AUTO_CHECK_LABELS[lesson.autoCheck] : "";
  }

  syncLabel(): string {
    switch (this.sync.state()) {
      case "synced":
        return "Synced";
      case "syncing":
        return "Syncing";
      case "error":
        return "Device only";
      default:
        return "On this device";
    }
  }

  syncIcon(): string {
    switch (this.sync.state()) {
      case "synced":
        return "cloud_done";
      case "syncing":
        return "cloud_sync";
      case "error":
        return "cloud_off";
      default:
        return "devices";
    }
  }

  syncTitle(): string {
    switch (this.sync.state()) {
      case "synced":
        return "Your Masterclass progress is saved to your account and follows you to other devices.";
      case "syncing":
        return "Saving your Masterclass progress to your account.";
      case "error":
        return "Progress is saved on this device. Account sync will retry after your next lesson.";
      default:
        return "Progress is saved on this device. Sign in to carry it across devices.";
    }
  }

  onAtlasSearch(event: Event): void {
    this.atlasQuery.set((event.target as HTMLInputElement).value);
  }

  setAtlasGroup(group: string): void {
    this.atlasGroup.set(group);
  }

  toggleSurface(id: string): void {
    this.openSurfaceId.update((open) => (open === id ? null : id));
  }

  isSurfaceOpen(id: string): boolean {
    return this.openSurfaceId() === id;
  }

  trackProgress(track: GuideTrack): {
    done: number;
    total: number;
    percent: number;
  } {
    return this.guide.progressFor(track);
  }

  lessonDone(lesson: GuideLesson): boolean {
    return this.guide.isComplete(lesson.id);
  }

  lessonNumber(track: GuideTrack, lesson: GuideLesson): number {
    return track.lessons.findIndex((entry) => entry.id === lesson.id) + 1;
  }

  trackById(_index: number, track: GuideTrack): string {
    return track.id;
  }

  lessonById(_index: number, lesson: GuideLesson): string {
    return lesson.id;
  }

  atlasById(_index: number, entry: GuideSurfaceEntry): string {
    return entry.id;
  }

  async copyLink(): Promise<void> {
    const clipboard =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) return;

    try {
      await clipboard.writeText(window.location.href);
      this.linkCopied.set(true);
      if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
      this.copyResetTimer = setTimeout(() => this.linkCopied.set(false), 2200);
    } catch {
      // Clipboard access can be refused; the address bar still holds the link.
    }
  }

  private applyDeepLink(
    tab: GuideTab | null,
    track: GuideTrackId | null,
    lessonId: string | null,
  ): void {
    const lesson = guideLessonById(lessonId);
    const requestedTrack =
      lesson?.track ?? (isGuideTrackId(track) ? track : null);

    if (requestedTrack && requestedTrack !== this.selectedTrackId()) {
      this.selectedTrackId.set(requestedTrack);
      if (!lesson) {
        const next = this.guide.nextLesson(guideTrack(requestedTrack));
        this.openLessonId.set(next.id);
        this.autoCheck.track(next);
      }
    }

    if (tab && tab !== this.tab()) this.tab.set(tab);
    if (tab === "atlas" || tab === "words") this.autoCheck.clear();

    if (lesson) {
      this.tab.set("learn");
      if (this.openLessonId() !== lesson.id) {
        this.openLessonId.set(lesson.id);
        this.autoCheck.track(lesson);
      }
    }
  }

  private emitState(): void {
    this.stateChange.emit({
      tab: this.tab(),
      track: this.selectedTrackId(),
      lessonId: this.tab() === "learn" ? this.openLessonId() : null,
    });
  }
}
