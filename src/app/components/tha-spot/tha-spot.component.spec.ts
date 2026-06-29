import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ThaSpotComponent } from './tha-spot.component';
import { UserProfileService } from '../../services/user-profile.service';
import { SecurityService } from '../../services/security.service';
import { UIService } from '../../services/ui.service';
import { Router, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
  let httpMock: HttpTestingController;
  let removeListenerSpy: jest.SpyInstance;

  const mockFeed = {
    games: [
      {
        id: '1',
        name: 'Game 1',
        url: 'test',
        genre: 'Action',
        launchConfig: { embedMode: 'inline' },
      },
      {
        id: '2',
        name: 'Game 2',
        url: 'test',
        genre: 'RPG',
        launchConfig: { embedMode: 'inline' },
      },
    ],
    rooms: [],
    badges: [],
    liveEvents: [],
    socialPresence: [],
    promotions: [],
    recommendationRails: [],
  };

  beforeEach(async () => {
    (navigator as any).getGamepads = jest.fn().mockReturnValue([]);
    const profileServiceMock = {
      profile: signal({
        primaryGenre: 'Action',
        gameStats: {},
        thaSpotProgression: { currentStreak: 0 },
        careerGoals: [],
      }),
      recordGameLaunch: jest.fn(),
      recordGameResult: jest.fn(),
    };

    const uiServiceMock = {
      isCompactMobile: signal(false),
      navigateToView: jest.fn(),
    };

    const securityServiceMock = {
      getCSRFToken: jest.fn().mockReturnValue('test-token'),
    };

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ThaSpotComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: new Map(), queryParams: {} },
            queryParamMap: of({ get: (key: string) => null, has: (key: string) => false })
          },
        },
        { provide: UserProfileService, useValue: profileServiceMock },
        { provide: UIService, useValue: uiServiceMock },
        { provide: SecurityService, useValue: securityServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    removeListenerSpy = jest.spyOn(window, 'removeEventListener');
    fixture.detectChanges();

    const req = httpMock.expectOne('assets/data/tha-spot-feed.json');
    req.flush(mockFeed);

    // Also handle featured users call from ngOnInit
    const featuredReq = httpMock.expectOne(req => req.url.includes('/api/users/featured'));
    featuredReq.flush([]);

    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle between gaming and Pluto TV mode', () => {
    expect(component.displayMode()).toBe('gaming');
    component.setMode('pluto');
    expect(component.displayMode()).toBe('pluto');
    component.setMode('gaming');
    expect(component.displayMode()).toBe('gaming');
  });

  it('ignores game messages from untrusted origins', () => {
    const profileService = TestBed.inject(UserProfileService) as any;
    const frameWindow = {} as Window;
    component.gameIframe = {
      nativeElement: { contentWindow: frameWindow },
    } as any;
    component.currentGame.set({
      id: '1',
      url: '/assets/games/demo.html',
      launchConfig: { embedMode: 'inline' },
    } as any);

    const message = {
      origin: 'https://evil.example',
      source: frameWindow,
      data: { type: 'GAME_OVER', data: { score: 42 } },
    } as MessageEvent;

    component.onMessage(message);

    expect(profileService.recordGameResult).not.toHaveBeenCalled();
  });

  it('removes the exact message listener on destroy', () => {
    component.ngOnDestroy();
    const removeCall = removeListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'message'
    );
    expect(removeCall).toBeDefined();
    expect(typeof removeCall?.[1]).toBe('function');
  });
});
