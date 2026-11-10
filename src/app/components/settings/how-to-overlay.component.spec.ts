import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HowToOverlayComponent } from './how-to-overlay.component';
import { COMPLETE_GUIDE_LESSONS } from './complete-app-guide.lessons';

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

  it('renders the complete guide and every chapter', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('The whole system, one walkthrough.');
    expect(text).toContain('13');
    expect(
      fixture.nativeElement.querySelectorAll('.guide-chapter').length
    ).toBe(COMPLETE_GUIDE_LESSONS.length);
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
