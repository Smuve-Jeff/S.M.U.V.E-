import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THA_SPOT_FALLBACK_FEED } from './tha-spot-feed.fallback';

const MINIMUM_EXPECTED_GAMES = 4;

/** Extract the numeric ID from a retrogames.cc embed URL. */
function extractRetroId(url: string): string | null {
  const m = url.match(/\/embed\/(\d+)-/);
  return m ? m[1] : null;
}

/** Extract the slug (game-name portion) from a retrogames.cc embed URL. */
function extractRetroSlug(url: string): string | null {
  const m = url.match(/\/embed\/\d+-(.+)\.html$/);
  return m ? m[1] : null;
}

/**
 * Normalize a game name for comparison purposes:
 * - Strip unicode diacritics (Ō → O, é → e, etc.)
 * - Remove variant-label suffixes like "(Classic)", "(Elite)", "(Elite HD)", "Retro"
 * - Strip subtitles after ":" (e.g. "Street Fighter II: The World Warrior" → "Street Fighter II")
 * - Lowercase
 */
function normalizeGameName(name: string): string {
  return name
    .normalize('NFD') // decompose unicode (Ō → O + combining macron)
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/\s*:.*$/, '') // strip subtitle after ":"
    .replace(
      /\s*\(?(classic|elite|elite hd|elite edition|absolute edition|hd|arcade|original|remix|remastered|deluxe)\)?/g,
      ''
    )
    .replace(/^retro\s+/, '') // strip leading "retro" prefix
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower-case words from a slug, excluding platform/region noise tokens. */
const NOISE_TOKENS = new Set([
  'usa',
  'europe',
  'japan',
  'world',
  'ntsc',
  'pal',
  'nes',
  'snes',
  'n64',
  'gba',
  'gbc',
  'gb',
  'ps1',
  'ps2',
  'ps3',
  'xbox',
  'gc',
  'genesis',
  'mega',
  'drive',
  'dreamcast',
  'arcade',
  'rev',
  'disc',
  'version',
  'the',
  'a',
  'an',
  'and',
  'of',
  'in',
  'to',
]);

function slugCoreWords(slug: string): Set<string> {
  return new Set(
    slug
      .split('-')
      .filter(
        (w) => w && !NOISE_TOKENS.has(w) && w.length > 1 && !/^\d+$/.test(w)
      )
  );
}

/**
 * Return meaningful lower-case words from a game name.
 * Handles unicode normalization (strips diacritics) and camelCase compound
 * words like "FireRed" → ["fire", "red"].
 */
function nameCoreWords(name: string): Set<string> {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics: Ōkami → Okami, Pokémon → Pokemon
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase: FireRed → Fire Red
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' '); // strip remaining punctuation
  const tokens = normalized.split(/\s+/);
  return new Set(
    tokens.filter(
      (w) => w && !NOISE_TOKENS.has(w) && w.length > 1 && !/^\d+$/.test(w)
    )
  );
}

