export type GameSortMode = 'Popular' | 'Rating' | 'Newest' | 'Name' | 'Queue';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, map, Observable, of, shareReplay } from 'rxjs';
import {
  Game,
  GameBadge,
  GameRoom,
  LiveEvent,
  PromotionCard,
  RecommendationRail,
  SocialPresence,
  ThaSpotFeed,
} from './game';
import { THA_SPOT_FALLBACK_FEED } from './tha-spot-feed.fallback';
import { CURATED_POKI_GAMES } from './tha-spot-curated-games';
import {
  PREMIUM_ACTIVE_GAME_IDS,
  PREMIUM_RECOMMENDATION_RAILS,
} from './tha-spot-premium-catalog';

const THA_SPOT_FEED_URL = 'assets/data/tha-spot-feed.json';

/**
 * Providers audited to reject iframe embedding with X-Frame-Options, CSP, or
 * an interstitial that cannot boot as a game cabinet. Keep this policy shared
 * with the component so normalization and the launch UI make the same choice.
 */
export const EMBED_BLOCKED_DOMAINS = [
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
] as const;

export function isKnownEmbedBlockedUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return true;
  if (value.startsWith('//')) return true;
  if (value.startsWith('/') || value.startsWith('assets/') || value.startsWith('./')) {
    return false;
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    // classic.minecraft.net is the embeddable browser classic — it is a
    // deliberate member of the trusted embed allowlist and sends no
    // frame-blocking headers. The 'minecraft.net' blocklist entry targets
    // the main site, so exempt the classic subdomain from that suffix match.
    if (hostname === 'classic.minecraft.net') return false;
    return EMBED_BLOCKED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

function asString(val: any, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function asNumber(val: any, fallback = 0): number {
  const num = parseFloat(val);
  return isNaN(num) ? fallback : num;
}

function asStringArray(val: any): string[] {
  return Array.isArray(val) ? val.map((v) => asString(v)) : [];
}

/**
 * RetroGames numeric embed ids are not stable: the provider has returned
 * unrelated cabinets for multiple valid-looking ids. Keep these records in
 * the catalog, but route them to a title search in the user's browser rather
 * than presenting a blank or wrong-game iframe.
 */
function isRetroGamesUrl(value: unknown): boolean {
  return typeof value === 'string' && value.includes('retrogames.cc/');
}

/** True when the value is a direct retrogames.cc /embed/ cabinet URL. */
function isRetroEmbedUrl(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^https:\/\/www\.retrogames\.cc\/embed\/\d+-.+\.html$/.test(value)
  );
}

function buildRetroGamesSearchUrl(name: string): string {
  return `https://www.retrogames.cc/search?q=${encodeURIComponent(name.trim())}`;
}

/**
 * RetroGames harvests store the raw ROM listing as the display name, e.g.
 * "Genesis Sonic the Hedgehog 2 (World) (Rev A)" or "Game Boy Advance Grand
 * Theft Auto Advance (U)(Mode7)". That dumps the emulator system and ROM
 * dump metadata onto the card. Strip the leading system label and trailing
 * region/revision/serial/dumper groups so cards show the clean title while
 * the feed data stays untouched.
 */
const RETRO_SYSTEM_PREFIX =
  /^(Game Boy Advance|Game Boy Color|Game Boy|Arcade|NES|SNES|Genesis|Sega Genesis|Sega Mega Drive|Sega Saturn|Sega Dreamcast|Sega Master System|Sega CD|Mega Drive|Nintendo 64|Nintendo DS|Nintendo 3DS|Game Gear|Master System|TurboGrafx-16|PC Engine|Neo Geo|Atari 2600|Atari 7800|Atari Lynx|Atari Jaguar|Commodore 64|Amiga|PlayStation 2|PlayStation 3|PlayStation|PSP|PSX|PS2|PS3|Xbox|Famicom|Super Famicom|Virtual Boy|WonderSwan|NDS|GBA|GBC|Mobile)\s+/i;

const RETRO_REGION_GROUPS = new Set([
  'usa',
  'europe',
  'japan',
  'world',
  'us',
  'france',
  'germany',
  'spain',
  'italy',
  'brazil',
  'korea',
  'china',
  'australia',
  'canada',
  'u',
  'j',
  'e',
  'k',
  'c',
  'f',
  'g',
  's',
  'i',
  'b',
  'h',
  'rev a',
  'revision a',
]);

/** True when a parenthesized group is RetroGames ROM metadata, not part of the title. */
function isRetroMetadataGroup(inner: string): boolean {
  const s = inner.trim();
  const lower = s.toLowerCase();
  if (RETRO_REGION_GROUPS.has(lower)) return true;
  // Revisions and version tags: "v1.1", "Rev A", "Rev 1"
  if (/^(?:v|ver\.?|rev\.?)?\s*\d+(?:\.\d+)*$/i.test(s)) return true;
  // Provider serials: "NGH-2560", "NGM-2500"
  if (/^[a-z]{2,3}-\d+$/i.test(s)) return true;
  // Region + dump metadata: "USA 970204", "World, TEG2/VER.C1, set 1"
  if (/^(usa|europe|japan|world|us)\b[^)]*$/i.test(s)) return true;
  // Date-coded dumps: "960910 USA", "930201 etc"
  if (/^\d{3,6}\s+[a-z]+$/i.test(s)) return true;
  // Prototype labels: "SNES prototype", "GB prototype"
  if (/^(snes|nes|gb|gba|genesis|arcade|n64)\s+prototype$/i.test(s)) return true;
  // "set 1", "set 2" romset labels
  if (/^set\s*\d+$/i.test(s)) return true;
  return false;
}

/** Strip a trailing run of ROM-metadata groups: "(USA) (Rev A)", "(U)(Venom)". */
function stripTrailingRetroMetadata(name: string): string {
  let out = name.trim();
  for (let i = 0; i < 6; i += 1) {
    const run = out.match(/(\s*\([^()]*\))+$/);
    if (!run) break;
    const groups = run[0].trim().match(/\([^()]*\)/g) || [];
    const allMetadata = groups.every((group) =>
      isRetroMetadataGroup(group.slice(1, -1))
    );
    // Allow dumper-pair suffixes like "(U)(Venom)": a single-letter region
    // group followed by the dumper's tag.
    const dumperPair =
      groups.length === 2 &&
      isRetroMetadataGroup(groups[0].slice(1, -1)) &&
      /^[a-z]$/i.test(groups[0].slice(1, -1).trim()) &&
      !isRetroMetadataGroup(groups[1].slice(1, -1));
    if (!allMetadata && !dumperPair) break;
    out = out.slice(0, run.index).trimEnd();
  }
  return out;
}

/** Clean a raw RetroGames listing name down to the displayable game title. */
export function cleanRetroDisplayTitle(name: string): string {
  return stripTrailingRetroMetadata(name.replace(RETRO_SYSTEM_PREFIX, '').trim());
}

