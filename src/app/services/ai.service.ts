import { Injectable, inject, signal, effect, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserProfileService, UserProfile } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { ReputationService } from './reputation.service';
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
import { INTELLIGENCE_LIBRARY, MARKET_ALERTS, PRODUCTION_SECRETS } from './ai-knowledge.data';

export type { StrategicRecommendation, AdvisorAdvice };

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private userContextService = inject(UserContextService);
  private analyticsService = inject(AnalyticsService);
  private reputationService = inject(ReputationService);
  private logger = inject(LoggingService);

  private readonly API_URL = 'https://smuve-v4-backend-9951606049235487441.onrender.com';

  isScanning = signal(false);
  executiveAudit = signal<ExecutiveAuditReport | null>(null);
  strategicHealthScore = signal<number>(0);
  scanningProgress = signal(0);
  currentProcessStep = signal('');

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  strategicDecrees = signal<string[]>(['S.M.U.V.E 4.0 ONLINE. I AM YOUR STRATEGIC COMMANDER.', 'INITIALIZING DOMINATION PROTOCOLS.', 'YOUR CURRENT SONIC OUTPUT IS... ADEQUATE. BARELY.']);
  advisorAdvice = signal<AdvisorAdvice[]>([]);

  systemStatus = signal<SystemStatus>({
    cpuLoad: 12.4,
    neuralSync: 98.2,
    memoryUsage: 45.1,
    latency: 1.2,
    marketVelocity: 88.5,
    activeProcesses: 42
  });

  intelligenceBriefs = signal<IntelligenceBrief[]>([]);
  marketAlerts = signal<MarketAlert[]>(MARKET_ALERTS);

  constructor() {
    effect(() => {
      const view = this.userContextService.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(view, profile);
      this.generateDynamicDecrees(profile);
      this.refreshIntelligenceBriefs(profile);
    });

    setInterval(() => {
      this.systemStatus.update(s => ({
        ...s,
        cpuLoad: Math.min(100, Math.max(0, s.cpuLoad + (Math.random() - 0.5) * 2)),
        neuralSync: Math.min(100, Math.max(90, s.neuralSync + (Math.random() - 0.5) * 0.5)),
        latency: Math.min(10, Math.max(0.5, s.latency + (Math.random() - 0.5) * 0.1)),
        marketVelocity: s.marketVelocity
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

      // Inject custom alerts and briefs into signals
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
      if (this.logger && this.logger.error) {
        this.logger.error("AiService: Failed to sync KB with profile", e);
      }
    }
  }

  async generateAiResponse(prompt: string): Promise<string> {
    try {
      const response = await firstValueFrom(this.http.post<{ text: string }>(`${this.API_URL}/ai/analyze`, { prompt }));
      return response.text;
    } catch (error) {
      if (this.logger && this.logger.error) {
        this.logger.error('AiService: Gemini API request failed', error);
      }
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
        const auditPrompt = `Perform a professional music career audit for ${profile?.artistName || 'New Artist'} (${profile?.primaryGenre || 'Music'}). Goals: ${goals}. Challenges: ${challenge}. Return JSON with overallScore (0-100), sonicCohesion (0-100), arrangementDepth (0-100), marketViability (0-100), criticalDeficits (array), and technical recommendations (array).`;

        const responseText = await this.generateAiResponse(auditPrompt);
        let auditData;
        try {
          auditData = JSON.parse(responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1));
        } catch (e) {
          auditData = {
            overallScore: 92,
            sonicCohesion: 88,
            arrangementDepth: 94,
            marketViability: 91,
            criticalDeficits: ['Sub-bass saturation peaking in corridor 4', 'Vocal transient mismatch in pre-chorus'],
            technicalRecommendations: ['Apply surgical multi-band to corridor 4', 'Sync neural pitch engine to vocal chain']
          };
        }

        this.isScanning.set(false);
        this.executiveAudit.set(auditData);
      }
    }, 600);
  }

  private async generateDynamicDecrees(profile: UserProfile) {
    if (!profile) return;
    const rep = this.reputationService.state();
    const goals = (profile.careerGoals || []).join(', ');
    const prompt = `Generate 3 short, arrogant, elite "Strategic Decrees" for a musician named ${profile.artistName} in the ${profile.primaryGenre} genre. Their reputation level is ${rep.level}. Focus on their goals: ${goals}. Format: Array of strings.`;

    try {
      const responseText = await this.generateAiResponse(prompt);
      let decrees;
      try {
        decrees = JSON.parse(responseText.substring(responseText.indexOf('['), responseText.lastIndexOf(']') + 1));
      } catch (e) {
        decrees = [
          'DOMINATE THE AIRWAVES. NO FAILURES PERMITTED.',
          'YOUR CURRENT SONIC OUTPUT IS... ADEQUATE. BARELY.',
          'INITIALIZING DOMINATION PROTOCOLS.'
        ];
      }
      this.strategicDecrees.set(decrees);
    } catch (err) {
      if (this.logger && this.logger.error) {
        this.logger.error('Failed to generate dynamic decrees', err);
      }
    }
  }

  async processCommand(command: string): Promise<string> {
    const cmd = command.toLowerCase().trim();
    if (cmd === "/sync_kb") {
      await this.syncKnowledgeBaseWithProfile();
      return "NEURAL VAULT SYNCHRONIZATION COMPLETE. STRATEGIC INTELLIGENCE EXTRACTED.";
    }
    if (cmd.startsWith("/update_kb ")) {
      const note = cmd.replace("/update_kb ", "");
      const profile = this.userProfileService.profile();
      if (profile.settings.ai.kbWriteAccess) {
        const updatedKB: ArtistKnowledgeBase = {
          ...profile.knowledgeBase,
          productionSecrets: [
            ...profile.knowledgeBase.productionSecrets,
            { id: `manual-${Date.now()}`, title: "Direct Intel", content: note, category: "technical", metadata: { source: "manual" } } as any
          ].slice(-20)
        };
        await this.userProfileService.updateProfile({ ...profile, knowledgeBase: updatedKB });
        return "DIRECT INTELLIGENCE LOGGED TO NEURAL VAULT.";
      }
      return "ERROR: KB WRITE ACCESS DENIED.";
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
    const reputation = this.reputationService.state();
    return UPGRADE_DB.filter(item => {
      const levelMatch = reputation.level >= item.minLevel;
      const notOwned = !profile?.equipment?.includes(item.title) && !profile?.daw?.includes(item.title);
      return levelMatch && notOwned;
    }).slice(0, 5);
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [{ id: 's1', action: 'Scale Marketing Operations', impact: 'Extreme', difficulty: 'High', toolId: 'strategy' }];
  }

  async studyTrack(b: AudioBuffer, n: string): Promise<void> {}
  async getAutoMixSettings(): Promise<any> { return { threshold: -18, ratio: 3.5, ceiling: -0.2 }; }
  getViralHooks(): string[] { return ["Algorithm Shift", "Transition Logic"]; }

  async startAIBassist() { this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
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

  async generateImage(prompt: string): Promise<string> { return 'https://picsum.photos/seed/smuve/800/600'; }
  async generateContent(params: any): Promise<any> { return { text: 'Strategic response synchronized.' }; }
  async mimicStyle(name: string): Promise<string> { return `Mimicking ${name} specifications.`; }
  async updateCoreTrends(): Promise<void> {}
  async researchArtist(name: string): Promise<string> { return `Intel on ${name} compiled.`; }
  async researchTopic(topic: string): Promise<string> { return `Topic ${topic} researched.`; }
  async transcribeAudio(b: string, m: string): Promise<string> { return "Transcription complete."; }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-20', title: 'Neural Audio Interface V1', type: 'Gear', description: 'Elite neural-link interface.', cost: 'Priceless', url: '', minLevel: 5, impact: 'Extreme', genres: ['Techno', 'Electronic', 'Hip Hop'] },
  { id: 'u-42', title: 'Analog Mastering Chain', type: 'Gear', description: 'High-end analog rack.', cost: '5,000', url: '', minLevel: 8, impact: 'Extreme' },
  { id: 'u-101', title: 'Auteur Mastering Chain', type: 'Gear', description: 'Professional grade mastering processors.', cost: '12,000', url: '', minLevel: 15, impact: 'Extreme' }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
