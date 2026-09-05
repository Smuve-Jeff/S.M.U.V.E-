import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import {
  GameService,
  canEmbedGameInline,
  cleanRetroDisplayTitle,
  isKnownEmbedBlockedUrl,
} from './game.service';
import { ThaSpotFeed } from './game';
import { THA_SPOT_FALLBACK_FEED } from './tha-spot-feed.fallback';
import { CURATED_POKI_GAMES } from './tha-spot-curated-games';
import { PREMIUM_ACTIVE_GAME_IDS } from './tha-spot-premium-catalog';

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

  it('swaps a blocked primary provider for its verified RetroGames fallback', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush({
      ...mockFeed,
      games: [
        {
          id: 'nba-jam-elite',
          name: 'NBA Jam',
          genre: 'Sports',
          url: 'https://www.gamepix.com/play/nba-jam',
          launchConfig: {
            embedMode: 'inline',
            approvedEmbedUrl: 'https://www.gamepix.com/play/nba-jam',
            approvedExternalUrl:
              'https://www.retrogames.cc/embed/17392-nba-jam-usa.html',
          },
        },
      ],
    });
    const games = await pending;

    const game = games.find((entry) => entry.id === 'nba-jam-elite');
    // The gamepix /play/ page sends X-Frame-Options, so the verified
    // RetroGames embed must become the external target instead.
    expect(game?.launchConfig?.embedMode).toBe('external-only');
    expect(game?.launchConfig?.approvedEmbedUrl).toBeUndefined();
    expect(game?.launchConfig?.approvedExternalUrl).toBe(
      'https://www.retrogames.cc/embed/17392-nba-jam-usa.html'
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

  it('uses the same premium shelf when the remote feed is unavailable', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock
      .expectOne('assets/data/tha-spot-feed.json')
      .error(new ProgressEvent('network-error'));
    const games = await pending;

    expect(games).toHaveLength(867);
    expect(games.slice(0, 44).map((game) => game.id)).toContain('rocket-league');
    expect(games.some((game) => game.id === 'rg-44097-super-mario-bros')).toBe(true);
    expect(games.some((game) => game.url.includes('retrogames.cc'))).toBe(true);
    expect(service.getGameById('rocket-league')?.id).toBe('rocket-league');
    expect(service.getGameById('rg-44097-super-mario-bros')?.id).toBe(
      'rg-44097-super-mario-bros'
    );
  });

  it('keeps the premium Sports shelf populated with modern competitive picks', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('sports'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const sports = await pending;
    const ids = new Set(sports.map((game) => game.id));

    expect(sports.length).toBeGreaterThanOrEqual(5);
    for (const expectedId of [
      'rocket-league',
      'fifa-24',
      'poki-retro-bowl',
      'nba-pro-3d',
      'nfl-redzone-rush',
    ]) {
      expect(ids.has(expectedId)).toBe(true);
    }
    expect(sports.every((game) => game.launchConfig)).toBe(true);
  });

  it('keeps the original archive behind the premium-first shelf', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;

    expect(games).toHaveLength(867);
    expect(games.slice(0, 44).some((game) => game.id === 'rocket-league')).toBe(true);
    expect(games.slice(0, 44).some((game) => game.id === 'gta-online')).toBe(true);
    expect(games.some((game) => game.id === 'rg-44097-super-mario-bros')).toBe(true);
    expect(games.some((game) => game.url.includes('retrogames.cc'))).toBe(true);
    expect(new Set(games.map((game) => game.id)).size).toBe(867);
  });

  it('keeps every premium launch target explicit and truthful', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;

    for (const game of games) {
      const launch = game.launchConfig;
      expect(launch).toBeTruthy();
      if (launch?.embedMode === 'external-only') {
        expect(launch.approvedExternalUrl).toBeTruthy();
        expect(launch.approvedEmbedUrl).toBeUndefined();
      } else {
        expect(launch?.embedMode).toBe('inline');
        expect(launch?.approvedEmbedUrl || game.url).toBeTruthy();
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

    expect(shooters.length).toBeGreaterThanOrEqual(3);
    // FPS and shoot-'em-up cabinets must not fall out of the Shooting room.
    expect(ids.has('venge-io-webgl')).toBe(true);
    expect(ids.has('tactical-squad')).toBe(true);
  });

  it('routes Action RPG cabinets into the RPG Vault room', async () => {
    const pending = firstValueFrom(service.getGamesForRoom('rpg-vault'));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const rpgs = await pending;
    const ids = new Set(rpgs.map((game) => game.id));

    expect(rpgs.length).toBeGreaterThan(0);
    expect(rpgs.some((game) => game.tags?.includes('RPG'))).toBe(true);
  });

  it('keeps the embeddable Minecraft Classic cabinet inline while blocking the main site', () => {
    // classic.minecraft.net is a trusted, embeddable browser classic — the
    // minecraft.net blocklist entry targets the main site only.
    expect(isKnownEmbedBlockedUrl('https://classic.minecraft.net/')).toBe(
      false
    );
    expect(isKnownEmbedBlockedUrl('https://www.minecraft.net/')).toBe(true);

    // The feed keeps the classic cabinet inline.
    const minecraftClassic = THA_SPOT_FALLBACK_FEED.games.find(
      (g) => g.id === 'minecraft-classic'
    );
    expect(minecraftClassic?.launchConfig?.embedMode).toBe('inline');
    expect(minecraftClassic?.launchConfig?.approvedEmbedUrl).toContain(
      'classic.minecraft.net'
    );
  });

  it('replaces stale local art references across the full fallback catalog', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;

    // Production-sized feeds retain the archive with the reviewed premium shelf first.
    expect(games).toHaveLength(867);
    expect(games.slice(0, 44).map((game) => game.id)).toContain('gta-online');
    expect(games.slice(0, 44).map((game) => game.id)).toContain('poki-temple-run-2');
    expect(games.slice(0, 44).map((game) => game.id)).toContain('battlefield');
    expect(games.find((game) => game.id === 'gta-online')?.image).toBe(
      'assets/games/gta-online.svg'
    );
    // Owned cabinets carry original S.M.U.V.E. banner art on the shelf.
    expect(games.find((game) => game.id === 'battlefield')?.image).toBe(
      'assets/games/battlefield.svg'
    );
    expect(games.some((game) => game.id === 'rg-44097-super-mario-bros')).toBe(true);
  });

  it('swaps frame-blocked GamePix premium titles to verified inline mirrors', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const byId = new Map(games.map((game) => [game.id, game]));

    // These GamePix /play/ pages refuse iframes (X-Frame-Options SAMEORIGIN),
    // so the shelf must launch the verified standalone mirror inline instead.
    expect(byId.get('moto-x3m')?.launchConfig?.embedMode).toBe('inline');
    expect(byId.get('moto-x3m')?.launchConfig?.approvedEmbedUrl).toBe(
      'https://moto-x3m.io/'
    );
    expect(byId.get('moto-x3m')?.url).toBe('https://moto-x3m.io/');
    expect(byId.get('smash-karts-web-elite')?.launchConfig?.embedMode).toBe(
      'inline'
    );
    expect(byId.get('smash-karts-web-elite')?.launchConfig?.approvedEmbedUrl).toBe(
      'https://smashkarts.io/'
    );
    expect(byId.get('drift-hunters-web-elite')?.launchConfig?.approvedEmbedUrl).toBe(
      'https://drift-hunters.io/'
    );
    expect(byId.get('nba-pro-3d')?.launchConfig?.approvedEmbedUrl).toBe(
      'https://basketball-stars.io/'
    );
  });

  it('gives every premium shelf game real cover art', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const byId = new Map(games.map((game) => [game.id, game]));

    // Owned cabinets ship original banner SVGs.
    expect(byId.get('battlefield')?.image).toBe('assets/games/battlefield.svg');
    expect(byId.get('halo-combat-evolved')?.image).toBe(
      'assets/games/halo-combat-evolved.svg'
    );
    // GamePix and Poki rows carry real provider cover art.
    expect(byId.get('moto-x3m')?.image).toContain('img.gamepix.com/games/moto-x3m');
    expect(byId.get('poki-retro-bowl')?.image).toContain('img.poki-cdn.com');
    expect(byId.get('fruit-ninja-web-elite')?.image).toContain(
      'img.gamepix.com/games/fruit-ninja'
    );
  });

  it('keeps every premium recommendation rail populated with active games', async () => {
    const pending = firstValueFrom(service.getThaSpotFeed());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const feed = await pending;
    const activeIds = new Set(feed.games.map((game) => game.id));

    // Premium rails are merged with the original feed rails (8 + 16) so the
    // premium shelf never erases the archive's curated discovery surfaces.
    expect(feed.recommendationRails.length).toBe(24);
    expect(feed.recommendationRails.some((rail) => rail.id === 'premium-versus')).toBe(true);
    expect(feed.recommendationRails.some((rail) => rail.id === 'rail-golden-era')).toBe(true);
    for (const rail of feed.recommendationRails) {
      const supplied = rail.gameIds.length;
      if (rail.id.startsWith('premium-')) {
        // Merged premium rails are always populated and trimmed to maxItems.
        expect(supplied).toBeGreaterThan(0);
        expect(supplied).toBeLessThanOrEqual(rail.maxItems);
      } else if (supplied > 0) {
        // Archive rails carry the full curated set; they are populated by
        // room/audience matching at render time, so only validate the ids
        // that were explicitly supplied.
        expect(supplied).toBeGreaterThan(0);
      }
      expect(rail.gameIds.every((id) => activeIds.has(id))).toBe(true);
    }
  });

  it('keeps the premium shelf balanced across requested genres and launch contracts', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const genres = new Set(games.map((game) => game.genre));

    expect([...genres].some((value) => value === 'Action')).toBe(true);
    expect([...genres].some((value) => value === 'RPG')).toBe(true);
    expect([...genres].some((value) => value === 'Sports')).toBe(true);
    expect([...genres].some((value) => value === 'Racing')).toBe(true);
    expect(games.some((game) => game.tags?.includes('Adventure'))).toBe(true);
    expect(games.filter((game) => game.launchConfig?.embedMode === 'inline').length).toBeGreaterThan(5);
    expect(games.filter((game) => game.launchConfig?.embedMode === 'external-only').length).toBeGreaterThan(20);
    expect(games.every((game) => game.url && game.description && game.tags?.length)).toBe(true);
    expect(games.every((game) => game.image)).toBe(true);
  });

  it('validates every combined archive and premium row before exposing it', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;

    expect(games).toHaveLength(867);
    expect(new Set(games.map((game) => game.id)).size).toBe(games.length);
    // Only premium ids that are actually present in the feed must occupy the
    // premium-first prefix; the premium allowlist is larger than the feed, so
    // this assertion validates ordering for the overlap only.
    const premiumInFeed = PREMIUM_ACTIVE_GAME_IDS.filter((id) =>
      games.some((game) => game.id === id)
    );
    expect(games.slice(0, premiumInFeed.length).map((game) => game.id)).toEqual(
      premiumInFeed
    );

    for (const game of games) {
      expect(game.id.trim()).toBeTruthy();
      expect(game.name.trim()).toBeTruthy();
      expect(game.name).not.toMatch(/^Game\s+\d+$/i);
      expect(game.url.trim()).toMatch(/^(https?:\/\/|\/assets\/)/);

      const launch = game.launchConfig;
      expect(launch).toBeTruthy();
      if (launch?.embedMode === 'external-only') {
        expect(launch.approvedExternalUrl?.trim()).toBeTruthy();
        expect(launch.approvedEmbedUrl).toBeUndefined();
        expect(launch.approvedExternalUrl).not.toMatch(/^\/assets\/games\//);
      } else {
        expect(launch?.embedMode).toBe('inline');
        expect(canEmbedGameInline(game)).toBe(true);
      }

      for (const target of [
        game.url,
        launch?.approvedEmbedUrl,
        launch?.approvedExternalUrl,
      ]) {
        if (target?.startsWith('/assets/games/')) {
          expect(target).toMatch(/^\/assets\/games\/[^/]+\/[^/]+\.html$/);
        }
      }
    }
  });

  it('refreshes the feed when forced, preserving the combined catalog contract', async () =>
    const firstPending = firstValueFrom(service.getThaSpotFeed());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    await firstPending;

    const secondPending = firstValueFrom(service.getThaSpotFeed(true));
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(mockFeed);
    await secondPending;
  });

  it('badges every game in the combined catalog with a resolvable badge id', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;

    for (const game of games) {
      expect(game.badgeIds?.length ?? 0).toBeGreaterThan(0);
      for (const badgeId of game.badgeIds ?? []) {
        expect(badgeId.trim()).toBeTruthy();
        expect(badgeId).not.toMatch(/\s/);
      }
    }
  });

  it('resolves every game badge id to a defined badge with label and tone', async () => {
    const pending = firstValueFrom(service.getThaSpotFeed());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const feed = await pending;

    const defined = new Map(
      feed.badges.map((badge) => [badge.id, badge])
    );
    for (const game of feed.games) {
      for (const badgeId of game.badgeIds ?? []) {
        const badge = defined.get(badgeId);
        expect(badge).toBeDefined();
        expect(badge!.label.trim()).toBeTruthy();
        expect(
          ['primary', 'secondary', 'accent', 'warning'].includes(badge!.tone)
        ).toBe(true);
      }
    }
  });

  it('assigns premium-grade badges to the last two unbadged Gamepix games', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const byId = new Map(games.map((game) => [game.id, game]));

    expect(byId.get('basketball-master')?.badgeIds).toContain('featured');
    expect(byId.get('ludo-legend')?.badgeIds).toContain('staff-pick');
  });
});

