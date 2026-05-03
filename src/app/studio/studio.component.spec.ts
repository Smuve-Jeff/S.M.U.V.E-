import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { StudioComponent } from './studio.component';
import { AudioSessionService } from './audio-session.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { MusicManagerService } from '../services/music-manager.service';
import { ActivatedRoute, Router } from '@angular/router';

describe('StudioComponent', () => {
  const createComponent = async () => {
    const routeUrl$ = new Subject<any[]>();
    const queryParamMap$ = new Subject<any>();
    const uiServiceMock = {
      navigateToView: jest.fn(),
      performanceMode: signal(false),
    };
    const routerMock = {
      navigate: jest.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        {
          provide: AudioSessionService,
          useValue: { isRecording: signal(false) },
        },
        {
          provide: AudioEngineService,
          useValue: { currentBeat: signal(0) },
        },
        {
          provide: AiService,
          useValue: {
            strategicDecrees: signal(['READY']),
            performExecutiveAudit: jest.fn(),
          },
        },
        {
          provide: UIService,
          useValue: uiServiceMock,
        },
        {
          provide: MusicManagerService,
          useValue: { selectedTrackId: signal<number | null>(null) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            url: routeUrl$.asObservable(),
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
        { provide: Router, useValue: routerMock },
      ],
    })
      .overrideComponent(StudioComponent, { set: { template: '<div></div>' } })
      .compileComponents();

    const fixture = TestBed.createComponent(StudioComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { component, routeUrl$, queryParamMap$, routerMock, uiServiceMock };
  };

  it('syncs active view from query param without navigation loop', async () => {
    const { component, queryParamMap$, routerMock } = await createComponent();

    queryParamMap$.next(convertToParamMap({ view: 'mixer' }));

    expect(component.activeView()).toBe('mixer');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('sets active view and updates query params by default', async () => {
    const { component, routerMock } = await createComponent();

    component.setActiveView('mastering');

    expect(component.activeView()).toBe('mastering');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/studio'], {
      queryParams: { view: 'mastering' },
      replaceUrl: true,
    });
  });

  it('switches standalone studio routes back to the canonical update path', async () => {
    const { component, routeUrl$, routerMock } = await createComponent();

    routeUrl$.next([{ path: 'vocal-suite' }]);
    component.setActiveView('drum-machine');

    expect(component.activeView()).toBe('drum-machine');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/studio'], {
      queryParams: { view: 'drum-machine' },
      replaceUrl: true,
    });
  });

  it('navigates to dedicated standalone routes for studio aliases', async () => {
    const { component, routerMock } = await createComponent();

    component.setActiveView('vocal-suite');

    expect(routerMock.navigate).toHaveBeenCalledWith(['/vocal-suite'], {
      queryParams: undefined,
      replaceUrl: true,
    });
  });

  it('syncs mastering and performance views from query params without a navigation loop', async () => {
    const { component, queryParamMap$, routerMock } = await createComponent();

    queryParamMap$.next(convertToParamMap({ view: 'mastering' }));
    expect(component.activeView()).toBe('mastering');

    queryParamMap$.next(convertToParamMap({ view: 'performance' }));
    expect(component.activeView()).toBe('performance');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('maps studio quality class based on performance mode', async () => {
    const { component, uiServiceMock } = await createComponent();

    expect(component.studioQualityClass()).toBe('studio-quality-ultra');

    uiServiceMock.performanceMode.set(true);
    expect(component.studioQualityClass()).toBe('studio-quality-performance');
  });
});
