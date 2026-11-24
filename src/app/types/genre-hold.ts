import type { UserProfile } from './profile.types';

/**
 * The genre a brand-new profile ships with. It is a placeholder, not an answer,
 * until the artist commits the interview or uplink.
 */
export const DEFAULT_PRIMARY_GENRE = 'Hip Hop';

/** Just the fields the hold rule reads, so callers can pass a partial profile. */
export type GenreHoldProfile = Pick<
  UserProfile,
  'profileSetupCompleted' | 'primaryGenre'
>;

/**
 * The one genre-hold rule for the whole app.
 *
 * Genre-specific tempo, structure, mix advice, read-back and public identity
 * are withheld while the artist profile is uncommitted and the genre is still
 * the untouched default. The committed flag alone decides it: an artist who
 * typed a name but never finished the interview still has no accepted genre
 * answer, so the default "Hip Hop" must not become their plan.
 *
 * This module has no runtime imports, so pure type consumers, services and
 * components can all share it without a cycle.
 */
export function isGenreAdviceHeld(
  profile: GenreHoldProfile | null | undefined
): boolean {
  return (
    profile?.profileSetupCompleted !== true &&
    (profile?.primaryGenre || '').trim().toLowerCase() ===
      DEFAULT_PRIMARY_GENRE.toLowerCase()
  );
}