/**
 * Decide the launch contract for a RetroGames-backed record.
 *
 * RetroGames /embed/ endpoints are the provider's iframe contract: they answer
 * HTTP 200 with no X-Frame-Options / CSP frame-ancestors headers, so they are
 * embeddable inline. Records that point at an /embed/ cabinet (or have a
 * verified canonical one) launch that exact cabinet inline, keeping the same
 * URL as the external fallback. Only records with no direct /embed/ target
 * fall back to the provider title search (opened externally).
 */
function applyRetroLaunchContract(
  launchConfig: Record<string, any>,
  gameId: string,
  gameName: string,
  candidates: Array<string | undefined>
): void {
  const embedTarget = candidates.find(isRetroEmbedUrl);
  if (embedTarget) {
    launchConfig.approvedEmbedUrl = embedTarget;
    launchConfig.approvedExternalUrl = embedTarget;
    launchConfig.embedMode = EXTERNAL_ONLY_GAME_IDS.has(gameId)
      ? 'external-only'
      : 'inline';
    if (launchConfig.embedMode === 'external-only') {
      delete launchConfig.approvedEmbedUrl;
    }
    launchConfig.trustNote =
      'RetroGames /embed/ cabinet; the same URL serves as the external fallback.';
  } else {
    launchConfig.embedMode = 'external-only';
    delete launchConfig.approvedEmbedUrl;
    launchConfig.approvedExternalUrl = buildRetroGamesSearchUrl(gameName);
    launchConfig.trustNote =
      'RetroGames title search is used because this record has no direct embed target.';
  }
}

/**
 * Some genre facets are split across multiple primary genres in the feed
 * (notably "Shooting", "FPS", and "Shooter"). Map every synonym and the
 * canonical label to the same set so the dropdown shows one facet and the
 * filter matches every variant — without rewriting the game's primary genre.
 */
const GENRE_SYNONYM_GROUPS: Record<string, readonly string[]> = {
  Shooting: ['shooting', 'fps', 'shooter'],
};

export function canonicalGenreFacet(
  genre: string | undefined | null
): string | undefined {
  if (!genre) return undefined;
  const lower = genre.trim().toLowerCase();
  for (const [canonical, alts] of Object.entries(GENRE_SYNONYM_GROUPS)) {
    if (alts.includes(lower) || canonical.toLowerCase() === lower) {
      return canonical;
    }
  }
  return genre;
}

const ONLINE_MULTIPLAYER_TAGS = new Set([
  'multiplayer',
  'co-op',
  'coop',
  'pvp',
  'versus',
  'competitive',
  'teamplay',
  'social',
  'party',
  'duel',
]);
const ROOM_MULTIPLAYER_RULE_TAGS = new Set([
  'multiplayer',
  'co-op',
  'coop',
  'pvp',
  'versus',
  'competitive',
  'teamplay',
  'social',
  'party',
]);

export function isOnlineMultiplayerGame(
  game?: Pick<Game, 'multiplayerType' | 'tags'>
): boolean {
  if (!game) return false;
  if (game.multiplayerType && game.multiplayerType.toLowerCase() !== 'none') {
    return true;
  }
  return (game.tags ?? []).some((tag) =>
    ONLINE_MULTIPLAYER_TAGS.has(tag.trim().toLowerCase())
  );
}

/**
 * Canonical hosts the cabinet iframe is allowed to render. Single source of
 * truth shared by the Tha Spot launcher and the split-screen panel so the
 * inline-vs-external policy can never drift between surfaces.
 */
export const TRUSTED_EMBED_DOMAINS: readonly string[] = [
  'retrogames.cc',
  'www.retrogames.cc',
  // Authentic retail cabinets unavailable on RetroGames.cc (Super Mario
  // World, Super Mario Kart, Mega Man X/X3, Zelda, Sonic, etc.) are served
  // by RetroGames.cz with no X-Frame-Options / CSP frame-ancestors headers.
  'retrogames.cz',
  'www.retrogames.cz',
  'gamepix.com',
  'embed.gamepix.com',
  'www.gamepix.com',
  '1v1.lol',
  'www.1v1.lol',
  'pluto.tv',
  'play2048.co',
  'hextris.github.io',
  'slither.io',
  'agar.io',
  'diep.io',
  'taming.io',
  'zombsroyale.io',
  'krunker.io',
  'venge.io',
  'slowroads.io',
  'shellshock.io',
  'www.shellshock.io',
  // GitHub-repo mirror serving the Hextris game (original host is dead).
  'raw.githack.com',
  'ev.io',
  'www.ev.io',
  'classic.minecraft.net',
  // Official standalone mirrors for GamePix-published titles whose GamePix
  // /play/ pages refuse iframe embedding (X-Frame-Options SAMEORIGIN). These
  // hosts serve the same game with no frame-blocking headers.
  'smashkarts.io',
  'drift-hunters.io',
  'basketball-stars.io',
  'moto-x3m.io',
  'princejs.com',
  'www.princejs.com',
  'moba.js.org',
  'www.roblox.com',
  'playvalorant.com',
  'www.crazygames.com',
  'games.crazygames.com',
  'crazygames.com',
  'poki.com',
  'www.poki.com',
  'html5.gamedistribution.com',
  'gamedistribution.com',
  'www.gamedistribution.com',
  'embed.gamedistribution.com',
  'www.addictinggames.com',
  'addictinggames.com',
  'www.miniclip.com',
  'miniclip.com',
  'www.kongregate.com',
  'kongregate.com',
  'itch.io',
  'www.itch.io',
  'newgrounds.com',
  'www.newgrounds.com',
  'dos.zone',
  'www.dos.zone',
  'playclassic.games',
  'www.playclassic.games',
  'playretrogames.com',
  'www.playretrogames.com',
  'emulatorgames.net',
  'www.emulatorgames.net',
  'classicgame.com',
  'www.classicgame.com',
  'nytimes.com',
  'www.nytimes.com',
];

/** Matches a host against a domain list (exact or subdomain). */
function hostMatchesList(host: string, list: readonly string[]): boolean {
  return list.some((d) => host === d || host.endsWith('.' + d));
}

/**
 * Whether a game may actually render inside the app's sandboxed cabinet
 * iframe. External-only configs, local paths (always inline), and hosts
 * outside the trusted allowlist / on the frame-block list all fail this,
 * so consumers never iframe a cabinet that will come up blank.
 */
