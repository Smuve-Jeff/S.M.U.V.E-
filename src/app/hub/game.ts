export type GameAvailability = 'Offline' | 'Online' | 'Hybrid';
export type GameMode = 'duel' | 'team' | 'solo';
export type EmbedMode = 'inline' | 'external-only';
export type TelemetryMode = 'frame-only' | 'origin' | 'none';

export interface GameLaunchConfig {
  difficulty?: string;
  controls?: string[];
  objectives?: string[];
  modes?: string[];
  inlinePolicy?: 'trusted' | 'external-only';
  embedMode?: EmbedMode;
  approvedEmbedUrl?: string;
  approvedExternalUrl?: string;
  telemetryMode?: TelemetryMode;
  telemetryOrigins?: string[];
  trustNote?: string;
}

export interface Game {
  id: string;
  name: string;
  url: string;
  image?: string;
  description?: string;
  genre?: string;
  tags?: string[];
  availability?: GameAvailability;
  previewVideo?: string;
  rating?: number;
  playersOnline?: number;
  modes?: GameMode[];
  bannerImage?: string;
  multiplayerType?: 'P2P' | 'Server' | 'None';
  aiSupportLevel?: 'Basic' | 'Advanced' | 'Neural' | 'None';
  aiBriefing?: string;
  badgeIds?: string[];
  queueEstimateMinutes?: number;
  sessionObjectives?: string[];
  controlHints?: string[];
  launchConfig?: GameLaunchConfig;
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
    availability?: GameAvailability[];
    badgeIds?: string[];
    featuredOnly?: boolean;
    gameIds?: string[];
  };
}

export interface LiveEventSchedule {
  startAt?: string;
  endAt?: string;
  recurrence?: 'once' | 'daily' | 'weekend';
  eligibilityTags?: string[];
  rewardType?: 'cosmetic' | 'token';
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
  schedule?: LiveEventSchedule;
}

export interface SocialPresence {
  id: string;
  name: string;
  status: 'online' | 'queueing' | 'in-match' | 'hosting' | 'invited';
  activity: string;
  roomId: string;
  gameId?: string;
  relationship?: 'friend' | 'rival' | 'party' | 'invite';
  joinable?: boolean;
  pendingInvite?: boolean;
  partySize?: number;
  cta?: string;
  alert?: string;
}

export interface PromotionCard {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: string;
  cta: string;
  roomIds?: string[];
  gameIds?: string[];
  audienceTags?: string[];
  priority?: number;
  campaignType?: 'studio' | 'arena' | 'intel' | 'community';
}

export interface RecommendationAudience {
  primaryGenres?: string[];
  rooms?: string[];
  minPlays?: number;
  maxPlays?: number;
}

export interface RecommendationWeights {
  genre?: number;
  history?: number;
  crowd?: number;
  badge?: number;
  room?: number;
  novelty?: number;
}

export interface RecommendationRail {
  id: string;
  title: string;
  subtitle?: string;
  emptyState?: string;
  gameIds?: string[];
  roomIds?: string[];
  audience?: RecommendationAudience;
  weights?: RecommendationWeights;
  maxItems?: number;
}

export interface ThaSpotFeed {
  badges: GameBadge[];
  rooms: GameRoom[];
  liveEvents: LiveEvent[];
  socialPresence: SocialPresence[];
  promotions: PromotionCard[];
  recommendationRails: RecommendationRail[];
  games: Game[];
}
