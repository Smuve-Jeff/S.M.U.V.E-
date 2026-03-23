import { BusinessPipeline, ProData } from "../types/business.types";
import { LoggingService } from './logging.service';
import { MarketingCampaign } from '../types/marketing.types';
import { Injectable, signal, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DatabaseService } from './database.service';
import { ArtistKnowledgeBase } from '../types/ai.types';

export interface AppSettings {
  ui: {
    theme: string;
    performanceMode: boolean;
    showScanlines: boolean;
    animationsEnabled: boolean;
  };
  audio: {
    masterVolume: number;
    sampleRate: number;
    bufferSize: number;
    autoSaveEnabled: boolean;
    defaultExportFormat: "wav" | "mp3" | "webm";
  };
  ai: {
    kbWriteAccess: boolean;
    commanderPersona: "Elite" | "Balanced" | "Supportive";
    autoAuditEnabled: boolean;
    intelligenceFrequency: "High" | "Medium" | "Low";
  };
  studio: {
    defaultQuantize: string;
    pianoRollSnap: string;
    showVelocityLane: boolean;
    autoMixEnabled: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    publicProfile: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    endToEndEncryption: boolean;
    sessionTimeout: number;
    biometricLock: boolean;
    auditLogEnabled: boolean;
  };
}

export interface CatalogItem {
  id: string;
  title: string;
  type?: 'Master' | 'Demo' | 'Stem' | 'Asset' | string;
  url: string;
  metadata: any;
  status?: string;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArtistTask {
  id: string;
  title: string;
  category: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'low' | 'medium' | 'high';
  aiSuggested?: boolean;
}

export interface ShowcaseItem {
  id: string;
  title: string;
  type: 'Video' | 'Audio' | 'Image';
  url: string;
}

export interface ArtistPlatform {
  url: string;
  verified: boolean;
  status: 'unverified' | 'syncing' | 'verified';
  lastSynced?: string;
}

export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  lastModified?: string;
}

export interface UserProfile {
  settings: AppSettings;
  catalog: CatalogItem[];
  businessPipelines?: BusinessPipeline[];
  proData?: ProData;
  tasks: ArtistTask[];
  marketingCampaigns: MarketingCampaign[];
  artistName: string;
  stageName?: string;
  location?: string;
  bio: string;
  profilePictureUrl?: string;
  primaryGenre: string;
  secondaryGenres: string[];
  subGenres: string[];
  musicalInfluences: string;
  artistsYouSoundLike: string[];
  uniqueSound: string;
  yearsActive: number;
  experienceLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional';
  formalTraining: string;
  skills: string[];
  expertiseLevels: {
    [key: string]: number;
    songwriting: number;
    production: number;
    mixing: number;
    mastering: number;
    performance: number;
    marketing: number;
    businessManagement: number;
    audioEngineering: number;
    lyricsWriting: number;
    melodyCreation: number;
  };
  careerStage:
    | 'Just Starting'
    | 'Building Fanbase'
    | 'Established Local'
    | 'Regional Success'
    | 'National/International';
  careerGoals: string[];
  shortTermGoals: string[];
  longTermGoals: string[];
  currentFocus: string;
  biggestChallenge: string;
  targetAudience: string;
  currentFanbase: 'None' | '<100' | '100-1K' | '1K-10K' | '10K-100K' | '100K+';
  geographicFocus: string[];
  releaseFrequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Sporadic';
  contentTypes: string[];
  releasedTracks: number;
  upcomingProjects: string;
  showcases: ShowcaseItem[];
  marketingExperience: 'None' | 'Basic' | 'Intermediate' | 'Advanced';
  promotionChannels: string[];
  marketingBudget:
    | 'No Budget'
    | '<00/mo'
    | '00-2K/mo'
    | 'K-5K/mo'
    | 'K+/mo';
  contentStrategy: string;
  revenueStreams: string[];
  isMonetizing: boolean;
  businessStructure:
    | 'Individual'
    | 'LLC'
    | 'Partnership'
    | 'Corporation'
    | 'Not Set Up';
  hasManager: boolean;
  hasBookingAgent: boolean;
  hasPublisher: boolean;
  hasLabel: boolean;
  labelType?: 'Independent' | 'Major' | 'Distribution Only';
  legalDocuments?: LegalDocument[];
  daw: string[];
  equipment: string[];
  vst_plugins: string[];
  recordingSetup:
    | 'Home Studio'
    | 'Project Studio'
    | 'Professional Studio'
    | 'Mobile Setup';
  openToCollaboration: boolean;
  collaborationTypes: string[];
  networkingGoals: string;
  lookingFor: string[];
  performancesPerYear: 'None' | '1-5' | '6-20' | '20-50' | '50+';
  venueTypes: string[];
  comfortableWithLive: boolean;
  links: { [key: string]: string };
  officialMusicProfiles: {
    apple: ArtistPlatform;
    spotify: ArtistPlatform;
    tidal: ArtistPlatform;
    iheart: ArtistPlatform;
    amazon: ArtistPlatform;
    youtube: ArtistPlatform;
    pandora: ArtistPlatform;
    soundcloud: ArtistPlatform;
  };
  personalSocialProfiles: {
    facebook: ArtistPlatform;
    instagram: ArtistPlatform;
    tiktok: ArtistPlatform;
    youtube: ArtistPlatform;
    x: ArtistPlatform;
  };
  mostActiveOn: string[];
  postingFrequency: string;
  engagementLevel: 'Low' | 'Medium' | 'High';
  proName?: string;
  proIpi?: string;
  soundExchangeId?: string;
  mlcId?: string;
  isni?: string;
  isOfficialProfile: boolean;
  genreSpecificData: { [key: string]: any };
  touringDetails: {
    hasRider: boolean;
    technicalRiderUrl?: string;
    hospitalityRiderUrl?: string;
    travelPreference: string;
    backlineNeeds: string[];
    averageGuarantee: string;
  };
  publishingDetails: {
    iswcRegistered: boolean;
    worksCount: number;
    publishingDealType: string;
    hasSyncAgent: boolean;
  };
  brandIdentity: {
    brandVoice: string[];
    colorPalette: string[];
    targetDemographics: {
      age: string[];
      interests: string[];
      locations: string[];
    };
    brandStory: string;
  };
  team: {
    role: 'Admin' | 'Manager' | 'Collaborator' | 'Engineer' | 'Viewer';
    name: string;
    contact: string;
    active: boolean;
    permissions: string[];
  }[];
  socialMediaStrategy: {
    platforms: string[];
    frequency: string;
    contentTypes: string[];
    engagementGoal: string;
  };
  preferredDistributor?: string;
  distributionStatus?: 'Not Started' | 'In Progress' | 'Distributed';
  areasToImprove: string[];
  learningStyle:
    | 'Video Tutorials'
    | 'Written Guides'
    | 'Hands-on Practice'
    | 'Mentorship'
    | 'Courses';
  investingInEducation: boolean;
  knowledgeBase: ArtistKnowledgeBase;
  confidenceLevel: number;
  dealingWithCriticism: 'Poorly' | 'Okay' | 'Well' | 'Excellently';
  motivationLevel: number;
  consistency:
    | 'Struggle'
    | 'Inconsistent'
    | 'Fairly Consistent'
    | 'Very Consistent';
}

