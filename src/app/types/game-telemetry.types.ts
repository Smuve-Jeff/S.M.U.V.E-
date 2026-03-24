export type GameTelemetryEventType =
  | 'GAME_READY'
  | 'GAME_UPDATE'
  | 'GAME_OVER'
  | 'ACHIEVEMENT_UNLOCKED';

export interface GameTelemetryEnvelope<TPayload = any> {
  type: GameTelemetryEventType;
  gameId?: string;
  timestamp?: number;
  payload?: TPayload;
}

export interface GameUpdatePayload {
  score?: number;
  combo?: number;
  level?: number;
  health?: number;
}

export interface GameOverPayload {
  score: number;
  durationMs?: number;
  reason?: string;
}

export interface AchievementUnlockedPayload {
  achievementId: string;
  title: string;
  description?: string;
}