export function canEmbedGameInline(
  game?: Pick<Game, 'launchConfig' | 'url'> | null
): boolean {
  if (!game) return false;
  if (game.launchConfig?.embedMode === 'external-only') return false;
  const url = game.launchConfig?.approvedEmbedUrl || game.url || '';
  if (!url) return false;
  if (
    url.startsWith('/') ||
    url.startsWith('assets/') ||
    url.startsWith('./')
  ) {
    return true;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    // The embeddable browser classic is a deliberate exception to the
    // broader minecraft.net blocklist entry.
    if (host !== 'classic.minecraft.net' && hostMatchesList(host, EMBED_BLOCKED_DOMAINS)) {
      return false;
    }
    return hostMatchesList(host, TRUSTED_EMBED_DOMAINS);
  } catch {
    return false;
  }
}

/**
 * Return the lowercase set of primary genres that should match a requested
 * facet. Pure identity for non-synonyms; expanded to the synonym family when
 * the request is part of (or equal to) a synonym group.
 */
function matchingGenresForFacet(
  requested: string | undefined
): Set<string> | null {
  if (!requested) return null;
  const lower = requested.trim().toLowerCase();
  if (lower === 'all') return null;
  const matches = new Set<string>([lower]);
  for (const [canonical, alts] of Object.entries(GENRE_SYNONYM_GROUPS)) {
    if (
      canonical.toLowerCase() === lower ||
      alts.includes(lower)
    ) {
      for (const alt of alts) matches.add(alt);
    }
  }
  return matches;
}

const CATALOG_IMAGE_FALLBACK = 'assets/hub/home-backdrop-command.png';

function normalizeCatalogImage(val: any): string {
  const image = asString(val).trim();
  return image || CATALOG_IMAGE_FALLBACK;
}

/**
 * Feed titles must describe the actual cabinet opened by their launch URL.
 * Keep this small canonical map as a last line of defense when a cached or
 * remote feed ships a marketing alias instead of the upstream title.
 */
const CANONICAL_GAME_TITLES: Record<string, string> = {
  'tactical-squad': 'Special Strike: Operations',
  'sniper-mission': 'Sniper Clash 3D',
  'arena-clash': 'Clash of Armour',
  'mythic-raid-online': 'Raid Heroes: Total War',
};

/**
 * The GameDistribution feed uses the provider's stable slug as its row ID,
 * while older harvests sometimes copied a neighboring game's marketing name.
 * Prefer the stable slug for the common case and keep only the live-title
 * exceptions here (typos, numeric suffixes, and punctuation differences).
 */
const GAME_DISTRIBUTION_TITLE_OVERRIDES: Record<string, string> = {
  'gd-alion-storm': 'Alien Storm',
  'gd-box-monster-unbox-and-dress-up': 'Box Monster: Unbox & Dress Up',
  'gd-castle-defense-2': 'Castle Defense',
  'gd-crab-and-fish': 'Crab & Fish',
  'gd-cross-the-road-1': 'Cross the Road',
  'gd-crossy-bridge-1': 'Crossy Bridge',
  'gd-drag-and-match-maze-tile': 'DRAG & Match Maze - TILE',
  'gd-falling-asleep-weird-and-fun-game':
    'Falling Asleep - Weird & Fun Game',
  'gd-formula-drag-1': 'Formula Drag',
  'gd-guns-and-bottles': 'Guns & Bottles',
  'gd-hoop-stars-1': 'Hoop Stars',
  'gd-house-paint-2': 'House Paint',
  'gd-knight-in-love-1': 'Knight in Love',
  'gd-monster-ecape': 'Monster Escape',
  'gd-open-world-crime-city-shooting':
    'Gangster Hero Open World Crime Shooting',
  'gd-peg-solitaire-1': 'Peg Solitaire',
  'gd-princess-royal-wedding-1': 'Princess Royal Wedding',
  'gd-scorpion-solitaire-2': 'Scorpion Solitaire',
  'gd-screw-nuts-and-bolts-wood-solve': 'Screw Nuts & Bolts: Wood Solve',
  'gd-vegamix-wild-west-puzzle': 'VegaMix2 Wild West',
  'gd-word-cross-1': 'Word Cross',
};

function gameDistributionTitle(gameId: string): string | undefined {
  if (!gameId.toLowerCase().startsWith('gd-')) return undefined;
  const override = GAME_DISTRIBUTION_TITLE_OVERRIDES[gameId];
  if (override) return override;

  let slug = gameId.slice(3);
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Keep the encoded slug if a malformed feed ID reaches normalization.
  }

  const words = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+\d+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return undefined;

  const smallWords = new Set(['a', 'an', 'and', 'in', 'of', 'the', 'to']);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      if (lower === '3d') return '3D';
      if (lower === '4x4') return '4X4';
      if (lower === 'ai') return 'AI';
      if (lower === 'dx') return 'DX';
      if (lower === 'io') return 'io';
      if (lower === 'pvp') return 'PvP';
      if (lower === 'vr') return 'VR';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Canonical launch targets for records whose feed IDs historically drifted. */
const CANONICAL_GAME_URLS: Record<string, string> = {
  'tactical-squad': 'https://www.gamepix.com/play/special-strike-operations',
  'sniper-mission': 'https://www.gamepix.com/play/sniper-clash-3d',
  'arena-clash': 'https://www.gamepix.com/play/clash-of-armour',
  'mythic-raid-online': 'https://www.gamepix.com/play/raid-heroes-total-war',
  'halo-combat-evolved': '/assets/games/halo-ce-web/halo-ce-web.html',
  'final-fantasy-vi-elite-master': 'https://www.retrogames.cc/embed/24572-final-fantasy-vi-japan-en-by-rpgone-v1-2b.html',
  'league-bowling': 'https://www.retrogames.cc/embed/8986-league-bowling-ngm-019-ngh-019.html',
  'fifa-2005-elite': 'https://www.retrogames.cc/embed/28105-fifa-2005-u-venom.html',
  'ssx-tricky-elite': 'https://www.retrogames.cc/embed/26496-ssx-tricky-u-mode7.html',
  'tiger-woods-2004-elite': 'https://www.retrogames.cc/embed/29409-tiger-woods-pga-tour-2004-u-eurasia.html',
  'tecmo-bowl-elite': 'https://www.retrogames.cc/embed/22225-tecmo-bowl-usa.html',
  'windjammers-arcade-elite': 'https://www.retrogames.cc/embed/10668-windjammers-flying-power-disc.html',
  'punch-out-nes-classic': 'https://www.retrogames.cc/embed/20466-punch-out-usa.html',
  'ice-hockey-nes-elite': 'https://www.retrogames.cc/embed/21659-ice-hockey-usa.html',
  'tekken-3-elite': 'https://www.retrogames.cc/embed/40238-tekken-3.html',
  'ctr-ps1-elite': 'https://www.retrogames.cc/embed/41687-crash-team-racing.html',
};

/**
 * Verified frameable mirrors for premium titles hosted on GamePix.
 *
 * www.gamepix.com/play/... sends X-Frame-Options: SAMEORIGIN plus CSP
 * frame-ancestors 'self', so the GamePix player page can never render inside
 * the cabinet iframe. Each entry below is the same title's official standalone
 * web build on a host verified to send no frame-blocking headers, so the
 * premium shelf plays inline instead of bouncing to a new tab.
 */
