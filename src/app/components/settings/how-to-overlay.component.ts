import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import {
  COMPLETE_GUIDE_LESSONS,
  COMPLETE_GUIDE_PROGRESS_KEY,
  COMPLETE_GUIDE_SRC,
  CompleteGuideLesson,
} from './complete-app-guide.lessons';

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

  @Output() close = new EventEmitter<void>();
  @ViewChild('tutorialVideo')
  private tutorialVideo?: ElementRef<HTMLVideoElement>;

  readonly lessons = COMPLETE_GUIDE_LESSONS;
  readonly videoSrc = COMPLETE_GUIDE_SRC;
  readonly selectedLesson = signal<CompleteGuideLesson>(this.lessons[0]);
  readonly completed = signal<ReadonlySet<string>>(this.loadCompleted());
  private pendingSeekTarget: number | null = null;
  private seekToken = 0;

  selectLesson(lesson: CompleteGuideLesson, autoplay = false): void {
    this.selectedLesson.set(lesson);
    this.markCompleted(lesson.id);
    this.seekToLesson(lesson.tutorialAt, autoplay);
  }

  playChapter(): void {
    this.seekToLesson(this.selectedLesson().tutorialAt, true);
  }

  nextChapter(): void {
    const index = this.chapterIndex();
    const next = this.lessons[index + 1];
    if (next) {
      this.selectLesson(next, true);
    } else {
      this.selectLesson(this.lessons[this.lessons.length - 1]);
    }
  }

  previousChapter(): void {
    const index = this.chapterIndex();
    const previous = this.lessons[index - 1];
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
    return this.completed().size;
  }

  progressPercent(): number {
    return Math.round((this.completedCount() / this.lessons.length) * 100);
  }

  isComplete(lesson: CompleteGuideLesson): boolean {
    return this.completed().has(lesson.id);
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
    }
  }

  openWorkspace(): void {
    this.pauseVideo();
    this.close.emit();
    void this.router.navigateByUrl(this.selectedLesson().route);
  }

  closeGuide(): void {
    this.pauseVideo();
    this.close.emit();
  }

  ngAfterViewInit(): void {
    // The Settings card uses backdrop-filter, which becomes the containing
    // block for a fixed overlay. Move the host out so the guide covers the
    // viewport instead of only the card.
    const host = this.host.nativeElement;
    if (host.parentElement !== this.document.body) {
      this.document.body.appendChild(host);
    }
  }

  ngOnDestroy(): void {
    this.pauseVideo();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeGuide();
  }

  trackByLesson(_index: number, lesson: CompleteGuideLesson): string {
    return lesson.id;
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

  private markCompleted(id: string): void {
    if (this.completed().has(id)) return;
    const next = new Set(this.completed());
    next.add(id);
    this.completed.set(next);
    try {
      localStorage.setItem(
        COMPLETE_GUIDE_PROGRESS_KEY,
        JSON.stringify([...next])
      );
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
