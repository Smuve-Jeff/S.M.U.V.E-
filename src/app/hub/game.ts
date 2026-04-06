export interface Game {
  id: string;
  name: string;
  url: string; // Play URL or route
  image?: string; // Cover image
  description?: string;
  genre?: string;
  tags?: string[]; // e.g., ['PvP','Shooter','Duel']
  availability?: 'Offline' | 'Online' | 'Hybrid';
  previewVideo?: string; // Short webm/mp4 for hover preview
  rating?: number; // 0..5
  playersOnline?: number;
  modes?: Array<'duel' | 'team' | 'solo'>;
  bannerImage?: string;

  // S.M.U.V.E. Enhancements
  multiplayerType?: 'P2P' | 'Server' | 'None';
  aiSupportLevel?: 'Basic' | 'Advanced' | 'Neural' | 'None';
  aiBriefing?: string;
  badgeIds?: string[];
  queueEstimateMinutes?: number;
  sessionObjectives?: string[];
  controlHints?: string[];
  launchConfig?: {
    difficulty?: string;
    controls?: string[];
    objectives?: string[];
    modes?: string[];
    inlinePolicy?: 'trusted' | 'external-only';
    trustNote?: string;
  };
  art?: {
    eyebrow: string;
    accentStart: string;
    accentEnd: string;
  };
}

export interface GameBadge {
  id: string;
  label: string;
  tone: 'primary' | 'secondary' | 'accent' | 'warning';
}

export interface GameRoom {
  id: string;
  name: string;
  icon: string;
  description: string;
  limitedTime?: boolean;
  spotlight?: string;
  rules?: {
    genres?: string[];
    tags?: string[];
    availability?: Array<'Offline' | 'Online' | 'Hybrid'>;
    badgeIds?: string[];
    featuredOnly?: boolean;
  };
}

export interface LiveEvent {
  id: string;
  title: string;
  description: string;
  roomId: string;
  reward: string;
  status: 'live' | 'upcoming' | 'ending-soon';
  windowLabel: string;
  featuredGameId?: string;
  badgeId?: string;
}

export interface SocialPresence {
  id: string;
  name: string;
  status: 'online' | 'queueing' | 'in-match' | 'hosting';
  activity: string;
  roomId: string;
  gameId?: string;
}

export interface PromotionCard {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: string;
  cta: string;
}

export interface LeaderboardEntry {
  id: string;
  label: string;
  score: string;
  roomId: string;
  trend: string;
}

export interface ThaSpotFeed {
  badges: GameBadge[];
  rooms: GameRoom[];
  liveEvents: LiveEvent[];
  socialPresence: SocialPresence[];
  promotions: PromotionCard[];
  leaderboards: LeaderboardEntry[];
  games: Game[];
}