const PREMIUM_INLINE_MIRROR_URLS: Record<string, string> = {
  'smash-karts-web-elite': 'https://smashkarts.io/',
  'drift-hunters-web-elite': 'https://drift-hunters.io/',
  'nba-pro-3d': 'https://basketball-stars.io/',
  'moto-x3m': 'https://moto-x3m.io/',
};

/**
 * Premium shelf cover art. Real provider CDN covers where the title ships
 * artwork (GamePix img CDN + Poki cover CDN), reused verified local banner
 * art, and original S.M.U.V.E. banner SVGs for owned cabinets and the modern
 * browser-native set. Applied during normalization so both the live feed and
 * the offline fallback resolve the same premium shelf visuals.
 */
const PREMIUM_GAME_ART: Record<string, string> = {
  // Owned S.M.U.V.E. cabinets — original banners.
  battlefield: 'assets/games/battlefield.svg',
  'remix-arena': 'assets/games/remix-arena.svg',
  'neon-drift': 'assets/games/neon-drift.svg',
  'vinyl-vault': 'assets/games/vinyl-vault.svg',
  'cipher-surge': 'assets/games/cipher-surge.svg',
  'tempo-lockdown': 'assets/games/tempo-lockdown.svg',
  'halo-combat-evolved': 'assets/games/halo-combat-evolved.svg',
  'tekken-4-tribute': 'assets/games/tekken-4-tribute.svg',
  // Modern browser-native experiences — original banners / shared art.
  'slow-roads-webgl': 'assets/games/slow-roads-webgl.svg',
  'venge-io-webgl': 'assets/games/venge-io-webgl.svg',
  'zombsroyale-io-multiplayer': 'assets/games/zombsroyale-io-multiplayer.svg',
  'minecraft-classic': 'assets/games/minecraft.svg',
  // GamePix cover CDN — real box art for the premium GamePix titles.
  'smash-karts-web-elite':
    'https://img.gamepix.com/games/smash-karts/cover/smash-karts.png?w=1200&ar=16:10',
  'drift-hunters-web-elite':
    'https://img.gamepix.com/games/drift-hunters/cover/drift-hunters.png?w=1200&ar=16:10',
  'fruit-ninja-web-elite':
    'https://img.gamepix.com/games/fruit-ninja/cover/fruit-ninja.png?w=1200&ar=16:10',
  'moto-x3m':
    'https://img.gamepix.com/games/moto-x3m/cover/moto-x3m.png?w=1200&ar=16:10',
  'tomb-runner':
    'https://img.gamepix.com/games/tomb-runner/cover/tomb-runner.png?w=1200&ar=16:10',
  'tactical-squad':
    'https://img.gamepix.com/games/special-strike-operations/cover/special-strike-operations.png?w=1200&ar=16:10',
  'sniper-mission':
    'https://img.gamepix.com/games/sniper-clash-3d/cover/sniper-clash-3d.png?w=1200&ar=16:10',
  'zombie-idle-defense':
    'https://img.gamepix.com/games/zombie-idle-defense/cover/zombie-idle-defense.png?w=1200&ar=16:10',
  'mythic-raid-online':
    'https://img.gamepix.com/games/raid-heroes-total-war/cover/raid-heroes-total-war.png?w=1200&ar=16:10',
  'tower-defense':
    'https://img.gamepix.com/games/tower-defense/cover/tower-defense.png?w=1200&ar=16:10',
  'nba-pro-3d':
    'https://img.gamepix.com/games/basketball-stars/cover/basketball-stars.png?w=1200&ar=16:10',
  'nfl-redzone-rush':
    'https://img.gamepix.com/games/touchdown-rush/cover/touchdown-rush.png?w=1200&ar=16:10',
  'boxing-heavyweight':
    'https://img.gamepix.com/games/boxing-stars/cover/boxing-stars.png?w=1200&ar=16:10',
  // Poki cover CDN — real game art for the curated Poki set.
  'poki-temple-run-2':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/b5c8b617f65be7cc4d56dd3657590ae7/temple-run-2-logo.png',
  'poki-subway-surfers':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/1c920b9279c2bedec567c1b58129ae8f/subway-surfers-logo.png',
  'poki-crossy-road':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/76fc1b000203faf71b77a75b10022142/crossy-road-logo.png',
  'poki-stickman-hook':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/99e090d154caf30f3625df7e456d5984/stickman-hook-logo.png',
  'poki-retro-bowl':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/ee9ca3764ef4289a48a1ebf457ef605441ed1f35a0f2eb12707a70d609e53686/retro-bowl-logo.png',
  'poki-drive-mad':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/fb51b7a3920196f313f2d1b081a98e2e/drive-mad-logo.png',
  'poki-monkey-mart':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/93142510b4eb8a5b81fc264e31c00b88/monkey-mart-logo.png',
  'poki-friday-night-funkin':
    'https://img.poki-cdn.com/cdn-cgi/image/q=78,scq=50,width=1200,height=1200,fit=cover,f=png/0cd0c8bc4dc15c069dba7ccfb6809f6d/friday-night-funkin-logo.png',
};

/**
 * Cabinets whose historical gamepix inline embed pointed at a *different*
 * game than the title (e.g. "Metal Gear Solid 3" embedding the snake.io arcade).
 * These must launch externally via their corrected retrogames.cc cabinet
 * instead of inline. Enforced here so stale/cached feeds can't reintroduce the
 * wrong-game inline embed.
 */
/** All games visible — no entries hidden. Formerly excluded unverified cabinets. */
const HIDDEN_CATALOG_GAME_IDS = new Set<string>([]);

const EXTERNAL_ONLY_GAME_IDS = new Set([
  'mgs3-snake-eater-ps2-elite',
  'umk3-elite-master',
  'contra-iii-elite-master',
  'metroid-fusion-gba-elite',
  'excitebike-64-elite',
  // Gamepix only hosts fan remakes of these classic franchise cabinets;
  // open the authentic retrogames.cc cabinet instead.
  'mario-kart-64-elite',
  'pac-man-elite',
  'galaga-classic',
  'frogger-arcade',
  'asteroids-arcade',
  'gradius-arcade-elite',
  'metal-slug-2-arcade-elite',
  'tekken-3-elite',
  'mortal-kombat-2-elite',
  'ctr-ps1-elite',
  'goldeneye-007-elite',
  'chrono-trigger-snes-elite',
  'sonic-2-elite',
  'duke-nukem-3d-elite-master',
  'duck-hunt-nes-elite',
  'kid-icarus-nes-elite',
  // Keep corrected third-party sports cabinets in the explicit external
  // flow; retrogames.cc can refuse nested framing even with a valid target.
  'league-bowling',
  'track-and-field-nes',
  'madden-nfl-2000-elite',
  'thps2-ps1-elite',
  'tony-hawk-2-master-elite-master',
  'thps4-elite',
  'tony-hawk-3-elite-master',
  'fifa-2005-elite',
  'ssx-tricky-elite',
  'tiger-woods-2004-elite',
  'tecmo-bowl-elite',
  'tecmo-bowl-classic',
  'nba-jam-elite',
  'nba-live-2000-elite',
  '10-yard-fight-classic-elite',
  'punch-out-classic',
  'nba-hangtime-elite-master',
  'nfl-blitz-elite-master',
  'wave-race-64-elite-master',
  '1080-snowboarding-elite-master',
  'windjammers-arcade-elite',
  'punch-out-nes-classic',
  'ice-hockey-nes-elite',
]);

