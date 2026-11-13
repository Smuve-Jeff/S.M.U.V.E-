import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
  type ParamMap,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MusicAcademyComponent } from './music-academy.component';
import { MusicAcademyService } from '../../composer/music-academy.service';
import { UserProfileService } from '../../services/user-profile.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { NotificationService } from '../../services/notification.service';

describe('MusicAcademyComponent', () => {
  let fixture: ComponentFixture<MusicAcademyComponent>;
  let component: MusicAcademyComponent;
  let service: MusicAcademyService;
  let music: { addTrack: jest.Mock; setTrackPlugins: jest.Mock };
  let notify: { show: jest.Mock };
  let navigate: jest.SpyInstance;
  let queryParams: BehaviorSubject<ParamMap>;

  const button = (label: string): HTMLButtonElement => {
    const match = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ).find((candidate: HTMLButtonElement) =>
      candidate.textContent?.includes(label)
    ) as HTMLButtonElement | undefined;
    expect(match).toBeTruthy();
    return match!;
  };

  beforeEach(() => {
    localStorage.clear();
    music = {
      addTrack: jest.fn(() => 'track-1'),
      setTrackPlugins: jest.fn(),
    };
    notify = { show: jest.fn() };
    queryParams = new BehaviorSubject<ParamMap>(convertToParamMap({}));

    TestBed.configureTestingModule({
      imports: [MusicAcademyComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParams.asObservable() },
        },
        { provide: UserProfileService, useValue: { profile: () => null } },
        { provide: MusicManagerService, useValue: music },
        { provide: NotificationService, useValue: notify },
      ],
    });

    const router = TestBed.inject(Router);
    navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(MusicAcademyComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(MusicAcademyService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.clear();
  });

  it('renders the selected program and its next lesson without a false empty state', () => {
    const text = fixture.nativeElement.textContent || '';

    expect(text).toContain('Learn the craft');
    expect(text).toContain('Voice / Vocal Coach');
    expect(text).toContain('Next up:');
    expect(fixture.nativeElement.querySelector('.detail')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.empty')).toBeNull();
  });

  it('requires a second press before resetting program progress', () => {
    const lesson = service.selectedProgram().stages[0].lessons[0];
    service.toggleLesson(lesson);
    fixture.detectChanges();

    const reset = button('Reset progress');
    expect(reset.disabled).toBe(false);

    reset.click();
    fixture.detectChanges();
    expect(button('Confirm reset')).toBeTruthy();
    expect(service.isComplete(lesson)).toBe(true);

    button('Confirm reset').click();
    fixture.detectChanges();
    expect(service.isComplete(lesson)).toBe(false);
    expect(button('Reset progress').disabled).toBe(true);
    expect(notify.show).toHaveBeenCalledWith(
      'Voice / Vocal Coach progress reset.',
      'info'
    );
  });

  it('hides the detail and offers a clear action when nothing matches', () => {
    service.setSearch('there-is-no-such-program');
    fixture.detectChanges();

    expect(component.academy.selectedProgramInView()).toBeNull();
    expect(fixture.nativeElement.querySelector('.detail')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'No program matches that search or filter.'
    );

    button('Clear filters').click();
    fixture.detectChanges();

    expect(service.search()).toBe('');
    expect(service.familyFilter()).toBe('all');
    expect(component.academy.selectedProgramInView()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.detail')).not.toBeNull();
  });

  it('exposes accessible names and states for search, filters, programs and lessons', () => {
    const search = fixture.nativeElement.querySelector(
      'input.search'
    ) as HTMLInputElement;
    expect(search.getAttribute('aria-label')).toBe(
      'Search programs, lessons and drills'
    );

    const allChip = Array.from(
      fixture.nativeElement.querySelectorAll('.chips .chip-btn')
    ).find((candidate: HTMLButtonElement) =>
      candidate.textContent?.includes('All disciplines')
    ) as HTMLButtonElement;
    expect(allChip.getAttribute('aria-pressed')).toBe('true');

    const firstProgram = fixture.nativeElement.querySelector(
      '.program'
    ) as HTMLButtonElement;
    expect(firstProgram.getAttribute('aria-pressed')).toBe('true');
    expect(firstProgram.getAttribute('aria-label')).toContain('% complete');
    expect(
      firstProgram.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')
    ).toBe('0');

    const checks = Array.from(
      fixture.nativeElement.querySelectorAll('.check')
    ) as HTMLButtonElement[];
    expect(checks.length).toBeGreaterThan(0);
    expect(checks[0].getAttribute('aria-label')).toContain('Mark');
    expect(checks[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('opens practice in the Studio with the selected instrument', () => {
    button('Open in Studio').click();
    fixture.detectChanges();

    expect(music.addTrack).toHaveBeenCalledWith(
      'Voice / Vocal Coach practice',
      'choir-ensemble',
      'midi'
    );
    expect(navigate).toHaveBeenCalledWith(['/studio'], {
      queryParams: { view: 'vocal-suite' },
    });
  });

  it('sends acting practice to Practice Space with its own call to action', () => {
    service.selectProgram('acting');
    fixture.detectChanges();

    button('Open Practice Space').click();
    fixture.detectChanges();

    expect(music.addTrack).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/practice']);
  });

  it('lands on the program named by the ?program= deep link', () => {
    queryParams.next(convertToParamMap({ program: 'directing' }));
    fixture.detectChanges();

    expect(service.selectedProgram().id).toBe('directing');
    expect(component.practiceLabel()).toBe('Open Image & Video Lab');
  });

  it('ignores an unknown ?program= value instead of selecting nothing', () => {
    queryParams.next(convertToParamMap({ program: 'not-a-program' }));
    fixture.detectChanges();

    expect(service.selectedProgram().id).toBe('voice');
  });

  it('writes the selected program back to the URL for sharing', () => {
    component.selectProgram('marketing-promotion');

    expect(service.selectedProgram().id).toBe('marketing-promotion');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { program: 'marketing-promotion' },
      })
    );
  });
});
