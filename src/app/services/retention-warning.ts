/**
 * Retention wording, kept pure so it can be tested without a component.
 *
 * Both helpers take `now` instead of reading the clock: the panel passes a
 * signal that ticks, which is what makes a badge appear on a page a host left
 * open instead of only on the next refresh.
 */

/** Warn this long before the sweeper takes a show, unless it gets pinned. */
export const EXPIRY_WARNING_HOURS = 6;

const HOUR_MS = 3_600_000;

/** `IN 4H` / `IN 45M` while a show is close to the sweeper, else empty. */
export function expiryLabel(
  expiresAt: string | null | undefined,
  now: number,
  warningHours = EXPIRY_WARNING_HOURS,
): string {
  const until = new Date(String(expiresAt ?? ''));
  if (Number.isNaN(until.getTime())) return '';
  const left = until.getTime() - now;
  if (left <= 0 || left > warningHours * HOUR_MS) return '';
  return left < HOUR_MS
    ? `IN ${Math.max(1, Math.round(left / 60_000))}M`
    : `IN ${Math.round(left / HOUR_MS)}H`;
}

/** `KEPT UNTIL 23 NOV` for a promise that has not run out yet, else empty. */
export function keepLabel(
  keepUntil: string | null | undefined,
  now: number,
): string {
  const until = new Date(String(keepUntil ?? ''));
  if (Number.isNaN(until.getTime()) || until.getTime() <= now) return '';
  const day = until.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
  return `KEPT UNTIL ${day.toUpperCase()}`;
}
