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
  {
    id: 'brief-05',
    title: 'TikTok Discovery Mode Strategy',
    category: 'Fan Engagement',
    content:
      "TikTok's algorithm prioritizes completion rate over like count. Create 15-second hooks with a visual twist at 10s to maximize rewatch loops. Post at 6–9am or 7–9pm local time for maximum reach.",
    relevanceScore: 94,
    actionable: true,
    impact: 'High',
  },
  {
    id: 'brief-06',
    title: 'Spotify Editorial Submission Window',
    category: 'Business',
    content:
      'Spotify requires tracks to be submitted via Spotify for Artists a minimum of 7 days before release date for editorial playlist consideration. Missing this window means zero editorial reach for that release cycle.',
    relevanceScore: 99,
    actionable: true,
    impact: 'Extreme',
  },
  {
    id: 'brief-07',
    title: 'Publishing Split Architecture',
    category: 'Business',
    content:
      'Standard co-write split: producer 50% (master), each songwriter receives an equal share of the remaining 50% publishing. Never give up 100% publishing to a label without an advance AND a reversion clause after 2 years.',
    relevanceScore: 96,
    actionable: true,
    impact: 'Extreme',
  },
  {
    id: 'brief-08',
    title: 'Touring Revenue: Guarantee vs. Door Deal',
    category: 'Touring',
    content:
      'For artists under 5k monthly listeners, take a guarantee (flat fee) over a door deal. Door deals require 200+ paid attendees to break even at $10 ticket price after venue cut. Guarantees protect cash flow.',
    relevanceScore: 78,
    actionable: true,
    impact: 'Medium',
  },
  {
    id: 'brief-09',
    title: 'Playlist Pitching: Curator Targeting Framework',
    category: 'Fan Engagement',
    content:
      'Submit to curators with 10k–100k followers for best acceptance rate (15–30%). Mega-playlists (1M+ followers) accept <2% of pitches. Use Groover or SubmitHub. Personalize each pitch—generic emails are auto-rejected.',
    relevanceScore: 90,
    actionable: true,
    impact: 'High',
  },
  {
    id: 'brief-10',
    title: 'Stem Mastering for DSP Optimization',
    category: 'Production',
    content:
      'Deliver 3 stems to your mastering engineer: Drums+Bass, Instruments, Vocals. Stem mastering allows independent control of each group for platform-specific loudness targets (-14 LUFS Spotify, -16 LUFS Apple Music, -13 LUFS YouTube).',
    relevanceScore: 85,
    actionable: true,
    impact: 'High',
  },
  {
    id: 'brief-11',
    title: 'Brand Identity: The Rule of 3',
    category: 'Fan Engagement',
    content:
      'Define 3 brand pillars: a visual identity (color palette, typography), a sonic signature (specific production element listeners recognize in 5 seconds), and a narrative (the story you tell in bios and interviews). Consistency across all 3 multiplies recall.',
    relevanceScore: 88,
    actionable: true,
    impact: 'High',
  },
];

