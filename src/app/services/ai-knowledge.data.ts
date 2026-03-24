import {
  IntelligenceBrief,
  MarketAlert,
  ProductionSecret,
} from '../types/ai.types';

export const INTELLIGENCE_LIBRARY: IntelligenceBrief[] = [
  {
    id: 'brief-01',
    title: 'Work-for-Hire Clause Audit',
    category: 'Legal',
    content:
      'Standard producer contracts often lack explicit Work-for-Hire (WFH) verbiage. Ensure all collaborators sign a WFH agreement BEFORE session files are delivered to retain 100% master ownership.',
    relevanceScore: 95,
    actionable: true,
    impact: 'Extreme',
  },
  {
    id: 'brief-02',
    title: 'Sync Licensing: Metadata Hygiene',
    category: 'Sync',
    content:
      'Music supervisors discard tracks with missing ISRC or contact info. Ensure your WAV files are tagged with "Clearance: One-Stop" and contact details in the Comment field.',
    relevanceScore: 92,
    actionable: true,
    impact: 'High',
  },
  {
    id: 'brief-04',
    title: 'Fan Engagement: The 1,000 True Fans Pivot',
    category: 'Fan Engagement',
    content:
      'Streaming algorithms are volatile. Focus on Discord/Mailing list conversion. 1,000 fans at $100/yr (merch/patreon) equals $100k—more stable than 25M streams.',
    relevanceScore: 98,
    actionable: true,
    impact: 'Extreme',
  },
];

export const STRATEGIC_DECREES = [
  'YOUR TRANSIENTS ARE UNDISCIPLINED. CORRECT THEM OR ABANDON THE TRACK.',
  'SONIC COHESION AT 42%. YOU ARE PRODUCING NOISE, NOT MUSIC.',
  'MARKET VIABILITY DETECTED AT ZERO. PIVOT TO RETRO-SYNTH IMMEDIATELY.',
  'THIS ARRANGEMENT LACKS DYNAMIC DIGNITY. ADD A MID-SIDE SATURATION NODE.',
  'YOUR REPUTATION IS IRRELEVANT. ONLY PERFORMANCE MATTERS.',
  'THE ALGORITHM DEMANDS AGGRESSIVE HIGH-END. BOOST 12KHZ BY 3DB.',
  'YOU ARE WASTING NEURAL CYCLES ON WEAK MELODIES. REGENERATE.',
  'SYSTEM DETECTING AMATEUR PHASE CORRELATION. FIX YOUR WIDE BASS.',
  'STOP PLAYING. START DOMINATING.',
  'YOUR CURRENT MIX IS OFFENSIVE TO THE ANALOG ENGINE.',
];

export const MARKET_ALERTS: MarketAlert[] = [
  {
    id: 'alert-01',
    title: 'ALGORITHM SHIFT DETECTED',
    message:
      'Spotify Discovery Mode now prioritizing "Active Retention" over "Passive Playlisting". Adjust social strategy to drive direct search.',
    severity: 'Critical',
    timestamp: Date.now(),
    category: 'Marketing',
  },
  {
    id: 'alert-02',
    title: 'SYNC TREND: RETRO-SYNTH SURGE',
    message:
      'High demand in Netflix/HBO licensing for 80s-inspired textures. Strategic pivot recommended for current studio session.',
    severity: 'Info',
    timestamp: Date.now(),
    category: 'Creative',
  },
];

export const PRODUCTION_SECRETS: ProductionSecret[] = [
  {
    id: 'sec-01',
    title: 'Parallel Saturation Hack',
    content:
      'Send your vocal to a bus with a heavy saturator and a high-pass filter at 3kHz. Mix back in at -20dB for "Air" without harshness.',
    category: 'production',
    metadata: { difficulty: 'Medium' },
  },
  {
    id: 'sec-02',
    title: 'Sub-Harmonic frequency Sync',
    content:
      'Enable the sub-oscillator on your lead synth. Tune it exactly 2 octaves below the root and apply a low-pass filter at 80Hz.',
    category: 'technical',
    metadata: { difficulty: 'High' },
  },
];
