import { IntelligenceBrief, MarketAlert, ProductionSecret } from '../types/ai.types';

export const INTELLIGENCE_LIBRARY: IntelligenceBrief[] = [
  {
    id: 'brief-01',
    title: 'Work-for-Hire Clause Audit',
    category: 'Legal',
    content: 'Standard producer contracts often lack explicit Work-for-Hire (WFH) verbiage. Ensure all collaborators sign a WFH agreement BEFORE session files are delivered to retain 100% master ownership.',
    relevanceScore: 95,
    actionable: true,
    impact: 'Extreme'
  },
  {
    id: 'brief-02',
    title: 'Sync Licensing: Metadata Hygiene',
    category: 'Sync',
    content: 'Music supervisors discard tracks with missing ISRC or contact info. Ensure your WAV files are tagged with "Clearance: One-Stop" and contact details in the Comment field.',
    relevanceScore: 92,
    actionable: true,
    impact: 'High'
  },
  {
    id: 'brief-03',
    title: 'Touring: Radius Clause Strategy',
    category: 'Touring',
    content: 'Major festivals enforce radius clauses (300 miles, 60 days). Negotiate exceptions for private events and underground club sets to maximize regional revenue.',
    relevanceScore: 88,
    actionable: false,
    impact: 'Medium'
  },
  {
    id: 'brief-04',
    title: 'Fan Engagement: The 1,000 True Fans Pivot',
    category: 'Fan Engagement',
    content: 'Streaming algorithms are volatile. Focus on Discord/Mailing list conversion. 1,000 fans at $100/yr (merch/patreon) equals $100k—more stable than 25M streams.',
    relevanceScore: 98,
    actionable: true,
    impact: 'Extreme'
  },
  {
    id: 'brief-05',
    title: 'Business: LLC vs S-Corp Optimization',
    category: 'Business',
    content: 'Once annual revenue exceeds $50k, transitioning from LLC to S-Corp can save ~15% on self-employment taxes via payroll distribution.',
    relevanceScore: 90,
    actionable: true,
    impact: 'High'
  },
  {
    id: 'brief-06',
    title: 'Sync: Trailer Music Dynamics',
    category: 'Sync',
    content: 'Trailer editors require "stems with tails" and 3-act structures. Ensure your compositions have clear "stop-starts" every 30 seconds for easy editing.',
    relevanceScore: 85,
    actionable: true,
    impact: 'High'
  }
];

export const MARKET_ALERTS: MarketAlert[] = [
  {
    id: 'alert-01',
    title: 'ALGORITHM SHIFT DETECTED',
    message: 'Spotify Discovery Mode now prioritizing "Active Retention" over "Passive Playlisting". Adjust social strategy to drive direct search.',
    severity: 'Critical',
    timestamp: Date.now(),
    category: 'Marketing'
  },
  {
    id: 'alert-02',
    title: 'DISTRIBUTION BOTTLE-NECK',
    message: 'Global vinyl production delays reaching 8 months. Advise immediate transition to "Digital-First" rollout for upcoming LP.',
    severity: 'Warning',
    timestamp: Date.now(),
    category: 'Operations'
  },
  {
    id: 'alert-03',
    title: 'SYNC TREND: RETRO-SYNTH SURGE',
    message: 'High demand in Netflix/HBO licensing for 80s-inspired textures. Strategic pivot recommended for current studio session.',
    severity: 'Info',
    timestamp: Date.now(),
    category: 'Creative'
  }
];

export const PRODUCTION_SECRETS: ProductionSecret[] = [
  {
    id: 'sec-01',
    title: 'Parallel Saturation Hack',
    content: 'Send your vocal to a bus with a heavy saturator and a high-pass filter at 3kHz. Mix back in at -20dB for "Air" without harshness.',
    category: 'production',
    metadata: { difficulty: 'Medium' }
  },
  {
    id: 'sec-02',
    title: 'Transient Shaper Gating',
    content: 'Place a transient shaper BEFORE your gate on drums. Boost attack to ensure the gate triggers reliably on ghost notes.',
    category: 'technical',
    metadata: { difficulty: 'High' }
  }
];
