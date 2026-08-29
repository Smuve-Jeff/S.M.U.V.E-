import { BehaviorSubject, of } from 'rxjs';
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
import { ShareableInviteService } from '../../services/shareable-invite.service';
import { DailyMissionsService } from '../../services/daily-missions.service';
import { GameRatingsService } from '../../services/game-ratings.service';
import { StudioOrchestrationService } from '../../services/studio-orchestration.service';
import {
  Router,
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
} from '@angular/router';
import { signal } from '@angular/core';

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
  let removeListenerSpy: jest.SpyInstance;
  let routerMock: { navigate: jest.Mock };
  let routeQueryParamMap: BehaviorSubject<ParamMap>;
  let socialServiceMock: any;
  let inboxServiceMock: any;
  let matchmakingMock: any;
  let profileServiceMock: any;

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
    profileServiceMock = {
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
    routerMock = { navigate: jest.fn() };
    routeQueryParamMap = new BehaviorSubject(convertToParamMap({}));
    socialServiceMock = {
      isIncognito: signal(false),
      onlineUsers: signal([]),
      messages: signal([]),
      roomMessages: signal([]),
      activeHubTab: signal<'room' | 'dm' | 'stream' | 'friends' | 'party'>(
        'room'
      ),
      simulatedLiveChat: signal([]),
      matchmakingStatus: signal<'idle' | 'searching' | 'matched'>('idle'),
      typingUsers: signal<Record<string, boolean>>({}),
      pendingPartyInvite: signal(null),
      pendingNeuralSync: signal(null),
      currentPartyId: jest.fn().mockReturnValue(null),
      updateStatus: jest.fn(),
      loadFriends: jest.fn(),
      joinParty: jest.fn(),
      joinRoom: jest.fn(),
      sendTypingStatus: jest.fn(),
      acceptPartyInvite: jest.fn(),
      declinePartyInvite: jest.fn(),
      acceptNeuralSyncRequest: jest.fn(),
      declineNeuralSyncRequest: jest.fn(),
      getFeaturedUsers: jest.fn().mockResolvedValue([]),
      searchUsers: jest.fn().mockResolvedValue([]),
      sendRoomMessage: jest.fn(),
      sendMessage: jest.fn(),
      sendPartyMessage: jest.fn(),
      startStream: jest.fn(),
      stopStream: jest.fn(),
      loadMessageHistory: jest.fn(),
    };
    inboxServiceMock = {
      challenges: signal([]),
      challengePlayer: jest.fn(),
      respondToChallenge: jest.fn(),
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
    matchmakingMock = {
      cancelMatchQueue: jest.fn(),
      queueForMatch: jest.fn(),
      createLobby: jest
        .fn()
        .mockReturnValue({ gameName: 'Test Game', id: 'lobby-1' }),
      toggleReady: jest.fn(),
      clearMatchState: jest.fn(),
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
        { provide: Router, useValue: routerMock },
        {
          provide: ActivatedRoute,
          useValue: {
            routeConfig: { path: 'tha-spot' },
            snapshot: {
              queryParamMap: convertToParamMap({}),
              queryParams: {},
            },
            paramMap: of(convertToParamMap({})),
            queryParamMap: routeQueryParamMap,
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

  it('defaults to the full catalog (room all) on load', () => {
    expect(component.activeRoom()).toBe('all');
    expect(socialServiceMock.joinRoom).toHaveBeenCalledWith('all');
  });

  it('mirrors a room selection into the URL as a navigable filter', () => {
    component.selectRoom('arcade');
    expect(component.activeRoom()).toBe('arcade');
    expect(routerMock.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ room: 'arcade' }),
        queryParamsHandling: 'merge',
      })
    );
  });

  it('restores the room filter from the URL reactively', () => {
    routeQueryParamMap.next(convertToParamMap({ room: 'arcade' }));
    fixture.detectChanges();
    expect(component.activeRoom()).toBe('arcade');
  });

  it('restores genre/platform/search filters from the URL', () => {
    routeQueryParamMap.next(
      convertToParamMap({ genre: 'RPG', platform: 'SNES', q: 'mario' })
    );
    fixture.detectChanges();
    expect(component.activeGenre()).toBe('RPG');
    expect(component.activePlatform()).toBe('SNES');
    expect(component.searchQuery()).toBe('mario');
  });

  it('resets filters back to the full catalog when the URL drops them', () => {
    component.selectRoom('arcade');
    expect(component.activeRoom()).toBe('arcade');
    routeQueryParamMap.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(component.activeRoom()).toBe('all');
  });

  it('persists an accepted banner challenge so the challenger is notified', () => {
    component.incomingChallenge.set({
      id: 7,
      fromUserId: 'rival-1',
      fromUserName: 'RIVAL',
      gameId: 'game-1',
      timestamp: 1,
    });
    component.acceptIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      7,
      'accepted'
    );
    expect(component.incomingChallenge()).toBeNull();
  });

  it('persists a declined banner challenge so the challenger is notified', () => {
    component.incomingChallenge.set({
      id: 8,
      fromUserId: 'rival-1',
      gameId: 'game-1',
      timestamp: 1,
    });
    component.declineIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      8,
      'declined'
    );
    expect(component.incomingChallenge()).toBeNull();
  });

  it('falls back to the matching pending record for id-less deep-link challenges', () => {
    inboxServiceMock.challenges.set([
      {
        id: 42,
        fromUserId: 'rival-1',
        fromUserName: 'RIVAL',
        toUserId: profileServiceMock.profile().id,
        gameId: 'game-1',
        status: 'pending',
        timestamp: 1,
      },
    ]);
    component.incomingChallenge.set({
      fromUserId: 'rival-1',
      gameId: 'game-1',
      timestamp: 1,
    });
    component.acceptIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      42,
      'accepted'
    );
  });

  it('carries the active split-screen lobby id into split-screen share links', async () => {
    const shareable = TestBed.inject(ShareableInviteService);
    const buildSpy = jest.spyOn(shareable, 'buildShareIntent');
    matchmakingMock.activeSplitLobby = jest
      .fn()
      .mockReturnValue({ id: 'split_abc' });
    component.selectedGame.set({ id: 'game-1', name: 'Game One' } as any);
    await component.shareSelectedGame('split-screen');
    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'split-screen',
        gameId: 'game-1',
        lobbyId: 'split_abc',
      })
    );
    buildSpy.mockRestore();
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

  it('offers an external launch dialog only for safe web URLs', () => {
    component.selectedGame.set({
      id: 'ext-safe',
      name: 'External Safe',
      genre: 'Arcade',
      url: 'https://untrusted.example/game',
      launchConfig: { embedMode: 'external-only' },
    } as any);

    component.confirmLaunch();

    expect(component.showExternalConfirm()).toBe(true);
    expect(component.externalTargetUrl()).toBe('https://untrusted.example/game');
    expect(component.externalTargetDomain()).toBe('untrusted.example');
  });

  it('refuses non-web external launch URLs before showing the dialog', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      component.selectedGame.set({
        id: 'ext-evil',
        name: 'External Evil',
        genre: 'Arcade',
        url: 'javascript:alert(1)',
        launchConfig: { embedMode: 'external-only' },
      } as any);

      component.confirmLaunch();

      expect(component.showExternalConfirm()).toBe(false);
      expect(component.externalTargetUrl()).toBe('');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('opens only http(s) targets from the external-launch dialog', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    try {
      component.externalTargetUrl.set('https://example.test/game');
      component.showExternalConfirm.set(true);

      component.confirmExternalLaunch();

      expect(openSpy).toHaveBeenCalledWith(
        'https://example.test/game',
        '_blank',
        'noopener,noreferrer'
      );
      expect(component.showExternalConfirm()).toBe(false);
      expect(component.selectedGame()).toBeNull();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('never opens non-web targets from the external-launch dialog', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    try {
      component.externalTargetUrl.set('javascript:alert(1)');
      component.showExternalConfirm.set(true);

      component.confirmExternalLaunch();

      expect(openSpy).not.toHaveBeenCalled();
      expect(component.showExternalConfirm()).toBe(false);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('recreates the game frame through the state-driven retry machine', () => {
    jest.useFakeTimers();
    try {
      component.currentGame.set({
        id: 'retry-1',
        url: '/assets/games/demo.html',
        launchConfig: { embedMode: 'inline' },
      } as any);
      component.gameLoadError.set(true);

      component.retryGameLoad();

      // Error held during the swap window so *ngIf removes the dead iframe
      expect(component.gameLoadError()).toBe(true);
      expect(component.gameLoadStage()).toBe('loading');

      jest.advanceTimersByTime(1);

      // Error cleared -> *ngIf recreates a FRESH iframe; watchdog re-armed
      expect(component.gameLoadError()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
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

  it('clears the live typing indicator when a DM is submitted', () => {
    component.activeHubTab.set('dm');
    component.dmTargetUserId.set('peer-1');
    component.chatInput.set('yo');

    component.handleChatSubmit();

    expect(socialServiceMock.sendMessage).toHaveBeenCalledWith('peer-1', 'yo');
    expect(socialServiceMock.sendTypingStatus).toHaveBeenCalledWith(
      'peer-1',
      false
    );
    expect(component.chatInput()).toBe('');
  });

  it('never silently drops squad chat when no squad exists', () => {
    const snackbar = TestBed.inject(SnackbarService) as any;
    component.activeHubTab.set('party');
    component.chatInput.set('lets run it');

    component.handleChatSubmit();

    expect(socialServiceMock.sendPartyMessage).not.toHaveBeenCalled();
    expect(snackbar.info).toHaveBeenCalledWith(
      'JOIN OR CREATE A SQUAD BEFORE CHATTING'
    );
    expect(component.chatInput()).toBe('');
  });

  it('reports the DM typing state for the active target reactively', () => {
    component.dmTargetUserId.set('peer-1');
    fixture.detectChanges();
    expect(component.dmTyping()).toBe(false);

    socialServiceMock.typingUsers.set({ 'peer-1': true });
    fixture.detectChanges();
    expect(component.dmTyping()).toBe(true);

    socialServiceMock.typingUsers.set({ 'peer-1': false });
    fixture.detectChanges();
    expect(component.dmTyping()).toBe(false);
  });

  it('resets stale matchmaking state when the queue is cancelled', () => {
    component.selectedGame.set({ id: 'game-1' } as any);
    socialServiceMock.matchmakingStatus.set('matched');
    component.isMatchmaking.set(true);

    component.cancelMatchmaking();

    expect(matchmakingMock.cancelMatchQueue).toHaveBeenCalledWith('game-1');
    expect(matchmakingMock.clearMatchState).toHaveBeenCalled();
    expect(socialServiceMock.matchmakingStatus()).toBe('idle');
    expect(component.isMatchmaking()).toBe(false);
  });

  it('clears stale match state when engaging the AI bot after no rivals found', () => {
    component.selectedGame.set({ id: 'game-1' } as any);
    socialServiceMock.matchmakingStatus.set('searching');

    component.engageAiBot();

    expect(matchmakingMock.clearMatchState).toHaveBeenCalled();
    expect(socialServiceMock.matchmakingStatus()).toBe('idle');
    expect(component.showBotOption()).toBe(false);
  });

  it('accepts a squad invite through the social layer and opens the party tab', () => {
    component.acceptPartyInvite('party-9');

    expect(socialServiceMock.acceptPartyInvite).toHaveBeenCalledWith('party-9');
    expect(component.activeHubTab()).toBe('party');
    expect(component.showRivalHub()).toBe(true);
  });

  it('declines a squad invite and notifies the user', () => {
    const snackbar = TestBed.inject(SnackbarService) as any;

    component.declinePartyInvite();

    expect(socialServiceMock.declinePartyInvite).toHaveBeenCalled();
    expect(snackbar.info).toHaveBeenCalledWith('SQUAD INVITE DECLINED');
  });

  it('routes neural sync accept/decline through the social layer', () => {
    component.acceptNeuralSync('peer-2');
    expect(socialServiceMock.acceptNeuralSyncRequest).toHaveBeenCalledWith(
      'peer-2'
    );

    component.declineNeuralSync();
    expect(socialServiceMock.declineNeuralSyncRequest).toHaveBeenCalled();
  });
});
