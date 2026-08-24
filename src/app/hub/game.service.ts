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

const THA_SPOT_FEED_URL = 'assets/data/tha-spot-feed.json';

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
  const image = asString(val);
  return !image || image.startsWith('/assets/games/') || image.startsWith('assets/games/')
    ? CATALOG_IMAGE_FALLBACK
    : image;
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
  'super-metroid-elite-master',
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
  const name = CANONICAL_GAME_TITLES[id] || asString(game.name, 'Untitled Cabinet');
  const canonicalUrl = CANONICAL_GAME_URLS[id];
  const retroBacked = [
    game.url,
    game.launchConfig?.approvedEmbedUrl,
    game.launchConfig?.approvedExternalUrl,
  ].some(isRetroGamesUrl);
  const launchConfig = { ...(game.launchConfig || {}) };
  if (retroBacked) {
    applyRetroLaunchContract(launchConfig, id, name, [
      canonicalUrl,
      game.url,
      launchConfig.approvedEmbedUrl,
      launchConfig.approvedExternalUrl,
    ]);
  } else if (EXTERNAL_ONLY_GAME_IDS.has(id)) {
    launchConfig.embedMode = 'external-only';
  }
  return {
    ...game,
    id,
    launchConfig: Object.keys(launchConfig).length ? launchConfig : undefined,
    name,
    url: canonicalUrl || asString(game.url),
    image: normalizeCatalogImage(game.image),
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
  const url: string = game.url || '';
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
   * Iframe sandbox attribute builder - omitted allow-same-origin by default for
   * security. Returns a stricter set of permissions aligned with Web Platform best
   * practices. Callers may extend for legacy game sources that require same-origin.
   */
  buildIframeSandbox(game?: Game): string {
    if (!game) {
      return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-orientation-lock allow-downloads';
    }
    const tags = (game.tags || []).map((t) => t.toLowerCase());
    // Elite internal WASM cabinets explicitly need more privileges to boot
    if (game.id && tags.includes('internal')) {
      return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-orientation-lock allow-downloads allow-same-origin';
    }
    return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-orientation-lock allow-downloads';
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
          const normalized = normalizeFeed(feed);

          const resolvedFeed =
            normalized.games.length > 0
              ? normalized
              : normalizeFeed(THA_SPOT_FALLBACK_FEED);
          this.cacheFeed(resolvedFeed);
          return resolvedFeed;
        }),
        catchError(() => {
          const fallback = normalizeFeed(THA_SPOT_FALLBACK_FEED);
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
        filtered.sort(
          (a, b) => (b.playersOnline || 0) - (a.playersOnline || 0)
        );
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
        filtered.sort(
          (a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0)
        );
        break;
    }
    return filtered;
  }
}
