import { Injectable, inject, signal, computed } from '@angular/core';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';

/**
 * Daily Missions Service — S.M.U.V.E. Tha Spot engagement loop.
 *
 * Three rotating missions per day. Each mission has a target (event type +
 * count). As the user plays/wins/favorites/etc., progress increments. At 100%
 * the user can claim a reward (XP + cosmetic badge). A daily streak counter
 * increments if the user completes at least one mission per day.
 *
 * Persistence: localStorage under `smuve_daily_missions_v1` + `smuve_daily_mission_streak_v1`.
 * Mission pool is fixed; deterministic pick-by-day-offset so the same user
 * sees the same 3 missions on a given day.
 */

export type MissionType =
  | 'play_count' // launch N games (any)
  | 'win_count' // complete N games with a 'win' outcome
  | 'genre_explore' // play a game from a specific genre
  | 'favorite_count' // favorite N games
  | 'session_minutes' // spend N minutes playing
  | 'multiplayer' // join N multiplayer/cabinet/cabinet rooms
  | 'challenge_send' // send N rival challenges
  | 'high_score'; // beat previous high score on a game

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  glyph: string; // emoji / icon hint
  type: MissionType;
  target: number; // progress target
  progress: number; // current progress
  rewardXp: number; // awarded XP (decorative — totals surface in UI)
  rewardBadge: string; // badge symbol awarded
  progressLabel: string; // e.g. "2 / 5"
  /** Optional sub-target (genre name, game id, etc.) */
  hint?: string;
  expiresAt: number;
  claimed: boolean;
}

interface DailyMissionsState {
  dateKey: string; // 'YYYY-MM-DD' of roll-over
  missions: DailyMission[];
  totalCompletedToday: number;
}

interface StreakState {
  streak: number;
  bestStreak: number;
  lastCompletedDate: string | null;
}

const STORAGE_KEY = 'smuve_daily_missions_v1';
const STREAK_KEY = 'smuve_daily_mission_streak_v1';

// 8-mission pool (deterministic pick by date => 3 missions per day = 56 unique daily sets)
const MISSION_POOL: Omit<
  DailyMission,
  'id' | 'progress' | 'progressLabel' | 'expiresAt' | 'claimed'
>[] = [
  {
    title: 'Game On',
    description: 'Launch any 3 games today',
    glyph: '🎮',
    type: 'play_count',
    target: 3,
    rewardXp: 50,
    rewardBadge: '🟢',
  },
  {
    title: 'Marathon',
    description: 'Launch 8 different games today',
    glyph: '🚀',
    type: 'play_count',
    target: 8,
    rewardXp: 120,
    rewardBadge: '🔥',
  },
  {
    title: 'Champion',
    description: 'Win 2 matches (record a "win" outcome)',
    glyph: '🏆',
    type: 'win_count',
    target: 2,
    rewardXp: 80,
    rewardBadge: '🥇',
  },
  {
    title: 'Squad Up',
    description: 'Join 2 multiplayer / cabinet rooms',
    glyph: '🤝',
    type: 'multiplayer',
    target: 2,
    rewardXp: 60,
    rewardBadge: '⚔️',
  },
  {
    title: 'Genre Hop',
    description: 'Play one game of any genre today',
    glyph: '🌐',
    type: 'genre_explore',
    target: 1,
    rewardXp: 40,
    rewardBadge: '🌀',
    hint: 'Any genre counts',
  },
  {
    title: 'Rival',
    description: 'Send 1 challenge to another player',
    glyph: '📨',
    type: 'challenge_send',
    target: 1,
    rewardXp: 35,
    rewardBadge: '🗡️',
  },
  {
    title: 'Curator',
    description: 'Favorite 2 games from the catalog',
    glyph: '⭐',
    type: 'favorite_count',
    target: 2,
    rewardXp: 30,
    rewardBadge: '💖',
  },
  {
    title: 'Grinder',
    description: 'Spend 30 minutes playing today',
    glyph: '⏱️',
    type: 'session_minutes',
    target: 30,
    rewardXp: 90,
    rewardBadge: '⏳',
  },
];

function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickThree(seed: string): typeof MISSION_POOL {
  // Simple deterministic shuffle by date string
  const indices = Array.from({ length: MISSION_POOL.length }, (_, i) => i);
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  for (let i = indices.length - 1; i > 0; i--) {
    h = ((h << 5) - h + seed.charCodeAt(i % seed.length)) | 0;
    const j = Math.abs(h) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, 3).map((i) => MISSION_POOL[i]);
}

@Injectable({ providedIn: 'root' })
export class DailyMissionsService {
  private notify = inject(NotificationService);
  private haptic = inject(HapticService);

