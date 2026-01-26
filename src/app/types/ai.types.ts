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