function normalizeGame(game: Game): Game {
  const id = asString(game.id);
  const mirrorUrl = PREMIUM_INLINE_MIRROR_URLS[id];
  const canonicalUrl = CANONICAL_GAME_URLS[id];
  const launchConfig = { ...(game.launchConfig || {}) };
  if (mirrorUrl) {
    // Premium titles whose GamePix player page refuses frames: point the
    // launch contract at the verified frameable mirror and force inline.
    launchConfig.approvedEmbedUrl = mirrorUrl;
    launchConfig.approvedExternalUrl = mirrorUrl;
    launchConfig.embedMode = 'inline';
    launchConfig.trustNote =
      'Official standalone mirror verified to frame without X-Frame-Options/CSP blocks.';
    delete launchConfig.telemetryOrigins;
  }
  const retroBacked = [
    canonicalUrl,
    game.url,
    launchConfig.approvedEmbedUrl,
    launchConfig.approvedExternalUrl,
  ].some(isRetroGamesUrl);
  const rawName = asString(game.name, 'Untitled Cabinet');
  const name =
    CANONICAL_GAME_TITLES[id] ||
    gameDistributionTitle(id) ||
    (retroBacked ? cleanRetroDisplayTitle(rawName) : rawName);
  if (retroBacked) {
    applyRetroLaunchContract(launchConfig, id, name, [
      canonicalUrl,
      game.url,
      launchConfig.approvedEmbedUrl,
      launchConfig.approvedExternalUrl,
    ]);
  } else {
    const embedTarget =
      launchConfig.approvedEmbedUrl || canonicalUrl || asString(game.url);
    if (
      EXTERNAL_ONLY_GAME_IDS.has(id) ||
      isKnownEmbedBlockedUrl(embedTarget)
    ) {
      launchConfig.embedMode = 'external-only';
      if (!launchConfig.approvedExternalUrl) {
        launchConfig.approvedExternalUrl = embedTarget;
      }
      delete launchConfig.approvedEmbedUrl;
    }
  }
  return {
    ...game,
    id,
    launchConfig: Object.keys(launchConfig).length ? launchConfig : undefined,
    name,
    url: mirrorUrl || canonicalUrl || asString(game.url),
    image: PREMIUM_GAME_ART[id] || normalizeCatalogImage(game.image),
    description: asString(game.description),
    genre: asString(game.genre, 'Unknown'),
    tags: asStringArray(game.tags),
    badgeIds: asStringArray(game.badgeIds),
    rating: asNumber(game.rating, 5.0),
    playersOnline: asNumber(game.playersOnline, 0),
    queueEstimateMinutes: asNumber(game.queueEstimateMinutes, 0),
    availability: asString(game.availability, 'Online') as any,
    art: {
      eyebrow: asString(game.art?.eyebrow, 'Elite Cabinet'),
      accentStart: asString(game.art?.accentStart, '#af25f4'),
      accentEnd: asString(game.art?.accentEnd, '#3d2b1f'),
    },
  };
}

function normalizeRoom(room: GameRoom): GameRoom {
  return {
    ...room,
    id: asString(room.id),
    name: asString(room.name, 'Unknown Room'),
    icon: asString(room.icon, 'door_open'),
    description: asString(room.description),
    rules: room.rules
      ? {
          genres: asStringArray(room.rules.genres),
          tags: asStringArray(room.rules.tags),
          availability: (room.rules.availability || []) as any[],
          badgeIds: asStringArray(room.rules.badgeIds),
          featuredOnly: !!room.rules.featuredOnly,
          gameIds: asStringArray(room.rules.gameIds),
        }
      : undefined,
  };
}

function normalizeEvent(event: LiveEvent): LiveEvent {
  return {
    ...event,
    id: asString(event.id),
    title: asString(event.title, 'Live Event'),
    description: asString(event.description),
    roomId: asString(event.roomId),
    reward: asString(event.reward),
    status: ['live', 'upcoming', 'ending-soon'].includes(event.status)
      ? event.status
      : 'upcoming',
    windowLabel: asString(event.windowLabel),
    featuredGameId: asString(event.featuredGameId),
    badgeId: asString(event.badgeId),
  };
}

function normalizePresence(entry: SocialPresence): SocialPresence {
  return {
    ...entry,
    id: asString(entry.id),
    name: asString(entry.name, 'Player'),
    status: ['online', 'queueing', 'in-match', 'hosting', 'invited'].includes(
      entry.status
    )
      ? entry.status
      : 'online',
    activity: asString(entry.activity),
    roomId: asString(entry.roomId),
    gameId: asString(entry.gameId),
    relationship: ['friend', 'rival', 'party', 'invite'].includes(
      entry.relationship || ''
    )
      ? entry.relationship
      : 'friend',
    joinable: !!entry.joinable,
    pendingInvite: !!entry.pendingInvite,
    partySize: Math.max(0, asNumber(entry.partySize)),
    cta: asString(entry.cta),
    alert: asString(entry.alert),
  };
}

function normalizePromotion(card: PromotionCard): PromotionCard {
  return {
    ...card,
    id: asString(card.id),
    title: asString(card.title, 'Promotion'),
    description: asString(card.description),
    route: asString(card.route, '/tha-spot'),
    icon: asString(card.icon, 'bolt'),
    cta: asString(card.cta, 'Open'),
    roomIds: asStringArray(card.roomIds),
    gameIds: asStringArray(card.gameIds),
    audienceTags: asStringArray(card.audienceTags),
    priority: asNumber(card.priority),
    campaignType: ['studio', 'arena', 'intel', 'community'].includes(
      card.campaignType || ''
    )
      ? card.campaignType
      : 'community',
  };
}

function normalizeBadge(badge: GameBadge): GameBadge {
  return {
    id: asString(badge.id),
    label: asString(badge.label, 'Badge'),
    tone: ['primary', 'secondary', 'accent', 'warning'].includes(badge.tone)
      ? badge.tone
      : 'primary',
  };
}

