import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GameService } from './game.service';
import { ThaSpotFeed } from './game';

const mockFeed: ThaSpotFeed = {
  badges: [
    { id: 'featured', label: 'Featured', tone: 'primary' },
    { id: 'tournament-live', label: 'Tournament Live', tone: 'secondary' },
    { id: 'new-drop', label: 'New Drop', tone: 'warning' },
  ],
  rooms: [
    {
      id: 'all',
      name: 'All Games',
      icon: 'grid_view',
      description: 'All cabinets.',
    },
    {
      id: 'weekend-clash',
      name: 'Weekend Clash',
      icon: 'bolt',
      description: 'Featured event room.',
      rules: { badgeIds: ['featured', 'tournament-live'] },
    },
  ],
  liveEvents: [],
  socialPresence: [],
  promotions: [],
  recommendationRails: [
    {
      id: 'returning',
      title: 'Return to your hot cabinets',
      roomIds: ['all'],
      audience: { minPlays: 1, maxPlays: 99 },
      weights: {
        history: 16,
        crowd: 4,
        badge: 3,
        room: 3,
        novelty: 1,
        genre: 1,
      },
      maxItems: 4,
    },
  ],
  games: [
    {
      id: '12',
      name: 'Hextris',
      url: 'https://hextris.github.io/hextris/',
      genre: 'Classic',
      availability: 'Online',
      rating: 4.8,
      playersOnline: 5200,
      tags: ['Arcade', 'Retro'],
      badgeIds: ['featured'],
      art: { eyebrow: 'Online', accentStart: '#06b6d4', accentEnd: '#2563eb' },
      launchConfig: {
        approvedEmbedUrl: 'https://hextris.github.io/hextris/',
        approvedExternalUrl: 'https://hextris.github.io/hextris/',
        telemetryMode: 'origin',
        telemetryOrigins: ['https://hextris.github.io'],
      },
    },
    {
      id: '13',
      name: 'Bracket Hero',
      url: '/assets/games/battlefield/battlefield.html',
      genre: 'Fighting',
      availability: 'Hybrid',
      rating: 4.9,
      playersOnline: 1400,
      tags: ['Combat', 'Multiplayer'],
      badgeIds: ['featured', 'tournament-live'],
      art: { eyebrow: 'Hybrid', accentStart: '#10b981', accentEnd: '#0f766e' },
      launchConfig: {
        approvedEmbedUrl: '/assets/games/battlefield/battlefield.html',
        approvedExternalUrl: '/assets/games/battlefield/battlefield.html',
      },
    },
    {
      id: '14',
      name: 'Tempo Lockdown',
      url: '/assets/games/tempo-lockdown/tempo-lockdown.html',
      genre: 'Rhythm',
      availability: 'Offline',
      rating: 4.7,
      playersOnline: 390,
      tags: ['Rhythm'],
      badgeIds: ['new-drop'],
      art: { eyebrow: 'Offline', accentStart: '#34d399', accentEnd: '#059669' },
      launchConfig: {
        approvedEmbedUrl: '/assets/games/tempo-lockdown/tempo-lockdown.html',
        approvedExternalUrl: '/assets/games/tempo-lockdown/tempo-lockdown.html',
      },
    },
  ],
};

describe('GameService', () => {
  let service: GameService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(GameService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads the Tha Spot feed and generates managed artwork', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('/assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    expect(games.length).toBe(3);
    expect(games.some((game) => game.availability === 'Offline')).toBe(true);
    expect(games.some((game) => game.availability === 'Online')).toBe(true);
    expect(games.some((game) => game.name === 'Hextris')).toBe(true);
    expect(games.every((game) => typeof game.image === 'string')).toBe(true);
    expect(games[0]?.launchConfig?.telemetryMode).toBeDefined();
  });

  it('filters games through data-driven room rules', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('weekend-clash'));
    httpMock.expectOne('/assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    expect(games.map((game) => game.name)).toEqual(['Hextris', 'Bracket Hero']);
  });

  it('returns the newest games first when requested', async () => {
    const pending = firstValueFrom(service.listGames({}, 'Newest'));
    httpMock.expectOne('/assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    expect(games[0].id).toBe('14');
    expect(games[1].id).toBe('13');
  });

  it('refreshes the feed when forced', async () => {
    const firstPending = firstValueFrom(service.getThaSpotFeed());
    httpMock.expectOne('/assets/data/tha-spot-feed.json').flush(mockFeed);
    await firstPending;

    const secondPending = firstValueFrom(service.getThaSpotFeed(true));
    httpMock.expectOne('/assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        ...mockFeed.games,
        { ...mockFeed.games[0], id: '15', name: 'Reloaded' },
      ],
    });
    const refreshed = await secondPending;

    expect(refreshed.games.some((game) => game.id === '15')).toBe(true);
  });
});
