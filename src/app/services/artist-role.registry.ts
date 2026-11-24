import type { FinetuneRole } from './artist-profile-finetune.service';

/**
 * One expert identity S.M.U.V.E. can answer as. This is the single list the
 * fine-tune prompts, the coach panel and the chat desks all read from, so a
 * label or alias cannot drift between the three.
 */
export interface ArtistRoleDefinition {
  role: FinetuneRole;
  /** Display label, e.g. "A&R" or "CEO". */
  label: string;
  /** Slash aliases that open this desk (lowercase, without the slash). */
  aliases: readonly string[];
}

/**
 * Aliases deliberately avoid slash commands that already mean something
 * (for example `/promo` is the promotion plan, so the desk is `/promotion`).
 */
export const ARTIST_ROLES: readonly ArtistRoleDefinition[] = [
  { role: 'producer', label: 'Producer', aliases: ['producer'] },
  { role: 'songwriter', label: 'Songwriter', aliases: ['songwriter'] },
  { role: 'manager', label: 'Manager', aliases: ['manager'] },
  { role: 'ar', label: 'A&R', aliases: ['ar'] },
  { role: 'promotion', label: 'Promotion', aliases: ['promotion'] },
  { role: 'marketing', label: 'Marketing', aliases: ['marketing'] },
  { role: 'legal', label: 'Legal', aliases: ['legal'] },
  { role: 'brand', label: 'Brand', aliases: ['brand'] },
  { role: 'engineer', label: 'Engineer', aliases: ['engineer'] },
  { role: 'teacher', label: 'Teacher', aliases: ['teach', 'teacher'] },
  { role: 'coach', label: 'Coach', aliases: ['coach'] },
  { role: 'ceo', label: 'CEO', aliases: ['ceo'] },
];

/** Display label per role, for desks and panels. */
export const ARTIST_ROLE_LABELS = Object.fromEntries(
  ARTIST_ROLES.map((definition) => [definition.role, definition.label])
) as Record<FinetuneRole, string>;

/** Role ids in the order prompts and panels should present them. */
export const ARTIST_ROLE_IDS: FinetuneRole[] = ARTIST_ROLES.map(
  (definition) => definition.role
);

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