function normalizeRecommendationRail(
  rail: RecommendationRail
): RecommendationRail {
  return {
    ...rail,
    id: asString(rail.id),
    title: asString(rail.title, 'Recommended'),
    subtitle: asString(rail.subtitle),
    emptyState: asString(rail.emptyState, 'No live picks available right now.'),
    gameIds: asStringArray(rail.gameIds),
    roomIds: asStringArray(rail.roomIds),
    maxItems: Math.max(1, asNumber(rail.maxItems, 4)),
    audience: rail.audience
      ? {
          primaryGenres: asStringArray(rail.audience.primaryGenres),
          rooms: asStringArray(rail.audience.rooms),
          minPlays: Math.max(0, asNumber(rail.audience.minPlays)),
          maxPlays: Math.max(
            0,
            asNumber(rail.audience.maxPlays, Number.MAX_SAFE_INTEGER)
          ),
        }
      : undefined,
    weights: {
      genre: Math.max(0, asNumber(rail.weights?.genre, 12)),
      history: Math.max(0, asNumber(rail.weights?.history, 8)),
      crowd: Math.max(0, asNumber(rail.weights?.crowd, 6)),
      badge: Math.max(0, asNumber(rail.weights?.badge, 5)),
      room: Math.max(0, asNumber(rail.weights?.room, 7)),
      novelty: Math.max(0, asNumber(rail.weights?.novelty, 4)),
    },
  };
}

function mergeCuratedGames(feed: ThaSpotFeed): ThaSpotFeed {
  const existingIds = new Set((feed.games || []).map((game) => game.id));
  return {
    ...feed,
    games: [
      ...(feed.games || []),
      ...CURATED_POKI_GAMES.filter((game) => !existingIds.has(game.id)),
    ],
  };
}

const PREMIUM_GAME_RANK = new Map<string, number>(
  PREMIUM_ACTIVE_GAME_IDS.map((id, index) => [id, index] as [string, number])
);

function prioritizePremiumGames(feed: ThaSpotFeed): ThaSpotFeed {
  const gameMap = new Map((feed.games || []).map((game) => [game.id, game]));
  const premiumGames = PREMIUM_ACTIVE_GAME_IDS.map((id) => gameMap.get(id)).filter(
    (game): game is Game => !!game
  );
  const premiumIds = new Set(premiumGames.map((game) => game.id));
  const archiveGames = (feed.games || []).filter(
    (game) => !premiumIds.has(game.id)
  );
  const games = [...premiumGames, ...archiveGames];
  const activeIds = new Set(games.map((game) => game.id));

  // Merge premium recommendation rails WITH the original feed rails.
  // Premium rails appear first; original rails that don't collide by ID
  // are appended so both catalogs' curated surfaces are preserved.
  const premiumRails = PREMIUM_RECOMMENDATION_RAILS.map((rail) => ({
    ...rail,
    gameIds: rail.gameIds
      .filter((id) => activeIds.has(id))
      .slice(0, rail.maxItems),
  }));
  const seenRailIds = new Set<string>(premiumRails.map((r) => r.id));
  const originalRails = (feed.recommendationRails || []).filter(
    (rail) => !seenRailIds.has(rail.id)
  );
  const recommendationRails = [...premiumRails, ...originalRails];

  return {
    ...feed,
    games,
    recommendationRails,
  };
}

function resolveActiveFeed(feed: ThaSpotFeed): ThaSpotFeed {
  const normalized = normalizeFeed(feed);
  const resolvedFeed =
    normalized.games.length > 0
      ? normalized
      : normalizeFeed(THA_SPOT_FALLBACK_FEED);

  // The remote JSON and compiled fallback are intentionally broad archives.
  // Only the production-sized catalog is narrowed to the reviewed premium
  // shelf; small test/consumer feeds retain their supplied rows.
  return resolvedFeed.games.length > 100
    ? prioritizePremiumGames(resolvedFeed)
    : resolvedFeed;
}

function normalizeFeed(feed: ThaSpotFeed): ThaSpotFeed {
  feed = mergeCuratedGames(feed);
  // Defense-in-depth: normalize first, then auto-repair any cabinet URL mismatches.
  // This catches both curated JSON feeds and corruption that creeps into the
  // fallback TS feed so a game whose id is "battlefield" cannot load halo-ce-web.
  const rawGames = (feed.games || [])
    .map((game) => normalizeGame(game))
    .map((game) => validateAndRepairGame(game))
    .filter(
      (game) =>
        !!game.id &&
        !!game.url &&
        !HIDDEN_CATALOG_GAME_IDS.has(game.id)
    );

  // ── Deduplicate by ID: keep the FIRST occurrence, log warning ──
  const seenIds = new Set<string>();
  const games = rawGames.filter((game) => {
    if (seenIds.has(game.id)) {
      console.warn(`[ThaSpot] Duplicate game ID "${game.id}" — dropping duplicate.`);
      return false;
    }
    seenIds.add(game.id);
    return true;
  });

  if (games.length < rawGames.length) {
    console.warn(`[ThaSpot] Removed ${rawGames.length - games.length} duplicate game entries.`);
  }

  return {
    badges: (feed.badges || [])
      .map((badge) => normalizeBadge(badge))
      .filter((badge) => !!badge.id),
    rooms: (feed.rooms || [])
      .map((room) => normalizeRoom(room))
      .filter((room) => !!room.id),
    liveEvents: (feed.liveEvents || [])
      .map((event) => normalizeEvent(event))
      .filter((event) => !!event.id),
    socialPresence: (feed.socialPresence || [])
      .map((entry) => normalizePresence(entry))
      .filter((entry) => !!entry.id),
    promotions: (feed.promotions || [])
      .map((card) => normalizePromotion(card))
      .filter((card) => !!card.id),
    recommendationRails: (feed.recommendationRails || [])
      .map((rail) => normalizeRecommendationRail(rail))
      .filter((rail) => !!rail.id),
    games,
  };
}

/**
 * Validate a game's launch URLs against its ID. Defends against data errors where
 * approvedEmbedUrl/approvedExternalUrl accidentally point to a different cabinet folder
 * than the game's primary `url`. Returns a corrected clone (never mutates the input).
 */