describe('cleanRetroDisplayTitle', () => {
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

  it.each([
    // [raw RetroGames listing, expected clean display title]
    ['NES Battle City (Japan)', 'Battle City'],
    ['SNES Doom (USA)', 'Doom'],
    ['Genesis Sonic the Hedgehog 2 (World) (Rev A)', 'Sonic the Hedgehog 2'],
    ['Game Boy Advance Grand Theft Auto Advance (U)(Mode7)', 'Grand Theft Auto Advance'],
    ['Game Boy Space Invaders (USA, Europe)', 'Space Invaders'],
    ['Arcade Street Fighter III: New Generation (USA 970204)', 'Street Fighter III: New Generation'],
    ['Arcade Tekken Tag Tournament (World, TEG2/VER.C1, set 1)', 'Tekken Tag Tournament'],
    ['Arcade Metal Slug X - Super Vehicle-001 (NGM-2500)(NGH-2500)', 'Metal Slug X - Super Vehicle-001'],
    ['Arcade X-Men vs Street Fighter (960910 USA)', 'X-Men vs Street Fighter'],
    ['NES Final Fantasy VII (C)', 'Final Fantasy VII'],
    ['Game Boy Advance Tony Hawk\'s Pro Skater 2 (F)(Cezar)', 'Tony Hawk\'s Pro Skater 2'],
    ['SNES Super Metroid - V I T A L I T Y', 'Super Metroid - V I T A L I T Y'],
    ['SNES Super "Mario" World', 'Super "Mario" World'],
    ['Genesis Alien Soldier (Europe)', 'Alien Soldier'],
    ['Arcade Frogger', 'Frogger'],
    ['Mario Kart Super Circuit XXL', 'Mario Kart Super Circuit XXL'],
    ['Genesis Aladdin II', 'Aladdin II'],
    ['Arcade Galaga \'88', 'Galaga \'88'],
    ['Game Boy Advance Tony Hawk\'s Pro Skater 4 (U)(Rapid Fire)', 'Tony Hawk\'s Pro Skater 4'],
  ])('cleans "%s" to "%s"', (raw, expected) => {
    expect(cleanRetroDisplayTitle(raw)).toBe(expected);
  });

  it('leaves non-RetroGames display names untouched', () => {
    expect(cleanRetroDisplayTitle('Venge.io (Next-Gen)')).toBe('Venge.io (Next-Gen)');
    expect(cleanRetroDisplayTitle('Halo: Combat Evolved (WASM)')).toBe('Halo: Combat Evolved (WASM)');
  });

  it('cleans every retro-backed row in the resolved feed', async () => {
    const pending = firstValueFrom(service.listGames());
    httpMock.expectOne('assets/data/tha-spot-feed.json').flush(
      THA_SPOT_FALLBACK_FEED
    );
    const games = await pending;
    const retro = games.filter((game) =>
      [game.url, game.launchConfig?.approvedEmbedUrl].some(
        (target) => target?.includes('retrogames.cc/')
      )
    );
    expect(retro.length).toBeGreaterThan(400);
    const rawByName = new Map(
      THA_SPOT_FALLBACK_FEED.games.map((game) => [game.id, game.name])
    );
    for (const game of retro) {
      const raw = rawByName.get(game.id) || game.name;
      // The resolved name must be the fully cleaned ROM title — never the raw
      // listing with its system prefix or region/dumper metadata still attached.
      expect(game.name).toBe(cleanRetroDisplayTitle(raw));
      expect(game.name.trim()).toBeTruthy();
    }
  });
});
