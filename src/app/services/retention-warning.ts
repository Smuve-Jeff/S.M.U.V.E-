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

/**
 * True once the sweeper's deadline has passed. A show with no deadline (a relay
 * that keeps everything) is never dropped by the clock alone.
 */
export function isSwept(
  expiresAt: string | null | undefined,
  now: number,
): boolean {
  const until = new Date(String(expiresAt ?? ''));
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() <= now;
}

/**
 * How one recording is addressed across reloads. A show is the relay session,
 * so every segment of it shares the key even as the API's first-segment name
 * changes when the oldest segment is swept.
 */
export const recordingKey = (row: { relayId: string; name: string }): string =>
  `${row.relayId}`;

/**
 * Keep a row this panel already watched expire off the list, even when the
 * relay's own sweep has not run yet and its list still contains it.
 *
 * A locally swept key is forgotten as soon as the relay stops listing it, so the
 * set tracks the gap between the deadline and the sweep instead of growing.
 */
export function reconcileSweptRows<T extends { relayId: string; name: string }>(
  rows: T[],
  locallySwept: ReadonlySet<string>,
): { rows: T[]; swept: Set<string> } {
  const listed = new Set(rows.map(recordingKey));
  const swept = new Set(
    [...locallySwept].filter((key) => listed.has(key)),
  );
  return {
    rows: rows.filter((row) => !swept.has(recordingKey(row))),
    swept,
  };
}

/**
 * What an empty recordings list should say. A relay that records nothing is the
 * one case worth shouting about: the host is about to broadcast with no chance
 * of keeping the show.
 */
export function recordingsEmptyNote(
  recordingEnabled: boolean | null,
  retentionHours: number | null,
): string {
  if (recordingEnabled === false) {
    return 'RECORDING IS OFF ON THE RELAY — NOTHING FROM A PUSH WILL BE KEPT.';
  }
  if (retentionHours === 0) {
    return 'NO RECORDINGS YET — THIS RELAY KEEPS EVERYTHING IT RECORDS.';
  }
  if (typeof retentionHours === 'number' && retentionHours > 0) {
    return `NO RECORDINGS YET — A FINISHED PUSH IS KEPT HERE FOR ${retentionHours}H.`;
  }
  return 'NO RECORDINGS YET — THEY APPEAR HERE AFTER A FINISHED PUSH.';
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
