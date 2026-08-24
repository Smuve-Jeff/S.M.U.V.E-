import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { GameService } from './game.service';
import { ThaSpotFeed } from './game';
import { THA_SPOT_FALLBACK_FEED } from './tha-spot-feed.fallback';
import { CURATED_POKI_GAMES } from './tha-spot-curated-games';

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

  it('repairs known drifting cabinet titles and launch targets', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        {
          ...mockFeed.games[0],
          id: 'tactical-squad',
          name: 'Tactical Squad',
          url: 'https://www.gamepix.com/play/tactical-squad',
        },
      ],
    });
    const games = await pending;

    expect(
      games
        .filter((game) => game.id === 'tactical-squad')
        .map((game) => ({ id: game.id, name: game.name, url: game.url }))
    ).toEqual([
      {
        id: 'tactical-squad',
        name: 'Special Strike: Operations',
        url: 'https://www.gamepix.com/play/special-strike-operations',
      },
    ]);
  });

  it('forces wrong-game elite cabinets to launch externally', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        {
          ...mockFeed.games[0],
          id: 'mgs3-snake-eater-ps2-elite',
          name: 'Metal Gear Solid 3: Snake Eater',
          url: 'https://www.gamepix.com/play/snake',
          launchConfig: {
            embedMode: 'inline',
            approvedEmbedUrl: 'https://www.gamepix.com/play/snake',
            approvedExternalUrl:
              'https://www.retrogames.cc/embed/41229-metal-gear-solid-3-snake-eater-usa.html',
          },
        },
      ],
    });
    const games = await pending;

    const repairedGame = games.find(
      (game) => game.id === 'mgs3-snake-eater-ps2-elite'
    );
    // The fabricated retrogames cabinet is gone; the wrong-game gamepix embed
    // must never play inline — it can only open externally.
    expect(repairedGame).toBeTruthy();
    expect(repairedGame?.launchConfig?.embedMode).toBe('external-only');
    expect(repairedGame?.launchConfig?.approvedEmbedUrl).toBeUndefined();
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

  it('allows online multiplayer cabinets to match co-op and PvP room rules even without a tag', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('co-op-link'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        {
          id: 'server-match',
          name: 'Server Match',
          genre: 'FPS',
          tags: ['Arena'],
          multiplayerType: 'Server',
          url: 'https://example.test/server-match',
        },
      ],
    });
    const games = await pending;

    expect(games.map((game) => game.id)).toContain('server-match');
    expect(games.filter((game) => game.id === 'server-match')).toHaveLength(1);
  });

  it('grants live audio/video permissions to real online multiplayer sessions', () => {
    const game = {
      id: 'server-match',
      name: 'Server Match',
      genre: 'FPS',
      tags: ['Arena'],
      multiplayerType: 'Server',
      url: 'https://example.test/server-match',
    } as any;

    const allowAttr = service.buildIframeAllowAttr(game);

    expect(allowAttr).toContain('microphone');
    expect(allowAttr).toContain('camera');
    expect(allowAttr).toContain('display-capture');
  });

  it('keeps non-multiplayer cabinets on the strict iframe permissions policy', () => {
    const game = {
      id: 'solo-puzzle',
      name: 'Solo Puzzle',
      genre: 'Puzzle',
      tags: ['Solo'],
      multiplayerType: 'None',
      url: 'https://example.test/solo-puzzle',
    } as any;

    const allowAttr = service.buildIframeAllowAttr(game);

    expect(allowAttr).not.toContain('microphone');
    expect(allowAttr).not.toContain('camera');
    expect(allowAttr).not.toContain('display-capture');
  });

  it('merges the Shooting facet across Shooting, FPS, and Shooter genres', async () => {
    const pending = firstValueFrom(
      service.listGames({ genre: 'Shooting' }, 'Name')
    );
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        {
          id: 'shoot-arcade',
          name: 'Aim Arcade',
          genre: 'Shooting',
          tags: [],
          url: 'https://example.test/shoot-arcade',
        },
        {
          id: 'fps-engine',
          name: 'First-Person Engine',
          genre: 'FPS',
          tags: [],
          url: 'https://example.test/fps-engine',
        },
        {
          id: 'shmup',
          name: 'Vertical Shmup',
          genre: 'Shooter',
          tags: [],
          url: 'https://example.test/shmup',
        },
        {
          id: 'platformer',
          name: 'Side-Step Platformer',
          genre: 'Platformer',
          tags: [],
          url: 'https://example.test/platformer',
        },
      ],
    });
    const games = await pending;

    // The merged Shooting facet must surface every synonym variant without
    // touching the game's primary genre.
    expect(games.map((game) => game.id).sort()).toEqual([
      'fps-engine',
      'shmup',
      'shoot-arcade',
    ]);
    expect(games.find((game) => game.id === 'fps-engine')?.genre).toBe('FPS');
    expect(games.find((game) => game.id === 'shmup')?.genre).toBe('Shooter');
  });

  it('treats Open World tags as a filter facet without changing primary genres', async () => {
    const pending = firstValueFrom(service.listGames({ genre: 'Open World' }, 'Name'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        ...mockFeed.games,
        {
          id: '16',
          name: 'Street Sandbox',
          genre: 'Action',
          tags: ['Open World', 'Action'],
          url: 'https://example.test/street-sandbox',
        },
      ],
    });
    const games = await pending;

    expect(games.map((game) => game.name)).toEqual(['Street Sandbox']);
    expect(games[0].genre).toBe('Action');
  });

  it('repairs the Final Fantasy VI record instead of opening the Final Fantasy IV cabinet', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        {
          ...mockFeed.games[0],
          id: 'final-fantasy-vi-elite-master',
          name: 'Final Fantasy VI',
          url: 'https://www.retrogames.cc/embed/4571-final-fantasy-iv-snes.html',
          launchConfig: {
            embedMode: 'inline',
            approvedEmbedUrl:
              'https://www.retrogames.cc/embed/4571-final-fantasy-iv-snes.html',
            approvedExternalUrl:
              'https://www.retrogames.cc/embed/4571-final-fantasy-iv-snes.html',
          },
        },
      ],
    });
    const games = await pending;

    const repairedGame = games.find(
      (game) => game.id === 'final-fantasy-vi-elite-master'
    );
    expect(repairedGame?.url).toBe(
      'https://www.retrogames.cc/embed/24572-final-fantasy-vi-japan-en-by-rpgone-v1-2b.html'
    );
    expect(repairedGame?.launchConfig?.approvedEmbedUrl).toBe(
      'https://www.retrogames.cc/embed/24572-final-fantasy-vi-japan-en-by-rpgone-v1-2b.html'
    );
    expect(repairedGame?.launchConfig?.approvedExternalUrl).toBe(
      'https://www.retrogames.cc/embed/24572-final-fantasy-vi-japan-en-by-rpgone-v1-2b.html'
    );
    expect(repairedGame?.launchConfig?.embedMode).toBe('inline');
  });

  it('caches the fallback feed when the asset is empty', async () => {
    const pending = firstValueFrom(service.getThaSpotFeed());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [],
    });
    const feed = await pending;

    expect(service.listGamesSync()).toEqual(feed.games);
    expect(service.getGameById(feed.games[0].id)).toEqual(feed.games[0]);
  });

  it('returns the newest games first when requested', async () => {
    const pending = firstValueFrom(service.listGames({}, 'Newest'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    const games = await pending;

    expect(games[0].id).toBe('15');
    expect(games[1].id).toBe('14');
  });

  it('repairs Sports launch targets and excludes unverified duplicate records', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('sports'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const sports = await pending;
    const byId = new Map(sports.map((game) => [game.id, game]));

    expect(sports.length).toBeGreaterThanOrEqual(20);
    expect(byId.get('league-bowling')?.url).toBe(
      'https://www.retrogames.cc/embed/8986-league-bowling-ngm-019-ngh-019.html'
    );
    expect(byId.get('ice-hockey-nes-elite')?.url).toBe(
      'https://www.retrogames.cc/embed/21659-ice-hockey-usa.html'
    );

    for (const expectedId of [
      'tecmo-bowl-elite',
      'fifa-2005-elite',
      'ssx-tricky-elite',
      'tiger-woods-2004-elite',
      '10-yard-fight-classic-elite',
      'punch-out-nes-classic',
    ]) {
      expect(byId.has(expectedId)).toBe(true);
    }
  });

  it('serves classic franchise cabinets from authentic verified embeds', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const byName = new Map(games.map((game) => [game.name, game]));

    // These cabinets were re-verified against the live provider: the card
    // name must equal the real cabinet title and launch from its /embed/ URL.
    for (const expected of [
      'Arcade Frogger',
      'SNES Mortal Kombat II (USA)',
      "NES Mike Tyson's Punch-Out!! (USA)",
      'SNES Doom (USA)',
      'NES Tetris (USA)',
    ]) {
      const game = byName.get(expected);
      expect(game).toBeTruthy();
      expect(game?.url).toMatch(/^https:\/\/www\.retrogames\.cc\/embed\/\d+-.+\.html$/);
      expect(game?.url).not.toContain('gamepix');
    }
  });

  it('plays every RetroGames cabinet from its direct /embed/ target', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const retroGames = games.filter((game) =>
      [
        game.url,
        game.launchConfig?.approvedEmbedUrl,
        game.launchConfig?.approvedExternalUrl,
      ].some((url) => url?.includes('retrogames.cc/'))
    );

    expect(retroGames.length).toBeGreaterThan(20);

    for (const game of retroGames) {
      const targets = [
        game.url,
        game.launchConfig?.approvedEmbedUrl,
        game.launchConfig?.approvedExternalUrl,
      ];
      // Every Retro cabinet targets a direct /embed/ URL — never the search
      // discovery page, which is what made these games appear broken.
      expect(targets.some((u) => u?.includes('retrogames.cc/embed/'))).toBe(
        true
      );
      expect(targets.some((u) => u?.includes('retrogames.cc/search'))).toBe(
        false
      );
      // Cabinets without the explicit external-only flag play inline from
      // their /embed/ URL; flagged ones keep the same cabinet as the external
      // fallback instead of a search page.
      if (game.launchConfig?.embedMode === 'inline') {
        expect(game.launchConfig?.approvedEmbedUrl).toMatch(
        /^https:\/\/www\.retrogames\.cc\/embed\/\d+-.+\.html$/
        );
      } else {
        expect(game.launchConfig?.embedMode).toBe('external-only');
        expect(game.launchConfig?.approvedExternalUrl).toMatch(
          /^https:\/\/www\.retrogames\.cc\/embed\/\d+-.+\.html$/
        );
      }
    }
  });

  it('exposes the curated Poki catalog as truthful external launches', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const byId = new Map(games.map((game) => [game.id, game]));

    expect(CURATED_POKI_GAMES).toHaveLength(8);
    for (const expected of CURATED_POKI_GAMES) {
      const game = byId.get(expected.id);
      expect(game).toBeTruthy();
      expect(game?.url).toBe(expected.url);
      expect(game?.launchConfig?.embedMode).toBe('external-only');
      expect(game?.launchConfig?.approvedExternalUrl).toBe(expected.url);
      expect(game?.launchConfig?.approvedEmbedUrl).toBeUndefined();
      expect(game?.tags).toContain('Poki');
    }
  });

  it('routes FPS and shmup cabinets into the Shooting room', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('shooting-range'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const shooters = await pending;
    const ids = new Set(shooters.map((game) => game.id));

    expect(shooters.length).toBeGreaterThanOrEqual(15);
    // FPS and shoot-'em-up cabinets must not fall out of the Shooting room.
    expect(ids.has('doom-ii-elite-master')).toBe(true);
    expect(ids.has('rtype-arcade-elite')).toBe(true);
  });

  it('routes Action RPG cabinets into the RPG Vault room', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('rpg-vault'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const rpgs = await pending;
    const ids = new Set(rpgs.map((game) => game.id));

    expect(rpgs.length).toBeGreaterThan(0);
    expect([...ids].some((id) => id.includes('rpg') || id.includes('fantasy'))).toBe(true);
  });

  it('replaces stale local art references across the full fallback catalog', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;

    // The normalized fallback includes the full visible catalog plus the
    // curated Poki additions; no catalog entries are hidden by this service.
    expect(games).toHaveLength(870);
    expect(games.every((game) => !game.image?.startsWith('/assets/games/'))).toBe(
      true
    );
    expect(games.some((game) => game.image === 'assets/hub/home-backdrop-command.png')).toBe(
      true
    );
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
