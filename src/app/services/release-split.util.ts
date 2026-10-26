import type { UserProfile } from './user-profile.service';
import type { ReleaseProject } from '../types/release.types';
import type { CatalogItem } from '../types/profile.types';

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
 * The catalogue work a release belongs to.
 *
 * An explicit link (`release.catalogWorkId`) wins, so a release that was renamed
 * keeps the work it was actually recorded as. Without a link the app falls back
 * to matching the title, which is all it had before linking existed. A link to a
 * work that no longer exists falls back to the title match rather than reporting
 * a work the profile does not hold.
 */
export const findCatalogWork = (
  profile: UserProfile | null | undefined,
  release: ReleaseProject | null | undefined
): CatalogItem | null => {
  if (!release) return null;
  const catalog = ((profile as any)?.catalog ?? []) as CatalogItem[];

  const linkedId = (release.catalogWorkId || '').trim();
  if (linkedId) {
    const linked = catalog.find((entry) => entry?.id === linkedId);
    if (linked) return linked;
  }

  const target = normalizeReleaseTitle(release.name);
  if (!target) return null;
  return (
    catalog.find((entry) => normalizeReleaseTitle(entry?.title) === target) ?? null
  );
};

/**
 * Resolves the release a reading should be about.
 *
 * The split reference for a release title lives in two places by design: the
 * release project is the plan, the catalogue entry is the work. When the release
 * has not recorded one but its catalogue work has, the catalogue's reference is
 * adopted so every reader sees the same fact instead of one surface reporting a
 * split on file and another asking for it.
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

  const work = findCatalogWork(profile, release);
  const reference = (work?.splitSheetRef || '').trim();
  if (!reference) return release;

  return { ...release, splitSheetRef: reference };
};
