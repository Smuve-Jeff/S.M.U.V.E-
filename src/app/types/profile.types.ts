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
    /** Studio beginner mode — simplified controls with tips. Mirrored to
     *  localStorage `smuve_beginner_mode` so it survives pre-auth sessions
     *  and is readable by every view (Hub, Studio, mobile quick-start). */
    beginnerMode: boolean;
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
    /** Permanently enabled — S.M.U.V.E. identity. Always true, never toggleable. */
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

export interface ArtistMusicBlueprint {
  /** How the artist wants their voice or lead instrument to feel in a record. */
  vocalDelivery?: string;
  /** Recurring subjects, images, and emotional territory in the writing. */
  lyricalThemes?: string[];
  /** Groove, pocket, swing, and rhythmic references that define the feel. */
  rhythmicFeel?: string;
  /** Chord vocabulary, key movement, and harmonic tension preferences. */
  harmonicLanguage?: string;
  /** How energy, sections, transitions, and instrumental space should develop. */
  arrangementApproach?: string;
  /** Recording choices and performance details S.M.U.V.E should protect. */
  recordingPriorities?: string[];
  /** Mix or master outcomes the artist values most. */
  mixingPriorities?: string[];
  /** Specific tracks used as sonic references, not instructions to imitate. */
  referenceTracks?: string[];
  /** The listeners and communities the artist is intentionally serving. */
  audienceProfile?: string;
  /** Collaboration limits, credit expectations, and working preferences. */
  collaborationBoundaries?: string;
  /** The feeling or change the artist wants the music to create. */
  artisticIntent?: string;
}

/**
 * Compact, bounded S.M.U.V.E artist-data block derived from the profile.
 * Single source of truth for every AI surface (persona synthesis, chatbot
 * master prompt, advisor) so the questionnaire can never drift away from
 * what the chatbot actually knows. Text fields are capped to keep prompts
 * lean; empty/absent fields are skipped entirely.
 */
export function buildArtistMusicContext(
  profile: UserProfile | null | undefined
): string {
  if (!profile) return '';
  const j = profile.musicalJourney || ({} as MusicalJourney);
  const bp = j.musicBlueprint || ({} as ArtistMusicBlueprint);
  const cap = (v: unknown, max = 240): string => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
  };
  const list = (v: unknown, max = 6): string => {
    if (Array.isArray(v)) {
      return v
        .filter((x) => typeof x === 'string' && x.trim())
        .slice(0, max)
        .join(', ');
    }
    // Free-text answers (e.g. reference tracks) may arrive as newline- or
    // semicolon-separated strings; normalize them into a bounded list.
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) return '';
    return s
      .split(/\r?\n|;/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, max)
      .join(', ');
  };

  const lines: string[] = [];
  const push = (label: string, value: string) => {
    if (value) lines.push(`- ${label}: ${value}`);
  };

  push('Artist', cap(profile.artistName, 80));
  push('Genre', cap(profile.primaryGenre, 60));
  push('Subgenres', list(j.subgenres));
  push('Roles', list(profile.expertise?.roles ?? j.roles));
  push('Influences', list(j.musicalInfluences));
  push('Songwriting style', cap(j.songwritingStyle, 80));
  push('Production philosophy', cap(j.productionPhilosophy, 80));
  push('Signature sound', cap(j.signatureSound));
  push('Signature gear', cap(j.signatureGear, 120));
  push('Vocal range', cap(j.vocalRange, 60));
  push('Tempo zone', cap(j.preferredBpmRange, 30));
  push('Market position', cap(j.marketPosition, 60));
  push('Release velocity', cap(j.releaseVelocity, 60));
  push('Success metric', cap(j.primarySuccessMetric, 60));
  push('Current focus', cap(j.currentFocus));
  push('Biggest challenge', cap(j.biggestChallenge));
  push('Collaboration goals', cap(j.collaborationGoals));
  push('Ultimate vision', cap(j.ultimateVision));

  // Sonic blueprint — the deep musical make-up collected by q55–q65.
  push('Vocal/instrument delivery', cap(bp.vocalDelivery, 120));
  push('Lyrical themes', list(bp.lyricalThemes));
  push('Rhythmic feel', cap(bp.rhythmicFeel, 120));
  push('Harmonic language', cap(bp.harmonicLanguage, 120));
  push('Arrangement approach', cap(bp.arrangementApproach, 120));
  push('Recording priorities', list(bp.recordingPriorities));
  push('Mixing priorities', list(bp.mixingPriorities));
  push('Reference tracks', list(bp.referenceTracks, 8));
  push('Audience profile', cap(bp.audienceProfile));
  push('Collaboration boundaries', cap(bp.collaborationBoundaries));
  push('Artistic intent', cap(bp.artisticIntent));

  return lines.join('\n');
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
  /** What makes the artist's sound unmistakably theirs — the uniqueness core. */
  signatureSound?: string;
  /** First song the artist ever made or performed — journey anchor. */
  firstSong?: string;
  /** The moment that changed the trajectory of the artist's career. */
  breakthroughMoment?: string;
  /** Vocal register / range descriptor (e.g. 'Tenor (C3–C5)'). */
  vocalRange?: string;
  /** Active revenue streams (streaming, sync, merch, sessions, shows...). */
  incomeStreams?: string[];
  /** Self-identified experience band ('Beginner' | 'Intermediate' | ...). */
  experienceLevel?: string;
  /** Preferred tempo zone (e.g. '90-120'). */
  preferredBpmRange?: string;
  /** The current mission — what the artist is building right now. */
  currentFocus?: string;
  /** The single biggest obstacle the artist is fighting. */
  biggestChallenge?: string;
  /** Who the artist wants to work with and why. */
  collaborationGoals?: string;
  /** Optional detailed sonic blueprint collected by the deep questionnaire. */
  musicBlueprint?: ArtistMusicBlueprint;
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
      beginnerMode: true,
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
      // Default commander persona changed to the platform's ominous persona
      // so the S.M.U.V.E voice uses the intended character; voice
      // shape-shifting is permanent core identity (not toggleable).
      commanderPersona: 'Ominous Dominator',
      aiMimicEnabled: false,
      aiProfanityEnabled: true,
      aiPersonaIntensityEnabled: true,
      autoAuditEnabled: false,
      aiTotalControlEnabled: false,
      aiConversationalTier: 'Standard',
      // S.M.U.V.E. identity — permanently active, never toggleable
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
      crossfaderCurve: 'power',
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
    musicBlueprint: {
      vocalDelivery: '',
      lyricalThemes: [],
      rhythmicFeel: '',
      harmonicLanguage: '',
      arrangementApproach: '',
      recordingPriorities: [],
      mixingPriorities: [],
      referenceTracks: [],
      audienceProfile: '',
      collaborationBoundaries: '',
      artisticIntent: '',
    },
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