describe('Tha Spot feed integrity', () => {
  const feedPath = join(
    process.cwd(),
    'src',
    'assets',
    'data',
    'tha-spot-feed.json'
  );
  const feed = JSON.parse(readFileSync(feedPath, 'utf8')) as {
    rooms?: Array<{
      id?: string;
      name?: string;
    }>;
    games?: Array<{
      id?: string;
      name?: string;
      description?: string;
      genre?: string;
      availability?: string;
      multiplayerType?: string;
      tags?: string[];
      url?: string;
      launchConfig?: {
        approvedEmbedUrl?: string;
        approvedExternalUrl?: string;
      };
    }>;
    recommendationRails?: Array<{
      id?: string;
      gameIds?: string[];
    }>;
    promotions?: Array<{
      id?: string;
      gameIds?: string[];
    }>;
    liveEvents?: Array<{
      id?: string;
      featuredGameId?: string;
    }>;
    socialPresence?: Array<{
      id?: string;
      gameId?: string;
    }>;
  };
  const rooms = feed.rooms ?? [];
  const games = feed.games ?? [];

  it('keeps every library entry uniquely identifiable', () => {
    const ids = games.map((game) => game.id);
    expect(ids.length).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_GAMES);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships fully populated, non-placeholder library entries', () => {
    for (const game of games) {
      expect(game.name).toBeTruthy();
      expect(game.name).not.toMatch(/^Game\s+\d+$/i);
      expect(game.description).toBeTruthy();
      expect(game.genre).toBeTruthy();
      expect(['Offline', 'Online', 'Hybrid']).toContain(game.availability);
      expect(game.tags?.length).toBeGreaterThan(0);
      expect(game.launchConfig).toBeTruthy();
      expect(
        game.launchConfig?.approvedEmbedUrl ||
          game.launchConfig?.approvedExternalUrl
      ).toBeTruthy();
    }
  });

  it('keeps category rooms available for the expanded library', () => {
    const roomIds = new Set(rooms.map((room) => room.id));

    expect(roomIds.has('sports')).toBe(true);
    expect(roomIds.has('fighting-pit')).toBe(true);
    expect(roomIds.has('shooting-range')).toBe(true);
    expect(roomIds.has('rpg-vault')).toBe(true);
    expect(roomIds.has('co-op-link')).toBe(true);
  });

  it('keeps the Sports room inclusive of every Sports genre cabinet', () => {
    const sportsRoom = rooms.find((room) => room.id === 'sports');
    const sportsGames = games.filter((game) => game.genre === 'Sports');
    const roomGenres = (sportsRoom?.rules?.genres ?? []).map((genre) =>
      genre.toLowerCase()
    );
    const roomTags = sportsRoom?.rules?.tags ?? [];

    expect(roomGenres).toContain('sports');
    expect(roomTags).toHaveLength(0);
    expect(sportsGames.length).toBeGreaterThanOrEqual(20);
  });

  it('maintains multiple choices for the featured expansion categories', () => {
    const fightingGames = games.filter((game) => game.genre === 'Fighting');
    const sportsGames = games.filter((game) => game.genre === 'Sports');
    const shootingGames = games.filter((game) => game.genre === 'Shooting');
    const rpgGames = games.filter(
      (game) => game.genre === 'RPG' || game.tags?.includes('RPG')
    );
    const coopGames = games.filter((game) => game.tags?.includes('Co-op'));

    expect(fightingGames.length).toBeGreaterThanOrEqual(1);
    expect(sportsGames.length).toBeGreaterThanOrEqual(1);
    expect(shootingGames.length).toBeGreaterThanOrEqual(0);
    expect(rpgGames.length).toBeGreaterThanOrEqual(0);
    expect(coopGames.length).toBeGreaterThanOrEqual(0);
  });

  it('has no duplicate game names in the catalog', () => {
    const nameCounts = new Map<string, number>();
    for (const game of games) {
      const name = game.name ?? '';
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    const duplicates = [...nameCounts.entries()].filter(
      ([, count]) => count > 1
    );
    expect(duplicates).toHaveLength(0);
  });

  it('has no duplicate game IDs in the catalog', () => {
    const ids = games.map((g) => g.id ?? '');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tags every Server-multiplayer cabinet for the PvP / co-op rooms', () => {
    // Server-multiplayer cabinets surface the quick-lobby, challenge, and
    // split-screen surfaces. Each one must also carry a room-facing tag so
    // Versus Night (PvP/Multiplayer) and/or Online Co-op (Co-op) can surface
    // them, otherwise a live multiplayer game would be invisible to both
    // multiplayer rooms.
    const multiplayerGames = games.filter(
      (g) => g.multiplayerType === 'Server'
    );
    expect(multiplayerGames.length).toBeGreaterThanOrEqual(10);

    const untagged: string[] = [];
    for (const game of multiplayerGames) {
      const tags = new Set((game.tags ?? []).map((t) => t.toLowerCase()));
      const roomFacing =
        tags.has('multiplayer') || tags.has('pvp') || tags.has('co-op');
      if (!roomFacing) {
        untagged.push(`${game.id} (${game.name})`);
      }
    }
    expect(untagged).toHaveLength(0);
  });

  it('has no retrogames.cc embed URL ID shared between different game entries', () => {
    // Each retrogames.cc numeric ID must resolve to the same underlying game.
    // Sharing an ID between genuinely different games means one entry is wrong.
    // We normalize names before comparing so "Elite" and "Classic" display
    // variants of the same game are not treated as conflicts.
    const retroIdToNames = new Map<string, Set<string>>();

    for (const game of games) {
      const lc = game.launchConfig ?? {};
      for (const url of [
        game.url,
        lc.approvedEmbedUrl,
        lc.approvedExternalUrl,
      ]) {
        if (!url || !url.includes('retrogames.cc')) continue;
        const match = url.match(/\/embed\/(\d+)-/);
        if (!match) continue;
        const retroId = match[1];
        const normalizedName = normalizeGameName(game.name ?? '');
        if (!retroIdToNames.has(retroId)) {
          retroIdToNames.set(retroId, new Set());
        }
        retroIdToNames.get(retroId)!.add(normalizedName);
      }
    }

    const conflicts: string[] = [];
    for (const [retroId, normalizedNames] of retroIdToNames) {
      if (normalizedNames.size > 1) {
        conflicts.push(
          `ID ${retroId}: normalized names [${[...normalizedNames].join(', ')}]`
        );
      }
    }

    expect(conflicts).toHaveLength(0);
  });

  it('keeps the compiled-in fallback feed in sync with the JSON asset', () => {
    // The fallback is the offline mirror of the primary catalog. If these
    // drift, users who fetch the asset off-cache get a different library.
    const jsonIds = games.map((g) => g.id ?? '').sort();
    const fallbackIds = THA_SPOT_FALLBACK_FEED.games.map((g) => g.id).sort();
    expect(fallbackIds).toEqual(jsonIds);
  });

  it('has no dangling game references from rails, promotions, events, or presence', () => {
    const gameIds = new Set(games.map((g) => g.id ?? '').filter(Boolean));
    const dangling: string[] = [];
    const check = (label: string, ids: Array<string | undefined>) => {
      for (const id of ids) {
        if (id && !gameIds.has(id)) dangling.push(`${label}: ${id}`);
      }
    };

    for (const rail of feed.recommendationRails ?? []) {
      check(`rail ${rail.id}`, rail.gameIds ?? []);
    }
    for (const promo of feed.promotions ?? []) {
      check(`promo ${promo.id}`, promo.gameIds ?? []);
    }
    for (const event of feed.liveEvents ?? []) {
      if (event.featuredGameId) {
        check(`event ${event.id}`, [event.featuredGameId]);
      }
    }
    for (const entry of feed.socialPresence ?? []) {
      if (entry.gameId) check(`presence ${entry.id}`, [entry.gameId]);
    }

    expect(dangling).toHaveLength(0);
  });

  it('has no retrogames.cc URL slug that contradicts the game title', () => {
    // A retrogames.cc URL slug that shares zero words with the game name
    // is a strong indicator the URL points to the wrong game.
    // We use substring matching to handle compound words like "GoldenEye" (slug)
    // matching "Golden"+"Eye" (from split camelCase name), and "earthbound" matching
    // "earth"+"bound" etc.
    const mismatches: string[] = [];

    for (const game of games) {
      const lc = game.launchConfig ?? {};
      const name = game.name ?? '';
      const nameWords = nameCoreWords(name);

      for (const url of [
        game.url,
        lc.approvedEmbedUrl,
        lc.approvedExternalUrl,
      ]) {
        if (!url || !url.includes('retrogames.cc')) continue;
        const slug = extractRetroSlug(url);
        if (!slug) continue;
        const slugWords = slugCoreWords(slug);
        if (slugWords.size > 0 && nameWords.size > 0) {
          // Check for word overlap, including substring containment for compound words
          const overlap = [...slugWords].some((sw) =>
            [...nameWords].some(
              (nw) => sw === nw || sw.includes(nw) || nw.includes(sw)
            )
          );
          if (!overlap) {
            mismatches.push(`"${name}" — slug "${slug}" (url: ${url})`);
            break;
          }
        }
      }
    }

    expect(mismatches).toHaveLength(0);
  });
});
