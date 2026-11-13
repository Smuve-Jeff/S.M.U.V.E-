import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  type ParamMap,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { MasterclassPageComponent } from './masterclass-page.component';
import { StudioGuideAutoCheckService } from '../studio-guide/studio-guide.auto-check.service';
import { StudioGuideSyncService } from '../studio-guide/studio-guide-sync.service';

describe('MasterclassPageComponent', () => {
  let fixture: ComponentFixture<MasterclassPageComponent>;
  let component: MasterclassPageComponent;
  let params: BehaviorSubject<ParamMap>;
  let router: { navigate: jest.Mock };
  let autoCheck: {
    track: jest.Mock;
    clear: jest.Mock;
    noteActiveView: jest.Mock;
    noteAction: jest.Mock;
    noteGuideOpen: jest.Mock;
    dismissRecent: jest.Mock;
    lastAutoCompleted: ReturnType<typeof signal<null>>;
    activeLesson: ReturnType<typeof signal<null>>;
  };

  async function create(initial: Record<string, string> = {}): Promise<void> {
    window.localStorage.clear();
    params = new BehaviorSubject(convertToParamMap(initial));
    router = { navigate: jest.fn().mockResolvedValue(true) };
    autoCheck = {
      track: jest.fn(),
      clear: jest.fn(),
      noteActiveView: jest.fn(),
      noteAction: jest.fn(),
      noteGuideOpen: jest.fn(),
      dismissRecent: jest.fn(),
      lastAutoCompleted: signal(null),
      activeLesson: signal(null),
    };

    await TestBed.configureTestingModule({
      imports: [MasterclassPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params.asObservable() },
        },
        { provide: Router, useValue: router },
        { provide: StudioGuideAutoCheckService, useValue: autoCheck },
        {
          provide: StudioGuideSyncService,
          useValue: { state: signal('local') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MasterclassPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    window.localStorage.clear();
  });

  it('renders the shared curriculum as a page, not a modal', async () => {
    await create();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.sg-backdrop')?.classList).toContain('is-page');
    expect(element.querySelector('.sg-shell')?.getAttribute('role')).toBe(
      'region'
    );
    expect(
      element.querySelector('[aria-label="Back to the Studio"]')
    ).not.toBeNull();
  });

  it('opens a deep-linked path and lesson', async () => {
    await create({ guide: 'mastery', lesson: 'master-ears' });

    expect(component.tab()).toBe('learn');
    expect(component.track()).toBe('mastery');
    expect(component.lesson()).toBe('master-ears');
  });

  it('mirrors tab changes into shareable query parameters', async () => {
    await create();

    component.onStateChange({
      tab: 'atlas',
      track: 'full-song',
      lessonId: 'song-export',
    });

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { guide: 'atlas', lesson: null },
        replaceUrl: true,
      })
    );

    params.next(convertToParamMap({ guide: 'atlas' }));
    fixture.detectChanges();
    expect(component.tab()).toBe('atlas');
    expect(component.lesson()).toBeNull();
  });

  it('hands the real surface back to the Studio with a view query', async () => {
    await create();

    component.openStudioSurface('mixer');

    expect(router.navigate).toHaveBeenCalledWith(['/studio'], {
      queryParams: { view: 'mixer' },
    });
  });

  it('returns to the Studio from the page control', async () => {
    await create();

    component.backToStudio();

    expect(router.navigate).toHaveBeenCalledWith(['/studio']);
  });

  it('opens a whole-application lesson route', async () => {
    await create();

    component.openWorkspace('/academy');

    expect(router.navigate).toHaveBeenCalledWith(['/academy']);
  });
});
