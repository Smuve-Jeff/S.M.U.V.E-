import { Injectable, signal, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface ShowcaseItem {
  type: 'music' | 'image' | 'video';
  url: string;
  title: string;
  artist: string;
  visibility: 'public' | 'private' | 'unlisted';
  featured: boolean;
}

export interface UserProfile {
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
  careerStage: 'Just Starting' | 'Building Fanbase' | 'Established Local' | 'Regional Success' | 'National/International';
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
  marketingBudget: 'No Budget' | '<$500/mo' | '$500-2K/mo' | '$2K-5K/mo' | '$5K+/mo';
  contentStrategy: string;
  
  // === BUSINESS & REVENUE ===
  revenueStreams: string[]; // Streaming, Shows, Merch, Sync, Teaching, etc.
  isMonetizing: boolean;
  businessStructure: 'Individual' | 'LLC' | 'Partnership' | 'Corporation' | 'Not Set Up';
  hasManager: boolean;
  hasBookingAgent: boolean;
  hasPublisher: boolean;
  hasLabel: boolean;
  labelType?: 'Independent' | 'Major' | 'Distribution Only';
  
  // === EQUIPMENT & SOFTWARE ===
  daw: string[]; // FL Studio, Ableton, Logic, etc.
  equipment: string[]; // Microphone, Audio Interface, Monitors, etc.
  vst_plugins: string[];
  recordingSetup: 'Home Studio' | 'Project Studio' | 'Professional Studio' | 'Mobile Setup';
  
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
  mostActiveOn: string[]; // Which platforms
  postingFrequency: string;
  engagementLevel: 'Low' | 'Medium' | 'High';
  
  // === LEARNING & DEVELOPMENT ===
  areasToImprove: string[];
  learningStyle: 'Video Tutorials' | 'Written Guides' | 'Hands-on Practice' | 'Mentorship' | 'Courses';
  investingInEducation: boolean;
  
  // === MENTAL GAME & MINDSET ===
  confidenceLevel: number; // 1-10
  dealingWithCriticism: 'Poorly' | 'Okay' | 'Well' | 'Excellently';
  motivationLevel: number; // 1-10
  consistency: 'Struggle' | 'Inconsistent' | 'Fairly Consistent' | 'Very Consistent';
}

export const initialProfile: UserProfile = {
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
  mostActiveOn: [],
  postingFrequency: '',
  engagementLevel: 'Low',
  
  // Learning & Development
  areasToImprove: [],
  learningStyle: 'Video Tutorials',
  investingInEducation: false,
  
  // Mental Game & Mindset
  confidenceLevel: 5,
  dealingWithCriticism: 'Okay',
  motivationLevel: 5,
  consistency: 'Inconsistent',
};

const USER_PROFILE_STORAGE_KEY = 'aura_user_profile';

@Injectable({
  providedIn: 'root'
})
export class UserProfileService {
  private authService = inject(AuthService);
  profile = signal<UserProfile>(initialProfile);

  constructor() {
    // When the user logs in, fetch their profile.
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
      const userProfile = await this.authService.fetchUserProfile();
      this.profile.set(userProfile);
    } catch (error) {
      console.error('UserProfileService: Failed to load profile', error);
      // Handle error, maybe show a notification to the user
    }
  }

  async updateProfile(newProfile: UserProfile): Promise<void> {
    try {
      await this.authService.saveUserProfile(newProfile);
      this.profile.set(newProfile);
    } catch (error) {
      console.error('UserProfileService: Failed to save profile', error);
      // Handle error, maybe show a notification to the user
    }
  }
}