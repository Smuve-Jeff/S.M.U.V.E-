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
import { UserProfileService } from '../services/user-profile.service';
import { NotificationService } from '../services/notification.service';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';

describe('StudioComponent', () => {
  const createComponent = async (initialView?: string) => {
    const routeUrl$ = new Subject<any[]>();
    const queryParamMap$ = new Subject<any>();
    const uiServiceMock = {
      navigateToView: jest.fn(),
      performanceMode: signal(false),
      holographicMode: signal(false),
      isCompactMobile: () => false,
    };
    const routerMock = {
      navigate: jest.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        {
          provide: AudioSessionService,
          useValue: {
            isRecording: signal(false),
            isPlaying: signal(false),
            isStopped: signal(true),
            masterVolume: signal(100),
          },
        },
        {
          provide: AudioEngineService,
          useValue: {
            currentBeat: signal(0),
            tempo: signal(120),
            resume: jest.fn(),
            metronomeEnabled: signal(false),
            metronomeVolume: signal(0.5),
            stepsPerBeat: () => 4,
            performanceTier: signal('ultra'),
          },
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
          useValue: {
            selectedTrackId: signal<number | null>(null),
            tracks: signal([]),
            currentStep: signal(0),
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({}),
          },
        },
        {
          provide: NotificationService,
          useValue: {},
        },
        {
          provide: AiCopilotService,
          useValue: {},
        },
        {
          provide: HapticService,
          useValue: {},
        },
        {
          provide: TouchGestureService,
          useValue: {},
        },
        {
          provide: ActivatedRoute,
          useValue: {
            url: routeUrl$.asObservable(),
            queryParamMap: queryParamMap$.asObservable(),
            snapshot: {
              queryParamMap: convertToParamMap(
                initialView ? { view: initialView } : {}
              ),
            },
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

  it('sets active view and updates query params by default', async () => {
    const { component, routerMock } = await createComponent();

    component.setActiveView('mastering');

    expect(component.activeView()).toBe('mastering');
    expect(routerMock.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { view: 'mastering' },
        queryParamsHandling: 'merge',
      })
    );
  });

  it('uses route query param view when valid', async () => {
    const { component } = await createComponent('piano-roll');

    expect(component.activeView()).toBe('piano-roll');
  });

  it('maps studio quality class based on performance mode', async () => {
    const { component } = await createComponent();
    const audioEngine = TestBed.inject(AudioEngineService);

    expect(component.studioQualityClass()).toBe('studio-ultra');

    (audioEngine.performanceTier as any).set('performance');
    expect(component.studioQualityClass()).toBe('studio-perf');
  });

  it('derives current bar from step position', async () => {
    const { component } = await createComponent();
    const musicManager = TestBed.inject(MusicManagerService);

    expect(component.currentBar()).toBe(1);

    (musicManager.currentStep as any).set(16);
    expect(component.currentBar()).toBe(2);

    (musicManager.currentStep as any).set(31);
    expect(component.currentBar()).toBe(2);

    (musicManager.currentStep as any).set(64);
    expect(component.currentBar()).toBe(5);
  });
});
