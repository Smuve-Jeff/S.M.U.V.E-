import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import {
  GLOBAL_KEYBOARD_SHORTCUT_NOTE,
  GLOBAL_KEYBOARD_SHORTCUTS,
} from '../../services/global-keyboard-shortcuts';
import { NotificationService } from '../../services/notification.service';
import {
  COMPLETE_GUIDE_LESSONS,
  COMPLETE_GUIDE_PROGRESS_KEY,
  COMPLETE_GUIDE_RESUME_KEY,
  COMPLETE_GUIDE_SRC,
  CompleteGuideLesson,
  chapterNarration,
} from './complete-app-guide.lessons';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { saveJson, saveString, deleteSaved } from '../../services/guarded-storage';

/**
 * The complete application guide.
 *
 * The old Help Center was four static cards. This surface is a chaptered
 * walkthrough of the shipped application: the bundled video, the same chapter
 * metadata, a real route into every workspace, and progress that stays local.
 */
@Component({
  selector: 'app-how-to-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './how-to-overlay.component.html',
  styleUrls: ['./how-to-overlay.component.css'],
})
export class HowToOverlayComponent implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notify = inject(NotificationService);
  private readonly speech = inject(SpeechSynthesisService);

  @Output() close = new EventEmitter<void>();
  @Input() focusKeyboardReference = false;
  @ViewChild('tutorialVideo')
  private tutorialVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('keyboardReference')
  private keyboardReference?: ElementRef<HTMLElement>;
  @ViewChild('guideClose', { static: true })
  private closeButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('guideMain', { static: true })
  private guideMain?: ElementRef<HTMLElement>;
  @ViewChild('resetTrigger', { static: true })
  private resetTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('resetCancel')
  private resetCancelButton?: ElementRef<HTMLButtonElement>;
  @ViewChildren('chapterButton')
  private chapterButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  readonly lessons = COMPLETE_GUIDE_LESSONS;
  readonly shortcuts = GLOBAL_KEYBOARD_SHORTCUTS;
  readonly shortcutNote = GLOBAL_KEYBOARD_SHORTCUT_NOTE;
  readonly videoSrc = COMPLETE_GUIDE_SRC;
  private readonly restoredLesson = this.loadResumeLesson();
  readonly selectedLesson = signal<CompleteGuideLesson>(
    this.restoredLesson ?? this.lessons[0]
  );
  readonly resumedChapter = signal<CompleteGuideLesson | null>(
    this.restoredLesson?.id === this.lessons[0].id
      ? null
      : this.restoredLesson
  );
  readonly completed = signal<ReadonlySet<string>>(this.loadCompleted());
  readonly videoUnavailable = signal(false);
  readonly resetConfirming = signal(false);
  /** True while S.M.U.V.E is reading the selected chapter aloud. */
  readonly narrating = signal(false);
  /**
   * Which line is speaking: -1 for the introduction, 0..n-1 for a feature
   * (highlighted in the panel), and `features.length` for the closing habit.
   */
  readonly narrationIndex = signal<number | null>(null);
  /**
   * The narration is the chapter's voice track, so it needs an engine. When the
   * device has no voices the button is simply absent; the text guide remains.
   */
  readonly narrationSupported = computed(
    () =>
      this.speech.isSupported() &&
      this.speech.outputCapability() !== 'no-voices'
  );
  /** Bumped by every start/stop so a stale completion cannot continue a script. */
  private narrationToken = 0;
  private readonly knownLessonIds = new Set(
    this.lessons.map((lesson) => lesson.id)
  );
  private readonly opener: HTMLElement | null =
    this.document.activeElement instanceof HTMLElement
      ? this.document.activeElement
      : null;
  private previousBodyOverflow: string | null = null;
  private pendingSeekTarget: number | null = null;
  private seekToken = 0;

  selectLesson(lesson: CompleteGuideLesson, autoplay = false): void {
    this.stopNarration();
    this.resetConfirming.set(false);
    this.resumedChapter.set(null);
    this.selectedLesson.set(lesson);
    this.markCompleted(lesson.id);
    this.rememberLesson(lesson.id);
    this.seekToLesson(lesson.tutorialAt, autoplay);
    queueMicrotask(() => {
      this.resetDetailScroll();
      this.scrollActiveChapterIntoView();
    });
  }

  playChapter(): void {
    this.stopNarration();
    this.markCurrentLessonExplored();
    this.seekToLesson(this.selectedLesson().tutorialAt, true);
  }

  /** Play/pause control for the chapter's S.M.U.V.E narration. */
  toggleNarration(): void {
    if (this.narrating()) {
      this.stopNarration();
      return;
    }
    this.startNarration();
  }

  /**
   * Read the chapter in the full S.M.U.V.E. voice spectrum: the introduction,
   * then one line per feature in order, then the habit. Every line is spoken by
   * a different archetype, so the instructor sounds like the system and not like
   * a browser reader. The feature being spoken is highlighted as it plays, which
   * is what makes this a walkthrough rather than a transcript.
   */
  private startNarration(): void {
    if (!this.narrationSupported()) return;
    const lesson = this.selectedLesson();
    const narration = chapterNarration(lesson.id);
    if (!narration) return;

    this.stopNarration();
    // One voice at a time: the bundled video owns the audio otherwise.
    this.pauseVideo();
    this.markCurrentLessonExplored();

    const token = ++this.narrationToken;
    const script = [
      narration.intro,
      ...narration.features,
      narration.closing,
    ];
    this.narrating.set(true);

    let line = 0;
    const speakLine = (): void => {
      if (token !== this.narrationToken) return;
      if (line >= script.length) {
        this.narrating.set(false);
        this.narrationIndex.set(null);
        return;
      }
      const index = line;
      line += 1;
      // -1 is the introduction; features start at zero.
      this.narrationIndex.set(index - 1);
      this.speech.speak(script[index], {
        shapeShift: true,
        allowVulgarLanguage: true,
        onComplete: speakLine,
      });
    };

    speakLine();
  }

  /** Stop the chapter narration without touching any other S.M.U.V.E surface. */
  stopNarration(): void {
    this.narrationToken += 1;
    if (this.narrating()) this.speech.cancel();
    this.narrating.set(false);
    this.narrationIndex.set(null);
  }

  /** The video's own play event: the picture takes the audio back. */
  onVideoPlay(): void {
    this.stopNarration();
    this.markCurrentLessonExplored();
  }

  markCurrentLessonExplored(): void {
    this.resetConfirming.set(false);
    this.resumedChapter.set(null);
    this.markCompleted(this.selectedLesson().id);
    this.rememberLesson(this.selectedLesson().id);
  }

  startFromBeginning(): void {
    this.resumedChapter.set(null);
    this.selectLesson(this.lessons[0], true);
  }

  requestReset(): void {
    if (this.resetConfirming()) return;
    this.resetConfirming.set(true);
    this.cdr.detectChanges();
    queueMicrotask(() => this.resetCancelButton?.nativeElement.focus());
  }

  cancelReset(): void {
    this.resetConfirming.set(false);
    queueMicrotask(() => this.resetTrigger?.nativeElement.focus());
  }

  confirmReset(): void {
    this.resetConfirming.set(false);
    this.clearProgress();
    this.notify.show(
      'Guide progress and resume point cleared.',
      'success',
      3000
    );
    queueMicrotask(() => this.resetTrigger?.nativeElement.focus());
  }

  private clearProgress(): void {
    this.completed.set(new Set<string>());
    this.resumedChapter.set(null);
    this.selectedLesson.set(this.lessons[0]);
    try {
      deleteSaved(COMPLETE_GUIDE_PROGRESS_KEY, 'localStorage');
      deleteSaved(COMPLETE_GUIDE_RESUME_KEY, 'localStorage');
    } catch {
      // Private browsing can refuse storage; the in-memory reset still applies.
    }
    this.seekToLesson(this.lessons[0].tutorialAt, false);
    this.pauseVideo();
    queueMicrotask(() => {
      this.resetDetailScroll();
      this.scrollActiveChapterIntoView();
    });
  }

  onVideoLoaded(): void {
    this.videoUnavailable.set(false);
    const video = this.tutorialVideo?.nativeElement;
    if (!video) return;
    const target = this.selectedLesson().tutorialAt;
    if (target <= 0) return;
    try {
      if (Math.abs(video.currentTime - target) > 1) {
        video.currentTime = target;
      }
    } catch {
      // Metadata is not seekable yet; Play chapter will seek when ready.
    }
  }

  nextChapter(): void {
    if (this.isLast()) return;
    const next = this.lessons[this.chapterIndex() + 1];
    if (next) this.selectLesson(next, true);
  }

  previousChapter(): void {
    if (this.isFirst()) return;
    const previous = this.lessons[this.chapterIndex() - 1];
    if (previous) this.selectLesson(previous, true);
  }

  chapterIndex(): number {
    return this.lessons.findIndex(
      (lesson) => lesson.id === this.selectedLesson().id
    );
  }

  isFirst(): boolean {
    return this.chapterIndex() === 0;
  }

  isLast(): boolean {
    return this.chapterIndex() === this.lessons.length - 1;
  }

  completedCount(): number {
    let count = 0;
    for (const id of this.completed()) {
      if (this.knownLessonIds.has(id)) count += 1;
    }
    return count;
  }

  progressPercent(): number {
    if (!this.lessons.length) return 0;
    const percent = Math.round(
      (this.completedCount() / this.lessons.length) * 100
    );
    return Math.min(100, percent);
  }

  isComplete(lesson: CompleteGuideLesson): boolean {
    return this.completed().has(lesson.id);
  }

  onVideoError(): void {
    this.videoUnavailable.set(true);
    this.pendingSeekTarget = null;
  }

  onTimeUpdate(): void {
    if (this.pendingSeekTarget !== null) return;
    const video = this.tutorialVideo?.nativeElement;
    if (!video) return;
    let current = this.lessons[0];
    for (const lesson of this.lessons) {
      if (video.currentTime + 0.05 >= lesson.tutorialAt) current = lesson;
    }
    if (current.id !== this.selectedLesson().id) {
      this.selectedLesson.set(current);
      this.markCompleted(current.id);
      this.rememberLesson(current.id);
      queueMicrotask(() => this.scrollActiveChapterIntoView());
    }
  }

  openWorkspace(): void {
    this.pauseVideo();
    this.close.emit();
    const lesson = this.selectedLesson();
    const query = new URLSearchParams(lesson.queryParams ?? {}).toString();
    void this.router.navigateByUrl(
      query ? `${lesson.route}?${query}` : lesson.route,
    );
  }

  closeGuide(): void {
    this.stopNarration();
    this.pauseVideo();
    this.close.emit();
    if (this.opener && this.opener.isConnected) {
      this.opener.focus();
    }
  }

  ngAfterViewInit(): void {
    // The Settings card uses backdrop-filter, which becomes the containing
    // block for a fixed overlay. Move the host out so the guide covers the
    // viewport instead of only the card.
    const host = this.host.nativeElement;
    if (host.parentElement !== this.document.body) {
      this.document.body.appendChild(host);
    }
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';

    queueMicrotask(() => {
      if (this.focusKeyboardReference) {
        const reference = this.keyboardReference?.nativeElement;
        if (!reference) return;
        reference.scrollIntoView?.({ block: 'nearest' });
        reference.focus({ preventScroll: true });
        return;
      }
      this.closeButton?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    this.stopNarration();
    this.pauseVideo();
    if (this.previousBodyOverflow !== null) {
      this.document.body.style.overflow = this.previousBodyOverflow;
    }
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const root = this.host.nativeElement;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hasAttribute('disabled'));
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = this.document.activeElement as HTMLElement | null;
    const activeIndex = active ? focusables.indexOf(active) : -1;
    if (activeIndex === -1) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && activeIndex === focusables.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.resetConfirming()) {
      this.cancelReset();
      return;
    }
    this.closeGuide();
  }

  trackByLesson(_index: number, lesson: CompleteGuideLesson): string {
    return lesson.id;
  }

  private resetDetailScroll(): void {
    const main = this.guideMain?.nativeElement;
    if (main) main.scrollTop = 0;
  }

  private scrollActiveChapterIntoView(): void {
    const active = this.chapterButtons
      ?.toArray()
      .find(
        (button) =>
          button.nativeElement.dataset.lessonId === this.selectedLesson().id
      )?.nativeElement;
    active?.scrollIntoView?.({ block: 'nearest' });
  }

  private seekToLesson(target: number, autoplay: boolean): void {
    const video = this.tutorialVideo?.nativeElement;
    if (!video) return;

    const token = ++this.seekToken;
    const seek = () => {
      if (token !== this.seekToken) return;
      try {
        video.currentTime = target;
      } catch {
        this.pendingSeekTarget = null;
        if (autoplay) this.playVideo();
      }
    };

    if (video.readyState >= 1 && Math.abs(video.currentTime - target) < 0.05) {
      this.pendingSeekTarget = null;
      if (autoplay) this.playVideo();
      return;
    }

    // Do not start playback until the seek lands. Starting from zero while the
    // seek is pending lets timeupdate move the selection back to chapter one.
    this.pendingSeekTarget = target;
    video.pause();

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      if (token !== this.seekToken) return;
      this.pendingSeekTarget = null;
      if (autoplay) this.playVideo();
    };
    video.addEventListener('seeked', onSeeked, { once: true });

    if (video.readyState >= 1) {
      seek();
    } else {
      video.addEventListener('loadedmetadata', seek, { once: true });
    }
  }

  private playVideo(): void {
    const video = this.tutorialVideo?.nativeElement;
    if (!video) return;
    try {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          // Autoplay can be refused; the native controls remain available.
        });
      }
    } catch {
      // No media error needs to be surfaced here; the controls still work.
    }
  }

  private pauseVideo(): void {
    try {
      this.tutorialVideo?.nativeElement.pause();
    } catch {
      // The element may already be gone during route teardown.
    }
  }

  private rememberLesson(id: string): void {
    try {
      saveString(COMPLETE_GUIDE_RESUME_KEY, id, 'localStorage');
    } catch {
      // Private browsing can refuse storage; the in-memory selection remains.
    }
  }

  private loadResumeLesson(): CompleteGuideLesson | null {
    try {
      const id = localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY);
      if (!id) return null;
      return this.lessons.find((lesson) => lesson.id === id) ?? null;
    } catch {
      return null;
    }
  }

  private markCompleted(id: string): void {
    if (this.completed().has(id)) return;
    const next = new Set(this.completed());
    next.add(id);
    this.completed.set(next);
    try {
      saveJson(COMPLETE_GUIDE_PROGRESS_KEY, [...next], 'localStorage');
    } catch {
      // Private browsing can refuse storage; progress remains in memory.
    }
  }

  private loadCompleted(): ReadonlySet<string> {
    try {
      const raw = localStorage.getItem(COMPLETE_GUIDE_PROGRESS_KEY);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      return new Set<string>(
        Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === 'string')
          : []
      );
    } catch {
      return new Set<string>();
    }
  }
}