  // ── Signals ──
  readonly missions = signal<DailyMission[]>([]);
  readonly streak = signal<StreakState>({
    streak: 0,
    bestStreak: 0,
    lastCompletedDate: null,
  });
  readonly totalCompletedToday = computed(
    () =>
      this.missions().filter((m) => m.progress >= m.target && m.claimed).length
  );
  readonly allComplete = computed(
    () => this.missions().length > 0 && this.missions().every((m) => m.claimed)
  );

  constructor() {
    this.refreshIfNewDay();
  }

  /** Public — call from event sites (close game, win, favorite, etc.) */
  recordProgress(type: MissionType, delta = 1, hint?: string): void {
    this.refreshIfNewDay();
    let dirty = false;
    const updated = this.missions().map((m) => {
      if (m.type !== type) return m;
      // hint filter: if mission has a hint and event hint doesn't match, skip
      if (m.hint && hint && m.hint !== hint) return m;
      const next = Math.min(m.target, m.progress + delta);
      if (next > m.progress) dirty = true;
      return { ...m, progress: next, progressLabel: `${next} / ${m.target}` };
    });
    if (!dirty) return;
    this.missions.set(updated);
    this.persist();
    // Detect newly reached completion
    updated.forEach((m) => {
      const before = this.missions().find((x) => x.id === m.id);
      if (before && before.progress < before.target && m.progress >= m.target) {
        this.notify.show(
          `🎯 Mission ready: ${m.title} — claim your reward!`,
          'success'
        );
        this.haptic.medium();
      }
    });
  }

  /** Track minutes-played via delta (called from session timer). */
  recordMinutes(minutes: number): void {
    if (minutes <= 0) return;
    this.recordProgress('session_minutes', Math.round(minutes));
  }

  claimReward(missionId: string): boolean {
    const mission = this.missions().find((m) => m.id === missionId);
    if (!mission) return false;
    if (mission.claimed) return false;
    if (mission.progress < mission.target) return false;
    const updated = this.missions().map((m) =>
      m.id === missionId ? { ...m, claimed: true } : m
    );
    this.missions.set(updated);
    this.persist();
    this.notify.show(
      `🎁 +${mission.rewardXp} XP · Badge ${mission.rewardBadge} unlocked`,
      'success'
    );
    this.haptic.heavy();
    this.updateStreak();
    return true;
  }

  /** Stats for HUD/rival hub display */
  getSummary(): { total: number; done: number; streak: number; best: number } {
    const ms = this.missions();
    return {
      total: ms.length,
      done: ms.filter((m) => m.claimed).length,
      streak: this.streak().streak,
      best: this.streak().bestStreak,
    };
  }

  // ── Internals ──

  private refreshIfNewDay(): void {
    const today = dateKey();
    const stored = this.loadState();
    if (stored && stored.dateKey === today && stored.missions.length > 0) {
      this.missions.set(stored.missions);
      this.streak.set(this.loadStreak());
      return;
    }
    // Roll over — generate today's 3 missions
    const pool = pickThree(today);
    const newMissions: DailyMission[] = pool.map((m, idx) => ({
      ...m,
      id: `mission-${today}-${idx}`,
      progress: 0,
      progressLabel: `0 / ${m.target}`,
      expiresAt: this.endOfDay(new Date()).getTime(),
      claimed: false,
    }));
    this.missions.set(newMissions);
    this.streak.set(this.loadStreak());
    this.persist();
  }

  private updateStreak(): void {
    const all = this.missions().every((m) => m.claimed);
    if (!all) return;
    const today = dateKey();
    const cur = this.streak();
    if (cur.lastCompletedDate === today) return; // already counted today
    // Yesterday?
    const yesterday = dateKey(new Date(Date.now() - 86_400_000));
    const newStreak = cur.lastCompletedDate === yesterday ? cur.streak + 1 : 1;
    const ns: StreakState = {
      streak: newStreak,
      bestStreak: Math.max(cur.bestStreak, newStreak),
      lastCompletedDate: today,
    };
    this.streak.set(ns);
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(ns));
    } catch {}
    this.notify.show(`🔥 ${newStreak}-day streak · keep it going!`, 'success');
  }

  private endOfDay(d: Date): Date {
    const e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return e;
  }

  private loadState(): DailyMissionsState | null {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      return raw ? (JSON.parse(raw) as DailyMissionsState) : null;
    } catch {
      return null;
    }
  }

  private loadStreak(): StreakState {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(STREAK_KEY)
          : null;
      return raw
        ? JSON.parse(raw)
        : { streak: 0, bestStreak: 0, lastCompletedDate: null };
    } catch {
      return { streak: 0, bestStreak: 0, lastCompletedDate: null };
    }
  }

  private persist(): void {
    try {
      const state: DailyMissionsState = {
        dateKey: dateKey(),
        missions: this.missions(),
        totalCompletedToday: this.totalCompletedToday(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
}
