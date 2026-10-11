import { Injectable, computed, inject } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ArtistAdaptiveEngineService, ArtistAdaptationState } from './artist-adaptive-engine.service';
import { MusicalDnaService } from './musical-dna.service';
import { ArtistProfileFinetuneService, ArtistProfileKnowledge } from './artist-profile-finetune.service';

export interface CareerStage {
  id: 'foundational' | 'emerging' | 'established' | 'elite';
  label: string;
  description: string;
  priority: string[];
  bookingReach: string;
  typicalGigRate: string;
  syncValue: string;
  merchandiseStrategy: string;
}

export interface BrandIdentity {
  visualAesthetic: string[];
  voiceTone: string;
  narrative: string;
  targetAudience: string;
  marketPosition: string;
  uniqueValue: string;
}

export interface LiveBookingStrategy {
  touringCircuits: string[];
  geoTargets: string[];
  venueTypes: string[];
  typicalDuration: string;
  equipmentRequirements: string[];
  promotionApproach: string;
  revenueModel: string;
}

export interface ExpandedAdaptationState extends ArtistAdaptationState {
  careerStage: CareerStage;
  brandIdentity: BrandIdentity;
  liveBookingStrategy: LiveBookingStrategy;
  coachingPriorities: string[];
}

const CAREER_STAGES: Record<'foundational' | 'emerging' | 'established' | 'elite', CareerStage> = {
  foundational: {
    id: 'foundational',
    label: 'Foundational',
    description: 'Building the first songs and establishing identity',
    priority: ['Complete first catalog', 'Define sonic identity', 'Record demo quality', 'Build initial audience'],
    bookingReach: 'Local open mics, friend networks, small venues',
    typicalGigRate: 'Free to $50',
    syncValue: 'Non-professional, music bed for friends',
    merchandiseStrategy: 'Not yet, focus on music first',
  },
  emerging: {
    id: 'emerging',
    label: 'Emerging',
    description: 'Small releases gaining traction, local touring',
    priority: ['Release singles regularly', 'Build fanbase beyond local', 'Secure booking agent', 'Prepare for touring'],
    bookingReach: 'Regional venues, college circuit, festivals',
    typicalGigRate: '$100-$500',
    syncValue: 'Local TV/web series, indie films',
    merchandiseStrategy: 'T-shirts, hoodies at shows',
  },
  established: {
    id: 'established',
    label: 'Established',
    description: 'National presence, regular touring, radio/streaming',
    priority: ['Album cycles', 'Major label consideration', 'International touring', 'Licensing deals'],
    bookingReach: 'National theaters, major festivals, touring headliner',
    typicalGigRate: '$1K-$10K',
    syncValue: 'Film/TV placements, advertising',
    merchandiseStrategy: 'Full merchandise line, artist shop',
  },
  elite: {
    id: 'elite',
    label: 'Elite',
    description: 'Charts, award consideration, global recognition',
    priority: ['Cultural relevance', 'Superstardom', 'Licensing empire', 'Legacy building'],
    bookingReach: 'International arenas, festivals, residencies',
    typicalGigRate: '$10K-$100K+',
    syncValue: 'Premium licensing, brand partnerships',
    merchandiseStrategy: 'Global merchandise empire, lifestyle brand',
  },
};

@Injectable({ providedIn: 'root' })
export class ArtistCareerExpansionService {
  private profileService = inject(UserProfileService);
  private adaptiveEngine = inject(ArtistAdaptiveEngineService);
  private dnaService = inject(MusicalDnaService);
  private finetune = inject(ArtistProfileFinetuneService);

  readonly expandedAdaptationState = computed(() =>
    this.buildExpandedAdaptationState(this.profileService.profile())
  );

  private buildExpandedAdaptationState(profile: UserProfile | null | undefined): ExpandedAdaptationState {
    const baseAdaptation = this.adaptiveEngine.buildAdaptationState(profile);
    const careerStage = this.detectCareerStage(profile, baseAdaptation);
    const brandIdentity = this.buildBrandIdentity(profile, baseAdaptation);
    const liveBookingStrategy = this.buildLiveBookingStrategy(profile, baseAdaptation, careerStage);

    return {
      ...baseAdaptation,
      careerStage,
      brandIdentity,
      liveBookingStrategy,
      coachingPriorities: this.generateCoachingPriorities(profile, baseAdaptation, careerStage),
    };
  }

