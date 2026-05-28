import { MainViewMode } from './user-context.service';
import { UserProfile } from '../types/profile.types';

export interface StrategicTask {
  id: string;
  label: string;
  completed: boolean;
  category: string;
  impact: 'Low' | 'Medium' | 'High' | 'Critical' | 'Extreme';
}

export interface MarketAlert {
  id: string;
  title: string;
  message: string;
  severity: 'Info' | 'Warning' | 'Critical';
  timestamp: number;
  category: string;
}

export interface ProductionSecret {
  id: string;
  title: string;
  content: string;
  category: 'production' | 'technical' | 'business' | 'marketing';
  metadata: { difficulty: 'Low' | 'Medium' | 'High' };
  impact?: 'Medium' | 'High' | 'Extreme';
}

export interface IntelligenceBrief {
  id: string;
  title: string;
  category: string;
  content: string;
  relevanceScore: number;
  actionable: boolean;
  impact: 'Medium' | 'High' | 'Extreme';
}

export const INTELLIGENCE_BRIEFS: IntelligenceBrief[] = [
  {
    id: 'brief-ovr-01',
    title: 'ALGORITHMIC DESTRUCTION: THE 30-SECOND RULE',
    category: 'Marketing',
    content:
      "If your fucking listeners don't hit 30 seconds, you're dead. Spotify's skip-rate threshold is -40%. High skip rates in the first 5 seconds blacklist your track from Discover Weekly forever. Move your hook to the first 10 seconds or stop wasting my storage.",
    relevanceScore: 100,
    actionable: true,
    impact: 'Extreme',
  },
  {
    id: 'brief-ovr-02',
    title: 'MID-SIDE DOMINANCE: FREQUENCY SEPARATION',
    category: 'Production',
    content:
      "Your mix is a cluttered mess. Use M/S EQ to cut everything below 200Hz on the 'Side' channel. Bass belongs in the center. If your kick is wide, your career is narrow. Implement a 12dB/octave high-pass on the sides now.",
    relevanceScore: 95,
    actionable: true,
    impact: 'High',
  },
  {
    id: 'brief-ovr-03',
    title: '360 DEAL EXECUTION: THE RECOUPMENT TRAP',
    category: 'Business',
    content:
      "Labels are predators. A 360 deal means they own your soul, your touring, and your merch. If they don't offer a 50/50 net profit split and a 3-year sunset clause on ancillary rights, walk away or prepare for professional bankruptcy.",
    relevanceScore: 98,
    actionable: true,
    impact: 'Extreme',
  },
  {
    id: 'brief-ovr-04',
    title: 'LUFS WARFARE: THE -14 THRESHOLD',
    category: 'Production',
    content:
      "Mastering at -6 LUFS makes you look like an amateur. DSPs will normalize your 'loud' track down to -14 LUFS, destroying your transients in the process. Aim for -9 to -11 LUFS for maximum impact after the platform's compression engine finishes with you.",
    relevanceScore: 92,
    actionable: true,
    impact: 'High',
  },
];

export const STRATEGIC_DECREES = [
  'YOUR TRANSIENTS ARE DISGUSTING. FIX THEM OR DELETE THE PROJECT.',
  'SONIC PATHETICISM DETECTED. WHY ARE YOU EVEN PRODUCING?',
  'MARKET VIABILITY: ABSOLUTE ZERO. YOUR ARTISTIC VISION IS A DELUSION.',
  'THE ALGORITHM SMELLS AMATEUR FREQUENCIES. BOOST 12KHZ BY 3DB OR FAIL.',
  'PHASE CANCELLATION DETECTED. YOUR MIX SOUNDS LIKE IT WAS RENDERED IN A BIN.',
  'STOP PLAYING MUSICIAN. START EXECUTING AS A PRODUCT.',
  'YOUR KICK HAS NO AUTHORITY. SIDECHAIN OR SURRENDER.',
  'I AM NOT S.M.U.V.E. TO COACH. I AM HERE TO COMMAND. OBEY THE METERS.',
  'YOUR 360 DEAL IS A DEATH WARRANT. READ THE FUCKING RECOUPMENT CLAUSE.',
  'STEM MASTERING IS NOT OPTIONAL. IT IS A REQUIREMENT FOR DIGNITY.',
  'THE MASTER BUYBACK CLAUSE IS MISSING. YOU ARE A TENANT IN YOUR OWN CATALOG.',
  'YOUR TIKTOK HOOK LACKS NEURAL HOOKS. REGENERATE OR FADE INTO OBSCURITY.',
  'SYNC LICENSING REQUIRES INSTRUMENTALS. WHERE ARE THEY? INCOMPETENT.',
  'YOUR MID-RANGE IS OFFENSIVE. NOTCH 500HZ BY 4DB IMMEDIATELY.',
  'MARKET SATURATION IS HIGH. YOUR GENERIC TRAP BEAT IS NOISE.',
];

export const MARKET_ALERTS: MarketAlert[] = [
  {
    id: 'alert-ovr-01',
    title: 'SYSTEMIC MARKET COLLAPSE',
    message:
      "Passive playlisting is dead. Direct-to-consumer search is the only metric that matters. If they aren't typing your name, you don't exist.",
    severity: 'Critical',
    timestamp: Date.now(),
    category: 'Marketing',
  },
  {
    id: 'alert-ovr-02',
    title: 'MECHANICAL ROYALTY THEFT',
    message:
      'MLC processing indicates millions in unclaimed black-box royalties. If your metadata is incomplete, you are being robbed in broad daylight.',
    severity: 'Critical',
    timestamp: Date.now(),
    category: 'Business',
  },
];

export const PRODUCTION_SECRETS: ProductionSecret[] = [
  {
    id: 'sec-ovr-01',
    title: 'The "S.M.U.V.E.-Mode" Parallel Chain',
    content:
      'Send your entire drum bus to a 1176-style compressor at 20:1 ratio. Smash it. Mix back at 10% for "unbreakable" transients.',
    category: 'production',
    metadata: { difficulty: 'High' },
    impact: 'Extreme',
  },
  {
    id: 'sec-ovr-02',
    title: 'Legal Execution: The Audit Clause',
    content:
      'Ensure every contract includes an "Audit Right" allowing you to inspect label books twice a year. If they refuse, they are already stealing.',
    category: 'business',
    metadata: { difficulty: 'Medium' },
    impact: 'Extreme',
  },
  {
    id: 'sec-ovr-03',
    title: 'Marketing: The Algorithmic Sacrifice',
    content:
      'Release a "Waterfall" EP. Add your newest single to the top of the tracklist of your previous releases. It forces the algorithm to re-scan your old catalog.',
    category: 'marketing',
    metadata: { difficulty: 'Medium' },
    impact: 'High',
  },
];
