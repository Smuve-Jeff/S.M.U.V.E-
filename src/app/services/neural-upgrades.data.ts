import type { UpgradeRecommendation } from '../types/ai.types';

/**
 * Included workspace next steps.
 *
 * These entries used to sell fixed-price "upgrades" in ETH with outcome claims
 * like "400% royalty recovery", "INF sonic authority" and "94% hit probability".
 * Nothing in the app could deliver those claims, and no purchase or license was
 * ever processed. Each card now opens a tool the artist already has and states
 * only what that tool contains.
 */
export const NEURAL_UPGRADE_BLUEPRINTS: UpgradeRecommendation[] = [
  {
    id: 'upg-ovr-mastering',
    title: 'Mastering chain review',
    type: 'Software',
    description:
      'Open Mastering and check loudness, spectrum and export settings yourself. Nothing is applied automatically.',
    cost: 'Included',
    url: '',
    impact: 'High',
    rationale: 'A master is only as good as the checks the artist actually makes.',
    targetArea: 'Production',
    priority: 'High',
    prerequisites: [],
    actionLabel: 'Open Mastering',
    toolId: 'mastering',
  },
  {
    id: 'upg-legal-executioner',
    title: 'Rights and split review',
    type: 'Service',
    description:
      'Review split sheets, PRO registration and release credits on your record. This is a checklist, not legal advice.',
    cost: 'Included',
    url: '',
    impact: 'High',
    rationale: 'Rights gaps are easier to see before a release than after one.',
    targetArea: 'Business',
    priority: 'High',
    prerequisites: [],
    actionLabel: 'Open Career Hub',
    toolId: 'career',
  },
  {
    id: 'upg-neural-stem-splitter',
    title: 'Stem and session export',
    type: 'Software',
    description:
      'Open the Studio to prepare instrumental, acapella and stem exports from sessions you control.',
    cost: 'Included',
    url: '',
    impact: 'Medium',
    rationale: 'Deliverables you can hand over are more useful than ones you describe.',
    targetArea: 'Production',
    priority: 'Medium',
    prerequisites: [],
    actionLabel: 'Open Studio',
    toolId: 'studio',
  },
  {
    id: 'upg-tha-spot-god-mode',
    title: 'Tha Spot progression review',
    type: 'Service',
    description:
      'Review the cabinets you have played and the cosmetics you actually earned. No unlock is granted from this card.',
    cost: 'Included',
    url: '',
    impact: 'Low',
    rationale: 'The record of what was played belongs to the artist who played it.',
    targetArea: 'Practice',
    priority: 'Medium',
    prerequisites: [],
    actionLabel: 'Open Tha Spot',
    toolId: 'tha-spot',
  },
  {
    id: 'upg-neural-ghostwriter-pro',
    title: 'Lyric editor session',
    type: 'Software',
    description:
      'Open the Songwriting Studio and draft from your own ideas. S.M.U.V.E. does not source lyrics from Billboard metadata.',
    cost: 'Included',
    url: '',
    impact: 'Medium',
    rationale: 'A writing surface is useful; a promise to write the hit for you is not.',
    targetArea: 'Production',
    priority: 'Medium',
    prerequisites: [],
    actionLabel: 'Open Songwriting Studio',
    toolId: 'songwriting',
  },
  {
    id: 'upg-engagement-hijacker',
    title: 'Campaign planner',
    type: 'Service',
    description:
      'Create a campaign plan with your own goal, audience and budget. No ad or social account is connected, and no growth is promised.',
    cost: 'Included',
    url: '',
    impact: 'Medium',
    rationale: 'A plan records what the artist intends, not what a platform will do.',
    targetArea: 'Marketing',
    priority: 'Medium',
    prerequisites: [],
    actionLabel: 'Open Strategy',
    toolId: 'strategy',
  },
  {
    id: 'upg-quantum-mastering',
    title: 'Release readiness review',
    type: 'Service',
    description:
      'Open the Release Pipeline and see which delivery items are recorded versus missing before you schedule anything.',
    cost: 'Included',
    url: '',
    impact: 'High',
    rationale: 'A release date is only useful when the delivery record supports it.',
    targetArea: 'Business',
    priority: 'High',
    prerequisites: [],
    actionLabel: 'Open Release Pipeline',
    toolId: 'release-pipeline',
  },
];
