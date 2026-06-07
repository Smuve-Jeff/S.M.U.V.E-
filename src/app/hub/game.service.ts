export type GameSortMode = 'Popular' | 'Rating' | 'Newest' | 'Name' | 'Queue';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, shareReplay } from 'rxjs';
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

function normalizeGame(game: Game): Game {
  return {
    ...game,
    id: asString(game.id),
    name: asString(game.name, 'Untitled Cabinet'),
    url: asString(game.url),
    image: asString(game.image),
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
        map((feed) => {
          const normalized = normalizeFeed(feed);
          if (!normalized.games || normalized.games.length === 0) {
            return normalizeFeed(THA_SPOT_FALLBACK_FEED);
          }
          return normalized;
        }),
        catchError(() => of(normalizeFeed(THA_SPOT_FALLBACK_FEED))),
        shareReplay(1)
      );
    }
    return this.feedCache$;
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
    if (filters.genre && filters.genre !== 'all') {
      filtered = filtered.filter((game) => game.genre === filters.genre);
    }
    if (filters.platform && filters.platform !== 'all') {
      filtered = filtered.filter((game) => {
        const isInternal = game.url.startsWith('/assets/');
        return filters.platform === 'Internal' ? isInternal : !isInternal;
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