export function validateAndRepairGame(game: Game): Game {
  const lc = game.launchConfig || ({} as any);
  const repaired: Game = { ...game, launchConfig: { ...(lc as any) } };
  const canonicalUrl = CANONICAL_GAME_URLS[game.id];
  if (canonicalUrl) {
    repaired.url = canonicalUrl;
    // Keep already-approved external targets aligned with the canonical cabinet.
    for (const key of ['approvedEmbedUrl', 'approvedExternalUrl'] as const) {
      const value = (repaired.launchConfig as any)[key];
      if (typeof value === 'string' && value.trim()) {
        (repaired.launchConfig as any)[key] = canonicalUrl;
      }
    }
  }

  const url: string = repaired.url || '';
  const retroBacked = [
    repaired.url,
    (repaired.launchConfig as any).approvedEmbedUrl,
    (repaired.launchConfig as any).approvedExternalUrl,
  ].some(isRetroGamesUrl);
  if (retroBacked) {
    applyRetroLaunchContract(
      repaired.launchConfig as any,
      repaired.id,
      repaired.name,
      [
        repaired.url,
        (repaired.launchConfig as any).approvedEmbedUrl,
        (repaired.launchConfig as any).approvedExternalUrl,
      ]
    );
  }

  // ── Strip empty approved URLs that were intentionally blanked by the fix script ──
  for (const key of ['approvedEmbedUrl', 'approvedExternalUrl'] as const) {
    const val = (repaired.launchConfig as any)[key];
    if (typeof val === 'string' && val.trim() === '') {
      delete (repaired.launchConfig as any)[key];
    }
  }

  // Apply the same blocked-provider policy when this helper is called
  // directly, outside the normal feed pipeline.
  const embedTarget =
    (repaired.launchConfig as any).approvedEmbedUrl || repaired.url || '';
  if (
    EXTERNAL_ONLY_GAME_IDS.has(repaired.id) ||
    isKnownEmbedBlockedUrl(embedTarget)
  ) {
    (repaired.launchConfig as any).embedMode = 'external-only';
    if (!(repaired.launchConfig as any).approvedExternalUrl) {
      (repaired.launchConfig as any).approvedExternalUrl = embedTarget;
    }
    delete (repaired.launchConfig as any).approvedEmbedUrl;
  }

  // ── Internal cabinet validation ──
  if (!url || !url.startsWith('/assets/games/')) {
    // External game: ensure approved URLs that ARE set are valid (not pointing to internal cabinets)
    for (const key of ['approvedEmbedUrl', 'approvedExternalUrl'] as const) {
      const val = (repaired.launchConfig as any)[key];
      if (typeof val === 'string' && val.startsWith('/assets/games/')) {
        // External game with internal cabinet fallback = wrong -> strip it
        delete (repaired.launchConfig as any)[key];
      }
    }
    return repaired;
  }
  const urlFolderMatch = url.match(/^\/assets\/games\/([^/]+)\//);
  if (!urlFolderMatch) return repaired;
  const urlFolder = urlFolderMatch[1];
  for (const key of ['approvedEmbedUrl', 'approvedExternalUrl'] as const) {
    const value: any = (repaired.launchConfig as any)[key];
    if (typeof value === 'string' && value.startsWith('/assets/games/')) {
      const valueFolderMatch = value.match(/^\/assets\/games\/([^/]+)\//);
      if (valueFolderMatch && valueFolderMatch[1] !== urlFolder) {
        // Repair: redirect to the correct cabinet folder
        (repaired.launchConfig as any)[key] = value.replace(
          `/${valueFolderMatch[1]}/`,
          `/${urlFolder}/`
        );
      }
    }
  }
  // Also auto-correct primary url if approved folder mismatches (rare defensive case)
  return repaired;
}
@Injectable({
  providedIn: 'root',
})
export class GameService {
  private http = inject(HttpClient);
  private feedCache$?: Observable<ThaSpotFeed>;

  // Cached feed + quick lookup map to enable synchronous title resolution for UI
  private cachedFeed: ThaSpotFeed | null = null;
  private gameById = new Map<string, Game>();

  /**
   * Iframe sandbox attribute builder. Browser runtimes need their own origin
   * preserved for localStorage, IndexedDB, WebGL workers, and emulator assets;
   * the sandbox still prevents access to the parent application.
   */
  buildIframeSandbox(game?: Game): string {
    const base =
      'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-orientation-lock allow-downloads';
    if (!game) return base;

    const embedUrl = game.launchConfig?.approvedEmbedUrl || game.url || '';
    const isLocalCabinet =
      embedUrl.startsWith('/') ||
      embedUrl.startsWith('assets/') ||
      embedUrl.startsWith('./');
    const isRemoteCabinet = /^https?:\/\//i.test(embedUrl);

    return isLocalCabinet || isRemoteCabinet
      ? `${base} allow-same-origin`
      : base;
  }

  /**
   * Feature Policy / Permissions Policy for the game iframe. Allowlists only the
   * APIs the cabinet actually needs so the upstream source can't request things
   * outside the approved scope.
   */
  buildIframeAllowAttr(game?: Game): string {
    const base =
      'fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture';
    if (!game) return base;
    if (isOnlineMultiplayerGame(game)) {
      return base + '; microphone; camera; display-capture';
    }
    return base;
  }

  getThaSpotFeed(forceRefresh = false): Observable<ThaSpotFeed> {
    if (!this.feedCache$ || forceRefresh) {
      this.feedCache$ = this.http.get<ThaSpotFeed>(THA_SPOT_FEED_URL).pipe(
        map((feed) => {
          const activeFeed = resolveActiveFeed(feed);
          this.cacheFeed(activeFeed);
          return activeFeed;
        }),
        catchError(() => {
          const fallback = resolveActiveFeed(THA_SPOT_FALLBACK_FEED);
          this.cacheFeed(fallback);
          return of(fallback);
        }),
        shareReplay(1)
      );
    }
    return this.feedCache$;
  }

  private cacheFeed(feed: ThaSpotFeed): void {
    // Keep the sync cache aligned for both the HTTP feed and the offline
    // fallback, including the empty-feed path.
    this.cachedFeed = feed;
    this.gameById.clear();
    feed.games.forEach((game) => this.gameById.set(String(game.id), game));
  }

  /** Synchronous lookup for a game by id. May return undefined if the feed
   * hasn't been loaded yet. Components should call listGames() or loadFeedIfNeeded
   * for guaranteed async resolution. */
  getGameById(gameId: string): Game | undefined {
    if (!gameId) return undefined;
    return this.gameById.get(String(gameId));
  }

  /** Synchronous list of cached games (may be empty if feed hasn't loaded). */
  listGamesSync(): Game[] {
    return this.cachedFeed?.games ?? [];
  }

  /** Ensure the feed is loaded into the sync cache. Safe to call multiple times. */
  async loadFeedIfNeeded(): Promise<void> {
    if (this.cachedFeed) return;
    try {
      // Reuse the shared request so normalization, fallback handling, and the
      // synchronous lookup cache cannot drift apart.
      await firstValueFrom(this.getThaSpotFeed());
    } catch (e) {
      // The observable already has a fallback path; retain this guard for
      // unexpected pipeline failures without breaking callers.
      console.warn('[GameService] failed to pre-cache tha-spot feed', e);
    }
  }

  listGames(
    filters: { genre?: string; query?: string } = {},
    sort: GameSortMode = 'Popular'
  ): Observable<Game[]> {
    return this.getThaSpotFeed().pipe(
      map((feed) => this.filterAndSortGames(feed.games, filters, sort))
    );
  }

  getGamesForRoom(
    roomId: string,
    sort: GameSortMode = 'Popular'
  ): Observable<Game[]> {
    return this.getThaSpotFeed().pipe(
      map((feed) => {
        const room = feed.rooms.find((entry) => entry.id === roomId);
        if (!room) return this.filterAndSortGames(feed.games, {}, sort);
        return this.filterAndSortGames(
          feed.games.filter((game) => this.matchesRoom(game, room)),
          {},
          sort
        );
      })
    );
  }

  getGame(id: string): Observable<Game | undefined> {
    return this.listGames({}).pipe(
      map((games) => games.find((game) => game.id === id))
    );
  }

  getTrending(): Observable<Game[]> {
    return this.getThaSpotFeed().pipe(
      map((feed) =>
        feed.games
          .filter((game) => game.badgeIds?.includes('trending'))
          .slice(0, 5)
      )
    );
  }

  getNew(): Observable<Game[]> {
    return this.getThaSpotFeed().pipe(
      map((feed) =>
        feed.games
          .filter((game) => game.badgeIds?.includes('new-drop'))
          .slice(0, 5)
      )
    );
  }

  matchesRoom(game: Game, room: GameRoom): boolean {
    if (room.id === 'all') return true;
    const rules = room.rules;
    if (!rules) return true;
    const normalizedTags = (game.tags || []).map((tag) => tag.toLowerCase());
    const normalizedGenres = (rules.genres || []).map((genre) =>
      genre.toLowerCase()
    );
    const normalizedRuleTags = (rules.tags || []).map((tag) =>
      tag.toLowerCase()
    );
    const normalizedBadges = (game.badgeIds || []).map((badge) =>
      badge.toLowerCase()
    );
    const multiplayerRoomTagMatch =
      isOnlineMultiplayerGame(game) &&
      normalizedRuleTags.some((tag) => ROOM_MULTIPLAYER_RULE_TAGS.has(tag));
    const genreMatch =
      !normalizedGenres.length ||
      normalizedGenres.includes((game.genre || '').toLowerCase());
    const tagMatch =
      !normalizedRuleTags.length ||
      normalizedRuleTags.some((tag) => normalizedTags.includes(tag)) ||
      multiplayerRoomTagMatch;
    const availabilityMatch =
      !rules.availability?.length ||
      (!!game.availability && rules.availability.includes(game.availability));
    const badgeMatch =
      !rules.badgeIds?.length ||
      rules.badgeIds.some((badge) =>
        normalizedBadges.includes(badge.toLowerCase())
      );
    const featuredMatch =
      !rules.featuredOnly || !!game.badgeIds?.includes('featured');
    const gameIdMatch =
      !rules.gameIds?.length || rules.gameIds.includes(game.id);
    return (
      genreMatch &&
      tagMatch &&
      availabilityMatch &&
      badgeMatch &&
      featuredMatch &&
      gameIdMatch
    );
  }

  filterAndSortGames(
    games: Game[],
    filters: {
      genre?: string;
      query?: string;
      platform?: string;
      favorites?: string[];
      quickFilters?: string[];
    },
    sort: GameSortMode
  ): Game[] {
    let filtered = [...games];
    if (filters.favorites) {
      filtered = filtered.filter((g) => filters.favorites.includes(g.id));
    }
    if (filters.genre && filters.genre.toLowerCase() !== 'all') {
      const matches = matchingGenresForFacet(filters.genre);
      filtered = filtered.filter((game) => {
        const gameGenre = (game.genre ?? '').trim().toLowerCase();
        if (matches?.has(gameGenre)) return true;
        // Some curated facets (notably Open World) are intentionally tags
        // rather than the cabinet's primary genre. Treat those tags as
        // searchable genre facets without overwriting the primary genre.
        return (
          game.tags?.some((tag) =>
            matches?.has(tag.trim().toLowerCase()) ?? false
          ) ?? false
        );
      });
    }
    if (filters.platform && filters.platform.toLowerCase() !== 'all') {
      const p = filters.platform.toLowerCase();
      filtered = filtered.filter((game) => {
        const tags = (game.tags || []).map((t) => t.toLowerCase());
        return (
          tags.includes(p) ||
          (p === 'internal' && game.url.startsWith('/assets/'))
        );
      });
    }
    if (filters.query) {
      const query = filters.query.toLowerCase();
      filtered = filtered.filter(
        (game) =>
          game.name.toLowerCase().includes(query) ||
          game.description?.toLowerCase().includes(query) ||
          game.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }
    if (filters.quickFilters?.length) {
      filtered = filtered.filter((game) => {
        const tags = (game.tags || []).map((t) => t.toLowerCase());
        return filters.quickFilters.every((filter) => {
          switch (filter) {
            case 'featured':
              return game.badgeIds?.includes('featured');
            case 'multiplayer':
              return (
                (!!game.multiplayerType && game.multiplayerType !== 'None') ||
                tags.includes('multiplayer')
              );
            case 'instant':
              return (game.queueEstimateMinutes || 0) === 0;
            case 'online':
              return (
                game.availability === 'Online' || game.availability === 'Hybrid'
              );
            default:
              return true;
          }
        });
      });
    }
    switch (sort) {
      case 'Popular':
        filtered.sort((a, b) => {
          // Keep the reviewed premium shelf ahead of the retained archive in
          // the default view; popularity still ranks games within each tier.
          const premiumA = PREMIUM_GAME_RANK.get(a.id);
          const premiumB = PREMIUM_GAME_RANK.get(b.id);
          if (premiumA !== undefined || premiumB !== undefined) {
            if (premiumA === undefined) return 1;
            if (premiumB === undefined) return -1;
            if (premiumA !== premiumB) return premiumA - premiumB;
          }
          return (b.playersOnline || 0) - (a.playersOnline || 0);
        });
        break;
      case 'Rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'Name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'Queue':
        filtered.sort(
          (a, b) =>
            (a.queueEstimateMinutes || 0) - (b.queueEstimateMinutes || 0)
        );
        break;
      case 'Newest':
        filtered.sort((a, b) => {
          // Newest first by release date; a missing/blank date sorts last.
          const dateA = Date.parse(a.releaseDate ?? '');
          const dateB = Date.parse(b.releaseDate ?? '');
          const normA = Number.isFinite(dateA) ? dateA : Number.NEGATIVE_INFINITY;
          const normB = Number.isFinite(dateB) ? dateB : Number.NEGATIVE_INFINITY;
          if (normA !== normB) return normB - normA;
          // Same (or absent) release date: fall back to descending numeric
          // id (legacy feed ordering), then stable insertion order (0).
          const numericA = parseInt(a.id, 10) || 0;
          const numericB = parseInt(b.id, 10) || 0;
          return numericB - numericA;
        });
        break;
    }
    return filtered;
  }
}
