import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
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
      reward: '500 XP',
      status: 'live',
      windowLabel: 'Live now',
      featuredGameId: '1',
      badgeId: 'tournament-live',
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
        inlinePolicy: 'trusted',
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
        inlinePolicy: 'trusted',
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
      xp: 320,
      level: 3,
      achievements: [],
      gameStats: {
        '2': { plays: 2, lastPlayedAt: Date.now() - 5000, bestScore: 900 },
      },
    }),
    recordGameSession: jest.fn().mockResolvedValue(undefined),
    recordGameResult: jest.fn().mockResolvedValue(undefined),
    awardXp: jest.fn().mockResolvedValue(undefined),
    unlockAchievement: jest.fn().mockResolvedValue(undefined),
  };

  const uiServiceMock = {
    activeTheme: signal({ name: 'Dark' }),
    mainViewMode: signal('tha-spot'),
    navigateToView: jest.fn(),
  };

  beforeEach(async () => {
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
    expect(component.filteredGames().map((game) => game.name)).toEqual(['Tempo Lockdown']);
    expect(component.getActiveRoomName()).toBe('Producer Lounge');
  }));

  it('surfaces personalized recommendations and live metrics', () => {
    expect(component.recommendedGames().length).toBeGreaterThan(0);
    expect(component.recentlyPlayed()[0].name).toBe('Tempo Lockdown');
    expect(component.liveMetrics().roomPlayers).toBe(1590);
  });

  it('opens a prelaunch preview before starting a game', () => {
    component.previewGame(mockFeed.games[0]!);

    expect(component.selectedGame()?.name).toBe('Tha Battlefield');
    expect(component.launchWarning()).toContain('Trusted source');
  });

  it('runs matchmaking for multiplayer games before launch', fakeAsync(() => {
    component.previewGame(mockFeed.games[0]!);
    component.confirmLaunch();

    expect(component.isMatchmaking()).toBe(true);
    tick(4000);
    tick(700);

    expect(component.isMatchmaking()).toBe(false);
    expect(component.currentGame()?.id).toBe('1');
    expect(profileServiceMock.recordGameSession).toHaveBeenCalledWith('1');
  }));

  it('launches solo games immediately from the preview flow', async () => {
    component.previewGame(mockFeed.games[1]!);
    component.confirmLaunch();

    expect(component.currentGame()?.id).toBe('2');
    expect(profileServiceMock.recordGameSession).toHaveBeenCalledWith('2');
  });
});
