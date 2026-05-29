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
  let pauseSpy: jest.SpyInstance;
  let loadSpy: jest.SpyInstance;

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
    streams: [],
  };

  beforeEach(async () => {
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
          useValue: { snapshot: { queryParams: {} } },
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
    pauseSpy = jest
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    loadSpy = jest
      .spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
    fixture.detectChanges();

    const req = httpMock.expectOne('assets/data/tha-spot-feed.json');
    req.flush(mockFeed);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
    pauseSpy.mockRestore();
    loadSpy.mockRestore();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle between gaming and cinema mode', () => {
    expect(component.displayMode()).toBe('gaming');
    component.setMode('cinema');
    expect(component.displayMode()).toBe('cinema');
    component.setMode('gaming');
    expect(component.displayMode()).toBe('gaming');
  });

  it('should initialize HLS player when a stream is clicked', () => {
    jest.useFakeTimers();
    const mockStream = { id: 's1', name: 'Stream 1', url: 'http://test.m3u8' };
    const hls = {
      loadSource: jest.fn(),
      attachMedia: jest.fn(),
      on: jest.fn(),
      destroy: jest.fn(),
    };
    (window as any).Hls = jest.fn(() => hls);
    (window as any).Hls.isSupported = jest.fn().mockReturnValue(true);
    (window as any).Hls.Events = { MANIFEST_PARSED: 'manifestParsed' };

    component.onStreamClick(mockStream as any);
    expect(component.currentStream()).toBe(mockStream);
    jest.runOnlyPendingTimers();
    expect(hls.loadSource).toHaveBeenCalledWith('http://test.m3u8');
    expect(hls.attachMedia).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('destroys active HLS player when closing stream', () => {
    const hls = {
      loadSource: jest.fn(),
      attachMedia: jest.fn(),
      on: jest.fn(),
      destroy: jest.fn(),
    };
    (window as any).Hls = jest.fn(() => hls);
    (window as any).Hls.isSupported = jest.fn().mockReturnValue(true);
    (window as any).Hls.Events = { MANIFEST_PARSED: 'manifestParsed' };

    const video = document.createElement('video');
    component.videoPlayer = { nativeElement: video } as any;

    jest.useFakeTimers();
    component.onStreamClick({
      id: 's1',
      name: 'Stream 1',
      url: 'http://test.m3u8',
    } as any);
    jest.runOnlyPendingTimers();

    component.closeStream();

    expect(hls.destroy).toHaveBeenCalled();
    expect(component.currentStream()).toBeNull();
    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
    jest.useRealTimers();
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
