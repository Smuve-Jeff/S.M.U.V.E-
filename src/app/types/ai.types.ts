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
  category: string;
  metadata: any;
}

export interface TrendData {
  id: string;
  trend: string;
  velocity: number;
  category: string;
  metadata: any;
}

export interface UpgradeRecommendation {
  id: string;
  title: string;
  type: 'Gear' | 'Software' | 'Service';
  description: string;
  cost: string;
  url: string;
  minLevel: number;
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
}

export interface StudioSettings {
  id: string;
  theme: 'titanium' | 'obsidian' | 'vocal';
  neuralFeedback: boolean;
  autoSave: boolean;
  latencyCompensation: number;
}
