import { Injectable, computed, inject } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ArtistAdaptiveEngineService, ArtistAdaptationState } from './artist-adaptive-engine.service';
import { MusicalDnaService } from './musical-dna.service';
import { ArtistProfileFinetuneService } from './artist-profile-finetune.service';

export interface CoachPrompt {
  role: 'producer' | 'songwriter' | 'manager' | 'ar' | 'promotion' | 'marketing' | 'legal' | 'brand';
  title: string;
  prompt: string;
  context: string;
  urgency: 'immediate' | 'high' | 'medium' | 'low';
  actionItems: string[];
}

export interface ReleaseStrategy {
  nextRelease: { type: string; targetDate: string; format: string[]; strategy: string; };
  catalogStrategy: string;
  marketingApproach: string;
  revenueTargets: string[];
  successMetrics: string[];
}

export interface ArtistCoachState {
  adaptation: ArtistAdaptationState;
  personalized: {
    coachPrompts: CoachPrompt[];
    releaseStrategy: ReleaseStrategy;
    prioritizedActions: string[];
    missedOpportunities: string[];
    warnings: string[];
  };
}

@Injectable({ providedIn: 'root' })
export class ArtistAiCoachService {
  private profileService = inject(UserProfileService);
  private adaptiveEngine = inject(ArtistAdaptiveEngineService);
  private dnaService = inject(MusicalDnaService);
  private finetune = inject(ArtistProfileFinetuneService);

  readonly coachState = computed(() => this.buildCoachState(this.profileService.profile()));

  private buildCoachState(profile: UserProfile | null | undefined): ArtistCoachState {
    const adaptation = this.adaptiveEngine.buildAdaptationState(profile);
    return {
      adaptation,
      personalized: {
        coachPrompts: this.generateCoachPrompts(profile, adaptation),
        releaseStrategy: this.generateReleaseStrategy(profile, adaptation),
        prioritizedActions: this.generatePrioritizedActions(profile, adaptation),
        missedOpportunities: this.identifyMissedOpportunities(profile, adaptation),
        warnings: this.generateWarnings(profile, adaptation),
      },
    };
  }

