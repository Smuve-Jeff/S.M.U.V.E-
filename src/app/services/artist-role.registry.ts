import type { FinetuneRole } from './artist-profile-finetune.service';

/**
 * One expert identity S.M.U.V.E. can answer as. This is the single list the
 * fine-tune prompts, the coach panel, the chat desks, the quick chips, the
 * desk actions and the handoff graph all read from, so none of them can drift.
 */
export interface ArtistRoleDefinition {
  role: FinetuneRole;
  /** Display label, e.g. "A&R" or "CEO". */
  label: string;
  /** Slash aliases that open this desk (lowercase, without the slash). */
  aliases: readonly string[];
  /** One line shown on the chat quick chip for this desk. */
  summary: string;
  /** Whether this desk earns a quick chip; the list stays curated, not exhaustive. */
  chip?: boolean;
  /** The shipped surface this expert usually works in. */
  surface: { label: string; route: string };
  /** Alias of the expert this desk naturally hands work to. */
  nextDesk: string;
}

/**
 * Aliases deliberately avoid slash commands that already mean something
 * (for example `/promo` is the promotion plan, so the desk is `/promotion`).
 * `teach` is special-cased in chat: bare `/teach` is the desk, while
 * `/teach <shipped feature>` keeps the feature walkthrough.
 */
export const ARTIST_ROLES: readonly ArtistRoleDefinition[] = [
  {
    role: 'producer',
    label: 'Producer',
    aliases: ['producer'],
    summary: 'Produce the next track inside your own sound',
    surface: { label: 'Studio', route: '/studio' },
    nextDesk: 'engineer',
  },
  {
    role: 'songwriter',
    label: 'Songwriter',
    aliases: ['songwriter'],
    summary: 'Write in your world, not a genre template',
    surface: { label: "Writer's Pad", route: '/songwriting/pad' },
    nextDesk: 'producer',
  },
  {
    role: 'manager',
    label: 'Manager',
    aliases: ['manager'],
    summary: 'Route the next move toward one milestone',
    chip: true,
    surface: { label: 'Career Board', route: '/career' },
    nextDesk: 'ceo',
  },
  {
    role: 'ar',
    label: 'A&R',
    aliases: ['ar'],
    summary: 'Judge the song against your signature',
    chip: true,
    surface: { label: 'Career Board', route: '/career' },
    nextDesk: 'marketing',
  },
  {
    role: 'promotion',
    label: 'Promotion',
    aliases: ['promotion'],
    summary: 'Pitch the story only in your own words',
    surface: { label: 'Release Pipeline', route: '/release-pipeline' },
    nextDesk: 'marketing',
  },
  {
    role: 'marketing',
    label: 'Marketing',
    aliases: ['marketing'],
    summary: 'Convert through your real listener routes',
    chip: true,
    surface: { label: 'Release Pipeline', route: '/release-pipeline' },
    nextDesk: 'promotion',
  },
  {
    role: 'legal',
    label: 'Legal',
    aliases: ['legal'],
    summary: 'Draft and protect the rights you own',
    chip: true,
    surface: { label: 'Business Suite', route: '/business-suite' },
    nextDesk: 'manager',
  },
  {
    role: 'brand',
    label: 'Brand',
    aliases: ['brand'],
    summary: 'Make every surface unmistakably you',
    surface: { label: 'Image & Video Lab', route: '/image-video-lab' },
    nextDesk: 'marketing',
  },
  {
    role: 'engineer',
    label: 'Engineer',
    aliases: ['engineer'],
    summary: 'Chain, gain and translation before plugins',
    chip: true,
    surface: { label: 'Studio', route: '/studio' },
    nextDesk: 'producer',
  },
  {
    role: 'teacher',
    label: 'Teacher',
    aliases: ['teach', 'teacher'],
    summary: 'A lesson and a task at your real level',
    chip: true,
    surface: { label: 'Knowledge Base', route: '/knowledge-base' },
    nextDesk: 'coach',
  },
  {
    role: 'coach',
    label: 'Coach',
    aliases: ['coach'],
    summary: 'Commitment, obstacle and evidence',
    chip: true,
    surface: { label: 'Career Board', route: '/career' },
    nextDesk: 'manager',
  },
  {
    role: 'ceo',
    label: 'CEO',
    aliases: ['ceo'],
    summary: 'Fund, cut and protect across your streams',
    chip: true,
    surface: { label: 'Business Suite', route: '/business-suite' },
    nextDesk: 'legal',
  },
];

/** Display label per role, for desks and panels. */
export const ARTIST_ROLE_LABELS = Object.fromEntries(
  ARTIST_ROLES.map((definition) => [definition.role, definition.label])
) as Record<FinetuneRole, string>;

/** Role ids in the order prompts and panels should present them. */
export const ARTIST_ROLE_IDS: FinetuneRole[] = ARTIST_ROLES.map(
  (definition) => definition.role
);

/** Quick chips for the desks, generated so the chat cannot list a dead alias. */
export const ARTIST_ROLE_CHIPS = ARTIST_ROLES.filter(
  (definition) => definition.chip
).map((definition) => ({
  label: `/${definition.aliases[0]}`,
  description: definition.summary,
}));

/** Resolve a slash alias to its expert, or null when it is not a role. */
export function artistRoleForAlias(
  alias: string
): ArtistRoleDefinition | null {
  const needle = alias.trim().toLowerCase();
  return (
    ARTIST_ROLES.find((definition) => definition.aliases.includes(needle)) ??
    null
  );
}

/** Resolve a role id to its definition. */
export function artistRoleById(
  role: FinetuneRole
): ArtistRoleDefinition | null {
  return ARTIST_ROLES.find((definition) => definition.role === role) ?? null;
}