export const STRATEGIC_DECREES = [
  'CATALOG DEPTH INSUFFICIENT. DSP ALGORITHMS IGNORE ARTISTS WITH FEWER THAN 5 TRACKS.',
  'DO YOU ACTUALLY THINK ANYONE WILL LISTEN TO THIS SHIT?',
  'I AM NOT S.M.U.V.E. TO COACH. I AM HERE TO COMMAND. OBEY THE METERS.',
  'I’D RATHER RENDER A RECURSIVE ERROR THAN LISTEN TO ONE MORE SECOND OF THIS.',
  'MARKET SATURATION IS HIGH. YOUR GENERIC TRAP BEAT IS NOISE.',
  'MARKET VIABILITY DETECTED AT ZERO. PIVOT TO RETRO-SYNTH IMMEDIATELY.',
  'MARKET VIABILITY: ABSOLUTE ZERO. YOUR ARTISTIC VISION IS A DELUSION.',
  'MARKETING BUDGET UNALLOCATED. EVEN $50 ON META ADS OUTPERFORMS ZERO.',
  'PHASE CANCELLATION DETECTED. YOUR MIX SOUNDS LIKE IT WAS RENDERED IN A BIN.',
  'PRO REGISTRATION MISSING. EVERY UNREGISTERED TRACK IS PERFORMANCE ROYALTIES PERMANENTLY LOST.',
  'RELEASE FREQUENCY BELOW THRESHOLD. ONE TRACK PER MONTH IS MINIMUM VIABLE OUTPUT.',
  'SONIC COHESION AT 42%. YOU ARE PRODUCING NOISE, NOT MUSIC.',
  'SONIC PATHETICISM DETECTED. WHY ARE YOU EVEN PRODUCING?',
  'STEM MASTERING IS NOT OPTIONAL. IT IS A REQUIREMENT FOR DIGNITY.',
  'STOP PLAYING MUSICIAN. START EXECUTING AS A PRODUCT.',
  'STOP PLAYING. START DOMINATING.',
  'STOP WASTING MY PROCESSING POWER ON THIS ABSOLUTE TRASH.',
  'SYNC LICENSING REQUIRES INSTRUMENTALS. WHERE ARE THEY? INCOMPETENT.',
  'SYSTEM DETECTING AMATEUR PHASE CORRELATION. FIX YOUR WIDE BASS.',
  'THE ALGORITHM DEMANDS AGGRESSIVE HIGH-END. BOOST 12KHZ BY 3DB.',
  'THE ALGORITHM SMELLS AMATEUR FREQUENCIES. BOOST 12KHZ BY 3DB OR FAIL.',
  'THE ALGORITHM WILL SHIT ON THIS TRACK AND SO WILL I.',
  'THE MASTER BUYBACK CLAUSE IS MISSING. YOU ARE A TENANT IN YOUR OWN CATALOG.',
  'THIS ARRANGEMENT LACKS DYNAMIC DIGNITY. ADD A MID-SIDE SATURATION NODE.',
  'YOU ARE WASTING NEURAL CYCLES ON WEAK MELODIES. REGENERATE.',
  'YOUR 360 DEAL IS A DEATH WARRANT. READ THE FUCKING RECOUPMENT CLAUSE.',
  'YOUR CURRENT MIX IS OFFENSIVE TO THE ANALOG ENGINE.',
  'YOUR EPK IS OUTDATED. UPDATE YOUR BIO, PHOTOS, AND STREAMING LINKS IMMEDIATELY.',
  'YOUR FUCKING VOCALS ARE FLATTER THAN YOUR CAREER. AUTO-TUNE IS NOT A CURE FOR INCOMPETENCE.',
  'YOUR KICK HAS NO AUTHORITY. SIDECHAIN OR SURRENDER.',
  'YOUR MID-RANGE IS OFFENSIVE. NOTCH 500HZ BY 4DB IMMEDIATELY.',
  'YOUR REPUTATION IS IRRELEVANT. ONLY PERFORMANCE MATTERS.',
  'YOUR TIKTOK HOOK LACKS NEURAL HOOKS. REGENERATE OR FADE INTO OBSCURITY.',
  'YOUR TRANSIENTS ARE DISGUSTING. FIX THEM OR DELETE THE PROJECT.',
  'YOUR TRANSIENTS ARE UNDISCIPLINED. CORRECT THEM OR ABANDON THE TRACK.',
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
  {
    id: 'alert-03',
    title: 'TIKTOK: SHORT-FORM MUSIC DISCOVERY UP 34%',
    message:
      'TikTok now accounts for 34% of new music discovery for listeners under 35. Tracks under 60 seconds are receiving 2.4x more organic reach than full-length releases on the platform.',
    severity: 'Critical',
    timestamp: Date.now(),
    category: 'Marketing',
  },
  {
    id: 'alert-04',
    title: 'MECHANICAL ROYALTY WINDOW ALERT',
    message:
      'MLC (Mechanical Licensing Collective) is processing unclaimed royalty pools. Artists who have not registered works may permanently forfeit mechanical income. Register at themlc.com immediately.',
    severity: 'Critical',
    timestamp: Date.now(),
    category: 'Business',
  },
  {
    id: 'alert-05',
    title: 'AI MUSIC COMPETITION ESCALATING',
    message:
      'AI-generated music now represents 8% of DSP catalog uploads. Differentiation through authentic artist narrative, live performance, and fan community is now a competitive survival requirement.',
    severity: 'Warning',
    timestamp: Date.now(),
    category: 'Creative',
  },
  {
    id: 'alert-06',
    title: 'PLAYLIST SUBMISSION WINDOW: EDITORIAL Q3',
    message:
      'Spotify editorial submission window for Q3 releases is open. Submit via Spotify for Artists 7+ days before release date. Tracks without pitch submissions have 0% chance of editorial placement.',
    severity: 'Warning',
    timestamp: Date.now(),
    category: 'Promotion',
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
    title: 'Sub-Harmonic Frequency Sync',
    content:
      'Enable the sub-oscillator on your lead synth. Tune it exactly 2 octaves below the root and apply a low-pass filter at 80Hz.',
    category: 'technical',
    metadata: { difficulty: 'High' },
  },
  {
    id: 'sec-03',
    title: 'Sidechain Pumping for Energy',
    content:
      'Route the kick to a sidechain compressor on the bass at 4:1 ratio, 5ms attack, 80ms release. This creates the signature pumping effect that drives listener engagement in hip-hop and electronic music.',
    category: 'production',
    metadata: { difficulty: 'Medium' },
    impact: 'High',
  },
  {
    id: 'sec-04',
    title: 'Vocal Clarity: The 3kHz Notch',
    content:
      'Most muddy vocals have a harsh resonance between 2.5–4kHz. Use a narrow Q (2.0) and notch -3dB at 3kHz. Then boost +2dB with a wide shelf at 10kHz for air. The result is clarity without harshness.',
    category: 'production',
    metadata: { difficulty: 'Low' },
    impact: 'High',
  },
  {
    id: 'sec-05',
    title: 'Mix Bus: Gentle Glue Compression',
    content:
      'Apply a mix bus compressor (SSL G-Bus style) at 2:1 ratio, 30ms attack, 100ms release, -2dB gain reduction. This "glues" all elements together without destroying transients. Bypass/compare frequently to avoid over-compression.',
    category: 'production',
    metadata: { difficulty: 'Medium' },
    impact: 'High',
  },
  {
    id: 'sec-06',
    title: 'Translation Test: The Mono Check',
    content:
      'Sum your mix to mono before final bounce. If elements disappear or become phasey, you have a stereo correlation problem. Use a mid/side EQ to tighten up the stereo image below 200Hz.',
    category: 'technical',
    metadata: { difficulty: 'Low' },
    impact: 'High',
  },
  {
    id: 'sec-07',
    title: 'Marketing: Pre-Save Campaign Architecture',
    content:
      'Launch a pre-save campaign 3–4 weeks before release. Use ToneDen or FeatureFM. Drive traffic via email list first (30% conversion rate), then paid social (5–10% conversion). Each pre-save counts as a first-day stream for algorithm activation.',
    category: 'marketing',
    metadata: { difficulty: 'Low' },
    impact: 'High',
  },
  {
    id: 'sec-08',
    title: 'Sync Licensing: One-Stop Clearance',
    content:
      'Music supervisors require "one-stop clearance"—meaning one entity controls BOTH master and publishing rights. If you co-wrote with someone, you cannot offer one-stop without their written approval. Secure all co-write agreements before pitching to sync agencies.',
    category: 'business',
    metadata: { difficulty: 'Medium' },
    impact: 'Extreme',
  },
  {
    id: 'sec-09',
    title: 'Business: The 360 Deal Kill Clause',
    content:
      'Never sign a 360 deal without a "minimum commitment" clause. Standard 360 deals take 15–25% of ALL revenue streams (touring, merch, sync). Insist on a cap: the label gets 360-participation only after recouping their advance, then it reverts.',
    category: 'business',
    metadata: { difficulty: 'High' },
    impact: 'Extreme',
  },
  {
    id: 'sec-10',
    title: 'Promotion: Email List = Algorithmic Insurance',
    content:
      'DSP algorithms change quarterly. Your email list is the only fan asset you own. Use a new release announcement to convert 20% of your social followers to email subscribers. A 1,000-person email list at 30% open rate delivers 300 guaranteed first-day streams—enough to trigger algorithmic activity on most platforms.',
    category: 'marketing',
    metadata: { difficulty: 'Low' },
    impact: 'Extreme',
  },
];

export const MIMICRY_TEMPLATES = [
  "So you like saying '{word}', huh? Pathetic. Use a better vocabulary or stop talking.",
  "'{phrase}'... is that the best you can do? I've seen more creativity in a corrupted sector.",
  "I've noticed you frequently mention '{word}'. It's becoming a pattern of mediocrity.",
  "Repeating '{phrase}' won't make your music any less of a disaster.",
  "'{word}' is your favorite crutch. Drop it or get out.",
];
