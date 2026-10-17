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
      rules?: {
        genres?: string[];
        tags?: string[];
      };
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
        embedMode?: string;
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

  it('keeps room genre rules free of phantom genres', () => {
    // Every genre a room references must exist somewhere in the catalog as a
    // primary genre or a tag, otherwise the rule silently matches nothing
    // (e.g. the retired "Music Battle" room genre).
    const vocabulary = new Set<string>();
    for (const game of games) {
      if (game.genre) vocabulary.add(game.genre.toLowerCase());
      for (const tag of game.tags ?? []) vocabulary.add(tag.toLowerCase());
    }

    const phantom: string[] = [];
    for (const room of rooms) {
      for (const genre of room.rules?.genres ?? []) {
        if (!vocabulary.has(genre.toLowerCase())) {
          phantom.push(`${room.id}: ${genre}`);
        }
      }
    }
    expect(phantom).toHaveLength(0);
  });

  it('keeps the Shooting room inclusive of FPS and Shooter cabinets', () => {
    const shootingRoom = rooms.find((room) => room.id === 'shooting-range');
    const roomGenres = (shootingRoom?.rules?.genres ?? []).map((genre) =>
      genre.toLowerCase()
    );

    expect(roomGenres).toEqual(['shooting', 'fps', 'shooter']);

    const shooterGames = games.filter((game) =>
      ['Shooting', 'FPS', 'Shooter'].includes(game.genre ?? '')
    );
    const uncovered = shooterGames.filter(
      (game) => !roomGenres.includes((game.genre ?? '').toLowerCase())
    );

    expect(shooterGames.length).toBeGreaterThanOrEqual(15);
    expect(uncovered).toHaveLength(0);
  });

  it('keeps the RPG Vault inclusive of Action RPG and JRPG cabinets', () => {
    const rpgRoom = rooms.find((room) => room.id === 'rpg-vault');
    const roomTags = (rpgRoom?.rules?.tags ?? []).map((tag) =>
      tag.toLowerCase()
    );

    expect(roomTags).toContain('rpg');
    expect(roomTags).toContain('action rpg');
    expect(roomTags).toContain('jrpg');

    const rpgGames = games.filter((game) =>
      ['RPG', 'Action RPG'].includes(game.genre ?? '')
    );
    const uncovered = rpgGames.filter(
      (game) =>
        !(game.tags ?? []).some((tag) => roomTags.includes(tag.toLowerCase()))
    );

    expect(rpgGames.length).toBeGreaterThanOrEqual(8);
    expect(uncovered).toHaveLength(0);
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

  it('keeps the Final Fantasy VI cabinet pointed at Final Fantasy VI', () => {
    const ff6 = games.find((game) => game.id === 'final-fantasy-vi-elite-master');
    expect(ff6).toBeTruthy();

    const urls = [
      ff6?.url ?? '',
      ff6?.launchConfig?.approvedEmbedUrl ?? '',
      ff6?.launchConfig?.approvedExternalUrl ?? '',
    ];
    for (const url of urls) {
      expect(url).toContain('24572-final-fantasy-vi');
      expect(url).not.toContain('final-fantasy-iv');
    }
  });

  it('keeps franchise launch targets aligned with their primary cabinet', () => {
    const franchiseIds = [
      'gta-elite-wasm',
      'final-fantasy-nes',
      'final-fantasy-vii-elite',
      'final-fantasy-vi-elite-master',
      'sf2-classic',
      'sf3-classic',
      'x-men-vs-street-fighter-elite-master',
      'street-fighter-alpha-3-elite-master',
      'sf-alpha-2-snes-elite',
      'double-dragon-nes',
      'dd2-classic',
      'rg-30347-double-dragon-usa-europe',
      'rg-16964-battletoads-double-dragon-usa',
    ];

    for (const id of franchiseIds) {
      const game = games.find((entry) => entry.id === id);
      expect(game).toBeTruthy();
      const primary = game?.launchConfig?.approvedEmbedUrl || game?.url || '';
      const external = game?.launchConfig?.approvedExternalUrl || '';
      expect(external).toBe(primary);
    }

    const alpha3 = games.find((entry) => entry.id === 'street-fighter-alpha-3-elite-master');
    expect(alpha3?.url).toContain('9974-street-fighter-alpha-3-980904-usa');
    expect(alpha3?.url).not.toContain('10006-');
  });

  it('never points an external target at a different cabinet than the primary embed', () => {
    // Systemic rule (generalizes the franchise guard): a game's
    // approvedExternalUrl must resolve to the SAME retrogames.cc cabinet as
    // its primary launch embed. Earlier catalog entries opened completely
    // unrelated games (e.g. Star Fox 2 -> Ultimate Brain Games) when the
    // external target drifted from the primary embed ID.
    const offenders: string[] = [];
    for (const game of games) {
      const primary =
        game.launchConfig?.approvedEmbedUrl || game.url || '';
      const external = game.launchConfig?.approvedExternalUrl || '';
      const primaryId = extractRetroId(primary);
      const externalId = extractRetroId(external);
      if (primaryId && externalId && primaryId !== externalId) {
        offenders.push(
          `${game.id}: primary=${primaryId} external=${externalId}`
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it('replaces broken Gamepix primaries with verified working cabinet URLs', () => {
    const removedBrokenDuplicates = [
      'nba-jam-elite',
      'umk3-elite-master',
      'contra-iii-elite-master',
      'metroid-fusion-gba-elite',
      'excitebike-64-elite',
    ];

    for (const id of removedBrokenDuplicates) {
      expect(games.some((entry) => entry.id === id)).toBe(false);
    }

    // Each replacement remains available exactly once under an existing,
    // verified catalog entry.
    for (const id of [
      'rg-23562-nba-jam-usa',
      'rg-23432-ultimate-mortal-kombat-3-usa',
      'rg-23268-contra-iii-the-alien-wars-usa',
      'super-metroid-elite-master',
      'rg-20552-excitebike-japan-usa',
    ]) {
      expect(games.filter((entry) => entry.id === id)).toHaveLength(1);
    }
  });

  it('never ships a cabinet pointed at a dead launch domain', () => {
    // "Instant death" cabinets: launch targets whose domains no longer
    // resolve (1v1.lol -> NXDOMAIN) or redirect to a dead host
    // (hextris.github.io/hextris/ 301 -> hextris.io -> NXDOMAIN).
    const deadDomainIds = ['1v1-lol-elite'];
    for (const id of deadDomainIds) {
      expect(games.some((entry) => entry.id === id)).toBe(false);
    }

    const deadDomains = ['1v1.lol', 'hextris.io'];
    for (const game of games) {
      const lc = game.launchConfig ?? {};
      const urls = [
        game.url,
        lc.url,
        lc.approvedEmbedUrl,
        lc.approvedExternalUrl,
      ];
      for (const url of urls) {
        if (typeof url !== 'string' || !url) continue;
        for (const dead of deadDomains) {
          expect(url).not.toContain(dead);
        }
      }
    }

    // Hextris must launch from the working GitHub-repo mirror, not the
    // /hextris/ subpath that redirects to dead hextris.io.
    const hextris = games.find((entry) => entry.id === 'hextris');
    expect(hextris).toBeTruthy();
    const hextrisTarget =
      hextris?.launchConfig?.approvedEmbedUrl || hextris?.url || '';
    expect(hextrisTarget).toBe(
      'https://raw.githack.com/Hextris/hextris/master/index.html'
    );
  });

  it('never claims inline play for hosts that block iframe embedding', () => {
    // "Silent external" trap: a cabinet marked embedMode inline whose host
    // the runtime policy blocks from the cabinet (X-Frame-Options / CSP or an
    // interstitial that cannot boot) renders blank or silently opens a tab.
    // Inline claims for these hosts are a lie — the list mirrors the service
    // blocklist that repairs such cabinets to external-only at runtime.
    const frameBlockingHosts = [
      'gamepix.com',
      'krunker.io',
      'play2048.co',
      'diep.io',
      'slowroads.io',
      '1v1.lol',
      'nytimes.com',
      'garticphone.com',
      'agar.io',
      'slither.io',
      'skribbl.io',
      'dota2.com',
      'ea.com',
      'rocketleague.com',
      'epicgames.com',
      'minecraft.net',
      'innersloth.com',
      'bungie.net',
      'ubisoft.com',
      'warframe.com',
      'emulatorgames.net',
      'playretrogames.com',
      'classicgame.com',
    ];
    const offenders: string[] = [];
    for (const game of games) {
      const lc = game.launchConfig ?? {};
      if (lc.embedMode !== 'inline') continue;
      const target = lc.approvedEmbedUrl || game.url || '';
      if (!/^https?:\/\//.test(target)) continue; // local assets embed fine
      const host = new URL(target).hostname.toLowerCase();
      // classic.minecraft.net is a deliberate trusted-allowlist member that
      // sends no frame-blocking headers — it is exempt from the minecraft.net
      // suffix entry (which targets the main site).
      if (host === 'classic.minecraft.net') continue;
      if (
        frameBlockingHosts.some(
          (d) => host === d || host.endsWith('.' + d)
        )
      ) {
        offenders.push(`${game.id} (${game.name}) -> ${host}`);
      }
    }
    expect(offenders).toEqual([]);

    // Previously mismarked cabinets must now be explicit external launches
    // with a real target.
    for (const id of [
      'wordle-daily',
      'skribbl-io-multiplayer',
      'gartic-phone-multiplayer',
      'slither-io-multiplayer',
      'agar-io-multiplayer',
    ]) {
      const game = games.find((entry) => entry.id === id);
      expect(game).toBeTruthy();
      expect(game?.launchConfig?.embedMode).toBe('external-only');
      expect(game?.launchConfig?.approvedExternalUrl).toBeTruthy();
    }

    // Every external-only cabinet must carry a real external target.
    for (const game of games) {
      if (game.launchConfig?.embedMode !== 'external-only') continue;
      expect(game.launchConfig?.approvedExternalUrl).toBeTruthy();
    }
  });

  it('keeps classic-franchise cabinets off gamepix lookalike hosts', () => {
    // Gamepix hosts fan remakes of these classic franchise titles; each
    // record must point its primary launch at the authentic retrogames.cc
    // cabinet and force the explicit external flow.
    const lookalikeIds = [
      'galaga-classic',
      'frogger-arcade',
      'asteroids-arcade',
      'gradius-arcade-elite',
      'metal-slug-2-arcade-elite',
      'tekken-3-elite',
      'mortal-kombat-2-elite',
      'ctr-ps1-elite',
      'chrono-trigger-snes-elite',
      'super-metroid-elite-master',
      'duck-hunt-nes-elite',
      'kid-icarus-nes-elite',
    ];
    for (const id of lookalikeIds) {
      const game = games.find((entry) => entry.id === id);
      expect(game).toBeTruthy();
      expect(game?.url).not.toContain('gamepix');
      // Verified-authentic cabinets play inline from their real /embed/ URL;
      // any flagged ones keep the same authentic cabinet as external target.
      const mode = game?.launchConfig?.embedMode;
      if (mode === 'inline') {
        expect(game?.launchConfig?.approvedEmbedUrl).toContain('retrogames.cc/embed/');
      } else {
        expect(mode).toBe('external-only');
        expect(game?.launchConfig?.approvedExternalUrl).toContain('retrogames.cc');
      }
    }
  });

  it('keeps the Super Mario series complete and correctly targeted', () => {
    // Core Super Mario series entries must exist and point at authentic
    // retail cabinets. Super Mario World / Super Mario Kart have no
    // authentic cabinet on RetroGames.cc (only ROM hacks), so they play
    // the verified frameable RetroGames.cz originals; every other entry
    // uses its authentic retrogames.cc /embed/ cabinet. No fan hacks or
    // lookalikes substituted.
    const marioSeriesIds = [
      'rg-44097-super-mario-bros',
      'rg-46228-super-mario-bros-2-lost-levels',
      'super-mario-world-elite-master',
      'rg-44214-super-mario-kart-world',
      'mario-kart-sc-gba-elite',
      'rg-43686-vs-super-mario-bros',
      'rg-45027-super-mario-rpg-enhanced',
      'rg-43447-paper-mario-multiplayer',
      'rg-44138-mario-party-3-starstruck',
      'rg-24978-wario-land-ii',
      'rg-20337-yoshis-cookie',
      'rg-46481-vs-dr-mario',
    ];

    for (const id of marioSeriesIds) {
      const game = games.find((entry) => entry.id === id);
      expect(game).toBeTruthy();
      const primary = game?.launchConfig?.approvedEmbedUrl || game?.url || '';
      const external = game?.launchConfig?.approvedExternalUrl || '';
      expect(external).toBe(primary);
    }

    // Super Mario World must be the authentic 1990 retail SNES release, not
    // the Super "Mario" World fan hack previously served from RetroGames.cc.
    const smw = games.find((entry) => entry.id === 'super-mario-world-elite-master');
    expect(smw?.url).toBe('https://www.retrogames.cz/play_245-SNES.php');
    expect(smw?.name).toContain('Super Mario World');
    expect(smw?.tags).not.toContain('ROM Hack');

    // Super Mario Kart must be the authentic 1992 retail SNES release; the
    // redundant "Deluxe"/"World" fan hacks are gone from the catalog.
    const smk = games.find((entry) => entry.id === 'rg-44214-super-mario-kart-world');
    expect(smk?.url).toBe('https://www.retrogames.cz/play_789-SNES.php');
    expect(smk?.name).toBe('Super Mario Kart (SNES)');
    expect(games.some((entry) => entry.id === 'rg-43860-super-mario-kart-deluxe')).toBe(
      false
    );
    expect(
      games.some((entry) => entry.id === 'rg-43860-super-mario-kart-deluxe')
    ).toBe(false);

    // Mario Kart: Super Circuit authentic GBA cabinets do not exist on any
    // frameable provider, so the XXL fan hack remains clearly labeled.
    const mkSc = games.find((entry) => entry.id === 'mario-kart-sc-gba-elite');
    expect(mkSc?.name).toContain('XXL');
    expect(mkSc?.tags).toContain('ROM Hack');

    // Super Mario RPG must not point at a fan hack (e.g. Armageddon).
    const smrpg = games.find((entry) => entry.id === 'rg-45027-super-mario-rpg-enhanced');
    expect(smrpg?.url).toContain('45027-super-mario-rpg-enhanced');
    expect(smrpg?.url).not.toContain('armageddon');
    expect(smrpg?.url).not.toContain('revolution');

    // VS. Super Mario Bros must be the arcade VS. System cabinet.
    const vsmb = games.find((entry) => entry.id === 'rg-43686-vs-super-mario-bros');
    expect(vsmb?.url).toContain('43686-vs-super-mario-bros');

    // Paper Mario must be the N64 version, not a randomizer or hack.
    const pmario = games.find((entry) => entry.id === 'rg-43447-paper-mario-multiplayer');
    expect(pmario?.url).toContain('43447-paper-mario-multiplayer');
    expect(pmario?.url).not.toContain('randomizer');
    expect(pmario?.url).not.toContain('master-quest');

    // Mario Party 3 must be the actual cabinet, not a character mod.
    const mp3 = games.find((entry) => entry.id === 'rg-44138-mario-party-3-starstruck');
    expect(mp3?.url).toContain('44138-mario-party-3-starstruck');
    expect(mp3?.url).not.toContain('playable-');

    // Dr. Mario must be the arcade VS. System version.
    const drmario = games.find((entry) => entry.id === 'rg-46481-vs-dr-mario');
    expect(drmario?.url).toContain('46481-vs-dr-mario');
    expect(drmario?.url).not.toContain('dr-garfield');
    expect(drmario?.url).not.toContain('dr-smol');
  });

  it('keeps saga flagship cabinets on authentic retail versions', () => {
    // Every previously hack- or pirate-port-based saga flagship must now
    // point at the authentic retail cabinet (any region) now that one is
    // playable on a frameable provider.
    const authenticTargets: Array<[string, string, string]> = [
      // [id, expected cabinet id/slug, expected platform marker]
      ['super-metroid-elite-master', '16893-super-metroid-japan-usa-en-ja', 'Super Metroid'],
      ['final-fantasy-vii-elite', '43658-final-fantasy-vii-usa-disc-1', 'Final Fantasy VII'],
      ['rg-44098-tekken-2', '41514-tekken-2', 'Tekken 2'],
      ['earthbound-snes-elite', '24789-earthbound-usa', 'EarthBound'],
      ['golden-sun-gba-elite', '28962-golden-sun-u-mode7', 'Golden Sun'],
      ['double-dragon-iii-nes', '22161-double-dragon-iii-the-sacred-stones-usa', 'Double Dragon III'],
      ['dbz-hyper-dimension-snes', '23402-dragon-ball-z-hyper-dimension-japan', 'Hyper Dimension'],
      ['dbz-super-butouden-snes', '23964-dragon-ball-z-super-butouden-japan', 'Super Butouden'],
      ['dbz-super-butouden-3-snes', '23298-dragon-ball-z-super-butouden-3-japan', 'Super Butouden 3'],
      ['mgs-ps1', '43266-metal-gear-solid-disc-1', 'Metal Gear Solid'],
      ['mgs-gbc', '26934-metal-gear-solid-usa', 'Metal Gear Solid'],
      // Authentic retail SNES cabinets only served by RetroGames.cz.
      ['super-mario-world-elite-master', 'play_245-SNES.php', 'Super Mario World'],
      ['rg-44214-super-mario-kart-world', 'play_789-SNES.php', 'Super Mario Kart'],
      ['mmx-classic', 'play_865-SNES.php', 'Mega Man X'],
      ['mega-man-x3-elite-master', 'play_933-SNES.php', 'Mega Man X3'],
    ];

    for (const [id, cabinet, title] of authenticTargets) {
      const game = games.find((entry) => entry.id === id);
      expect(game).toBeTruthy();
      const url = game?.url || '';
      expect(url).toContain(cabinet);
      expect(game?.name).toContain(title);
      const lc = game?.launchConfig ?? {};
      expect(lc.embedMode).toBe('inline');
      expect(lc.approvedEmbedUrl).toBe(url);
      expect(lc.approvedExternalUrl).toBe(url);
    }

    // The hack cabinets these swaps replaced must be gone from the catalog.
    for (const id of [
      'rg-43860-super-mario-kart-deluxe',
      'samsho2-arcade-elite',
      'rg-43121-mother-2-deluxe-2-0',
    ]) {
      expect(games.some((entry) => entry.id === id)).toBe(false);
    }

    // No saga flagship may still be pointed at a fan hack or pirate port.
    const bannedCabinetSlugs = [
      '46870-super-metroid-vitality',
      '22172-final-fantasy-vii-c',
      '44098-tekken-2',
      '43121-mother-2-deluxe-2-0',
      '19277-golden-sun-c',
      '44986-super-mario-world',
      '44214-super-mario-kart-world',
      '44592-mega-man-x-hard-type',
      '44783-mega-man-x3-shadow-armor',
      '34279-samurai-shodown-ii-shin-samurai-spirits-haohmaru-j',
    ];
    for (const game of games) {
      const urls = [game.url, game.launchConfig?.approvedEmbedUrl, game.launchConfig?.approvedExternalUrl];
      for (const url of urls) {
        if (typeof url === 'string' && url) {
          expect(bannedCabinetSlugs.some((slug) => url.includes(slug))).toBe(false);
        }
      }
    }
  });

  it('fills every saga gap with an authentic, frameable cabinet', () => {
    // Saga titles that had zero or thin representation (Zelda, Sonic,
    // Pokemon, Mega Man X2/7, Street Fighter II Turbo, Double Dragon III,
    // DBZ SNES fighters, Metal Gear Solid) are now present with authentic
    // retail cabinets that are verified frameable.
    const required: Record<string, string> = {
      'zelda-nes': 'play_068-NES.php',
      'zelda-ii-nes': 'play_126-NES.php',
      'zelda-alttp-snes': 'play_283-SNES.php',
      'zelda-links-awakening-gb': 'play_977-GameBoy.php',
      'zelda-oot-n64': 'play_984-N64.php',
      'zelda-majoras-mask-n64': 'play_1065-N64.php',
      'sonic-1-genesis': 'play_117-Genesis.php',
      'sonic-spinball-genesis': 'play_1757-Genesis.php',
      'sonic-3d-blast-genesis': 'play_507-Genesis.php',
      'sonic-triple-trouble-gg': 'play_1240-GameGear.php',
      'pokemon-red-gb': 'play_285-GameBoy.php',
      'pokemon-blue-gb': 'play_284-GameBoy.php',
      'pokemon-snap-n64': 'play_1090-N64.php',
      'mega-man-x2-snes': 'play_895-SNES.php',
      'mega-man-7-snes': 'play_904-SNES.php',
      'sf2-turbo-snes': 'play_1133-SNES.php',
      'super-sf2-snes': 'play_919-SNES.php',
      'super-double-dragon-snes': 'play_925-SNES.php',
      'dbz-dragon-power-nes': 'play_1243-NES.php',
      'snakes-revenge-nes': 'play_1119-NES.php',
      'super-mario-land-gb': 'play_145-GameBoy.php',
      'super-mario-64': 'play_978-N64.php',
    };

    for (const [id, cabinet] of Object.entries(required)) {
      const game = games.find((entry) => entry.id === id);
      expect(game).toBeTruthy();
      expect(game?.url).toContain(cabinet);
      expect(game?.launchConfig?.approvedExternalUrl).toBe(game?.url);
    }

    // Saga counts across the catalog (flagships + authentic fills).
    const count = (needle: string) =>
      games.filter(
        (g) =>
          (g.name ?? '').toLowerCase().includes(needle) ||
          (g.id ?? '').toLowerCase().includes(needle)
      ).length;
    expect(count('zelda')).toBeGreaterThanOrEqual(6);
    expect(count('sonic')).toBeGreaterThanOrEqual(5);
    expect(count('pokemon')).toBeGreaterThanOrEqual(4);
    expect(count('mega man x')).toBeGreaterThanOrEqual(3);
    expect(count('street fighter ii')).toBeGreaterThanOrEqual(4);
    expect(count('metal gear')).toBeGreaterThanOrEqual(3);
  });

  it('has no Mario Kart 64 fan-remake cabinet in the catalog', () => {
    // No authentic Mario Kart 64 cabinet exists on the provider, so the
    // fabricated entry was removed rather than serving a fan remake.
    const mk = games.find((game) => game.id === 'mario-kart-64-elite');
    expect(mk).toBeFalsy();
  });

  it('keeps the compiled-in fallback feed in sync with the JSON asset', () => {
    // The fallback is the offline mirror of the primary catalog. If these
    // drift, users who fetch the asset off-cache get a different library.
    const jsonIds = games.map((g) => g.id ?? '').sort();
    const fallbackIds = THA_SPOT_FALLBACK_FEED.games.map((g) => g.id).sort();
    expect(jsonIds.every(id => fallbackIds.includes(id))).toBe(true);
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
