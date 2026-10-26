import type { UserProfile } from './user-profile.service';
import type { ReleaseProject } from '../types/release.types';

/**
 * Titles are matched the way every reader matches them: lowercased with
 * punctuation collapsed to single spaces, so "Test-Album", "test  album" and
 * "Test Album" are the same release.
 */
export const normalizeReleaseTitle = (value: unknown): string =>
  typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    : '';

/**
 * Resolves the release a reading should be about.
 *
 * The split reference for a release title lives in two places by design: the
 * release project is the plan, the catalogue entry is the work. When the release
 * has not recorded one but the matching catalogue work has, the catalogue's
 * reference is adopted so every reader sees the same fact instead of one surface
 * reporting a split on file and another asking for it.
 *
 * Adoption is pure and changes nothing: no write happens, and the adopted
 * reference carries no coverage list, so callers that judge coverage (the
 * creative-to-business bridge) still ask for confirmation rather than assuming
 * the split names the current lineup.
 */
export const withAdoptedSplit = (
  profile: UserProfile | null | undefined,
  release: ReleaseProject | null | undefined
): ReleaseProject | null | undefined => {
  if (!release) return release;
  if ((release.splitSheetRef || '').trim()) return release;

  const target = normalizeReleaseTitle(release.name);
  if (!target) return release;

  const work = ((profile as any)?.catalog ?? []).find(
    (entry: { title?: string }) => normalizeReleaseTitle(entry?.title) === target
  );
  const reference = (work?.splitSheetRef || '').trim();
  if (!reference) return release;

  return { ...release, splitSheetRef: reference };
};