  private generateCoachPrompts(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): CoachPrompt[] {
    const prompts: CoachPrompt[] = [];
    if (!profile) return prompts;
    const genre = adaptation.genreProfile;
    const knowledge = adaptation.knowledge;

    prompts.push({
      role: 'producer',
      title: `Produce the next ${genre.label} track`,
      urgency: knowledge.state === 'foundational' ? 'immediate' : 'high',
      prompt: `You are the producer for ${knowledge.identity.name || 'this artist'} (${genre.label}). Use this setup:\n\n${adaptation.productionDirective}\n\nYour job is to produce a track that\n1. Protects the sonic rules\n2. Uses the actual equipment\n3. Delivers on the stated mix priorities\n4. Keeps the artist's production philosophy`,
      context: `Signature sound: ${knowledge.sonic.signatureSound}. Non-negotiables: ${knowledge.sonic.nonNegotiables}. DAW: ${profile.daw?.[0] || 'unspecified'}.`,
      actionItems: [
        `Set up ${profile.daw?.[0] || 'your DAW'} with these mix priorities: ${(knowledge.craft.mixingPriorities.length ? knowledge.craft.mixingPriorities : genre.productionDefaults.mixPriorities).join(', ')}`,
        `Lock the groove: ${knowledge.sonic.groove || genre.productionDefaults.sonicSignatures[0]}`,
        `Reference track: ${profile.musicalJourney?.musicBlueprint?.referenceTracks?.[0] || 'choose one from the stated influences'}`,
        `Session rule: ${knowledge.sonic.nonNegotiables || 'define the sonic non-negotiable'}`,
      ],
    });

    prompts.push({
      role: 'songwriter',
      title: 'Write inside the artist\'s world',
      urgency: 'high',
      prompt: `You are the songwriter for ${knowledge.identity.name || 'this artist'}. Write using this approach:\n\nWorld: ${knowledge.identity.livedWorld || 'capture lived-world details'}\nThemes: ${knowledge.craft.lyricalThemes.join(', ') || 'define the recurring subjects'}\nProcess: ${knowledge.craft.songwritingProcess || 'ask about their writing routine'}\n\nArrangement: ${knowledge.sonic.arrangement || genre.songwritingRules.typicalStructures[0]}\nDo not write generic lyrics. Use the artist's own language and concrete details.`,
      context: `Tension point: ${knowledge.identity.tension}. Recognition cue: ${knowledge.audience.recognitionCue}.`,
      actionItems: [
        `Write the hook first, make it deliver: ${knowledge.audience.recognitionCue}`,
        'Draft 2-3 verse ideas with specific, lived-world details',
        `Test structure against: ${genre.songwritingRules.typicalStructures.slice(0, 2).join(' or ')}`,
        `Lock the lyrical theme: ${knowledge.craft.lyricalThemes[0] || 'one core subject'}`,
      ],
    });

    if (knowledge.state !== 'foundational') {
      prompts.push({
        role: 'manager',
        title: 'Route the career toward the next milestone',
        urgency: adaptation.liveReadiness.score < 40 ? 'immediate' : 'high',
        prompt: `You are the manager for ${knowledge.identity.name || 'this artist'} (${genre.label}). Your job is routing:\n\n${adaptation.businessStrategy}\n\nNext move: ${adaptation.nextPrioritizedAction}\n\nProtect the artist's schedule and focus the effort on this one step.`,
        context: `Current focus: ${knowledge.business.focus}. Success metric: ${knowledge.business.successMetric}. Live readiness: ${adaptation.liveReadiness.score}%.`,
        actionItems: [
          `Define the ${adaptation.liveReadiness.score < 40 ? 'live' : 'release'} milestone for the next 90 days`,
          `Set ONE success metric: ${knowledge.business.successMetric}`,
          'Remove all work that does not feed this metric',
          `Block calendar: ${knowledge.business.velocity || 'define release cadence'}`,
        ],
      });
    }

    if (profile.catalog && profile.catalog.length > 0) {
      prompts.push({
        role: 'ar',
        title: 'Evaluate next releases against the signature sound',
        urgency: 'high',
        prompt: `You are the A&R for ${knowledge.identity.name || 'this artist'}. Judge every song by:\n\n1. Does it deliver the recognition cue? "${knowledge.audience.recognitionCue || 'the artist\'s signature moment'}"\n2. Does it protect the sonic signature? "${knowledge.sonic.signatureSound}"\n3. Does it honor the stated intent? "${knowledge.audience.intent || 'the artistic direction'}"\n\nReject anything that trades away the sonic non-negotiable: "${knowledge.sonic.nonNegotiables}"`,
        context: `Signature: ${knowledge.sonic.signatureSound}. Audience: ${knowledge.audience.profile}. Market: ${genre.businessPlaybook.targetAudience}.`,
        actionItems: [
          'Test song: does first 10 sec deliver the cue?',
          `Check: does it fit ${genre.songwritingRules.typicalStructures[0]}?`,
          `Evaluate: ${knowledge.audience.marketPosition || 'where does this sit in the market?'}`,
          `Protect: reject anything that trades away "${knowledge.sonic.nonNegotiables || 'the sound'}"`,
        ],
      });
    }

    return prompts;
  }

