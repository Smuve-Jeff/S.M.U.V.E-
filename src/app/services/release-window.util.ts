const DAY_MS = 86_400_000;

export interface ReleaseDateMismatch {
  planned: string;
  catalogue: string;
  plannedAt: number;
  catalogueAt: number;
}

/**
 * Finds a real disagreement between the artist's planned date and the
 * distributor-facing catalogue date. Both values must be readable, and they
 * must fall on different UTC calendar days. A timestamp and a date-only value
 * for the same day agree; an absent or unreadable date is not a mismatch.
 */
export function findReleaseDateMismatch(
  planned: string | null | undefined,
  catalogue: string | null | undefined
): ReleaseDateMismatch | null {
  const plannedDate = (planned || '').trim();
  const catalogueDate = (catalogue || '').trim();
  if (!plannedDate || !catalogueDate) return null;

  const plannedAt = Date.parse(plannedDate);
  const catalogueAt = Date.parse(catalogueDate);
  if (!Number.isFinite(plannedAt) || !Number.isFinite(catalogueAt)) {
    return null;
  }
  if (Math.floor(plannedAt / DAY_MS) === Math.floor(catalogueAt / DAY_MS)) {
    return null;
  }

  return {
    planned: plannedDate,
    catalogue: catalogueDate,
    plannedAt,
    catalogueAt,
  };
}

export function releaseDateMismatchMessage(
  mismatch: ReleaseDateMismatch
): string {
  return `The planned date ${mismatch.planned} differs from the catalogue date ${mismatch.catalogue}. Reconcile the two before delivery.`;
}