export const initialProfile: UserProfile = {
  settings: {
    ui: { theme: "Modern Professional", performanceMode: false, showScanlines: true, animationsEnabled: true },
    audio: { masterVolume: 0.8, sampleRate: 44100, bufferSize: 512, autoSaveEnabled: true, defaultExportFormat: "wav" },
    ai: { kbWriteAccess: true, commanderPersona: "Elite", autoAuditEnabled: false, intelligenceFrequency: "High" },
    studio: { defaultQuantize: "1/16", pianoRollSnap: "1/16", showVelocityLane: true, autoMixEnabled: false },
    privacy: { shareAnalytics: true, publicProfile: true },
    security: {
      twoFactorEnabled: false,
      endToEndEncryption: true,
      sessionTimeout: 3600,
      biometricLock: false,
      auditLogEnabled: true
    }
  },
  catalog: [],
  tasks: [],
  marketingCampaigns: [],
  artistName: 'New Artist',
  stageName: '',
  location: '',
  bio: 'Describe your musical journey...',
  profilePictureUrl: '',
  primaryGenre: '',
  secondaryGenres: [],
  subGenres: [],
  musicalInfluences: '',
  artistsYouSoundLike: [],
  uniqueSound: '',
  yearsActive: 0,
  experienceLevel: 'Beginner',
  formalTraining: '',
  skills: [],
  expertiseLevels: {
    songwriting: 5,
    production: 5,
    mixing: 5,
    mastering: 5,
    performance: 5,
    marketing: 5,
    businessManagement: 5,
    audioEngineering: 5,
    lyricsWriting: 5,
    melodyCreation: 5,
  },
  careerStage: 'Just Starting',
  careerGoals: [],
  shortTermGoals: [],
  longTermGoals: [],
  currentFocus: '',
  biggestChallenge: '',
  targetAudience: '',
  currentFanbase: 'None',
  geographicFocus: [],
  releaseFrequency: 'Sporadic',
  contentTypes: [],
  releasedTracks: 0,
  upcomingProjects: '',
  showcases: [],
  marketingExperience: 'None',
  promotionChannels: [],
  marketingBudget: 'No Budget',
  contentStrategy: '',
  revenueStreams: [],
  isMonetizing: false,
  businessStructure: 'Not Set Up',
  hasManager: false,
  hasBookingAgent: false,
  hasPublisher: false,
  hasLabel: false,
  legalDocuments: [],
  daw: [],
  equipment: [],
  vst_plugins: [],
  recordingSetup: 'Home Studio',
  openToCollaboration: true,
  collaborationTypes: [],
  networkingGoals: '',
  lookingFor: [],
  performancesPerYear: 'None',
  venueTypes: [],
  comfortableWithLive: false,
  links: {},
  officialMusicProfiles: {
    apple: { url: '', verified: false, status: 'unverified' },
    spotify: { url: '', verified: false, status: 'unverified' },
    tidal: { url: '', verified: false, status: 'unverified' },
    iheart: { url: '', verified: false, status: 'unverified' },
    amazon: { url: '', verified: false, status: 'unverified' },
    youtube: { url: '', verified: false, status: 'unverified' },
    pandora: { url: '', verified: false, status: 'unverified' },
    soundcloud: { url: '', verified: false, status: 'unverified' },
  },
  personalSocialProfiles: {
    facebook: { url: '', verified: false, status: 'unverified' },
    instagram: { url: '', verified: false, status: 'unverified' },
    tiktok: { url: '', verified: false, status: 'unverified' },
    youtube: { url: '', verified: false, status: 'unverified' },
    x: { url: '', verified: false, status: 'unverified' },
  },
  mostActiveOn: [],
  postingFrequency: '',
  engagementLevel: 'Low',
  proName: '',
  proIpi: '',
  soundExchangeId: '',
  mlcId: '',
  isni: '',
  isOfficialProfile: false,
  genreSpecificData: {},
  touringDetails: {
    hasRider: false,
    travelPreference: "Van",
    backlineNeeds: [],
    averageGuarantee: "0"
  },
  publishingDetails: {
    iswcRegistered: false,
    worksCount: 0,
    publishingDealType: "None",
    hasSyncAgent: false
  },
  brandIdentity: {
    brandVoice: [],
    colorPalette: [],
    targetDemographics: {
      age: [],
      interests: [],
      locations: []
    },
    brandStory: ""
  },
  team: [
    {
      role: 'Admin',
      name: 'Executive Artist',
      contact: 'internal',
      active: true,
      permissions: ['ALL_ACCESS', 'MANAGE_SETTINGS', 'MANAGE_BILLING', 'MANAGE_CATALOG', 'AI_WRITE']
    }
  ],
  socialMediaStrategy: {
    platforms: [],
    frequency: "Daily",
    contentTypes: [],
    engagementGoal: "Growth"
  },
  preferredDistributor: '',
  distributionStatus: 'Not Started',
  areasToImprove: [],
  learningStyle: 'Video Tutorials',
  investingInEducation: false,
  knowledgeBase: { id: "kb_01", artistId: "artist_01", dataPoints: [],
    learnedStyles: [],
    productionSecrets: [],
    coreTrends: [],
    strategicDirectives: [],
    marketIntel: [],
    genreAnalysis: {},
    brandStatus: {},
    strategicHealthScore: 0,
  },
  confidenceLevel: 5,
  dealingWithCriticism: 'Okay',
  motivationLevel: 5,
  consistency: 'Inconsistent',
};

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private logger = inject(LoggingService);
  private authService = inject(AuthService);
  private databaseService = inject(DatabaseService);
  profile = signal<UserProfile>(initialProfile);

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.loadProfile();
      } else {
        this.profile.set(initialProfile);
      }
    });
  }

  private async loadProfile(): Promise<void> {
    try {
      const userProfile = await this.databaseService.loadUserProfile();
      if (userProfile) {
        this.profile.set(userProfile);
      } else {
        this.profile.set(initialProfile);
        await this.databaseService.saveUserProfile(initialProfile);
      }
    } catch (error) {
      this.logger.error('UserProfileService: Failed to load profile', error);
    }
  }

  async acquireUpgrade(upgrade: { title: string; type: string }): Promise<void> {
    const currentProfile = this.profile();
    const updatedProfile = { ...currentProfile };
    if (upgrade.type === 'Software' || upgrade.type === 'Service') {
      if (!updatedProfile.daw.includes(upgrade.title)) {
        updatedProfile.daw = [...updatedProfile.daw, upgrade.title];
      }
      if (upgrade.type === 'Software' && !updatedProfile.vst_plugins.includes(upgrade.title)) {
        updatedProfile.vst_plugins = [...updatedProfile.vst_plugins, upgrade.title];
      }
    } else if (upgrade.type === 'Gear') {
      if (!updatedProfile.equipment.includes(upgrade.title)) {
        updatedProfile.equipment = [...updatedProfile.equipment, upgrade.title];
      }
    }
    await this.updateProfile(updatedProfile);
  }

  async updateProfile(newProfile: UserProfile): Promise<void> {
    try {
      await this.databaseService.saveUserProfile(newProfile);
      this.profile.set(newProfile);
    } catch (error) {
      this.logger.error('UserProfileService: Failed to save profile', error);
    }
  }
}