  private detectCareerStage(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): CareerStage {
    if (!profile) return CAREER_STAGES.foundational;

    const catalogSize = profile.catalog?.length || 0;
    const monthlyListeners = profile.musicalJourney?.monthlyListeners || 0;
    const isTouring = profile.touringDetails?.isTourReady === 'Ready to Tour';
    const hasBookingAgent = profile.team?.some((t) => t.role === 'Booking Agent') || false;
    const recordLabel = profile.team?.some((t) => t.role === 'Label') || false;
    const syncDeals = (profile.syncDetails?.hasCleanVersions && profile.syncDetails?.hasInstrumentals) || false;

    if (recordLabel || monthlyListeners > 100000) return CAREER_STAGES.elite;
    if (isTouring && hasBookingAgent && catalogSize >= 5 && monthlyListeners > 10000) return CAREER_STAGES.established;
    if ((isTouring || hasBookingAgent) && catalogSize >= 3 && monthlyListeners > 1000) return CAREER_STAGES.emerging;
    return CAREER_STAGES.foundational;
  }

  private buildBrandIdentity(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): BrandIdentity {
    if (!profile) {
      return {
        visualAesthetic: ['undefined'],
        voiceTone: 'undefined',
        narrative: 'undefined',
        targetAudience: 'undefined',
        marketPosition: 'undefined',
        uniqueValue: 'undefined',
      };
    }

    const knowledge = adaptation.knowledge;
    const genre = adaptation.genreProfile;

    return {
      visualAesthetic: knowledge.audience?.visualAesthetic || ['clean', 'modern'],
      voiceTone: knowledge.identity?.voiceTone || 'authentic',
      narrative: knowledge.identity?.livedWorld || 'lived experience',
      targetAudience: knowledge.audience?.profile || genre.businessPlaybook.targetAudience,
      marketPosition: knowledge.audience?.marketPosition || genre.businessPlaybook.marketPosition,
      uniqueValue: knowledge.audience?.recognitionCue || genre.productionDefaults.sonicSignatures[0],
    };
  }

  private buildLiveBookingStrategy(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState, careerStage: CareerStage): LiveBookingStrategy {
    if (!profile) {
      return {
        touringCircuits: [],
        geoTargets: [],
        venueTypes: [],
        typicalDuration: '0 minutes',
        equipmentRequirements: [],
        promotionApproach: 'undefined',
        revenueModel: 'undefined',
      };
    }

    const genre = adaptation.genreProfile;
    const regions = profile.touringDetails?.regions || [];

    return {
      touringCircuits: genre.livePerformance.regionalStrength,
      geoTargets: regions.length > 0 ? regions : genre.livePerformance.regionalStrength,
      venueTypes:
        careerStage.id === 'foundational'
          ? ['Open mics', 'Coffee shops', 'Friend gatherings']
          : careerStage.id === 'emerging'
            ? ['Clubs', 'Smaller theaters', 'College venues', 'Local festivals']
            : careerStage.id === 'established'
              ? ['Mid-size theaters', 'Regional festivals', 'Major markets']
              : ['Arenas', 'Festival headlining', 'International venues'],
      typicalDuration:
        careerStage.id === 'foundational'
          ? '30 minutes'
          : careerStage.id === 'emerging'
            ? '45-60 minutes'
            : careerStage.id === 'established'
              ? '75-90 minutes'
              : '120+ minutes',
      equipmentRequirements: genre.livePerformance.typicalBacklineNeeds,
      promotionApproach: `For ${careerStage.label}: ${careerStage.priority[0]}`,
      revenueModel: careerStage.typicalGigRate,
    };
  }

  private generateCoachingPriorities(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState, careerStage: CareerStage): string[] {
    const priorities: string[] = [];

    if (!profile) return priorities;

    // Career stage specific priorities
    priorities.push(...careerStage.priority.slice(0, 2));

    // Genre-specific business priorities
    priorities.push(`${adaptation.genreProfile.businessPlaybook.releaseStrategy}`);

    // Live readiness
    if (adaptation.liveReadiness.score < 60) {
      priorities.push(`Build live readiness: ${adaptation.liveReadiness.gaps[0] || 'touring infrastructure'}`);
    }

    // Sync readiness
    if (adaptation.syncReadiness.score < 70) {
      priorities.push(`Prepare sync assets: ${adaptation.syncReadiness.missingAssets[0] || 'multiple formats'}`);
    }

    // Catalog strength
    const catalogSize = profile.catalog?.length || 0;
    if (catalogSize < 5) {
      priorities.push(`Build catalog: current ${catalogSize}, target 5+`);
    }

    return priorities.slice(0, 6);
  }
}

export type { ExpandedAdaptationState, CareerStage, BrandIdentity, LiveBookingStrategy };
