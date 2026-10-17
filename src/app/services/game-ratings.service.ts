import { Injectable, signal, computed } from '@angular/core';

/**
 * Game Ratings Service — post-play ratings + win/loss tracking.
 *
 * Stores per-game (1-5 star) rating + optional comment + a stats record:
 * plays, wins, losses, lastPlayedAt, bestScore. Stored in localStorage so
 * ratings survive sessions. Exposes the postPlayRating modal payload
 * (recentPlayedGame) so the Tha Spot UI can show the rating card after
 * closing a console.
 */

export type Rating = 1 | 2 | 3 | 4 | 5;
export type PlayResult = 'win' | 'loss' | 'draw' | 'abandoned';

export interface GameRating {
  gameId: string;
  rating: Rating;
  comment?: string;
  result?: PlayResult;
  score?: number;
  createdAt: number;
}

export interface GameStats {
  gameId: string;
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  abandoned: number;
  bestScore: number;
  totalScore: number;
  firstPlayedAt: number;
  lastPlayedAt: number;
  ratingAvg: number;
  ratingCount: number;
}

interface RatingsStore {
  ratingsByGame: Record<string, GameRating[]>;
  statsByGame: Record<string, GameStats>;
}

const STORAGE_KEY = 'smuve_game_ratings_v1';

function emptyStats(gameId: string, now = Date.now()): GameStats {
  return {
    gameId,
    plays: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    abandoned: 0,
    bestScore: 0,
    totalScore: 0,
    firstPlayedAt: now,
    lastPlayedAt: now,
    ratingAvg: 0,
    ratingCount: 0,
  };
}

@Injectable({ providedIn: 'root' })
export class GameRatingsService {
  /** All ratings recorded for this user */
  readonly allRatings = signal<GameRating[]>([]);
  /** Per-game stats lookup */
  readonly allStats = signal<Record<string, GameStats>>({});
  /** Most recent game that closed and is awaiting a rating */
  readonly pendingRating = signal<{
    gameId: string;
    gameName: string;
    lastScore?: number;
    sessionMs?: number;
  } | null>(null);

  readonly totalRatings = computed(() => this.allRatings().length);
  readonly ratedGames = computed(() => Object.keys(this.allStats()).length);
  readonly topRatedGameId = computed(() => {
    const entries = Object.entries(this.allStats());
    if (entries.length === 0) return null;
    let best: { id: string; avg: number; count: number } | null = null;
    for (const [id, s] of entries) {
      if (s.ratingCount < 1) continue;
      if (!best || s.ratingAvg > best.avg) {
        best = { id, avg: s.ratingAvg, count: s.ratingCount };
      }
    }
    return best?.id ?? null;
  });

  constructor() {
    this.load();
  }

  /**
   * Signal a pending post-play rating prompt. Called from game-close site.
   */
  promptRating(
    gameId: string,
    gameName: string,
    lastScore?: number,
    sessionMs?: number
  ): void {
    this.pendingRating.set({ gameId, gameName, lastScore, sessionMs });
  }

  /** Clear the pending rating (dismiss / after submit). */
  dismissPending(): void {
    this.pendingRating.set(null);
  }

  /**
   * Record a play session (always — even if user skips rating).
   * Returns updated stats.
   */
  recordPlay(
    gameId: string,
    opts: {
      result?: PlayResult;
      score?: number;
    } = {}
  ): GameStats {
    const now = Date.now();
    const cur = this.allStats()[gameId] ?? emptyStats(gameId, now);
    const next: GameStats = {
      ...cur,
      plays: cur.plays + 1,
      wins: cur.wins + (opts.result === 'win' ? 1 : 0),
      losses: cur.losses + (opts.result === 'loss' ? 1 : 0),
      draws: cur.draws + (opts.result === 'draw' ? 1 : 0),
      abandoned: cur.abandoned + (opts.result === 'abandoned' ? 1 : 0),
      bestScore: Math.max(cur.bestScore, opts.score ?? 0),
      totalScore: cur.totalScore + (opts.score ?? 0),
      lastPlayedAt: now,
    };
    const map = { ...this.allStats(), [gameId]: next };
    this.allStats.set(map);
    this.persist();
    return next;
  }

  /**
   * Submit a rating + comment for a game. Updates stats ratingAvg/ratingCount.
   */
  rateGame(
    gameId: string,
    rating: Rating,
    comment?: string,
    result?: PlayResult,
    score?: number
  ): GameRating {
    const r: GameRating = {
      gameId,
      rating,
      comment: comment?.trim() || undefined,
      result,
      score,
      createdAt: Date.now(),
    };
    this.allRatings.update((list) => [...list, r]);
    const cur = this.allStats()[gameId] ?? emptyStats(gameId);
    const newCount = cur.ratingCount + 1;
    const newAvg = (cur.ratingAvg * cur.ratingCount + rating) / newCount;
    const map = {
      ...this.allStats(),
      [gameId]: {
        ...cur,
        plays: cur.plays + (r.result ? 1 : 0),
        wins: cur.wins + (r.result === 'win' ? 1 : 0),
        losses: cur.losses + (r.result === 'loss' ? 1 : 0),
        draws: cur.draws + (r.result === 'draw' ? 1 : 0),
        abandoned: cur.abandoned + (r.result === 'abandoned' ? 1 : 0),
        bestScore: Math.max(cur.bestScore, score ?? 0),
        totalScore: cur.totalScore + (score ?? 0),
        lastPlayedAt: r.createdAt,
        ratingAvg: newAvg,
        ratingCount: newCount,
      },
    };
    this.allStats.set(map);
    this.persist();
    this.dismissPending();
    return r;
  }

  /** Get stats for a single game (or empty stats). */
  statsFor(gameId: string): GameStats {
    return this.allStats()[gameId] ?? emptyStats(gameId, 0);
  }

  /** History of ratings for a single game. */
  ratingsFor(gameId: string): GameRating[] {
    return this.allRatings().filter((r) => r.gameId === gameId);
  }

  winRate(gameId: string): number {
    const s = this.statsFor(gameId);
    const decided = s.wins + s.losses;
    return decided === 0 ? 0 : Math.round((s.wins / decided) * 100);
  }

  /** All games sorted by lastPlayedAt desc. */
  recentGames(limit = 10): GameStats[] {
    return Object.values(this.allStats())
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, limit);
  }

  /** Internal — clear all (debug only) */
  resetAll(): void {
    this.allRatings.set([]);
    this.allStats.set({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  private load(): void {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as RatingsStore;
      this.allRatings.set(
        parsed.ratingsByGame ? Object.values(parsed.ratingsByGame).flat() : []
      );
      this.allStats.set(parsed.statsByGame ?? {});
    } catch {}
  }

  private persist(): void {
    try {
      const ratingsByGame: Record<string, GameRating[]> = {};
      this.allRatings().forEach((r) => {
        (ratingsByGame[r.gameId] ||= []).push(r);
      });
      const store: RatingsStore = {
        ratingsByGame,
        statsByGame: this.allStats(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {}
  }
}
