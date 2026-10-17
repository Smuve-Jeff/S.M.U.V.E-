import { ArtistIdentityState } from './artist-identity.types';
import {
  ArtistKnowledgeBase,
  RecommendationHistoryEntry,
  UpgradeRecommendation,
} from './ai.types';
import { MarketingCampaign } from './marketing.types';
import {
  buildMusicalDnaContext,
  buildMusicalDnaTeachingContext,
  type MusicalDnaReading,
  type MusicalDnaState,
} from './musical-dna.types';

export type { RecommendationHistoryEntry, UpgradeRecommendation };
export type { MusicalDnaReading, MusicalDnaState };

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
    /** Smart Creation Sheet recall — the pack/preset/mode the artist touched
     *  last. Mirrored to localStorage so a pre-auth session still re-arms, and
     *  stored on the profile so the choice follows the artist between devices. */
    smartSheet?: SmartSheetMemory;
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
    /** Lock the shell automatically after a stretch of inactivity. */
    autoLockEnabled: boolean;
    /** Inactivity window in minutes before the auto-lock fires. */
    autoLockMinutes: number;
    /** Epoch (ms) of the last known password change; drives rotation nudges. */
    passwordUpdatedAt: number;
    /** Privacy: broadcast live activity/presence to other accounts. */
    shareActivityStatus: boolean;
    /** Privacy: let other artists find and message this account. */
    allowCollaboratorDiscovery: boolean;
    /** Privacy: send anonymous diagnostics/telemetry off the device. */
    anonymousTelemetry: boolean;
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
  /** Official release history fields — how the work exists in the world. */
  releaseDate?: string;
  releaseType?: 'Single' | 'EP' | 'Album' | 'Mixtape' | 'Live' | 'Remix';
  /** ISRC — official identity of the recording. */
  isrc?: string;
  /** ISWC — official identity of the composition behind the recording. */
  iswc?: string;
  /** UPC — barcode identity of the release the work ships on. */
  upc?: string;
  distributor?: string;
  /** Where the release is live (Spotify, Apple Music, YouTube, Bandcamp...). */
  platforms?: string[];
  credits?: string;
  /** Splits or ownership paperwork attached to this specific work. */
  splitSheetRef?: string;
}

/**
 * A verified official destination for the artist — a For Artists dashboard, a
 * PRO account, an analytics service, or a distributor. Beginners have none of
 * these; established artists have several that need consolidating.
 */
export interface OfficialArtistProfileLink {
  id: string;
  /** Matches an id in the fingerprint destination registry. */
  destinationId: string;
  label: string;
  url: string;
  verified?: boolean;
  addedAt?: number;
  note?: string;
}

export interface StrategicSignals {
  marketReadiness: number;
  identityTrust: number;
  careerMomentum: number;
  technicalAuthority: number;
  syncViability: number;
  touringStability: number;
}

export interface SmartSheetMemory {
  lastStarterId?: string;
  lastVocalPresetId?: string;
  lastChordMoodId?: string;
  lastTab?: string;
  /** Epoch (ms) of the newest write; the account copy only wins when it is newer. */
  updatedAt?: number;
  /** Per-item use stamps keyed by category (`starter:trap`, `vocal:…`,
   *  `chord:…`) — drives the combined Recently Used row. Merged by max across
   *  devices instead of being picked, so both devices' history survives. */
  recent?: Record<string, number>;
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
  /** The productive contradiction or tension that gives the artist a point of view. */
  signatureTension?: string;
  /** Concrete lived-world details that keep the artist's story from sounding generic. */
  livedWorldDetails?: string;
  /** Musical choices the artist will not compromise, even when trends change. */
  sonicNonNegotiables?: string;
  /** The cue a listener should recognize within the first few seconds. */
  recognitionCue?: string;
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

  // Sonic blueprint — the deep musical make-up collected by q55–q69.
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
  push('Signature tension', cap(bp.signatureTension));
  push('Lived-world details', cap(bp.livedWorldDetails));
  push('Sonic non-negotiables', cap(bp.sonicNonNegotiables));
  push('Recognition cue', cap(bp.recognitionCue));

  // Learned fingerprint: declared answers reconciled against works, settings
  // and decisions. Appended last so the explicit profile still leads.
  const dna = buildMusicalDnaContext(profile);
  if (dna) lines.push('', dna);

  // The ordered lesson plan for the weakest axes — S.M.U.V.E. leads with
  // these instead of defaulting to generic advice.
  const teaching = buildMusicalDnaTeachingContext(profile);
  if (teaching) lines.push('', teaching);

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
  /** Official For Artists dashboards, PROs, analytics, and distributor links. */
  officialArtistProfiles?: OfficialArtistProfileLink[];
  /**
   * S.M.U.V.E. Musical DNA — the learned fingerprint.
   *
   * Persisted on the profile (so it survives devices via the profile's own
   * backup/cloud sync) and recomputed from declared answers plus observed
   * work, settings, decisions and live behaviour. See
   * `MusicalDnaService` and `MusicalDna` in `musical-dna.types.ts`.
   */
  musicalDna?: MusicalDnaState;
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
      // Default commander persona is the platform's signature S.M.U.V.E.
      // Prime character so the S.M.U.V.E voice uses the intended tone; voice
      // shape-shifting is permanent core identity (not toggleable).
      commanderPersona: 'S.M.U.V.E. Prime',
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
      smartSheet: {},
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
      autoLockEnabled: true,
      autoLockMinutes: 15,
      passwordUpdatedAt: 0,
      // Privacy-safe defaults: nothing leaves the device or the account
      // unless the artist opts in explicitly.
      shareActivityStatus: false,
      allowCollaboratorDiscovery: true,
      anonymousTelemetry: false,
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
      signatureTension: '',
      livedWorldDetails: '',
      sonicNonNegotiables: '',
      recognitionCue: '',
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
  officialArtistProfiles: [],
  gameStats: {},
  pressGallery: [],
  thaSpotProgression: { roomStats: {}, earnedCosmetics: [], eventHistory: [] },
  eliteScore: 0,
  squadCount: 0,
};
