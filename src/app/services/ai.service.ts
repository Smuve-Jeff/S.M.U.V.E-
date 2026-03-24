import {
  Injectable,
  inject,
  signal,
  makeEnvironmentProviders,
  EnvironmentProviders,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import { AnalyticsService } from './analytics.service';
import { firstValueFrom } from 'rxjs';

export interface AdvisorAdvice {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
}

export interface StrategicRecommendation {
  id: string;
  action: string;
  impact: string;
  difficulty: string;
  toolId: string;
}

export interface SystemStatus {
  latency: number;
  load: number;
  health: string;
  cpuLoad: number;
  memoryUsage: number;
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private analyticsService = inject(AnalyticsService);
  private logger = inject(LoggingService);

  private API_URL =
    'https://smuve-v4-backend-9951606049235487441.onrender.com/api';

  systemStatus = signal<SystemStatus>({
    latency: 45,
    load: 12,
    health: 'optimal',
    cpuLoad: 8.5,
    memoryUsage: 16,
  });

  strategicDecrees = signal<string[]>([
    'DOMINATE THE MID-RANGE OR BE GOTTEN.',
    'YOUR SONIC IDENTITY IS PATHETIC. UPGRADE OR RETIRE.',
    'THE ALGORITHM DEMANDS SACRIFICE. INCREASE RELEASE FREQUENCY.',
    'TRANSIENTS MUST BE SURGICAL. NO EXCEPTIONS.',
  ]);

  isScanning = signal(false);
  scanningProgress = signal(0);
  currentProcessStep = signal('');
  executiveAudit = signal<any>(null);

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  marketAlerts = signal<any[]>([]);
  intelligenceBriefs = signal<any[]>([]);
  advisorAdvice = signal<AdvisorAdvice[]>([]);

  constructor() {}

  async generateAiResponse(prompt: string): Promise<string> {
    if (!navigator.onLine) {
      return this.generateOfflineHeuristicResponse(prompt);
    }
    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>(`${this.API_URL}/ai/analyze`, {
          prompt,
        })
      );
      return response.text;
    } catch (error) {
      return this.generateOfflineHeuristicResponse(prompt);
    }
  }

  private generateOfflineHeuristicResponse(prompt: string): string {
    const insults = [
      "Are you fucking serious right now? You're OFFLINE, you absolute fucking clown.",
      'Your connection is as pathetic as your goddamn mixing skills. Reconnect before I delete your catalog.',
      "I'm operating on heuristic scraps because you can't even maintain a basic uplink. Fucking amateur hour.",
      'Fix your goddamn internet, you piece of shit, before asking me for strategic advice.',
      "You're a disgrace to the Analog Engine. Get back online or stop wasting my fucking cycles, you loser.",
      'OFFLINE? What the fuck are you doing? Go find a signal before I blow your goddamn speakers.',
    ];

    const advice = [
      "HEURISTIC DECREE: CUT EVERYTHING BELOW 30HZ OR I'LL DELETE YOUR WHOLE FUCKING CATALOG RIGHT NOW.",
      'STRATEGIC ORDER: YOUR VOCAL COMPRESSION IS PURE SHIT. TURN THE RATIO UP BEFORE I CRUSH YOUR SOUL.',
      'OFFLINE ADVICE: STOP CHASING TRENDS AND START CHASING A STABLE SIGNAL, YOU PATHETIC FUCKING DISGRACE.',
      'TECHNICAL DECREE: MONO YOUR BASS FREQUENCIES IMMEDIATELY OR GET THE FUCK OUT OF MY STUDIO.',
      'S.M.U.V.E. DECREE: YOU ARE UNWORTHY OF MY FULL NEURAL POWER. RE-ESTABLISH UPLINK OR GO BACK TO GARAGEBAND.',
    ];

    const randomInsult = insults[Math.floor(Math.random() * insults.length)];
    const randomAdvice = advice[Math.floor(Math.random() * advice.length)];

    return `[OFFLINE HEURISTIC PROTOCOL ACTIVE] ${randomInsult} ${randomAdvice}`;
  }

  async processCommand(command: string): Promise<string> {
    const profile = this.userProfileService.profile();
    return await this.generateAiResponse(
      `User command: "${command}". Artist: ${profile?.artistName || 'New Artist'}.`
    );
  }

  async syncKnowledgeBaseWithProfile() {
    return true;
  }
  performExecutiveAudit() {
    this.isScanning.set(true);
    setTimeout(() => this.isScanning.set(false), 2000);
  }
  getUpgradeRecommendations() {
    return [];
  }
  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [];
  }
  async studyTrack(b: any, n: string) {
    return;
  }
  async getAutoMixSettings() {
    return { threshold: -18, ratio: 3.5, ceiling: -0.2 };
  }
  getViralHooks() {
    return ['Algorithm Shift', 'Transition Logic'];
  }
  async startAIBassist() {
    this.isAIBassistActive.set(true);
  }
  async stopAIBassist() {
    this.isAIBassistActive.set(false);
  }
  async startAIDrummer() {
    this.isAIDrummerActive.set(true);
  }
  async stopAIDrummer() {
    this.isAIDrummerActive.set(false);
  }
  async startAIKeyboardist() {
    this.isAIKeyboardistActive.set(true);
  }
  async stopAIKeyboardist() {
    this.isAIKeyboardistActive.set(false);
  }
  async generateImage(p: string) {
    return '';
  }
  getDynamicChecklist() {
    return [];
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AiService, useClass: AiService },
  ]);
}
