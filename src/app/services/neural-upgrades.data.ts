import { UpgradeBlueprint } from './ai.service';

export const NEURAL_UPGRADE_BLUEPRINTS: UpgradeBlueprint[] = [
  {
    id: 'upg-neural-stem-splitter',
    title: 'Neural Stem Splitter',
    type: 'Software',
    description: 'Advanced AI-powered stem separation.',
    cost: '0.5 ETH',
    impact: 'High',
    rationale: 'Extract vocals and instruments with high fidelity.',
    targetArea: 'Sampling & Remixing',
    priority: 'High',
    prerequisites: [],
    actionLabel: 'Upgrade Now',
    toolId: 'stem-splitter',
    outcomeMetric: { label: 'Separation Quality', value: '98%' },
    preferredViews: ['hub', 'studio'],
    rank: ({ viewMode }) => (viewMode === 'hub' ? 90 : 65),
  },
];
