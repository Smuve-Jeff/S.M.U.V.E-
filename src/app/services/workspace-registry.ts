import { MainViewMode } from './user-context.service';

export type WorkspaceCategory =
  | 'CORE'
  | 'STRATEGY'
  | 'CREATIVE'
  | 'COMMUNITY'
  | 'UTILITY';

export interface ViewConfig {
  mode: MainViewMode;
  label: string;
  description: string;
  icon: string;
  category: WorkspaceCategory;
}

export interface WorkspaceConfig extends ViewConfig {
  routePath: string;
  mobilePrimary?: boolean;
  hidden?: boolean;
  aliasOf?: MainViewMode;
  related?: MainViewMode[];
}

export const WORKSPACE_REGISTRY: WorkspaceConfig[] = [
  {
    mode: 'hub',
    routePath: '/hub',
    label: 'Label Hub',
    description: 'Coordinate releases, assets, and day-to-day executive moves.',
    icon: 'grid_view',
    category: 'CORE',
    mobilePrimary: true,
    related: ['profile', 'projects', 'release-pipeline', 'analytics'],
  },
  {
    mode: 'studio',
    routePath: '/studio',
    label: 'Studio',
    description:
      'Build, mix, and refine production sessions with live control.',
    icon: 'token',
    category: 'CORE',
    mobilePrimary: true,
    related: ['piano-roll', 'vocal-suite', 'practice', 'lyric-editor'],
  },
  {
    mode: 'vocal-suite',
    routePath: '/vocal-suite',
    label: 'Vocal Suite',
    description:
      'Record, edit, and polish vocal performances through each stage.',
    icon: 'neurology',
    category: 'CORE',
    related: ['studio', 'practice', 'lyric-editor'],
  },
  {
    mode: 'piano-roll',
    routePath: '/piano-roll',
    label: 'Piano Roll',
    description:
      'Compose, edit, and route arrangements with the full rack and mix dock.',
    icon: 'piano',
    category: 'CORE',
    related: ['studio', 'vocal-suite', 'lyric-editor'],
  },
  {
    mode: 'lyric-editor',
    routePath: '/lyric-editor',
    label: 'Lyric Editor',
    description: 'Write hooks, verses, and concepts without leaving the stack.',
    icon: 'lyrics',
    category: 'CREATIVE',
    related: ['studio', 'vocal-suite', 'strategy'],
  },
  {
    mode: 'practice',
    routePath: '/practice',
    label: 'Practice Space',
    description: 'Rehearse, drill, and turn guidance into repeatable routines.',
    icon: 'sports_martial_arts',
    category: 'CORE',
    related: ['studio', 'vocal-suite', 'career'],
  },
  {
    mode: 'profile',
    routePath: '/profile',
    label: 'Profile',
    description:
      'Manage artist identity, preferences, and personalized settings.',
    icon: 'person',
    category: 'CORE',
    mobilePrimary: true,
    related: ['hub', 'strategy', 'career', 'settings'],
  },
  {
    mode: 'projects',
    routePath: '/projects',
    label: 'Projects',
    description: 'Track releases, tasks, and delivery readiness in one place.',
    icon: 'folder_managed',
    category: 'CORE',
    related: ['hub', 'release-pipeline', 'analytics'],
  },
  {
    mode: 'release-pipeline',
    routePath: '/release-pipeline',
    label: 'Release Pipeline',
    description:
      'Move tracks from production through launch with stage visibility.',
    icon: 'rocket_launch',
    category: 'CORE',
    related: ['projects', 'strategy', 'analytics', 'business-suite'],
  },
  {
    mode: 'strategy',
    routePath: '/strategy',
    label: 'Intel Lab',
    description: 'Activate AI strategy, market intelligence, and audit flows.',
    icon: 'analytics',
    category: 'STRATEGY',
    mobilePrimary: true,
    related: ['career', 'analytics', 'knowledge-base', 'release-pipeline'],
  },
  {
    mode: 'career',
    routePath: '/career',
    label: 'Career Board',
    description:
      'Track opportunities, growth priorities, and business momentum.',
    icon: 'business_center',
    category: 'STRATEGY',
    related: ['strategy', 'analytics', 'profile'],
  },
  {
    mode: 'analytics',
    routePath: '/analytics',
    label: 'Analytics',
    description: 'Review audience, growth, and performance signals.',
    icon: 'monitoring',
    category: 'STRATEGY',
    related: ['strategy', 'release-pipeline', 'career'],
  },
  {
    mode: 'knowledge-base',
    routePath: '/knowledge-base',
    label: 'Knowledge Base',
    description: 'Capture directives, reference material, and AI-led insights.',
    icon: 'library_books',
    category: 'STRATEGY',
    related: ['strategy', 'profile', 'career'],
  },
  {
    mode: 'image-video-lab',
    routePath: '/image-video-lab',
    label: 'Image & Video Lab',
    description: 'Produce cover art, visual concepts, and video timelines.',
    icon: 'movie',
    category: 'CREATIVE',
    related: ['projects', 'release-pipeline', 'strategy'],
  },
  {
    mode: 'remix-arena',
    routePath: '/remix-arena',
    label: 'Remix Arena',
    description:
      'Collaborate on remixes and live coding sessions in real time.',
    icon: 'queue_music',
    category: 'CREATIVE',
    related: ['studio', 'tha-spot', 'projects'],
  },
  {
    mode: 'business-suite',
    routePath: '/business-suite',
    label: 'Business Suite',
    description:
      'Organize business infrastructure, legal flows, and operations.',
    icon: 'apartment',
    category: 'UTILITY',
    related: ['release-pipeline', 'career', 'strategy'],
  },
  {
    mode: 'business-pipeline',
    routePath: '/business-suite',
    label: 'Business Pipeline',
    description: 'Review pipeline stage details and execute attached actions.',
    icon: 'account_tree',
    category: 'UTILITY',
    hidden: true,
    related: ['business-suite', 'strategy', 'career'],
  },
  {
    mode: 'tha-spot',
    routePath: '/tha-spot',
    label: 'Tha Spot',
    description: 'Step into community, discovery, and social session play.',
    icon: 'sports_esports',
    category: 'COMMUNITY',
    related: ['remix-arena', 'hub', 'career'],
  },
  {
    mode: 'settings',
    routePath: '/settings',
    label: 'Settings',
    description: 'Tune performance, visuals, sync, and security behavior.',
    icon: 'settings',
    category: 'UTILITY',
    related: ['profile', 'hub'],
  },
  {
    mode: 'login',
    routePath: '/login',
    label: 'Login',
    description: 'Authorize access into the S.M.U.V.E. control network.',
    icon: 'login',
    category: 'UTILITY',
    hidden: true,
  },
  {
    mode: 'dj',
    routePath: '/studio',
    label: 'DJ',
    description: 'Alias for Studio.',
    icon: 'token',
    category: 'CORE',
    hidden: true,
    aliasOf: 'studio',
  },
  {
    mode: 'player',
    routePath: '/hub',
    label: 'Player',
    description: 'Alias for Label Hub.',
    icon: 'grid_view',
    category: 'CORE',
    hidden: true,
    aliasOf: 'hub',
  },
  {
    mode: 'image-editor',
    routePath: '/image-video-lab',
    label: 'Image Editor',
    description: 'Alias for Image & Video Lab.',
    icon: 'movie',
    category: 'CREATIVE',
    hidden: true,
    aliasOf: 'image-video-lab',
  },
  {
    mode: 'video-editor',
    routePath: '/image-video-lab',
    label: 'Video Editor',
    description: 'Alias for Image & Video Lab.',
    icon: 'movie',
    category: 'CREATIVE',
    hidden: true,
    aliasOf: 'image-video-lab',
  },
  {
    mode: 'networking',
    routePath: '/tha-spot',
    label: 'Networking',
    description: 'Alias for Tha Spot.',
    icon: 'sports_esports',
    category: 'COMMUNITY',
    hidden: true,
    aliasOf: 'tha-spot',
  },
];

export const WORKSPACE_INDEX = new Map(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.mode, workspace])
);
