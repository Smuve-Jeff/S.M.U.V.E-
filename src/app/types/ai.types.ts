export interface StudioSettings {
  compression?: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  };
  limiter?: {
    ceiling?: number;
    release?: number;
    lookahead?: number;
  };
  eq?: {
    highs: number;
    mids: number;
    lows: number;
  };
  filterFreq?: number;
}

export interface LearnedStyle {
  id: string;
  name: string;
  bpm?: number;
  key?: string;
  energy?: 'low' | 'medium' | 'high';
  description: string;
  studioSettings?: StudioSettings;
  timestamp: number;
}

export interface ProductionSecret {
  id: string;
  artist: string;
  secret: string;
  category: 'mixing' | 'production' | 'songwriting' | 'marketing';
  source?: string;
}

export interface TrendData {
  id: string;
  genre: string;
  description: string;
  lastUpdated: number;
}

export interface ArtistKnowledgeBase {
  learnedStyles: LearnedStyle[];
  productionSecrets: ProductionSecret[];
  coreTrends: TrendData[];
}

export interface UpgradeRecommendation {
  id: string;
  title: string;
  description: string;
  type: 'Gear' | 'Service' | 'Software';
  cost: string;
  minLevel: number;
  genres?: string[];
  url?: string;
  impact: 'Extreme' | 'High' | 'Medium' | 'Low';
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
  category: 'pre' | 'day' | 'post' | 'production' | 'legal';
  impact: 'Extreme' | 'High' | 'Medium' | 'Low';
  description?: string;
}
