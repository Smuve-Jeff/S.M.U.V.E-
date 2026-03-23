import { Injectable, inject, signal, effect, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserProfileService, UserProfile } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { LoggingService } from './logging.service';
import { firstValueFrom } from 'rxjs';
import {
  IntelligenceBrief,
  MarketAlert,
  ProductionSecret,
  SystemStatus,
  StrategicRecommendation,
  AdvisorAdvice,
  UpgradeRecommendation,
  ExecutiveAuditReport,
  StrategicTask,
  ArtistKnowledgeBase
} from '../types/ai.types';
import { INTELLIGENCE_LIBRARY, MARKET_ALERTS, PRODUCTION_SECRETS, STRATEGIC_DECREES } from './ai-knowledge.data';

export type { StrategicRecommendation, AdvisorAdvice };

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private contextService = inject(UserContextService);
  private analyticsService = inject(AnalyticsService);
  private logger = inject(LoggingService);

  private API_URL = 'https://smuve-v4-backend-9951606049235487441.onrender.com/api';

  intelligenceBriefs = signal<IntelligenceBrief[]>([]);
  marketAlerts = signal<MarketAlert[]>([]);
  advisorAdvice = signal<AdvisorAdvice[]>([]);
  strategicDecrees = signal<string[]>(STRATEGIC_DECREES.slice(0, 3));
  systemStatus = signal<SystemStatus>({
      cpuLoad: 12.4,
      memoryUsage: 1.2,
      neuralLinkStrength: 98,
      neuralSync: 98,
      latency: 24,
      marketVelocity: 42,
      activeProcesses: 12
  });

  isScanning = signal(false);
  executiveAudit = signal<ExecutiveAuditReport | null>(null);
  scanningProgress = signal(0);
  currentProcessStep = signal('');

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  constructor() {
    effect(() => {
      const profile = this.userProfileService.profile();
      if (profile && profile.artistName !== 'New Artist') {
        this.refreshIntelligenceBriefs(profile);
        this.generateDynamicDecrees(profile);
      }
    });

    // Simulate system metrics
    setInterval(() => {
      this.systemStatus.update(s => ({
        ...s,
        cpuLoad: Math.max(5, Math.min(85, s.cpuLoad + (Math.random() - 0.5) * 2)),
        memoryUsage: Math.max(0.5, Math.min(1.5, s.memoryUsage + (Math.random() - 0.5) * 0.1)),
        neuralLinkStrength: Math.max(90, Math.min(100, (s.neuralLinkStrength || 95) + (Math.random() - 0.5) * 0.5)),
        latency: Math.max(10, Math.min(100, s.latency + (Math.random() - 0.5) * 5))
      }));

      if (Math.random() > 0.95) {
        this.triggerRandomMarketAlert();
      }
    }, 3000);
  }

  private triggerRandomMarketAlert() {
    const alert = MARKET_ALERTS[Math.floor(Math.random() * MARKET_ALERTS.length)];
    const newAlert = { ...alert, id: `alert-${Date.now()}`, timestamp: Date.now() };
    this.marketAlerts.update(alerts => [newAlert, ...alerts.slice(0, 4)]);
  }

  refreshIntelligenceBriefs(profile: UserProfile) {
    const goals = profile?.careerGoals || [];
    const filtered = (INTELLIGENCE_LIBRARY || []).filter(brief => {
      const matchesGoal = goals.some(goal => brief.category.toLowerCase().includes(goal.toLowerCase()) || goal.toLowerCase().includes(brief.category.toLowerCase()));
      const isExtreme = brief.impact === 'Extreme';
      return matchesGoal || isExtreme;
    });
    this.intelligenceBriefs.set(filtered);
  }

  async syncKnowledgeBaseWithProfile() {
    const profile = this.userProfileService.profile();
    if (!profile.settings.ai.kbWriteAccess) return;

    const prompt = `Analyze the following artist profile and extract strategic intelligence to update their Neural Knowledge Vault.
    Artist: ${profile.artistName}
    Genre: ${profile.primaryGenre}
    Sub-genres: ${profile.subGenres.join(", ")}
    Experience: ${profile.experienceLevel}
    Touring: ${JSON.stringify(profile.touringDetails)}
    Publishing: ${JSON.stringify(profile.publishingDetails)}
    Team: ${JSON.stringify(profile.team)}
    Social Strategy: ${JSON.stringify(profile.socialMediaStrategy)}
    Brand Voice: ${profile.brandIdentity.brandVoice.join(", ")}
    Brand Story: ${profile.brandIdentity.brandStory}
    Goals: ${profile.careerGoals.join(", ")}

    Return a JSON object with:
    7. strategicHealthScore (number 0-100 based on profile strength)
    1. learnedStyles (array of objects with id, name, genre, description, complexity, bpm, key, energy)
    2. productionSecrets (array of objects with id, title, content, category, metadata)
    3. strategicDirectives (array of strings)
    4. genreAnalysis (specific insights object for their primary genre)
    5. marketAlerts (array of custom MarketAlert objects tailored to their data)
    6. intelligenceBriefs (array of custom IntelligenceBrief objects)

    Format: JSON only.`;

    try {
      const responseText = await this.generateAiResponse(prompt);
      const data = JSON.parse(responseText.substring(responseText.indexOf("{"), responseText.lastIndexOf("}") + 1));

      const updatedKB: ArtistKnowledgeBase = {
        ...profile.knowledgeBase,
        learnedStyles: [...profile.knowledgeBase.learnedStyles, ...(data.learnedStyles || [])].slice(-10),
        productionSecrets: [...profile.knowledgeBase.productionSecrets, ...(data.productionSecrets || [])].slice(-10) as any,
        strategicDirectives: data.strategicDirectives || [],
        genreAnalysis: { ...profile.knowledgeBase.genreAnalysis, [profile.primaryGenre]: data.genreAnalysis },
        strategicHealthScore: data.strategicHealthScore || 0
      };

      if (data.marketAlerts) {
         this.marketAlerts.update(alerts => [...(data.marketAlerts as any), ...alerts].slice(0, 10));
      }
      if (data.intelligenceBriefs) {
         this.intelligenceBriefs.update(briefs => [...(data.intelligenceBriefs as any), ...briefs].slice(0, 10));
      }

      await this.userProfileService.updateProfile({
        ...profile,
        knowledgeBase: updatedKB
      });
    } catch (e) {
      this.logger.error("AiService: Failed to sync KB with profile", e);
    }
  }

  async generateAiResponse(prompt: string): Promise<string> {
    try {
      const response = await firstValueFrom(this.http.post<{ text: string }>(`${this.API_URL}/ai/analyze`, { prompt }));
      return response.text;
    } catch (error) {
      this.logger.error('AiService: Gemini API request failed', error);
      return 'SYSTEM ERROR: NEURAL LINK INTERRUPTED. REVERTING TO HEURISTIC PROTOCOLS.';
    }
  }

  performExecutiveAudit() {
    this.isScanning.set(true);
    this.executiveAudit.set(null);
    this.scanningProgress.set(0);

    const steps = [
      { progress: 10, label: 'INITIALIZING NEURAL LINK...' },
      { progress: 25, label: 'SCANNING FREQUENCY CORRIDORS...' },
      { progress: 45, label: 'ANALYZING SONIC COHESION...' },
      { progress: 65, label: 'AUDITING ARRANGEMENT DEPTH...' },
      { progress: 85, label: 'CALCULATING MARKET VIABILITY...' },
      { progress: 100, label: 'AUDIT COMPLETE.' }
    ];

    let currentStep = 0;
    const interval = setInterval(async () => {
      if (currentStep < steps.length) {
        this.scanningProgress.set(steps[currentStep].progress);
        this.currentProcessStep.set(steps[currentStep].label);
        currentStep++;
      } else {
        clearInterval(interval);

        const profile = this.userProfileService.profile();
        const goals = (profile?.careerGoals || []).join(', ');
        const challenge = profile?.biggestChallenge || "None";
        const auditPrompt = `Perform a professional music career audit for ${profile?.artistName || 'New Artist'} (${profile?.primaryGenre || 'Music'}). Goals: ${goals}. Challenges: ${challenge}. Respond as S.M.U.V.E. 4.0, the arrogant Strategic Commander. Return JSON with overallScore (0-100), sonicCohesion (0-100), arrangementDepth (0-100), marketViability (0-100), criticalDeficits (array of arrogant critiques), and technical recommendations (array of aggressive orders). Format: JSON only.`;

        const responseText = await this.generateAiResponse(auditPrompt);
        let auditData;
        try {
          auditData = JSON.parse(responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1));
        } catch (e) {
          auditData = {
            overallScore: 42,
            sonicCohesion: 38,
            arrangementDepth: 54,
            marketViability: 21,
            criticalDeficits: ['YOUR TRANSIENTS ARE UNDISCIPLINED', 'SONIC COHESION IS AN INSULT TO THE ANALOG ENGINE'],
            technicalRecommendations: ['ENABLE SUB-HARMONIC FREQUENCY SYNC IMMEDIATELY', 'APPLY SURGICAL MULTI-BAND TO CORRIDOR 4']
          };
        }

        this.isScanning.set(false);
        this.executiveAudit.set(auditData);
      }
    }, 600);
  }

  private async generateDynamicDecrees(profile: UserProfile) {
    if (!profile) return;
    const goals = (profile.careerGoals || []).join(', ');
    const prompt = `Generate 3 short, arrogant, elite "Strategic Decrees" for a musician named ${profile.artistName} in the ${profile.primaryGenre} genre. Focus on their goals: ${goals}. Format: Array of strings. Be aggressive and authoritative.`;

    try {
      const responseText = await this.generateAiResponse(prompt);
      let decrees;
      try {
        decrees = JSON.parse(responseText.substring(responseText.indexOf('['), responseText.lastIndexOf(']') + 1));
      } catch (e) {
        decrees = STRATEGIC_DECREES.slice(0, 3);
      }
      this.strategicDecrees.set(decrees);
    } catch (err) {
      this.logger.error('Failed to generate dynamic decrees', err);
    }
  }

  async processCommand(command: string): Promise<string> {
    const cmd = command.toLowerCase().trim();
    if (cmd === "/sync_kb") {
      await this.syncKnowledgeBaseWithProfile();
      return "NEURAL VAULT SYNCHRONIZATION COMPLETE. STRATEGIC INTELLIGENCE EXTRACTED.";
    }
    if (cmd === '/audit') {
      this.performExecutiveAudit();
      return 'INITIALIZING EXECUTIVE STUDIO AUDIT.';
    }

    const profile = this.userProfileService.profile();
    const goals = (profile?.careerGoals || []).join(', ');
    const prompt = `User command: "${command}". Context: You are S.M.U.V.E 4.0, the arrogant Strategic Commander. Artist: ${profile?.artistName || 'New Artist'}. Genre: ${profile?.primaryGenre || 'Music'}. Goals: ${goals}. Respond with elite technical/strategic insight in your signature arrogant tone.`;

    return await this.generateAiResponse(prompt);
  }

  private updateAdvisorAdvice(view: MainViewMode, profile: UserProfile) {
    const growth = this.analyticsService.overallGrowth();
    const advice: AdvisorAdvice[] = [];
    if (growth < 5) {
      advice.push({ id: 'adv-1', title: 'Visibility Surge Needed', content: 'Aggressive marketing recommended.', type: 'strategy', priority: 'high' });
    }
    this.advisorAdvice.set(advice);
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    return UPGRADE_DB.filter(item => {
      const notOwned = !profile?.equipment?.includes(item.title) && !profile?.daw?.includes(item.title);
      return notOwned;
    }).slice(0, 5);
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [{ id: 's1', action: 'Scale Marketing Operations', impact: 'Extreme', difficulty: 'High', toolId: 'strategy' }];
  }

  // Compatibility methods for Hub and Library
  async studyTrack(b: AudioBuffer, n: string): Promise<void> {}
  async getAutoMixSettings(): Promise<any> { return { threshold: -18, ratio: 3.5, ceiling: -0.2 }; }
  getViralHooks(): string[] { return ["Algorithm Shift", "Transition Logic"]; }

  async startAIBassist() { this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async generateImage(prompt: string): Promise<string> { return "https://picsum.photos/seed/smuve/800/600"; }
  async startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  getDynamicChecklist(): StrategicTask[] {
    const profile = this.userProfileService.profile();
    const tasks: StrategicTask[] = [];
    if (profile?.careerGoals?.includes('Sync Licensing')) {
      tasks.push({ id: 'task-sync-1', label: 'Tag 5 Tracks for One-Stop Clearance', completed: false, category: 'Sync', impact: 'High', description: 'Supervisors need instant clearance info.' });
    }
    tasks.push({ id: '1', label: 'Optimize Master Bus', completed: false, category: 'production', impact: 'Medium' });
    return tasks;
  }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-20', title: 'Neural Audio Interface V1', type: 'Gear', description: 'Elite neural-link interface.', cost: 'Priceless', url: '', impact: 'Extreme', genres: ['Techno', 'Electronic', 'Hip Hop'] },
  { id: 'u-42', title: 'Analog Mastering Chain', type: 'Gear', description: 'High-end analog rack.', cost: '5,000', url: '', impact: 'Extreme' },
  { id: 'u-101', title: 'Auteur Mastering Chain', type: 'Gear', description: 'Professional grade mastering processors.', cost: '12,000', url: '', impact: 'Extreme' }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
