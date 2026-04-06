import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import {
  Game,
  GameBadge,
  GameLaunchConfig,
  GameRoom,
  LeaderboardEntry,
  LiveEvent,
  PromotionCard,
  RecommendationRail,
  SocialPresence,
  ThaSpotFeed,
} from './game';
import { THA_SPOT_FALLBACK_FEED } from './tha-spot-feed.fallback';

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSvgColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#10b981';
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

const COVER_HASH_SEED = 7;
const THA_SPOT_FEED_URL = '/assets/data/tha-spot-feed.json';

function buildGameCover(
  title: string,
  eyebrow: string,
  accentStart: string,
  accentEnd: string
) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash = Array.from(
    `${title}|${eyebrow}|${accentStart}|${accentEnd}`
  ).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    COVER_HASH_SEED
  );
  const gradientId = `g-cover-${slug || 'spot'}-${hash.toString(16)}`;
  const safeTitle = escapeSvgText(title);
  const safeEyebrow = escapeSvgText(eyebrow.toUpperCase());
  const safeAccentStart = sanitizeSvgColor(accentStart);
  const safeAccentEnd = sanitizeSvgColor(accentEnd);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" role="img" aria-label="${safeTitle} cover art">
      <title>${safeTitle} cover art</title>
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${safeAccentStart}" />
          <stop offset="100%" stop-color="${safeAccentEnd}" />
        </linearGradient>
      </defs>
      <rect width="300" height="200" rx="24" fill="#020617" />
      <rect x="12" y="12" width="276" height="176" rx="20" fill="url(#${gradientId})" opacity="0.95" />
      <circle cx="246" cy="54" r="42" fill="rgba(255,255,255,0.12)" />
      <circle cx="228" cy="138" r="56" fill="rgba(255,255,255,0.08)" />
      <text x="26" y="44" fill="rgba(255,255,255,0.82)" font-size="16" font-family="Arial, sans-serif" letter-spacing="2">${safeEyebrow}</text>
      <text x="26" y="116" fill="#ffffff" font-size="30" font-weight="700" font-family="Arial, sans-serif">${safeTitle}</text>
      <text x="26" y="152" fill="rgba(255,255,255,0.88)" font-size="14" font-family="Arial, sans-serif">Curated for Tha Spot</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeLaunchConfig(
  config: GameLaunchConfig | undefined,
  fallbackUrl: string
): GameLaunchConfig {
  const inlinePolicy = config?.inlinePolicy || 'trusted';
  const embedMode =
    config?.embedMode ||
    (inlinePolicy === 'external-only' ? 'external-only' : 'inline');
  const approvedEmbedUrl =
    config?.approvedEmbedUrl ||
    (embedMode === 'inline' ? fallbackUrl : undefined);
  const approvedExternalUrl = config?.approvedExternalUrl || fallbackUrl;
  const telemetryMode =
    config?.telemetryMode ||
    (fallbackUrl.startsWith('/assets/games/')
      ? 'frame-only'
      : approvedEmbedUrl
        ? 'origin'
        : 'none');

  return {
    ...config,
    inlinePolicy,
    embedMode,
    approvedEmbedUrl,
    approvedExternalUrl,
    telemetryMode,
    telemetryOrigins: asStringArray(config?.telemetryOrigins),
    controls: asStringArray(config?.controls),
    objectives: asStringArray(config?.objectives),
    modes: asStringArray(config?.modes),
    trustNote: asString(config?.trustNote),
  };
}

function normalizeGame(game: Game): Game {
  const eyebrow =
    game.art?.eyebrow || game.availability || game.genre || 'Tha Spot';
  const accentStart = game.art?.accentStart || '#10b981';
  const accentEnd = game.art?.accentEnd || '#38bdf8';

  return {
    ...game,
    id: asString(game.id),
    name: asString(game.name, 'Unknown cabinet'),
    url: asString(game.url),
    description: asString(game.description),
    genre: asString(game.genre),
    tags: asStringArray(game.tags),
    badgeIds: asStringArray(game.badgeIds),
    sessionObjectives: asStringArray(
      game.sessionObjectives || game.launchConfig?.objectives
    ),
    controlHints: asStringArray(
      game.controlHints || game.launchConfig?.controls
    ),
    queueEstimateMinutes: Math.max(0, asNumber(game.queueEstimateMinutes)),
    playersOnline: Math.max(0, asNumber(game.playersOnline)),
    rating: Math.max(0, Math.min(5, asNumber(game.rating))),
    image:
      game.image || buildGameCover(game.name, eyebrow, accentStart, accentEnd),
    launchConfig: normalizeLaunchConfig(game.launchConfig, asString(game.url)),
    art: {
      eyebrow,
      accentStart: sanitizeSvgColor(accentStart),
      accentEnd: sanitizeSvgColor(accentEnd),
    },
  };
}

