import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HowToOverlayComponent } from './how-to-overlay.component';
import {
  COMPLETE_GUIDE_LESSONS,
  COMPLETE_GUIDE_PROGRESS_KEY,
  COMPLETE_GUIDE_RESUME_KEY,
} from './complete-app-guide.lessons';
import { GLOBAL_KEYBOARD_SHORTCUTS } from '../../services/global-keyboard-shortcuts';
import { NotificationService } from '../../services/notification.service';

describe('HowToOverlayComponent', () => {
  let fixture: ComponentFixture<HowToOverlayComponent>;
  let component: HowToOverlayComponent;
  let navigateByUrl: jest.Mock;

  beforeEach(async () => {
    localStorage.clear();
    navigateByUrl = jest.fn().mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [HowToOverlayComponent],
      providers: [{ provide: Router, useValue: { navigateByUrl } }],
    }).compileComponents();

    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.clear();
  });

  it('mounts the guide at the document root', () => {
    expect(fixture.nativeElement.parentElement).toBe(document.body);
  });

  it('keeps lesson metadata internally consistent', () => {
    const numbers = COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.number);
    const ids = COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.id);
    const starts = COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.tutorialAt);

    expect(new Set(ids).size).toBe(COMPLETE_GUIDE_LESSONS.length);
    expect(numbers).toEqual(
      COMPLETE_GUIDE_LESSONS.map((_, index) =>
        String(index + 1).padStart(2, '0')
      )
    );
    for (const lesson of COMPLETE_GUIDE_LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(3);
      expect(lesson.summary.length).toBeGreaterThan(20);
      expect(lesson.route.startsWith('/')).toBe(true);
      expect(lesson.route).not.toMatch(/\s|\/$/);
      expect(lesson.workspaceLabel.length).toBeGreaterThan(2);
      expect(lesson.steps.length).toBeGreaterThan(0);
      expect(lesson.features.length).toBeGreaterThan(0);
      expect(lesson.mistake.length).toBeGreaterThan(10);
    }
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index]).toBeGreaterThan(starts[index - 1]);
    }
  });

  it('ignores retired progress entries instead of inflating the count', () => {
    component.completed.set(new Set(['studio', 'retired-lesson']));

    expect(component.completedCount()).toBe(1);
    expect(component.progressPercent()).toBeLessThanOrEqual(100);
  });

  it('renders the complete guide and every chapter', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('The whole system, one walkthrough.');
    expect(text).toContain('13');
    expect(
      fixture.nativeElement.querySelectorAll('.guide-chapter').length
    ).toBe(COMPLETE_GUIDE_LESSONS.length);
  });

  it('renders the global keyboard reference in the help surface', () => {
    const items = fixture.nativeElement.querySelectorAll(
      '.guide-keyboard-item'
    );
    const text = fixture.nativeElement.textContent as string;

    expect(items.length).toBe(GLOBAL_KEYBOARD_SHORTCUTS.length);
    expect(text).toContain('Alt + L');
    expect(text).toContain('Teach this screen');
    expect(text).toContain('Ctrl / ⌘ + K');
    expect(text).toContain('Close overlay');
  });

  it('focuses the keyboard reference when opened directly to it', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    component.focusKeyboardReference = true;
    fixture.detectChanges();

    await Promise.resolve();

    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('.guide-keyboard')
    );
  });

  it('marks the active chapter for assistive technology', () => {
    const active = fixture.nativeElement.querySelector(
      '.guide-chapter.is-active'
    ) as HTMLElement;

    expect(active.getAttribute('aria-current')).toBe('step');
  });

  it('shows a usable fallback when the walkthrough video fails', () => {
    component.onVideoError();
    fixture.detectChanges();

    expect(component.videoUnavailable()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'The walkthrough video could not load.'
    );
  });

  it('does not move past the first or last chapter', () => {
    component.selectLesson(COMPLETE_GUIDE_LESSONS[0]);
    component.previousChapter();
    expect(component.selectedLesson().id).toBe(
      COMPLETE_GUIDE_LESSONS[0].id
    );

    component.selectLesson(
      COMPLETE_GUIDE_LESSONS[COMPLETE_GUIDE_LESSONS.length - 1]
    );
    component.nextChapter();
    expect(component.selectedLesson().id).toBe(
      COMPLETE_GUIDE_LESSONS[COMPLETE_GUIDE_LESSONS.length - 1].id
    );
  });

  it('returns keyboard focus to the control that opened the guide', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open guide';
    document.body.appendChild(opener);
    opener.focus();
    fixture.destroy();
    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.closeGuide();

    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });

  it('locks body scroll while open and restores it on close', () => {
    expect(document.body.style.overflow).toBe('hidden');

    fixture.destroy();
    expect(document.body.style.overflow).toBe('');

    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('moves initial focus into the dialog', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve();

    expect(
      (document.activeElement as HTMLElement | null)?.classList.contains(
        'guide-close'
      )
    ).toBe(true);
  });

  it('keeps Tab inside the dialog', () => {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button:not([disabled])')
    ) as HTMLButtonElement[];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    const wrap = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    });
    component.onOverlayKeydown(wrap);

    expect(document.activeElement).toBe(first);
    expect(wrap.defaultPrevented).toBe(true);

    first.focus();
    const reverse = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });
    component.onOverlayKeydown(reverse);

    expect(document.activeElement).toBe(last);
    expect(reverse.defaultPrevented).toBe(true);

    const keyboard = fixture.nativeElement.querySelector(
      '.guide-keyboard'
    ) as HTMLElement;
    keyboard.focus();
    const fromReference = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    });
    component.onOverlayKeydown(fromReference);

    expect(document.activeElement).toBe(first);
    expect(fromReference.defaultPrevented).toBe(true);
  });

  it('resets the detail scroll when changing chapters', async () => {
    const main = fixture.nativeElement.querySelector(
      '.guide-main'
    ) as HTMLElement;
    main.scrollTop = 120;

    component.selectLesson(COMPLETE_GUIDE_LESSONS[4]);
    await Promise.resolve();

    expect(main.scrollTop).toBe(0);
  });

  it('credits the initial chapter when playback starts', () => {
    expect(component.completedCount()).toBe(0);

    component.markCurrentLessonExplored();

    expect(component.isComplete(COMPLETE_GUIDE_LESSONS[0])).toBe(true);
    expect(component.completedCount()).toBe(1);
  });

  it('restores the last viewed chapter and explains the resume', () => {
    const last = COMPLETE_GUIDE_LESSONS[5];
    localStorage.setItem(COMPLETE_GUIDE_RESUME_KEY, last.id);
    fixture.destroy();
    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.selectedLesson().id).toBe(last.id);
    expect(component.resumedChapter()?.id).toBe(last.id);
    expect(fixture.nativeElement.textContent).toContain(
      `Resumed at chapter ${last.number}`
    );
  });

  it('lets the artist start over from chapter one', () => {
    const last = COMPLETE_GUIDE_LESSONS[5];
    localStorage.setItem(COMPLETE_GUIDE_RESUME_KEY, last.id);
    fixture.destroy();
    fixture = TestBed.createComponent(HowToOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.startFromBeginning();
    fixture.detectChanges();

    expect(component.selectedLesson().id).toBe(
      COMPLETE_GUIDE_LESSONS[0].id
    );
    expect(component.resumedChapter()).toBeNull();
    expect(fixture.nativeElement.querySelector('.guide-resume')).toBeNull();
    expect(localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY)).toBe(
      COMPLETE_GUIDE_LESSONS[0].id
    );
  });

  it('asks before clearing progress and resume', async () => {
    const last = COMPLETE_GUIDE_LESSONS[5];
    component.selectLesson(last);
    fixture.detectChanges();

    expect(component.completedCount()).toBe(1);
    expect(localStorage.getItem(COMPLETE_GUIDE_PROGRESS_KEY)).not.toBeNull();
    expect(localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY)).toBe(last.id);

    const reset = fixture.nativeElement.querySelector(
      '.guide-reset'
    ) as HTMLButtonElement;
    expect(reset).not.toBeNull();
    reset.click();
    fixture.detectChanges();
    await Promise.resolve();

    expect(component.resetConfirming()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.guide-reset-confirm')
    ).not.toBeNull();
    expect(component.completedCount()).toBe(1);
    expect(localStorage.getItem(COMPLETE_GUIDE_PROGRESS_KEY)).not.toBeNull();
    expect(localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY)).toBe(last.id);
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('.guide-reset-cancel')
    );

    const cancel = fixture.nativeElement.querySelector(
      '.guide-reset-cancel'
    ) as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();

    expect(component.resetConfirming()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('.guide-reset-confirm')
    ).toBeNull();
    expect(component.completedCount()).toBe(1);
    expect(localStorage.getItem(COMPLETE_GUIDE_PROGRESS_KEY)).not.toBeNull();
    expect(localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY)).toBe(last.id);
  });

  it('clears progress and resume only after confirmation', () => {
    const show = jest.spyOn(TestBed.inject(NotificationService), 'show');
    const last = COMPLETE_GUIDE_LESSONS[5];
    component.selectLesson(last);
    fixture.detectChanges();

    const reset = fixture.nativeElement.querySelector(
      '.guide-reset'
    ) as HTMLButtonElement;
    reset.click();
    fixture.detectChanges();

    const clear = fixture.nativeElement.querySelector(
      '.guide-reset-clear'
    ) as HTMLButtonElement;
    expect(clear).not.toBeNull();
    clear.click();
    fixture.detectChanges();

    expect(component.resetConfirming()).toBe(false);
    expect(component.completedCount()).toBe(0);
    expect(component.selectedLesson().id).toBe(
      COMPLETE_GUIDE_LESSONS[0].id
    );
    expect(component.resumedChapter()).toBeNull();
    expect(localStorage.getItem(COMPLETE_GUIDE_PROGRESS_KEY)).toBeNull();
    expect(localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY)).toBeNull();
    expect(show).toHaveBeenCalledWith(
      'Guide progress and resume point cleared.',
      'success',
      3000
    );
  });

  it('cancels the reset prompt before closing the guide on Escape', () => {
    const close = jest.spyOn(component.close, 'emit');
    component.selectLesson(COMPLETE_GUIDE_LESSONS[5]);
    component.requestReset();
    fixture.detectChanges();

    component.onEscape();

    expect(component.resetConfirming()).toBe(false);
    expect(close).not.toHaveBeenCalled();

    component.onEscape();

    expect(close).toHaveBeenCalled();
  });

  it('remembers a newly selected chapter for the next visit', () => {
    const next = COMPLETE_GUIDE_LESSONS[3];

    component.selectLesson(next);

    expect(localStorage.getItem(COMPLETE_GUIDE_RESUME_KEY)).toBe(next.id);
  });

  it('selects a chapter and records it as explored', () => {
    const studio = COMPLETE_GUIDE_LESSONS.find((lesson) => lesson.id === 'studio');
    expect(studio).toBeDefined();

    component.selectLesson(studio!);

    expect(component.selectedLesson().id).toBe('studio');
    expect(component.isComplete(studio!)).toBe(true);
    expect(component.completedCount()).toBe(1);
    expect(localStorage.getItem('smuve.complete-app-guide.progress.v1')).toContain(
      'studio'
    );
  });

  it('opens the selected workspace and closes the guide', () => {
    const close = jest.spyOn(component.close, 'emit');
    component.selectLesson(COMPLETE_GUIDE_LESSONS[2]);

    component.openWorkspace();

    expect(navigateByUrl).toHaveBeenCalledWith('/studio');
    expect(close).toHaveBeenCalled();
  });

  it('keeps a chapter selected while the video seek is pending', () => {
    const video = fixture.nativeElement.querySelector(
      'video'
    ) as HTMLVideoElement;
    let currentTime = 0;
    Object.defineProperty(video, 'readyState', {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });
    jest.spyOn(video, 'pause').mockImplementation(() => undefined);
    jest.spyOn(video, 'play').mockImplementation(() => Promise.resolve());

    const career = COMPLETE_GUIDE_LESSONS[7];
    component.selectLesson(career, true);
    currentTime = 0.6;
    component.onTimeUpdate();
    expect(component.selectedLesson().id).toBe('career');

    video.dispatchEvent(new Event('seeked'));
    currentTime = career.tutorialAt;
    component.onTimeUpdate();
    expect(component.selectedLesson().id).toBe('career');
  });

  it('moves to the next chapter and emits close on Escape', () => {
    const close = jest.spyOn(component.close, 'emit');
    component.selectLesson(COMPLETE_GUIDE_LESSONS[0]);

    component.nextChapter();
    expect(component.selectedLesson().number).toBe('02');

    component.onEscape();
    expect(close).toHaveBeenCalled();
  });
});
