import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
import { Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
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
      getThaSpotFeed: jest.fn().mockReturnValue(of(mockFeed)),
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
      activeHubTab: signal<'room' | 'dm' | 'stream' | 'friends' | 'party'>(
        'room'
      ),
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
      createLobby: jest
        .fn()
        .mockReturnValue({ gameName: 'Test Game', id: 'lobby-1' }),
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
      imports: [ThaSpotComponent],
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
        {
          provide: GamepadService,
          useValue: {
            connectedGamepad: signal(null),
            dpadX: signal(0),
            dpadY: signal(0),
          },
        },
        { provide: SocialNetworkingService, useValue: socialServiceMock },
        { provide: ChallengeInboxService, useValue: inboxServiceMock },
        { provide: PeerNetworkingService, useValue: peerServiceMock },
        {
          provide: SnackbarService,
          useValue: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
        },
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
    removeListenerSpy = jest.spyOn(window, 'removeEventListener');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
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

  it('keeps the rival chat drawer collapsed until explicitly toggled', () => {
    expect(component.showRivalHub()).toBe(false);

    component.toggleRivalHub();
    expect(component.showRivalHub()).toBe(true);

    component.toggleRivalHub();
    expect(component.showRivalHub()).toBe(false);
  });

  it('keeps strategic intel collapsed until explicitly toggled', () => {
    expect(component.showIntelPanel()).toBe(false);

    component.toggleIntel();
    expect(component.showIntelPanel()).toBe(true);

    component.toggleIntel();
    expect(component.showIntelPanel()).toBe(false);
  });

  it('uses an existing fallback asset for stale local catalog art', () => {
    expect(
      component.getGameImage({
        id: 'missing-art',
        name: 'Missing Art',
        genre: 'Arcade',
        url: 'https://example.test/game',
        image: '/assets/games/missing-art.png',
      })
    ).toBe('assets/hub/home-backdrop-command.png');

    const image = document.createElement('img');
    component.onGameImageError({ target: image } as unknown as Event);
    expect(image.src).toContain('/assets/hub/home-backdrop-command.png');
  });

  it('only treats remote art as real card art so tiles avoid stale placeholders', () => {
    const base = {
      id: 'art-check',
      name: 'Art Check',
      genre: 'Arcade',
      url: 'https://example.test/game',
    };
    expect(component.hasRealGameArt({ ...base, image: undefined })).toBe(false);
    expect(
      component.hasRealGameArt({
        ...base,
        image: '/assets/games/art-check.png',
      })
    ).toBe(false);
    expect(
      component.hasRealGameArt({
        ...base,
        image: 'assets/hub/home-backdrop-command.png',
      })
    ).toBe(false);
    expect(
      component.hasRealGameArt({
        ...base,
        image: 'https://cdn.example.test/art-check.png',
      })
    ).toBe(true);
  });

  it('routes untrusted and X-Frame-blocked embed hosts to external launch', () => {
    const untrusted = component.resolveLaunchMode({
      id: 'x',
      url: 'https://untrusted.example/game',
      launchConfig: {
        embedMode: 'inline',
        approvedEmbedUrl: 'https://untrusted.example/game',
      },
    } as any);
    expect(untrusted).toBe('external');

    // Gamepix /play/ pages send X-Frame-Options: SAMEORIGIN + CSP
    // frame-ancestors 'self', so they must open externally, not inline.
    const gamepix = component.resolveLaunchMode({
      id: 'y',
      url: 'https://www.gamepix.com/play/pac-man',
      launchConfig: {
        embedMode: 'inline',
        approvedEmbedUrl: 'https://www.gamepix.com/play/pac-man',
      },
    } as any);
    expect(gamepix).toBe('external');

    // retrogames.cc /embed/ endpoints carry no framing headers, so the
    // provider's iframe contract plays inline.
    const retro = component.resolveLaunchMode({
      id: 'z',
      url: 'https://www.retrogames.cc/embed/3654-super-mario-bros-nes.html',
      launchConfig: {
        embedMode: 'inline',
        approvedEmbedUrl:
          'https://www.retrogames.cc/embed/3654-super-mario-bros-nes.html',
      },
    } as any);
    expect(retro).toBe('inline');
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

  it('accepts trusted cabinet telemetry from the active iframe origin', () => {
    const matchmaking = TestBed.inject(MatchmakingService) as any;
    const frameWindow = {} as Window;
    component.gameIframe = {
      nativeElement: { contentWindow: frameWindow },
    } as any;
    component.currentGame.set({
      id: '2',
      name: 'Gamepix Title',
      url: 'https://www.gamepix.com/play/arcade',
      launchConfig: {
        embedMode: 'inline',
        approvedEmbedUrl: 'https://www.gamepix.com/play/arcade',
      },
    } as any);

    const message = {
      origin: 'https://www.gamepix.com',
      source: frameWindow,
      data: { type: 'GAME_STATE_UPDATE', data: { score: 12, level: 2 } },
    } as MessageEvent;

    component.onMessage(message);

    expect(matchmaking.broadcastGameState).toHaveBeenCalledWith({
      score: 12,
      progress: undefined,
      level: 2,
      alive: undefined,
      position: undefined,
      custom: undefined,
    });
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
