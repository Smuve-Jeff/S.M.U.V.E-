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

export interface ShowcaseProject {
  id: string;
  title: string;
  creator: string;
  type: 'Audio' | 'Video' | 'Concept';
  thumbnail: string;
  likes: number;
  plays: number;
  tags: string[];
}

export interface CollabRequest {
  id: string;
  user: string;
  role: string;
  projectGoal: string;
  genres: string[];
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: Date;
  isSystem?: boolean;
}

export interface OnlineUser {
  id: string;
  name: string;
  status: 'Jamming' | 'Gaming' | 'Idle';
  avatar: string;
}
