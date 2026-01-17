import { Game as DetailedGame } from './game';

export type Game = DetailedGame;

export interface Challenge {
  id: string;
  title: string;
  description: string;
  prize: string;
}

export interface CommunityPost {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
}

export interface BattleConfig {
  track: any | null;
  mode: 'duel' | 'team';
  roundLength: number;
  rounds: number;
  matchType: 'public' | 'private';
}
