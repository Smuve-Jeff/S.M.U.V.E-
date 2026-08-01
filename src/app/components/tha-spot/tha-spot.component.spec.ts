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
import { GameService } from '../../hub/game.service';
import { GamepadService } from '../../services/gamepad.service';
import { SocialNetworkingService } from '../../services/social-networking.service';
import { ChallengeInboxService } from '../../services/challenge-inbox.service';
import { PeerNetworkingService } from '../../services/peer-networking.service';
import { SnackbarService } from '../../services/snackbar.service';
import { MatchmakingService } from '../../hub/matchmaking.service';
import { DailyMissionsService } from '../../services/daily-missions.service';
import { GameRatingsService } from '../../services/game-ratings.service';
import { StudioOrchestrationService } from '../../services/studio-orchestration.service';
import {
  Router,
  ActivatedRoute,
  convertToParamMap,
} from '@angular/router';
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
    const gameServiceMock = {
      matchesRoom: jest.fn().mockReturnValue(true),
      filterAndSortGames: jest.fn((games: any[]) => games),
      buildIframeSandbox: jest.fn().mockReturnValue('allow-scripts'),
      buildIframeAllowAttr: jest.fn().mockReturnValue('fullscreen'),
    };
    const socialServiceMock = {
      isIncognito: signal(false),
      onlineUsers: signal([]),
      messages: signal([]),
      roomMessages: signal([]),
      activeHubTab: signal<'room' | 'dm' | 'stream' | 'friends' | 'party'>('room'),
      simulatedLiveChat: signal([]),
      matchmakingStatus: signal<'idle' | 'searching' | 'matched'>('idle'),
      currentPartyId: jest.fn().mockReturnValue(null),
      updateStatus: jest.fn(),
      loadFriends: jest.fn(),
      joinParty: jest.fn(),
      joinRoom: jest.fn(),
      sendTypingStatus: jest.fn(),
      getFeaturedUsers: jest.fn().mockResolvedValue([]),
      searchUsers: jest.fn().mockResolvedValue([]),
      sendRoomMessage: jest.fn(),
      sendMessage: jest.fn(),
      sendPartyMessage: jest.fn(),
      startStream: jest.fn(),
      stopStream: jest.fn(),
      loadMessageHistory: jest.fn(),
    };
    const inboxServiceMock = {
      challenges: signal([]),
      challengePlayer: jest.fn(),
    };
    const peerServiceMock = {
      isKnocking: signal(false),
      knockFromUserId: signal(null),
      isCallActive: signal(false),
      remoteStream: signal(null),
      voiceActivityLevel: jest.fn().mockReturnValue(0),
      startCall: jest.fn(),
      endCall: jest.fn(),
      toggleMute: jest.fn(),
    };
    const matchmakingMock = {
      cancelMatchQueue: jest.fn(),
      queueForMatch: jest.fn(),
      createLobby: jest.fn().mockReturnValue({ gameName: 'Test Game', id: 'lobby-1' }),
      toggleReady: jest.fn(),
      startCountdown: jest.fn(),
      cancelCountdown: jest.fn(),
      sendLobbyChatMessage: jest.fn(),
      startSpectateLobby: jest.fn(),
      stopSpectateLobby: jest.fn(),
      myLobby: jest.fn().mockReturnValue(null),
      startReplay: jest.fn(),
      stopReplay: jest.fn(),
      copyLobbyInviteLink: jest.fn(),
      shareLobbyInvite: jest.fn().mockResolvedValue(undefined),
      broadcastGameState: jest.fn(),
      recordGameSnapshot: jest.fn(),
    };
    const orchestrationMock = {
      requestRemix: jest.fn().mockResolvedValue(true),
      requestReview: jest.fn().mockResolvedValue(true),
      currentTarget: signal({
        projectId: 'proj-1',
        sessionId: 'sess-1',
        activeView: 'tha-spot',
        selectedTrackId: null,
        branchId: null,
        checkpointId: null,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ThaSpotComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            routeConfig: { path: 'tha-spot' },
            snapshot: {
              queryParamMap: convertToParamMap({}),
              queryParams: {},
            },
            paramMap: of(convertToParamMap({})),
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: UserProfileService, useValue: profileServiceMock },
        { provide: UIService, useValue: uiServiceMock },
        { provide: SecurityService, useValue: securityServiceMock },
        { provide: GameService, useValue: gameServiceMock },
        { provide: GamepadService, useValue: { connectedGamepad: signal(null), dpadX: signal(0), dpadY: signal(0) } },
        { provide: SocialNetworkingService, useValue: socialServiceMock },
        { provide: ChallengeInboxService, useValue: inboxServiceMock },
        { provide: PeerNetworkingService, useValue: peerServiceMock },
        { provide: SnackbarService, useValue: { info: jest.fn(), success: jest.fn(), error: jest.fn() } },
        { provide: MatchmakingService, useValue: matchmakingMock },
        { provide: DailyMissionsService, useValue: {} },
        { provide: GameRatingsService, useValue: {} },
        { provide: StudioOrchestrationService, useValue: orchestrationMock },
      ],
    })
      .overrideComponent(ThaSpotComponent, {
        set: { imports: [], template: '<div></div>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    removeListenerSpy = jest.spyOn(window, 'removeEventListener');
    fixture.detectChanges();

    const req = httpMock.expectOne('assets/data/tha-spot-feed.json');
    req.flush(mockFeed);

    // Also handle featured users call from ngOnInit
    const featuredReq = httpMock.expectOne((req) =>
      req.url.includes('/api/users/featured')
    );
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

  it('dispatches remix requests through the orchestration layer', async () => {
    const orchestration = TestBed.inject(StudioOrchestrationService) as any;

    await component.sendRemixRequest('peer-1');

    expect(orchestration.requestRemix).toHaveBeenCalledWith('peer-1');
  });
});
