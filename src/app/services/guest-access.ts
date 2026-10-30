/**
 * Guest clearance policy.
 *
 * A guest session is a real, limited S.M.U.V.E. session: it proves the app
 * works without asking for an email, but it must never look like a full
 * account nor reach account-only surfaces. The policy lives here so the login
 * surface, the route guard, the shell navigation and the guest landing page
 * all read the same list instead of drifting apart.
 */

export const GUEST_ROLE = 'Guest';

/**
 * The guest's only permission. Deliberately not `STANDARD`: permission-gated
 * routes treat a guest as lacking access unless they opt in explicitly.
 */
export const GUEST_PERMISSIONS: readonly string[] = ['GUEST'];

/**
 * Route prefixes a guest session may open, bare (no leading slash).
 *
 * These are the hands-on creative tools — the surfaces that let someone
 * evaluate the product in a single visit. Anything strategic, financial,
 * account-level or destructive stays behind an account.
 */
export const GUEST_ALLOWED_ROUTES: readonly string[] = [
  'guest-access',
  'hub',
  'studio',
  'studio-page',
  'studio-classic',
  'vocal-suite',
  'practice',
  'dj',
  'turntable',
  'decks',
  'piano-roll',
  'canvas-piano-roll',
  'mixer',
  'drum-machine',
  'performance',
  'lyric-editor',
  'tha-spot',
  'gaming-hub',
  'networking',
  'knowledge-base',
  'artist',
];

/** First path segment of a router URL, ignoring query/fragment and slashes. */
export function primaryRouteSegment(url: string): string {
  return (url || '')
    .split(/[?#]/)[0]
    .replace(/^\/+/, '')
    .split('/')[0]
    .toLowerCase();
}

/** Whether a guest session may open this router URL. */
export function isGuestRouteAllowed(url: string): boolean {
  const segment = primaryRouteSegment(url);
  // An empty URL resolves to the empty route, which redirects into the hub.
  return !segment || GUEST_ALLOWED_ROUTES.includes(segment);
}

/** Whether a session user is a guest. Tolerates partial/legacy user shapes. */
export function isGuestUser(
  user: { role?: string | null } | null | undefined
): boolean {
  return user?.role === GUEST_ROLE;
}

/**
 * Copy shown wherever a guest meets an AI surface, so the limitation reads as a
 * clearance rule instead of a broken feature.
 */
export const GUEST_AI_LOCK_NOTICE =
  'S.M.U.V.E.’s AI is account-only. Sign in or create an account to use the assistant, coaching, concept art and AI session musicians.';

/**
 * Whether this session may use AI at all.
 *
 * Guest clearance gets **no** AI integration: no model request, no assistant,
 * no AI session musicians. `AiService` is the single enforcement point, so a
 * stale view or a direct caller still cannot reach a provider as a guest.
 */
export function mayUseAi(
  user: { role?: string | null } | null | undefined
): boolean {
  return !isGuestUser(user);
}
