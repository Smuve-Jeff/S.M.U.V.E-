import { ShowcaseItem } from "../services/user-profile.service";

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
    track: ShowcaseItem | null;
    mode: 'duel' | 'team';
    roundLength: 60 | 90 | 120;
    rounds: 1 | 3 | 5;
    matchType: 'public' | 'private';
  }