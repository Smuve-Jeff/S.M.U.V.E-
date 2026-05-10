import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UserProfileService, UserProfile } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { LoggingService } from './logging.service';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';

// Represents the state and details of a potential upgrade for the user.
export interface UpgradeRecommendation {
  id: string;
  title: string;
  type: 'Software' | 'Cloud Service' | 'Hardware';
  description: string;
  cost: string;
  impact: 'High' | 'Medium' | 'Low' | 'Transformative' | 'Critical';
  rationale: string;
  targetArea: 'Production' | 'Mixing' | 'Mastering' | 'Rhythm' | 'Sampling & Remixing' | 'Arrangement' | 'Vocals';
  priority: 'High' | 'Medium' | 'Critical';
  prerequisites: string[];
  actionLabel: string;
  toolId: string;
  outcomeMetric: { label: string; value: string };
  state: 'locked' | 'unlocked' | 'suggested' | 'ignored';
  rankScore: number;
}

// Defines the structure for a blueprint used to generate recommendations.
export interface UpgradeBlueprint {
  id: string;
  title: string;
  type: 'Software' | 'Cloud Service' | 'Hardware';
  description: string;
  cost: string;
  impact: 'High' | 'Medium' | 'Low' | 'Transformative' | 'Critical';
  rationale: string;
  targetArea: 'Production' | 'Mixing' | 'Mastering' | 'Rhythm' | 'Sampling & Remixing' | 'Arrangement' | 'Vocals';
  priority: 'High' | 'Medium' | 'Critical';
  prerequisites: string[];
  actionLabel: string;
  toolId: string;
  outcomeMetric: { label: string; value: string };
  preferredViews?: MainViewMode[];
  rank: (context: { profile: UserProfile, context: any, viewMode: MainViewMode }) => number;
}

// Context used for ranking and generating recommendations.
interface RecommendationContext {
    trackCount: number;
    releaseReadyCount: number;
    hasMicrophone: boolean;
    activeLoopBars: number;
}

@Injectable({
  providedIn: 'root',
})
export class NeuralOrchestratorService {
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private userContext = inject(UserContextService);
  private analyticsService = inject(AnalyticsService);
  private logger = inject(LoggingService);

  // Signals for managing state
  unlockedUpgrades = signal<string[]>([]);
  availableUpgrades = computed(() => this.getRankedUpgrades());
  isProcessing = signal(false);

  constructor() {
    this.logger.info('NeuralOrchestratorService Initialized: V7.2');
  }

  /**
   * Triggers the unlock process for a specific upgrade.
   * This would typically involve a more complex flow, like a payment process or a confirmation dialog.
   * For now, it just adds the upgrade ID to the unlocked list.
   */
  unlockUpgrade(upgradeId: string): void {
    if (this.unlockedUpgrades().includes(upgradeId)) {
      this.logger.info(`Upgrade ${upgradeId} is already unlocked.`);
      return;
    }
    this.isProcessing.set(true);
    this.logger.info(`Unlocking neural upgrade: ${upgradeId}...`);
    
    // Simulate an async process (e.g., API call, payment)
    setTimeout(() => {
      this.unlockedUpgrades.update(current => [...current, upgradeId]);
      this.logger.info(`Successfully unlocked: ${upgradeId}`);
      this.isProcessing.set(false);
    }, 1500);
  }

  /**
   * Checks if a specific upgrade has been unlocked.
   */
  isUnlocked(upgradeId: string): boolean {
    return this.unlockedUpgrades().includes(upgradeId);
  }

  /**
   * Gathers context and ranks the available upgrade blueprints.
   * @returns A sorted array of UpgradeRecommendation objects.
   */
  private getRankedUpgrades(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const viewMode = this.userContext.mainViewMode();
    const context = this.buildRecommendationContext(profile);

    const ranked = NEURAL_UPGRADE_BLUEPRINTS.map(blueprint => {
      const rankScore = blueprint.rank({ profile, context, viewMode });
      const state = this.isUnlocked(blueprint.id) ? 'unlocked' : 'locked';
      return { ...blueprint, rankScore, state };
    });

    return ranked.sort((a, b) => b.rankScore - a.rankScore);
  }

  /**
   * Builds the context object needed for ranking upgrade blueprints.
   */
  private buildRecommendationContext(profile: UserProfile): RecommendationContext {
    // In a real application, this would gather much more data.
    return {
      trackCount: profile.catalog?.length || 0,
      releaseReadyCount: profile.catalog?.filter(t => t.status === 'ready').length || 0,
      hasMicrophone: profile.equipment?.includes('Microphone') || false,
      activeLoopBars: this.analyticsService.getActiveLoopBars(), // Assumes service has this method
    };
  }

  /**
   * Generates a tailored response or suggestion using a simulated AI call.
   */
  async getAIResponse(prompt: string): Promise<string> {
    this.isProcessing.set(true);
    try {
      // In a real app, this would be a call to a Gemini/Vertex AI backend
      const response = await firstValueFrom(
        this.http.post<{ text: string }>('/api/ai/generate', { prompt })
      );
      return response.text;
    } catch (error) {
      this.logger.error('AI response generation failed.', error);
      // Return a fallback response based on the most relevant upgrade
      const topUpgrade = this.availableUpgrades()[0];
      return `Network uplink failed. Priority directive: Consider the ${topUpgrade.title}. Its rationale is: ${topUpgrade.rationale}`;
    } finally {
      this.isProcessing.set(false);
    }
  }
}
