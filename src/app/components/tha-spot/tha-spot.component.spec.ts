import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ThaSpotComponent } from './tha-spot.component';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { ThaSpotFeed } from '../../hub/game';

const mockFeed: ThaSpotFeed = {
  badges: [
    { id: 'featured', label: 'Featured', tone: 'primary' },
    { id: 'tournament-live', label: 'Tournament Live', tone: 'secondary' },
    { id: 'staff-pick', label: 'Staff Pick', tone: 'accent' },
  ],
  rooms: [
    {
      id: 'all',
      name: 'All Games',
      icon: 'grid_view',
      description: 'Everything on the floor.',
    },
    {
      id: 'versus-night',
      name: 'Versus Night',
      icon: 'sports_kabaddi',
      description: 'Competitive brackets.',
      rules: { tags: ['Multiplayer', 'Combat'], badgeIds: ['tournament-live'] },
    },
    {
      id: 'producer-lounge',
      name: 'Producer Lounge',
      icon: 'music_note',
      description: 'Rhythm-first picks.',
      rules: { genres: ['Rhythm'], tags: ['Rhythm'] },
    },
  ],
  liveEvents: [
    {
      id: 'event-1',
      title: 'Live Bracket',
      description: 'Queue into the main event.',
      roomId: 'versus-night',
      reward: 'Clash Banner',
      status: 'live',
      windowLabel: 'Live now',
      featuredGameId: '1',
      badgeId: 'tournament-live',
      schedule: {
        startAt: '2026-04-04T20:00:00.000Z',
        endAt: '2026-04-07T05:00:00.000Z',
        recurrence: 'weekend',
        rewardType: 'cosmetic',
      },
    },
    {
      id: 'event-2',
      title: 'Daily Producer Challenge',
      description: 'Keep the rhythm line alive.',
      roomId: 'producer-lounge',
      reward: 'Studio skin',
      status: 'upcoming',
      windowLabel: 'Starts soon',
      featuredGameId: '2',
      badgeId: 'staff-pick',
      schedule: {
        startAt: '2026-04-06T20:00:00.000Z',
        endAt: '2026-04-07T20:00:00.000Z',
        recurrence: 'daily',
        rewardType: 'cosmetic',
      },
    },
  ],
  socialPresence: [
    {
      id: 'presence-1',
      name: 'MixMaven',
      status: 'hosting',
      activity: 'Hosting in Tha Battlefield',
      roomId: 'versus-night',
      gameId: '1',
      relationship: 'party',
      joinable: true,
      cta: 'Join party',
    },
    {
      id: 'presence-2',
      name: 'StudioGhost',
      status: 'invited',
      activity: 'Invite waiting in Tempo Lockdown',
      roomId: 'producer-lounge',
      gameId: '2',
      relationship: 'invite',
      pendingInvite: true,
      cta: 'Accept invite',
      alert: 'Invite expires soon.',
    },
  ],
  promotions: [
    {
      id: 'promo-1',
      title: 'Open Studio',
      description: 'Jump back into a session.',
      route: '/studio',
      icon: 'tune',
      cta: 'Open Studio',
      roomIds: ['producer-lounge'],
      audienceTags: ['producer', 'returning'],
      priority: 10,
      campaignType: 'studio',
    },
  ],
  leaderboards: [
    {
      id: 'board-1',
      label: 'Weekly bracket',
      score: '12,000',
      roomId: 'versus-night',
      trend: '+8%',
    },
  ],
  recommendationRails: [
    {
      id: 'producer-rail',
      title: 'Producer crossover',
      subtitle: 'Music-first feed picks.',
      audience: { primaryGenres: ['Hip Hop'], minPlays: 0, maxPlays: 99 },
      roomIds: ['all', 'producer-lounge'],
      weights: {
        genre: 12,
        history: 8,
        crowd: 4,
        badge: 4,
        room: 6,
        novelty: 3,
      },
      maxItems: 4,
    },
    {
      id: 'returning-rail',
      title: 'Return to your hot cabinets',
      subtitle: 'History-weighted picks.',
      audience: { minPlays: 1, maxPlays: 99 },
      roomIds: ['all', 'versus-night', 'producer-lounge'],
      weights: {
        history: 18,
        crowd: 3,
        badge: 2,
        room: 2,
        novelty: 1,
        genre: 1,
      },
      maxItems: 4,
    },
  ],
  games: [
    {
      id: '1',
      name: 'Tha Battlefield',
      url: '/assets/games/battlefield/battlefield.html',
      genre: 'Music Battle',
      availability: 'Hybrid',
      rating: 4.9,
      playersOnline: 1200,
      tags: ['Multiplayer', 'Combat'],
      multiplayerType: 'Server',
      badgeIds: ['featured', 'tournament-live'],
      queueEstimateMinutes: 2,
      sessionObjectives: ['Win two rounds'],
      controlHints: ['Use rhythm lanes'],
      launchConfig: {
        difficulty: 'Competitive',
        controls: ['Keyboard'],
        objectives: ['Finish top three'],
        modes: ['Tournament'],
        embedMode: 'inline',
        approvedEmbedUrl: '/assets/games/battlefield/battlefield.html',
        approvedExternalUrl: '/assets/games/battlefield/battlefield.html',
        telemetryMode: 'frame-only',
      },
      art: { eyebrow: 'Hybrid', accentStart: '#10b981', accentEnd: '#0f766e' },
    },
    {
      id: '2',
      name: 'Tempo Lockdown',
      url: '/assets/games/tempo-lockdown/tempo-lockdown.html',
      genre: 'Rhythm',
      availability: 'Offline',
      rating: 4.8,
      playersOnline: 390,
      tags: ['Rhythm', 'Original'],
      badgeIds: ['staff-pick'],
      queueEstimateMinutes: 0,
      sessionObjectives: ['Hit a streak'],
      controlHints: ['Use lane keys'],
      launchConfig: {
        difficulty: 'Adaptive',
        controls: ['Lane keys'],
        objectives: ['Finish one perfect chorus'],
        modes: ['Solo'],
        embedMode: 'inline',
        approvedEmbedUrl: '/assets/games/tempo-lockdown/tempo-lockdown.html',
        approvedExternalUrl: '/assets/games/tempo-lockdown/tempo-lockdown.html',
        telemetryMode: 'frame-only',
      },
      art: { eyebrow: 'Offline', accentStart: '#34d399', accentEnd: '#059669' },
    },
  ],
};

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
  let httpMock: HttpTestingController;

  const profileServiceMock = {
    profile: signal({
      artistName: 'Test Artist',
      primaryGenre: 'Hip Hop',
      settings: {
        ui: {
          theme: 'Dark',
          performanceMode: false,
          showScanlines: false,
          animationsEnabled: true,
        },
        audio: { masterVolume: 0.8, autoSaveEnabled: true },
        ai: { kbWriteAccess: true, commanderPersona: 'Elite' },
        security: { twoFactorEnabled: false },
      },
      knowledgeBase: { strategicHealthScore: 82 },
      careerGoals: [],
      equipment: [],
      daw: [],
      catalog: [],
      gameStats: {
        '2': {
          plays: 2,
          lastPlayedAt: Date.now() - 5000,
          currentStreak: 2,
        },
      },
      thaSpotProgression: {
        currentStreak: 2,
        favoriteRoomId: 'producer-lounge',
        earnedCosmetics: ['Weekend skin'],
      },
    }),
    recordGameLaunch: jest.fn().mockResolvedValue(undefined),
  };

  const uiServiceMock = {
    activeTheme: signal({ name: 'Dark' }),
    mainViewMode: signal('tha-spot'),
    navigateToView: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    await TestBed.configureTestingModule({
      imports: [ThaSpotComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserProfileService, useValue: profileServiceMock },
        { provide: UIService, useValue: uiServiceMock },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne('/assets/data/tha-spot-feed.json').flush(mockFeed);
    component.now.set(new Date('2026-04-06T21:00:00.000Z').getTime());
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.gamingRooms().length).toBe(3);
  });

  it('should switch to dynamic rooms and filter games', fakeAsync(() => {
    component.setActiveRoom('producer-lounge');
    tick(241);

    expect(component.activeRoom()).toBe('producer-lounge');
    expect(component.filteredGames().map((game) => game.name)).toEqual([
      'Tempo Lockdown',
    ]);
    expect(component.getActiveRoomName()).toBe('Producer Lounge');
  }));

  it('surfaces feed-driven recommendations and live metrics', () => {
    expect(component.activeRecommendationRail()?.title).toBe(
      'Producer crossover'
    );
    expect(component.recommendedGames().length).toBeGreaterThan(0);
    expect(component.recentlyPlayed()[0].name).toBe('Tempo Lockdown');
    expect(component.liveMetrics().roomPlayers).toBe(1590);
    expect(component.activitySummary().favoriteRoomLabel).toBe(
      'Producer Lounge'
    );
  });

  it('changes recommendation rails when the profile type changes', () => {
    profileServiceMock.profile.update((profile) => ({
      ...profile,
      primaryGenre: 'Classical',
      gameStats: {
        ...profile.gameStats,
        '1': { plays: 5, lastPlayedAt: Date.now() },
      },
      thaSpotProgression: {
        ...profile.thaSpotProgression,
        currentStreak: 4,
      },
    }));
    fixture.detectChanges();

    expect(component.activeRecommendationRail()?.title).toBe(
      'Return to your hot cabinets'
    );
  });

  it('resolves scheduled events from the live feed clock', fakeAsync(() => {
    component.setActiveRoom('producer-lounge');
    tick(241);
    component.now.set(new Date('2026-04-06T19:30:00.000Z').getTime());
    fixture.detectChanges();

    expect(component.activeEvents()[0]?.status).toBe('upcoming');

    component.now.set(new Date('2026-04-06T21:00:00.000Z').getTime());
    fixture.detectChanges();

    expect(component.activeEvents()[0]?.status).toBe('live');
  }));

  it('opens a governed preview before starting a game', () => {
    component.previewGame(mockFeed.games[0]!);

    expect(component.selectedGame()?.name).toBe('Tha Battlefield');
    expect(component.launchWarning()).toContain('Exact embed target verified');
  });

  it('runs matchmaking for multiplayer games before launch', fakeAsync(() => {
    component.previewGame(component.games()[0]!);
    component.confirmLaunch();

    expect(component.isMatchmaking()).toBe(true);
    tick(4000);
    tick(700);

    expect(component.isMatchmaking()).toBe(false);
    expect(component.currentGame()?.id).toBe('1');
    expect(profileServiceMock.recordGameLaunch).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        roomId: 'all',
        eventId: 'event-1',
      })
    );
  }));

  it('launches solo games immediately from the preview flow', async () => {
    component.previewGame(component.games()[1]!);
    component.confirmLaunch();

    expect(component.currentGame()?.id).toBe('2');
    expect(profileServiceMock.recordGameLaunch).toHaveBeenCalledWith(
      '2',
      expect.objectContaining({
        roomId: 'all',
      })
    );
  });

  it('blocks inline launch when a cabinet requires external governance', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const game = {
      ...component.games()[0]!,
      launchConfig: {
        ...component.games()[0]!.launchConfig,
        embedMode: 'external-only' as const,
      },
    };

    component.previewGame(game);
    component.confirmLaunch();

    expect(openSpy).toHaveBeenCalled();
    expect(component.currentGame()).toBeNull();
  });

  it('ignores posted scores when sessions end', () => {
    const sourceWindow = {} as Window;
    const sessionCallCount =
      profileServiceMock.recordGameLaunch.mock.calls.length;
    component.currentGame.set(component.games()[0]!);
    (component as any).gameIframe = {
      nativeElement: { contentWindow: sourceWindow },
    };

    component.onMessage({
      data: { type: 'GAME_OVER', payload: { score: 999999999 } },
      origin: 'http://localhost',
      source: sourceWindow,
    } as MessageEvent);

    expect(profileServiceMock.recordGameLaunch.mock.calls).toHaveLength(
      sessionCallCount
    );
  });
});