function normalizeRoom(room: GameRoom): GameRoom {
  return {
    ...room,
    id: asString(room.id),
    name: asString(room.name, 'Untitled room'),
    icon: asString(room.icon, 'grid_view'),
    description: asString(room.description),
    spotlight: asString(room.spotlight),
    rules: room.rules
      ? {
          genres: asStringArray(room.rules.genres),
          tags: asStringArray(room.rules.tags),
          availability: Array.isArray(room.rules.availability)
            ? room.rules.availability.filter(Boolean)
            : [],
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
    title: asString(event.title, 'Live event'),
    description: asString(event.description),
    roomId: asString(event.roomId, 'all'),
    reward: asString(event.reward),
    status: ['live', 'upcoming', 'ending-soon'].includes(event.status)
      ? event.status
      : 'upcoming',
    windowLabel: asString(event.windowLabel),
    featuredGameId: asString(event.featuredGameId),
    badgeId: asString(event.badgeId),
    schedule: event.schedule
      ? {
          startAt: asString(event.schedule.startAt),
          endAt: asString(event.schedule.endAt),
          recurrence: ['once', 'daily', 'weekend'].includes(
            event.schedule.recurrence || ''
          )
            ? event.schedule.recurrence
            : 'once',
          eligibilityTags: asStringArray(event.schedule.eligibilityTags),
          rewardType: ['xp', 'cosmetic', 'token'].includes(
            event.schedule.rewardType || ''
          )
            ? event.schedule.rewardType
            : 'xp',
        }
      : undefined,
  };
}

function normalizePresence(entry: SocialPresence): SocialPresence {
  return {
    ...entry,
    id: asString(entry.id),
    name: asString(entry.name, 'Unknown crew'),
    status: ['online', 'queueing', 'in-match', 'hosting', 'invited'].includes(
      entry.status
    )
      ? entry.status
      : 'online',
    activity: asString(entry.activity),
    roomId: asString(entry.roomId, 'all'),
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

function normalizeLeaderboard(entry: LeaderboardEntry): LeaderboardEntry {
  return {
    id: asString(entry.id),
    label: asString(entry.label, 'Leaderboard'),
    score: asString(entry.score, '0'),
    roomId: asString(entry.roomId, 'all'),
    trend: asString(entry.trend),
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
          requiresAchievements: !!rail.audience.requiresAchievements,
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

function normalizeFeed(feed: ThaSpotFeed): ThaSpotFeed {
  const games = (feed.games || [])
    .map((game) => normalizeGame(game))
    .filter((game) => !!game.id && !!game.url);

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
    leaderboards: (feed.leaderboards || [])
      .map((entry) => normalizeLeaderboard(entry))
      .filter((entry) => !!entry.id),
    recommendationRails: (feed.recommendationRails || [])
      .map((rail) => normalizeRecommendationRail(rail))
      .filter((rail) => !!rail.id),
    games,
  };
}

@Injectable({
  providedIn: 'root',
})
export class GameService {
  private http = inject(HttpClient);
  private feedCache$?: Observable<ThaSpotFeed>;

  getThaSpotFeed(forceRefresh = false): Observable<ThaSpotFeed> {
    if (!this.feedCache$ || forceRefresh) {
      this.feedCache$ = this.http.get<ThaSpotFeed>(THA_SPOT_FEED_URL).pipe(
        map((feed) => normalizeFeed(feed)),
        catchError((error) => {
          console.warn('GameService: failed to load Tha Spot feed', error);
          return of(normalizeFeed(THA_SPOT_FALLBACK_FEED));
        }),
        shareReplay(1)
      );
    }

    return this.feedCache$;
  }

  listGames(
    filters: { genre?: string; query?: string } = {},
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.getThaSpotFeed().pipe(
      map((feed) => this.applyFiltersAndSort(feed.games, filters, sort))
    );
  }

  getGamesForRoom(
    roomId: string,
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.getThaSpotFeed().pipe(
      map((feed) => {
        const room = feed.rooms.find((entry) => entry.id === roomId);
        if (!room) {
          return this.applyFiltersAndSort(feed.games, {}, sort);
        }
        return this.applyFiltersAndSort(
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
    if (room.id === 'all') {
      return true;
    }

    const rules = room.rules;
    if (!rules) {
      return true;
    }

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

    const genreMatch =
      !normalizedGenres.length ||
      normalizedGenres.includes((game.genre || '').toLowerCase());
    const tagMatch =
      !normalizedRuleTags.length ||
      normalizedRuleTags.some((tag) => normalizedTags.includes(tag));
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

  private applyFiltersAndSort(
    games: Game[],
    filters: { genre?: string; query?: string },
    sort: 'Popular' | 'Rating' | 'Newest'
  ): Game[] {
    let filtered = [...games];

    if (filters.genre) {
      filtered = filtered.filter((game) => game.genre === filters.genre);
    }

    if (filters.query) {
      const query = filters.query.toLowerCase();
      filtered = filtered.filter(
        (game) =>
          game.name.toLowerCase().includes(query) ||
          game.description?.toLowerCase().includes(query)
      );
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
      case 'Newest':
        filtered.sort((a, b) => {
          const idA = parseInt(a.id, 10);
          const idB = parseInt(b.id, 10);
          if (isNaN(idA) || isNaN(idB)) {
            return 0;
          }
          return idB - idA;
        });
        break;
    }

    return filtered;
  }
}
