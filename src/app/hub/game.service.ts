import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import {
  Game,
  GameRoom,
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

const COVER_HASH_SEED = 7;
const THA_SPOT_FEED_URL = '/assets/data/tha-spot-feed.json';

function buildGameCover(
  title: string,
  eyebrow: string,
  accentStart: string,
  accentEnd: string
) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash = Array.from(`${title}|${eyebrow}|${accentStart}|${accentEnd}`).reduce(
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

function normalizeGame(game: Game): Game {
  const eyebrow =
    game.art?.eyebrow || game.availability || game.genre || 'Tha Spot';
  const accentStart = game.art?.accentStart || '#10b981';
  const accentEnd = game.art?.accentEnd || '#38bdf8';

  return {
    ...game,
    image:
      game.image ||
      buildGameCover(game.name, eyebrow, accentStart, accentEnd),
    badgeIds: game.badgeIds || [],
    sessionObjectives:
      game.sessionObjectives || game.launchConfig?.objectives || [],
    controlHints: game.controlHints || game.launchConfig?.controls || [],
    queueEstimateMinutes: game.queueEstimateMinutes ?? 0,
  };
}

function normalizeFeed(feed: ThaSpotFeed): ThaSpotFeed {
  return {
    ...feed,
    badges: feed.badges || [],
    rooms: feed.rooms || [],
    liveEvents: feed.liveEvents || [],
    socialPresence: feed.socialPresence || [],
    promotions: feed.promotions || [],
    leaderboards: feed.leaderboards || [],
    games: (feed.games || []).map((game) => normalizeGame(game)),
  };
}

@Injectable({
  providedIn: 'root',
})
export class GameService {
  private http = inject(HttpClient);

  private feed$ = this.http.get<ThaSpotFeed>(THA_SPOT_FEED_URL).pipe(
    map((feed) => normalizeFeed(feed)),
    catchError(() => of(normalizeFeed(THA_SPOT_FALLBACK_FEED))),
    shareReplay(1)
  );

  getThaSpotFeed(): Observable<ThaSpotFeed> {
    return this.feed$;
  }

  listGames(
    filters: { genre?: string; query?: string } = {},
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.feed$.pipe(
      map((feed) => this.applyFiltersAndSort(feed.games, filters, sort))
    );
  }

  getGamesForRoom(
    roomId: string,
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.feed$.pipe(
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
    return this.listGames({}).pipe(map((games) => games.find((g) => g.id === id)));
  }

  getTrending(): Observable<Game[]> {
    return this.feed$.pipe(
      map((feed) =>
        feed.games
          .filter((game) => game.badgeIds?.includes('trending'))
          .slice(0, 5)
      )
    );
  }

  getNew(): Observable<Game[]> {
    return this.feed$.pipe(
      map((feed) =>
        feed.games.filter((game) => game.badgeIds?.includes('new-drop')).slice(0, 5)
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
    const normalizedGenres = (rules.genres || []).map((genre) => genre.toLowerCase());
    const normalizedRuleTags = (rules.tags || []).map((tag) => tag.toLowerCase());
    const normalizedBadges = (game.badgeIds || []).map((badge) => badge.toLowerCase());

    const genreMatch =
      !normalizedGenres.length ||
      normalizedGenres.includes((game.genre || '').toLowerCase());
    const tagMatch =
      !normalizedRuleTags.length ||
      normalizedRuleTags.some((tag) => normalizedTags.includes(tag));
    const availabilityMatch =
      !rules.availability?.length ||
      !!game.availability && rules.availability.includes(game.availability);
    const badgeMatch =
      !rules.badgeIds?.length ||
      rules.badgeIds.some((badge) => normalizedBadges.includes(badge.toLowerCase()));
    const featuredMatch = !rules.featuredOnly || !!game.badgeIds?.includes('featured');

    return genreMatch && tagMatch && availabilityMatch && badgeMatch && featuredMatch;
  }

  private applyFiltersAndSort(
    games: Game[],
    filters: { genre?: string; query?: string },
    sort: 'Popular' | 'Rating' | 'Newest'
  ): Game[] {
    let filtered = [...games];

    if (filters.genre) {
      filtered = filtered.filter((g) => g.genre === filters.genre);
    }

    if (filters.query) {
      const q = filters.query.toLowerCase();
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q)
      );
    }

    switch (sort) {
      case 'Popular':
        filtered.sort((a, b) => (b.playersOnline || 0) - (a.playersOnline || 0));
        break;
      case 'Rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'Newest':
        filtered.sort((a, b) => {
          const idA = parseInt(a.id, 10);
          const idB = parseInt(b.id, 10);
          if (isNaN(idA) || isNaN(idB)) return 0;
          return idB - idA;
        });
        break;
    }

    return filtered;
  }
}
