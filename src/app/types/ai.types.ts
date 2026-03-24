export interface LearnedStyle {
  id: string;
  name: string;
  genre: string;
  complexity: number;
  bpm: number;
  key: string;
  energy: number;
  description: string;
}

export interface ProductionSecret {
  id: string;
  title: string;
  content: string;
  category: 'production' | 'marketing' | 'business' | 'legal' | 'technical';
  metadata: any;
  details?: string;
  impact?: string;
}

export interface TrendData {
  id: string;
  trend: string;
  velocity: number;
  category: string;
  metadata: any;
  relevance?: number;
  actionableInsight?: string;
}

export interface UpgradeRecommendation {
  id: string;
  title: string;
  type: 'Gear' | 'Software' | 'Service';
  description: string;
  cost: string;
  url: string;
  minLevel?: number;
  impact: 'Extreme' | 'High' | 'Medium' | 'Low';
  genres?: string[];
}

export interface ProfileAuditResult {
  score: number;
  timestamp: number;
  categories: {
    production: number;
    marketing: number;
    career: number;
    technical: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface StrategicTask {
  id: string;
  label: string;
  completed: boolean;
  category: string;
  impact: string;
  description?: string;
}

export interface ExecutiveAuditReport {
  overallScore: number;
  sonicCohesion: number;
  arrangementDepth: number;
  marketViability: number;
  criticalDeficits: string[];
  technicalRecommendations: string[];
}

export interface ArtistKnowledgeBase {
  id: string;
  artistId: string;
  dataPoints: any[];
  learnedStyles: LearnedStyle[];
  productionSecrets: ProductionSecret[];
  coreTrends: TrendData[];
  strategicDirectives: string[];
  marketIntel: any[];
  genreAnalysis: { [genre: string]: any };
  brandStatus: any;
  strategicHealthScore?: number;
  currentRelease?: any;
}

export interface StudioSettings {
  id: string;
  theme: 'titanium' | 'obsidian' | 'vocal';
  neuralFeedback: boolean;
  autoSave: boolean;
  latencyCompensation: number;
}

export interface IntelligenceBrief {
  id: string;
  title: string;
  content: string;
  category:
    | 'Legal'
    | 'Touring'
    | 'Sync'
    | 'Fan Engagement'
    | 'Business'
    | 'Production';
  relevanceScore: number;
  actionable: boolean;
  impact: 'Extreme' | 'High' | 'Medium';
}

export interface MarketAlert {
  id: string;
  title: string;
  message: string;
  severity: 'Critical' | 'Warning' | 'Info';
  timestamp: number;
  category: string;
}

export interface SystemStatus {
  cpuLoad: number;
  neuralSync: number;
  memoryUsage: number;
  latency: number;
  marketVelocity: number;
  activeProcesses: number;
  neuralLinkStrength?: number;
}

export interface StrategicRecommendation {
  id: string;
  action: string;
  impact: string;
  difficulty: string;
  toolId: string;
}

export interface AdvisorAdvice {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
}
