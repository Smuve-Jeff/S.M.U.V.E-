const DAY_MS = 86_400_000;

export interface ReleaseDateMismatch {
  planned: string;
  catalogue: string;
  plannedAt: number;
  catalogueAt: number;
}

/**
 * True only when `value` names a real YYYY-MM-DD calendar day. A regex alone
 * accepts dates like 2026-02-31, which JavaScript silently rolls into March.
 */
export function isCalendarDay(value: string | null | undefined): boolean {
  const date = (value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Reads a release day from either a date-only value or a full timestamp.
 * Date-only values must be real calendar days; impossible dates return null
 * rather than being rolled forward by the Date parser.
 */
export function parseReleaseDay(
  value: string | null | undefined
): number | null {
  const date = (value || '').trim();
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return isCalendarDay(date) ? Date.parse(`${date}T00:00:00.000Z`) : null;
  }
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : null;
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

  const plannedAt = parseReleaseDay(plannedDate);
  const catalogueAt = parseReleaseDay(catalogueDate);
  if (plannedAt === null || catalogueAt === null) {
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
