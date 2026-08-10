import { ArtistIdentityState } from './artist-identity.types';
import {
  ArtistKnowledgeBase,
  RecommendationHistoryEntry,
  UpgradeRecommendation,
} from './ai.types';
import { MarketingCampaign } from './marketing.types';

export type { RecommendationHistoryEntry, UpgradeRecommendation };

export interface AppSettings {
  ui: {
    theme: string;
    performanceMode: boolean;
    showScanlines: boolean;
    animationsEnabled: boolean;
    autoPianoRoll: boolean;
  };
  audio: {
    masterVolume: number;
    autoSaveEnabled: boolean;
    sampleRate?: number;
    bufferSize?: number;
    defaultExportFormat?: string;
  };
  ai: {
    kbWriteAccess: boolean;
    commanderPersona: string;
    aiMimicEnabled: boolean;
    aiProfanityEnabled: boolean;
    aiPersonaIntensityEnabled: boolean;
    autoAuditEnabled: boolean;
    aiConversationalTier: 'Standard' | 'Elite' | 'SUPREME';
    aiTotalControlEnabled: boolean;
    aiVoiceShapeShiftEnabled: boolean;
  };
  studio: {
    defaultQuantize: string;
    autoMixEnabled: boolean;
    latencyCompensation: number;
    highFidelityExport: boolean;
    /** Stage FX ambience (aurora / marquee / sheens / pulses). Mirrored to
     *  localStorage `smuve_stage_fx` so the Studio shell and the global
     *  `stage-fx-off` body-class kill-switch honor it everywhere. */
    stageFxEnabled: boolean;
  };
  dj: {
    crossfaderCurve: 'linear' | 'power' | 'exp' | 'cut';
    hamsterMode: boolean;
    vinylMode: boolean;
    visualCuePoints: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    endToEndEncryption: boolean;
    biometricLock: boolean;
    auditLogEnabled: boolean;
    sessionTimeout: number;
  };
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

export interface StrategicSignals {
  marketReadiness: number;
  identityTrust: number;
  careerMomentum: number;
  technicalAuthority: number;
  syncViability: number;
  touringStability: number;
}

export interface SyncDetails {
  isSyncReady: string;
  hasCleanVersions: boolean;
  hasInstrumentals: boolean;
  hasStems: string;
  oneStopClearance: boolean;
  catalogSize: number;
  preferredKeywords: string[];
}

export interface LegalInfrastructure {
  hasRegisteredWorks: boolean | string;
  proAffiliation: string;
  hasStandardSplitSheet: string;
  isIncorporated: boolean;
  legalEntityName?: string;
  trademarkStatus: 'None' | 'Pending' | 'Registered';
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
  highScore?: number;
  bestLevel?: number;
  lastPlayedAt?: number;
}

export interface ThaSpotGameStat {
  plays?: number;
  highScore?: number;
  bestLevel?: number;
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
  roomStats: Record<string, ThaSpotRoomStat>;
  earnedCosmetics: string[];
  eventHistory: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotSessionContext {
  roomId: string;
  startedAt: number;
  gameId?: string;
  mode?: string;
}

export interface ExpertiseLevels {
  production: number;
  songwriting: number;
  marketing: number;
  business: number;
  legal: number;
  performance: number;
  catalyst: any;
  technical_mastery?: number;
  roles?: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  share: number;
  bio?: string;
  joinedAt: string;
}

export interface ProfessionalFinancials {
  accounts: any[];
  monthlyBudget: number;
  totalRevenue: number;
  pendingPayouts: number;
  splitSheets: any[];
  revenueHistory: any[];
}

export interface ProfileAuditLog {
  score: number;
  status: string;
  alerts: string[];
  deficits: string[];
  timestamp: number;
  recommendations?: any[];
  auditType?: string;
}

export interface MusicalJourney {
  songwritingStyle: string;
  productionPhilosophy: string;
  collaborativeMode: string;
  releaseVelocity: string;
  primarySuccessMetric: string;
  musicalInfluences: string[];
  yearsInIndustry: number;
  educationalBackground: string;
  contentStrategy: string;
  marketPosition: string;
  // Enhanced fields
  originStory?: string;
  artistNameMeaning?: string;
  subgenres?: string[];
  songwritingProcess?: string;
  signatureGear?: string;
  creativeCatalyst?: string;
  visualAesthetic?: string[];
  ultimateVision?: string;
  autoGenerateEpk?: boolean;
  roles?: string[];
  personaSynthesis?: {
    archetype: string;
    signatureTone: string;
    sonicSignature: string;
    aiPersonaProfile: string;
    recommendedStrategy: string;
    suggestedGenres: string[];
    productionAphorism: string;
  };
}

export interface UserProfile {
  musicalJourney: MusicalJourney;
  id?: string;
  artistName: string;
  primaryGenre: string;
  location?: string;
  website?: string;
  proIpi?: string;
  proName?: string;
  proData?: {
    workIds: any[];
    affiliations: string[];
    ipiNumber?: string;
  };
  skills?: string[];
  productionStyles?: string[];
  brandVoices?: string[];
  strategicGoals?: string[];
  performancesPerYear?: string;
  settings: AppSettings;
  knowledgeBase: ArtistKnowledgeBase;
  careerGoals: string[];
  equipment: string[];
  daw: string[];
  services: string[];
  recommendationPreferences: any;
  recommendationHistory: RecommendationHistoryEntry[];
  expertise: ExpertiseLevels;
  team: TeamMember[];
  marketingCampaigns: MarketingCampaign[];
  financials: ProfessionalFinancials;
  catalog: CatalogItem[];
  artistIdentity: ArtistIdentityState;
  avatarImage?: string;
  headerImage?: string;
  pressGallery: string[];
  strategicHealthScore: number;
  criticalDeficits: string[];
  strategicSignals: StrategicSignals;
  auditHistory: ProfileAuditLog[];
  touringDetails?: any;
  syncDetails?: any;
  legalInfrastructure?: any;
  genreSpecificData?: any;
  gameStats?: any;
  thaSpotProgression?: any;
  profileSetupCompleted?: boolean;
  profileSetupCompletedAt?: number;
  eliteScore?: number;
  squadCount?: number;
}

import { createInitialArtistIdentity } from './artist-identity.types';
export const initialProfile: UserProfile = {
  settings: {
    ui: {
      theme: 'Dark',
      performanceMode: false,
      showScanlines: false,
      animationsEnabled: true,
      autoPianoRoll: false,
    },
    audio: {
      masterVolume: 0.8,
      autoSaveEnabled: true,
      sampleRate: 48000,
      bufferSize: 256,
      defaultExportFormat: 'wav',
    },
    ai: {
      kbWriteAccess: true,
      commanderPersona: 'Elite',
      aiMimicEnabled: false,
      aiProfanityEnabled: false,
      aiPersonaIntensityEnabled: false,
      autoAuditEnabled: false,
      aiTotalControlEnabled: false,
      aiConversationalTier: 'Standard',
      aiVoiceShapeShiftEnabled: true,
    },
    studio: {
      defaultQuantize: '1/16',
      autoMixEnabled: false,
      latencyCompensation: 0,
      highFidelityExport: true,
      stageFxEnabled: true,
    },
    dj: {
      crossfaderCurve: 'linear',
      hamsterMode: false,
      vinylMode: true,
      visualCuePoints: true,
    },
    security: {
      twoFactorEnabled: false,
      endToEndEncryption: false,
      biometricLock: false,
      auditLogEnabled: true,
      sessionTimeout: 3600,
    },
  },
  artistName: 'New Artist',
  musicalJourney: {
    songwritingStyle: 'Unspecified',
    productionPhilosophy: 'Unspecified',
    collaborativeMode: 'Solo',
    releaseVelocity: 'Occasional',
    primarySuccessMetric: 'Creative Satisfaction',
    musicalInfluences: [],
    yearsInIndustry: 0,
    educationalBackground: 'Self-Taught',
    contentStrategy: 'Organic',
    marketPosition: 'Independent',
  },
  primaryGenre: 'Hip Hop',
  location: 'Unspecified',
  proName: '',
  proIpi: '',
  proData: { workIds: [], affiliations: [], ipiNumber: '' },
  knowledgeBase: {
    id: 'kb-initial',
    artistId: 'new-artist',
    dataPoints: [],
    learnedStyles: [],
    productionSecrets: [],
    coreTrends: [],
    strategicDirectives: [],
    marketIntel: [],
    genreAnalysis: {},
    brandStatus: {},
    strategicHealthScore: 0,
  },
  careerGoals: [],
  equipment: [],
  daw: [],
  services: [],
  recommendationPreferences: {},
  recommendationHistory: [],
  expertise: {
    production: 0,
    songwriting: 0,
    marketing: 0,
    business: 0,
    legal: 0,
    performance: 0,
    catalyst: 0,
  },
  team: [],
  marketingCampaigns: [],
  financials: {
    accounts: [],
    monthlyBudget: 0,
    totalRevenue: 0,
    pendingPayouts: 0,
    splitSheets: [],
    revenueHistory: [],
  },
  catalog: [],
  artistIdentity: createInitialArtistIdentity('New Artist', 'Hip Hop'),
  strategicHealthScore: 0,
  criticalDeficits: [],
  strategicSignals: {
    marketReadiness: 0,
    identityTrust: 0,
    careerMomentum: 0,
    technicalAuthority: 0,
    syncViability: 0,
    touringStability: 0,
  },
  auditHistory: [],
  skills: [],
  productionStyles: [],
  brandVoices: [],
  strategicGoals: [],
  performancesPerYear: 'None',
  touringDetails: {
    travelPreference: 'Van',
    regions: [],
    isTourReady: 'Studio Only',
    hasBackline: 'No',
  },
  syncDetails: {
    isSyncReady: 'Not Started',
    hasCleanVersions: false,
    hasInstrumentals: false,
    hasStems: 'No',
    oneStopClearance: false,
    catalogSize: 0,
    preferredKeywords: [],
  },
  legalInfrastructure: {
    hasRegisteredWorks: false,
    proAffiliation: 'None',
    hasStandardSplitSheet: 'Never',
    isIncorporated: false,
    trademarkStatus: 'None',
  },
  genreSpecificData: {},
  gameStats: {},
  pressGallery: [],
  thaSpotProgression: { roomStats: {}, earnedCosmetics: [], eventHistory: [] },
  eliteScore: 0,
  squadCount: 0,
};
