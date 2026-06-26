import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { GameService } from './game.service';
import { ThaSpotFeed } from './game';

const mockFeed: ThaSpotFeed = {
  badges: [],
  rooms: [
    {
      id: 'weekend-clash',
      name: 'Weekend Clash',
      icon: 'star',
      description: '',
      rules: { tags: ['Featured'] },
    },
    {
      id: 'rpg-vault',
      name: 'RPG Vault',
      icon: 'book',
      description: '',
      rules: { genres: ['RPG'] },
    },
  ],
  liveEvents: [],
  recommendationRails: [],
  games: [
    {
      id: '12',
      name: 'Hextris',
      genre: 'Puzzle',
      genres: ['Puzzle'],
      tags: ['Featured'],
      url: 'https://hextris.github.io/hextris/',
      launchConfig: {
        embedMode: 'inline',
        approvedEmbedUrl: 'https://hextris.github.io/hextris/',
        approvedExternalUrl: 'https://hextris.github.io/hextris/',
        telemetryMode: 'origin',
        telemetryOrigins: ['https://hextris.github.io'],
      },
    },
    {
      id: '13',
      name: 'Quest Relay',
      genre: 'RPG',
      genres: ['RPG'],
      tags: [],
      url: '/assets/games/quest-relay/index.html',
    },
    {
      id: '14',
      name: 'Bracket Hero',
      genre: 'Rhythm',
      genres: ['Rhythm'],
      tags: ['Featured'],
      url: '/assets/games/bracket-hero/index.html',
      releaseDate: '2026-01-01',
    },
    {
      id: '15',
      name: 'Tempo Lockdown',
      genre: 'Strategy',
      genres: ['Strategy'],
      tags: [],
      url: '/assets/games/tempo-lockdown/index.html',
      releaseDate: '2026-02-01',
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

  it('routes third-party cabinets to external launches while keeping managed games inline', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    const remoteGame = games.find((game) => game.id === '12');
    expect(remoteGame?.launchConfig).toEqual(
      expect.objectContaining({
        embedMode: 'inline',
        approvedEmbedUrl: 'https://hextris.github.io/hextris/',
        approvedExternalUrl: 'https://hextris.github.io/hextris/',
      })
    );
  });

  it('filters games through data-driven room rules', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('weekend-clash'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    const names = games.map((g) => g.name);
    expect(names).toContain('Hextris');
    expect(names).toContain('Bracket Hero');
  });

  it('supports tag-driven room discovery for RPG cabinets', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('rpg-vault'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    expect(games.map((game) => game.name)).toEqual(['Quest Relay']);
  });

  it('returns the newest games first when requested', async () => {
    const pending = firstValueFrom(service.listGames({}, 'Newest'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    expect(games[0].id).toBe('15');
    expect(games[1].id).toBe('14');
  });

  it('refreshes the feed when forced', async () => {
    const firstPending = firstValueFrom(service.getThaSpotFeed());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    await firstPending;

    const secondPending = firstValueFrom(service.getThaSpotFeed(true));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    await secondPending;
  });
});
