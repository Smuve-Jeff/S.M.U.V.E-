import { ArtistIdentityState } from './artist-identity.types';
import { ArtistKnowledgeBase, RecommendationHistoryEntry, UpgradeRecommendation } from './ai.types';
import { MarketingCampaign } from './marketing.types';

export interface AppSettings {
  ui: {
    theme: string;
    performanceMode: boolean;
    showScanlines: boolean;
    animationsEnabled: boolean;
    autoPianoRoll: boolean;
  };
  audio: { masterVolume: number; autoSaveEnabled: boolean };
  ai: { kbWriteAccess: boolean; commanderPersona: string };
  security: { twoFactorEnabled: boolean };
}

export interface CatalogItem {
  id: string;
  title: string;
  artist?: string;
  genre?: string;
  status?: string;
  category?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  url?: string;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface ThaSpotEventHistoryEntry {
  eventId: string;
  roomId?: string;
  reward?: string;
  rewardType?: 'access' | 'cosmetic' | 'token';
  participatedAt: number;
}

export interface ThaSpotRoomStat {
  plays?: number;
  lastPlayedAt?: number;
}

export interface ThaSpotGameStat {
  plays?: number;
  lastPlayedAt?: number;
  lastRoomId?: string;
  roomPlays?: Record<string, number>;
  earnedCosmetics?: string[];
  eventHistory?: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotProgression {
  lastSessionAt?: number;
  lastRoomId?: string;
  favoriteRoomId?: string;
  roomStats?: Record<string, ThaSpotRoomStat>;
  earnedCosmetics?: string[];
  eventHistory?: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotSessionContext {
  roomId?: string;
  eventId?: string;
  reward?: string;
  rewardType?: 'access' | 'cosmetic' | 'token';
  cosmetics?: string[];
}

export interface RecommendationPreference {
  state: NonNullable<UpgradeRecommendation['state']>;
  updatedAt: number;
  actionCount?: number;
}

export interface ExpertiseLevels {
  production: number;
  songwriting: number;
  marketing: number;
  business: number;
  legal: number;
  performance: number;
  catalyst?: number;
  technical_mastery?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: 'Manager' | 'Producer' | 'Engineer' | 'Publicist' | 'Lawyer' | 'Agent' | 'Assistant';
  email?: string;
  phone?: string;
  contractUrl?: string;
  splitPercentage?: number;
}

export interface RoyaltySplit {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  percentage: number;
  role: string;
  isConfirmed: boolean;
  notes?: string;
}

export interface SplitSheet {
  id: string;
  workId: string;
  title: string;
  status: 'Draft' | 'Sent' | 'Signed' | 'Disputed';
  splits: RoyaltySplit[];
  totalPercentage: number;
  updatedAt: number;
}

export interface RevenueStream {
  id: string;
  source: 'Streaming' | 'Sync' | 'Performance' | 'Merch' | 'Publishing' | 'Mechanicals' | 'Other';
  amount: number;
  currency: string;
  period: string;
  platform?: string;
  date: number;
}

export interface FinancialAccount {
  id: string;
  provider: 'DistroKid' | 'TuneCore' | 'ASCAP' | 'BMI' | 'SoundExchange' | 'AdSense' | 'PayPal' | 'Stripe' | 'Other';
  accountName: string;
  balance: number;
  currency: string;
  lastSyncAt: number;
  status: 'active' | 'disconnected' | 'error';
}

export interface ProfessionalFinancials {
  accounts: FinancialAccount[];
  totalRevenue: number;
  pendingPayouts: number;
  splitSheets: SplitSheet[];
  revenueHistory: RevenueStream[];
  taxIdentity?: {
    type: 'SSN' | 'EIN' | 'VAT';
    verified: boolean;
    country: string;
  };
}

export interface ProfileAuditLog {
  timestamp: number;
  score: number;
  deficits: string[];
  recommendations: string[];
  auditType: 'Full' | 'Quick' | 'Strategic';
}

export interface UserProfile {
  id?: string;
  artistName: string;
  primaryGenre: string;
  website?: string;
  settings: AppSettings;
  knowledgeBase: ArtistKnowledgeBase;
  careerGoals: string[];
  equipment: string[];
  daw: string[];
  services: string[];
  recommendationPreferences: Record<string, RecommendationPreference>;
  recommendationHistory: RecommendationHistoryEntry[];
  expertise: ExpertiseLevels;
  team: TeamMember[];
  marketingCampaigns: MarketingCampaign[];
  financials: ProfessionalFinancials;
  proName?: string;
  proIpi?: string;
  catalog: CatalogItem[];
  artistIdentity: ArtistIdentityState;
  avatarImage?: string;
  headerImage?: string;
  pressGallery?: string[];

  // AI Audit Support
  strategicHealthScore: number;
  criticalDeficits: string[];
  auditHistory: ProfileAuditLog[];

  // Onboarding & UI specific fields
  skills: string[];
  brandVoices: string[];
  strategicGoals: string[];
  performancesPerYear: string;
  touringDetails: {
    travelPreference: string;
    regions: string[];
  };
  genreSpecificData: Record<string, any>;
  profileSetupCompleted?: boolean;
  profileSetupCompletedAt?: number;

  // Gameplay progression
  gameStats: Record<string, ThaSpotGameStat>;
  thaSpotProgression: ThaSpotProgression;

  [key: string]: any;
}
