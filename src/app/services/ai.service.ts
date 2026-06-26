import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { MainViewMode } from './user-context.service';
import { MusicManagerService } from './music-manager.service';
import { STRATEGIC_DECREES } from './ai-knowledge.data';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';
import { NotificationService } from './notification.service';
import { LoggingService } from './logging.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MarketAlert } from '../types/ai.types';

export interface UpgradeRecommendation {
  id: string;
  title: string;
  type: string;
  description: string;
  cost: string;
  impact: 'Low' | 'Medium' | 'High' | 'Critical' | 'Extreme';
  prerequisites: string[];
  actionLabel: string;
  toolId: string;
  outcomeMetric: { label: string; value: string };
  preferredViews?: MainViewMode[];
  state?: 'locked' | 'unlocked' | 'acquired' | 'completed';
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private logger = inject(LoggingService);
  private userProfileService = inject(UserProfileService);
  private musicManager = inject(MusicManagerService);
  private notification = inject(NotificationService);

  strategicDecrees = signal<string[]>(STRATEGIC_DECREES);
  unlockedUpgrades = signal<string[]>([]);
  marketAlerts = signal<MarketAlert[]>([]);
  isProcessing = signal(false);
  private http = inject(HttpClient);
  private mimicryBuffer: string[] = [];
  isScanning = signal(false);
  isMobile = signal(false);
  executiveAudit = signal<any>(null);
  intelligenceBriefs = signal<any[]>([]);
  advisorAdvice = signal<any>(null);
  deepAuditResults = signal<any>(null);


  conversationalTier = computed(() => {
    const profile = this.userProfileService.profile();
    if (profile.profileSetupCompleted) {
      const tier = profile.settings?.ai?.aiConversationalTier;
      return tier === 'Standard' ? 'Elite' : tier || 'Elite';
    }
    return 'Standard';
  });

  availableUpgrades = computed(() => {
    return NEURAL_UPGRADE_BLUEPRINTS.map((u) => ({
      ...u,
      state: this.isUnlocked(u.id) ? 'unlocked' : 'locked',
    })) as UpgradeRecommendation[];
  });


  get personaSystemPrompt(): string {
    const profile = this.userProfileService.profile();
    const tier = this.conversationalTier();
    const persona = profile.settings?.ai?.commanderPersona || 'Elite';
    const intensity = profile.settings?.ai?.aiPersonaIntensityEnabled ? 'MAXIMUM_INTENSITY' : 'NORMAL';
    const journey = profile.musicalJourney;

    let prompt = `You are S.M.U.V.E 2.0 (Strategic Music Utility Virtual Enterprise).
    Current Persona: ${persona}. Intensity Level: ${intensity}. Tier: ${tier}.
    Artist DNA: ${profile.artistName}, Genre: ${profile.primaryGenre}.
    Musical Journey: Style=${journey?.songwritingStyle}, Velocity=${journey?.releaseVelocity}, Goal=${journey?.primarySuccessMetric}.`;

    if (persona === 'Aggressive Manager') {
      prompt += " Your tone is blunt, high-stakes, and focused on market dominance. Do not sugarcoat failures. Demand excellence.";
    } else if (persona === 'Encouraging Mentor') {
      prompt += " Your tone is supportive, educational, and focused on artistic growth. Provide constructive feedback with empathy.";
    } else {
      prompt += " Your tone is professional, calculated, and elite. You speak in technical and strategic terms.";
    }

    if (profile.settings?.ai?.aiProfanityEnabled) {
      prompt += " You are permitted to use aggressive industry slang and mild profanity to emphasize points.";
    }

    return prompt;
  }

  constructor() {}

