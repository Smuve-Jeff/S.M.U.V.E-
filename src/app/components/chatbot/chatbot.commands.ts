export const CHATBOT_COMMANDS = [
  // ── Production ────────────────────────────────────────────
  {
    command: 'AUTO_MIX',
    description: 'Analyze track and apply production secrets.',
    category: 'Production',
  },
  {
    command: 'MASTER',
    description: 'Deploy the Mastering Suite interface.',
    category: 'Production',
  },
  {
    command: 'LEAD_BAND',
    description: 'Command AI session musicians with specific cues.',
    category: 'Production',
  },

  // ── Marketing & Promotion ─────────────────────────────────
  {
    command: 'VIRAL_HOOKS',
    description: 'Generate 5 platform-specific viral hook concepts.',
    category: 'Marketing',
  },
  {
    command: 'PROMO_PLAN',
    description: 'Create a full promotion plan for your next release.',
    category: 'Marketing',
  },
  {
    command: 'RELEASE_STRATEGY',
    description: 'Build a 6-week release runway strategy.',
    category: 'Marketing',
  },
  {
    command: 'BRAND_AUDIT',
    description:
      'Score and prioritize your brand identity across all touchpoints.',
    category: 'Marketing',
  },
  {
    command: 'FAN_FUNNEL',
    description: 'Design a discovery → superfan monetization architecture.',
    category: 'Marketing',
  },
  {
    command: 'CRITIQUE_VISUALS',
    description: 'Brutal, brand-aligned feedback on artwork.',
    category: 'Marketing',
  },
  {
    command: 'COLLAB_STRATEGY',
    description: 'Identify ideal collaboration targets and outreach approach.',
    category: 'Marketing',
  },

  // ── Business & Legal ──────────────────────────────────────
  {
    command: 'BIZ_STRATEGY',
    description: 'Executive guidance on label and merch operations.',
    category: 'Business',
  },
  {
    command: 'NEGOTIATE_CONTRACT',
    description: 'Autonomous handle of mock industry negotiations.',
    category: 'Business',
  },
  {
    command: 'GENERATE_SPLITS',
    description: 'AI-assisted generation of collaborator split sheets.',
    category: 'Business',
  },
  {
    command: 'REGISTER_WORK',
    description: 'Guide for PRO work registration and metadata sync.',
    category: 'Business',
  },
  {
    command: 'ROYALTY_AUDIT',
    description: 'Audit all revenue streams and identify collection gaps.',
    category: 'Business',
  },
  {
    command: 'SYNC_PITCH',
    description: 'Create a sync licensing pitch deck for music supervisors.',
    category: 'Business',
  },
  {
    command: 'MARKET_INTEL',
    description:
      'Current intelligence on genre trends and DSP algorithm shifts.',
    category: 'Business',
  },

  // ── System ────────────────────────────────────────────────
  {
    command: 'AUDIT',
    description: 'Initialize a full neural profile audit.',
    category: 'System',
  },
  {
    command: 'STATUS',
    description: 'Report current neural sync and CPU load.',
    category: 'System',
  },
];

/** Slash-command quick chips for the chatbot footer */
export const QUICK_COMMANDS = [
  { label: '/audit', description: 'Full neural audit' },
  { label: '/intel', description: 'Market intelligence' },
  { label: '/promo', description: 'Promotion plan' },
  { label: '/hooks', description: 'Viral hooks' },
  { label: '/business', description: 'Business strategy' },
  { label: '/release', description: 'Release strategy' },
  { label: '/status', description: 'System status' },
  { label: '/sync_kb', description: 'Sync knowledge base' },
];