  private generateReleaseStrategy(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): ReleaseStrategy {
    const genre = adaptation.genreProfile;
    const knowledge = adaptation.knowledge;
    const catalogSize = profile?.catalog?.length || 0;
    const releaseType = 'Artist-selected format';
    const targetDate = 'Not scheduled — confirm finished songs, capacity and delivery lead time';

    return {
      nextRelease: {
        type: releaseType,
        targetDate,
        format: knowledge.sync.hasStems ? ['Master', 'Clean', 'Instrumental', 'Stems'] : ['Master', 'Clean', 'Instrumental'],
        strategy: `${releaseType} release targeting ${genre.businessPlaybook.incomeStreamPriority[0]}. Lead with: ${knowledge.audience.recognitionCue || 'the signature sound'}.`,
      },
      catalogStrategy: `Develop ${knowledge.sonic.subgenres[0] || genre.label} at ${knowledge.business.velocity || 'a sustainable artist-selected cadence'}. ${catalogSize} catalog items recorded; drafts do not prove release readiness.`,
      marketingApproach: `Lead with the artist's own voice and lived-world story. Avoid generic ${genre.label} tropes. Use: ${knowledge.audience.visualAesthetic?.[0] || 'define visual language'}.`,
      revenueTargets: (knowledge.business.streams.length ? knowledge.business.streams : genre.businessPlaybook.incomeStreamPriority).slice(0, 3),
      successMetrics: [
        knowledge.business.successMetric || 'Monthly listeners',
        `Playlist adds (${genre.businessPlaybook.targetAudience.toLowerCase()})`,
        'Save rate on Spotify',
        'Fan engagement (direct messages, comments)',
      ],
    };
  }

  private generatePrioritizedActions(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): string[] {
    const actions: string[] = [];
    if (!profile) return actions;
    const knowledge = adaptation.knowledge;
    const live = adaptation.liveReadiness;
    const sync = adaptation.syncReadiness;

    if (knowledge.state === 'foundational') {
      actions.push(`🔴 Complete your profile: ${knowledge.missing.slice(0, 2).join(', ')}`);
    }
    if (knowledge.pathway.nextStep) {
      actions.push(`⭐ Official pathway: ${knowledge.pathway.nextStep}`);
    }
    if (live.score < 40 && (profile.catalog?.length || 0) > 0) {
      actions.push(`🎤 Build live readiness: ${live.gaps[0] || 'define the touring plan'}`);
    }
    if (sync.score < 60) {
      actions.push(`🎬 Prepare sync assets: ${sync.missingAssets[0] || 'record clean versions'}`);
    }
    if ((profile.catalog?.length || 0) === 0) {
      actions.push(`📍 Release the first single: ${adaptation.genreProfile.businessPlaybook.releaseStrategy}`);
    } else if ((profile.catalog?.length || 0) < 3) {
      actions.push(`🎵 Build catalog to 3+ works: current ${profile.catalog?.length}`);
    }
    if (knowledge.presence.catalogAverageCompleteness < 80) {
      actions.push(`📋 Complete release metadata: ${knowledge.presence.catalogAverageCompleteness}% documented`);
    }
    return actions.slice(0, 6);
  }

  private identifyMissedOpportunities(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): string[] {
    const opportunities: string[] = [];
    if (!profile) return opportunities;
    const genre = adaptation.genreProfile;
    const knowledge = adaptation.knowledge;

    if (profile.team?.length === 0) {
      opportunities.push(`No team recorded — consider: ${genre.businessPlaybook.releaseStrategy.includes('album') ? 'producer, engineer, mixer' : 'collaborator, engineer'}`);
    }
    if (adaptation.syncReadiness.score < 50) {
      opportunities.push(`Sync licensing is ${adaptation.syncReadiness.score}% ready — ${genre.businessPlaybook.syncOpportunities[0] || 'film/TV placements'} could multiply revenue`);
    }
    if (!knowledge.presence.hasForArtists) {
      opportunities.push('No For Artists dashboard claimed — editorial pitching and analytics require this');
    }
    if (profile.services?.length === 0) {
      opportunities.push(`No production services listed — consider: ${genre.productionDefaults.recommendedDaw[0] || 'DAW'}, mixing tools, distribution`);
    }
    return opportunities.slice(0, 4);
  }

  private generateWarnings(profile: UserProfile | null | undefined, adaptation: ArtistAdaptationState): string[] {
    return adaptation.warningsAndProtections;
  }
}
