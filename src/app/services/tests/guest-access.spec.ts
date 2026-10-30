import {
  GUEST_AI_LOCK_NOTICE,
  GUEST_PERMISSIONS,
  GUEST_ROLE,
  isGuestRouteAllowed,
  isGuestUser,
  mayUseAi,
  primaryRouteSegment,
} from '../guest-access';

describe('guest access policy', () => {
  it('reduces URLs to their primary route segment', () => {
    expect(primaryRouteSegment('/studio?view=mixer#top')).toBe('studio');
    expect(primaryRouteSegment('business-pipeline/42')).toBe(
      'business-pipeline'
    );
    expect(primaryRouteSegment('')).toBe('');
  });

  it('opens the creative surfaces and the clearance page', () => {
    expect(isGuestRouteAllowed('/hub')).toBe(true);
    expect(isGuestRouteAllowed('/studio?view=mixer')).toBe(true);
    expect(isGuestRouteAllowed('/tha-spot/room/42')).toBe(true);
    expect(isGuestRouteAllowed('/guest-access?from=/business-suite')).toBe(
      true
    );
  });

  it('keeps account-only surfaces closed', () => {
    expect(isGuestRouteAllowed('/business-suite')).toBe(false);
    expect(isGuestRouteAllowed('/release-pipeline')).toBe(false);
    expect(isGuestRouteAllowed('/settings')).toBe(false);
    expect(isGuestRouteAllowed('/command-center')).toBe(false);
    expect(isGuestRouteAllowed('/cloud')).toBe(false);
    expect(isGuestRouteAllowed('/analytics?range=month')).toBe(false);
  });

  it('never confuses a similarly-prefixed route with an allowed one', () => {
    // `/studio-secrets` must not pass just because `/studio` is allowed.
    expect(isGuestRouteAllowed('/studios')).toBe(false);
  });

  it('recognises only the guest role', () => {
    expect(isGuestUser({ role: GUEST_ROLE })).toBe(true);
    expect(isGuestUser({ role: 'Artist' })).toBe(false);
    expect(isGuestUser(null)).toBe(false);
    expect(isGuestUser(undefined)).toBe(false);
  });

  it('does not grant the standard permission to guests', () => {
    expect(GUEST_PERMISSIONS).toEqual(['GUEST']);
    expect(GUEST_PERMISSIONS).not.toContain('STANDARD');
    expect(GUEST_PERMISSIONS).not.toContain('ALL_ACCESS');
  });

  it('gives guests no AI, while a real account keeps it', () => {
    expect(mayUseAi({ role: GUEST_ROLE })).toBe(false);
    expect(mayUseAi({ role: 'Artist' })).toBe(true);
    // A signed-out visitor is not a guest session: the AI gate is about the
    // limited clearance, not about hiding the product from the login screen.
    expect(mayUseAi(null)).toBe(true);
  });

  it('explains the AI limitation to a guest', () => {
    expect(GUEST_AI_LOCK_NOTICE).toContain('account-only');
  });
});
