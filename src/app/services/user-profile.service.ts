import { LoggingService } from './logging.service';
import { MarketingCampaign } from '../types/marketing.types';
import { Injectable, signal, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DatabaseService } from './database.service';
import { LegalDocument } from '../components/legal-document-editor/legal-document-editor.component';
export type { LegalDocument };
import { ArtistKnowledgeBase } from '../types/ai.types';

export interface ShowcaseItem {
  type: 'music' | 'image' | 'video';
  url: string;
  title: string;
  artist: string;
  visibility: 'public' | 'private' | 'unlisted';
  featured: boolean;
}

export interface ArtistPlatform {
  url: string;
  verified: boolean;
  status: 'unverified' | 'verified' | 'syncing';
  lastSynced?: string;
}


export interface CatalogItem {
  id: string;
  title: string;
  version?: string;
  status: 'demo' | 'completed' | 'released';
  category: 'track' | 'stem' | 'vocal' | 'instrumental' | 'artwork' | 'document' | 'other';
  url: string;
  metadata: {
    isrc?: string;
    upc?: string;
    bpm?: number;
    key?: string;
    genre?: string;
    mood?: string;
    credits: string[];
    releaseDate?: string;
    label?: string;
    distributor?: string;
  };
  socialLinks?: {
    platform: string;
    url: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface ArtistTask {
  id: string;
  title: string;
  description?: string;
  category: 'production' | 'marketing' | 'legal' | 'distribution' | 'other';
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  aiSuggested: boolean;
  actionUrl?: string;
}

export interface UserProfile {
  catalog: CatalogItem[];
  tasks: ArtistTask[];
  marketingCampaigns: MarketingCampaign[];
  // === BASIC INFO ===
  artistName: string;
  stageName?: string;
  location?: string;
  bio: string;
  profilePictureUrl?: string;

  // === MUSICAL IDENTITY ===
  primaryGenre: string;
  secondaryGenres: string[];
  subGenres: string[];
  musicalInfluences: string;
  artistsYouSoundLike: string[];
  uniqueSound: string; // What makes your sound unique

  // === EXPERIENCE & EXPERTISE ===
  yearsActive: number;
  experienceLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional';
  formalTraining: string; // Music school, self-taught, etc.
  skills: string[]; // Vocalist, Producer, Songwriter, DJ, etc.

  // Expertise levels (1-10 scale)
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

  // === CAREER STAGE & GOALS ===
  careerStage:
    | 'Just Starting'
    | 'Building Fanbase'
    | 'Established Local'
    | 'Regional Success'
    | 'National/International';
  careerGoals: string[]; // Get Signed, Grow Fanbase, Tour, etc.
  shortTermGoals: string[]; // Next 3-6 months
  longTermGoals: string[]; // 1-5 years
  currentFocus: string;
  biggestChallenge: string;

  // === AUDIENCE & MARKET ===
  targetAudience: string; // Demographics, psychographics
  currentFanbase: 'None' | '<100' | '100-1K' | '1K-10K' | '10K-100K' | '100K+';
  geographicFocus: string[]; // Local, Regional, National, International

  // === CONTENT & OUTPUT ===
  releaseFrequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Sporadic';
  contentTypes: string[]; // Singles, EPs, Albums, Freestyles, Covers, etc.
  releasedTracks: number;
  upcomingProjects: string;
  showcases: ShowcaseItem[];

  // === MARKETING & PROMOTION ===
  marketingExperience: 'None' | 'Basic' | 'Intermediate' | 'Advanced';
  promotionChannels: string[]; // Social media, Radio, Blogs, Playlists, etc.
  marketingBudget:
    | 'No Budget'
    | '<00/mo'
    | '00-2K/mo'
    | 'K-5K/mo'
    | 'K+/mo';
  contentStrategy: string;

  // === BUSINESS & REVENUE ===
  revenueStreams: string[]; // Streaming, Shows, Merch, Sync, Teaching, etc.
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

  // === EQUIPMENT & SOFTWARE ===
  daw: string[]; // FL Studio, Ableton, Logic, etc.
  equipment: string[]; // Microphone, Audio Interface, Monitors, etc.
  vst_plugins: string[];
  recordingSetup:
    | 'Home Studio'
    | 'Project Studio'
    | 'Professional Studio'
    | 'Mobile Setup';

  // === COLLABORATION & NETWORKING ===
  openToCollaboration: boolean;
  collaborationTypes: string[]; // Features, Production, Co-writing, etc.
  networkingGoals: string;
  lookingFor: string[]; // Producers, Vocalists, Managers, etc.

  // === PERFORMANCE & LIVE SHOWS ===
  performancesPerYear: 'None' | '1-5' | '6-20' | '20-50' | '50+';
  venueTypes: string[]; // Clubs, Festivals, Arenas, Online, etc.
  comfortableWithLive: boolean;

  // === SOCIAL MEDIA & ONLINE PRESENCE ===
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
  mostActiveOn: string[]; // Which platforms
  postingFrequency: string;
  engagementLevel: 'Low' | 'Medium' | 'High';

  // === PROFESSIONAL IDENTITY & COMPLIANCE ===
  proName?: string; // e.g., ASCAP, BMI, SESAC
  proIpi?: string;
  soundExchangeId?: string;
  mlcId?: string;
  isni?: string;
  isOfficialProfile: boolean;

  // === DISTRIBUTION ===
  preferredDistributor?: string;
  distributionStatus?: 'Not Started' | 'In Progress' | 'Distributed';

  // === LEARNING & DEVELOPMENT ===
  areasToImprove: string[];
  learningStyle:
    | 'Video Tutorials'
    | 'Written Guides'
    | 'Hands-on Practice'
    | 'Mentorship'
    | 'Courses';
  investingInEducation: boolean;

  // === AI KNOWLEDGE BASE ===
  knowledgeBase: ArtistKnowledgeBase;

  // === MENTAL GAME & MINDSET ===
  confidenceLevel: number; // 1-10
  dealingWithCriticism: 'Poorly' | 'Okay' | 'Well' | 'Excellently';
  motivationLevel: number; // 1-10
  consistency:
    | 'Struggle'
    | 'Inconsistent'
    | 'Fairly Consistent'
    | 'Very Consistent';
}

export const initialProfile: UserProfile = {
  catalog: [],
  tasks: [],
  marketingCampaigns: [],
  // Basic Info
  artistName: 'New Artist',
  stageName: '',
  location: '',
  bio: 'Describe your musical journey...',
  profilePictureUrl: '',

  // Musical Identity
  primaryGenre: '',
  secondaryGenres: [],
  subGenres: [],
  musicalInfluences: '',
  artistsYouSoundLike: [],
  uniqueSound: '',

  // Experience & Expertise
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

  // Career Stage & Goals
  careerStage: 'Just Starting',
  careerGoals: [],
  shortTermGoals: [],
  longTermGoals: [],
  currentFocus: '',
  biggestChallenge: '',

  // Audience & Market
  targetAudience: '',
  currentFanbase: 'None',
  geographicFocus: [],

  // Content & Output
  releaseFrequency: 'Sporadic',
  contentTypes: [],
  releasedTracks: 0,
  upcomingProjects: '',
  showcases: [],

  // Marketing & Promotion
  marketingExperience: 'None',
  promotionChannels: [],
  marketingBudget: 'No Budget',
  contentStrategy: '',

  // Business & Revenue
  revenueStreams: [],
  isMonetizing: false,
  businessStructure: 'Not Set Up',
  hasManager: false,
  hasBookingAgent: false,
  hasPublisher: false,
  hasLabel: false,
  legalDocuments: [],

  // Equipment & Software
  daw: [],
  equipment: [],
  vst_plugins: [],
  recordingSetup: 'Home Studio',

  // Collaboration & Networking
  openToCollaboration: true,
  collaborationTypes: [],
  networkingGoals: '',
  lookingFor: [],

  // Performance & Live Shows
  performancesPerYear: 'None',
  venueTypes: [],
  comfortableWithLive: false,

  // Social Media & Online Presence
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

  // Professional Identity & Compliance
  proName: '',
  proIpi: '',
  soundExchangeId: '',
  mlcId: '',
  isni: '',
  isOfficialProfile: false,

  // Distribution
  preferredDistributor: '',
  distributionStatus: 'Not Started',

  // Learning & Development
  areasToImprove: [],
  learningStyle: 'Video Tutorials',
  investingInEducation: false,

  // AI Knowledge Base
  knowledgeBase: {
    learnedStyles: [],
    productionSecrets: [],
    coreTrends: [],
  },

  // Mental Game & Mindset
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
    // When the user logs in, fetch their profile from the database.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.loadProfile();
      } else {
        // If logged out, reset to the initial profile
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
        // If no profile exists in the DB (e.g., new user), create one.
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
       if (upgrade.type === 'Software') {
          if (!updatedProfile.vst_plugins.includes(upgrade.title)) {
            updatedProfile.vst_plugins = [...updatedProfile.vst_plugins, upgrade.title];
          }
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
