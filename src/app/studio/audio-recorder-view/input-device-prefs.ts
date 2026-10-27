/**
 * The recorder remembers which input the artist picked.
 *
 * Device ids are origin-scoped and vanish with the hardware, so a stored id is
 * a *preference*, not a reference: it is only applied while a matching device is
 * actually present, and it is kept when that device disappears so plugging the
 * interface back in restores the choice instead of silently resetting it.
 *
 * Pure so the two rules (trim/ignore garbage, never select an absent device)
 * can be pinned without a microphone.
 */
export const INPUT_DEVICE_KEY = "smuve_studio_input_device";

/** The stored id, or null for "system default" / nothing usable stored. */
export function readStoredInputDeviceId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The id to select now: the stored one when it is still connected, otherwise
 * null (the system default). Never returns an id the browser did not enumerate —
 * an `{ exact: … }` constraint on an absent device rejects with
 * `OverconstrainedError`, which reads to the artist as "no microphone found".
 */
export function resolveInputDeviceId(
  stored: string | null,
  availableIds: readonly string[],
): string | null {
  if (!stored) return null;
  return availableIds.includes(stored) ? stored : null;
}
