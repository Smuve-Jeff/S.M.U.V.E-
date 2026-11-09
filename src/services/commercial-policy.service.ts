/**
 * Commercial policy for work produced in the app.
 *
 * Paid services are a future task, so entitlement is expressed as a role
 * check for now. Every account that is not already a paid or administrative
 * role is the free tier and carries the `[©️ Smuve Jeff Presents]` watermark.
 * When billing lands, only this resolver needs to change.
 */

export const FREE_TIER_WATERMARK_LABEL = "©️ Smuve Jeff Presents";

export type WatermarkTier = "free" | "paid" | "admin";

export interface WatermarkPolicy {
  tier: WatermarkTier;
  watermarkRequired: boolean;
  label: string;
  /**
   * Where a future paid product may provide an optional attribution. It is
   * not used to remove the free-tier watermark automatically.
   */
  attributionRequired: boolean;
}

const PAID_ROLES = new Set([
  "paid",
  "paying",
  "premium",
  "pro",
  "professional",
  "enterprise",
  "studio",
]);

const ADMIN_ROLE = "admin";

function normalizeRole(role: string | null | undefined): string {
  return role?.trim().toLowerCase() ?? "";
}

/**
 * Resolve the watermark policy for an authenticated account role.
 *
 * Unknown roles default to free: a future entitlement must be explicit, not
 * inferred from an unfamiliar role string.
 */
export function watermarkPolicyForRole(
  role: string | null | undefined,
): WatermarkPolicy {
  const normalizedRole = normalizeRole(role);
  const isAdmin = normalizedRole === ADMIN_ROLE;
  const isPaid = isAdmin || PAID_ROLES.has(normalizedRole);

  return {
    tier: isAdmin ? "admin" : isPaid ? "paid" : "free",
    watermarkRequired: !isPaid,
    label: FREE_TIER_WATERMARK_LABEL,
    attributionRequired: false,
  };
}