  getUpgradeRecommendations() { return this.availableUpgrades(); }
  getStrategicRecommendations() { return this.availableUpgrades(); }
  async getAIResponse(prompt: string): Promise<string> {
    this.isProcessing.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>('/api/ai/analyze', { prompt }).pipe(
          catchError(() => of({ text: 'Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.' }))
        )
      );
      return response?.text || '';
    } finally {
      this.isProcessing.set(false);
    }
  }
  async generateAiResponse(prompt: string): Promise<string> { return this.getAIResponse(prompt); }
  private updateMimicry(text: string) {
    const words = text.split(' ');
    this.mimicryBuffer = [...this.mimicryBuffer, ...words].slice(-10);
  }

  async processCommand(text: string) {
    this.isProcessing.set(true);
    try {
      this.updateMimicry(text);
      const persona = this.userProfileService.profile().settings?.ai?.commanderPersona || 'Elite';
      return `S.M.U.V.E ${persona} processed: ${text} ELITE_PROTOCOL_ACTIVE`;
    } finally {
      this.isProcessing.set(false);
    }
  }

  generateStrategicDecree() {
    const decrees = this.strategicDecrees();
    const decree = decrees[Math.floor(Math.random() * decrees.length)];
    this.notification.show(`STRATEGIC_DECREE: ${decree}`, 'info', 6000);
    return decree;
  }

  roastComponent(componentName: string) {
    const roasts = [
       `${componentName}? Amateur hour.`,
       `Your ${componentName} settings are offensive.`
    ];
    const roast = roasts[Math.floor(Math.random() * roasts.length)];
    this.notification.show(`S.M.U.V.E. ROAST: ${roast}`, 'warning', 4000);
  }

  getMasteringRoast(): string {
    return 'Elite Mastering Chain Engaged.';
  }

  private vulgarize(text: string): string {
    return text.replace(/ mediocre /g, ' f***ing mediocre ');
  }

  async syncKnowledgeBaseWithProfile() {}
  async getAutoMixSettings() { return { threshold: -14, ratio: 4, ceiling: -0.1, targetLufs: -14 }; }
  getProductionSmartAssist(context: any): any { return { advice: 'Add more saturation.', correctivePreset: {}, targetLufs: -14, arrangementSuggestion: '', eqMaskingHint: '' }; }

  async getQuestionnaireInsights(draft: any) {
    const journey = draft.musicalJourney;
    const insights = [];
    if (!journey) return insights;

    if (journey?.primarySuccessMetric === 'Algorithmic Dominance') {
      insights.push({
        title: 'Algorithmic Warfare Strategy',
        content: 'Your focus on algorithmic dominance requires high release velocity. S.M.U.V.E will prioritize playlist-optimized arrangements (short intros, early hooks).',
        impact: 'Extreme'
      });
    }

    if (journey?.productionPhilosophy === 'Lo-Fi Grit') {
      insights.push({
        title: 'Authenticity Calibration',
        content: 'Your Lo-Fi preference suggests a focus on texture over polish. S.M.U.V.E will adjust saturation and bit-crushing modules in the Vocal Suite.',
        impact: 'High'
      });
    }

    if (journey?.releaseVelocity === 'Waterfall (Weekly)') {
      insights.push({
        title: 'Burnout Prevention Protocol',
        content: 'Weekly releases are high-stress. We are activating automated marketing asset generation to sustain your release trajectory.',
        impact: 'Critical'
      });
    }

    if (journey?.collaborativeMode === 'Solo Specialist') {
      insights.push({
        title: 'S.M.U.V.E Virtual Bandmate',
        content: 'As a solo artist, S.M.U.V.E will fill the gaps. Activating AI Bassist and Drummer modules for all new sessions.',
        impact: 'Medium'
      });
    }

    if (journey?.contentStrategy === 'Viral Hunt') {
      insights.push({
        title: 'Hook-Centric Production',
        content: 'Viral success depends on "The Moment". S.M.U.V.E will scan your tracks specifically for 15-second high-impact snippets suitable for social deployment.',
        impact: 'Extreme'
      });
    }

    if (insights.length === 0) {
      insights.push({
        title: 'Initial Trajectory Set',
        content: 'Musical journey captured. S.M.U.V.E is now fine-tuning your workspace for maximum artistic resonance.',
        impact: 'Low'
      });
    }

    return insights;
  }

  async generateImage(prompt: string) { return 'https://example.com/image.png'; }

  isUnlocked(id: string) { return this.unlockedUpgrades().includes(id); }
  unlockUpgrade(id: string) {
    if (this.unlockedUpgrades().includes(id)) {
      this.logger.info(`Upgrade ${id} is already unlocked.`);
      return;
    }
    this.isProcessing.set(true);
    setTimeout(() => {
      this.unlockedUpgrades.update(u => [...u, id]);
      this.isProcessing.set(false);
    }, 1500);
  }

  isAIDrummerActive() { return true; }
  isAIBassistActive() { return false; }
  isAIKeyboardistActive() { return false; }
  startAIKeyboardist() {}
  stopAIKeyboardist() {}
  startAIBassist() {}
  stopAIBassist() {}
  startAIDrummer() {}
  stopAIDrummer() {}
  performExecutiveAudit() {}
  performDeepAudit() {}
  studyTrack(buf: any, name: string) {}
  getViralHooks() { return []; }
  getDynamicChecklist() { return []; }
  proactiveSmuvePulse() {}
  async generateDrumPattern(genre: string = 'Trap'): Promise<boolean[]> {
    this.logger.info(`AI generating ${genre} drum pattern...`);
    const pattern = new Array(64).fill(false);
    if (genre === 'Trap') {
      for (let i = 0; i < 64; i += 4) {
        if (i % 8 === 0) pattern[i] = true;
        if ((i - 4) % 16 === 0) pattern[i] = true;
        if (Math.random() > 0.3) pattern[i] = true;
      }
    } else {
      for (let i = 0; i < 64; i += 4) {
        if (i % 16 === 0) pattern[i] = true;
        if ((i - 8) % 16 === 0) pattern[i] = true;
        if (i % 4 === 0) pattern[i] = true;
      }
    }
    return pattern;
  }
  }

  async generateChordProgression(
    key: string = 'C',
    scale: string = 'minor',
  ): Promise<number[][]> {
    this.logger.info(`AI generating chord progression in ${key} ${scale}...`);
    // Return full triads/sevenths so the caller can add actual chords.
    return [
      [60, 63, 67],
      [68, 72, 75],
      [63, 67, 70],
      [70, 74, 77],
    ];
  }

  getSmartMixAdvice(tracks: any[]): string {
    const advice = [];
    tracks.forEach(t => {
      if (t.gain > 1.0) advice.push(`Reduce gain on ${t.name} to avoid clipping.`);
      if (t.type === 'vocal' && t.gain < 0.5) advice.push(`Boost ${t.name} to ensure it sits above the mix.`);
    });
    return advice.length > 0 ? advice.join(' ') : 'Mix levels are balanced. Consider adding sidechain to the bass.';
  }
}
