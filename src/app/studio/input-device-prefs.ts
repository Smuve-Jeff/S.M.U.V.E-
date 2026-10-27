/**
 * The studio remembers which input the artist picked.
 *
 * Device ids are origin-scoped and vanish with the hardware, so a stored id is
 * a *preference*, not a reference: it is only applied while a matching device is
 * actually present, and it is kept when that device disappears so plugging the
 * interface back in restores the choice instead of silently resetting it.
 *
 * The preference is studio-wide rather than recorder-only. The recorder, the
 * vocal chain and every take capture path (smart recording, comp takes,
 * performance capture) open the same input through these helpers; a USB
 * interface picked in one surface must not leave another recording from the
 * laptop's built-in microphone.
 *
 * The two pure rules (trim/ignore garbage, never select an absent device) can be
 * pinned without a microphone; the storage and enumeration wrappers below are
 * guarded so a locked store or a browser without `enumerateDevices` degrades to
 * the system default instead of throwing.
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

/** The remembered input, or null when none is stored / storage is locked. */
export function readPreferredInputDeviceId(): string | null {
  try {
    return readStoredInputDeviceId(localStorage.getItem(INPUT_DEVICE_KEY));
  } catch {
    return null; // private mode / locked storage
  }
}

/** Remember the pick, or clear it (null) for "system default". */
export function rememberPreferredInputDevice(deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(INPUT_DEVICE_KEY, deviceId);
    else localStorage.removeItem(INPUT_DEVICE_KEY);
  } catch {
    // The choice still applies for this session.
  }
}

/**
 * The remembered input while it is still connected, which is the id every
 * capture path should open.
 *
 * Null means "system default": either nothing was chosen, the interface has
 * been unplugged, or this browser cannot enumerate inputs (so the stored id
 * cannot be validated before constraining `getUserMedia`).
 */
export async function preferredConnectedInputDeviceId(): Promise<string | null> {
  const stored = readPreferredInputDeviceId();
  if (!stored) return null;
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return null;
  }

  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "audioinput")
      .map((device) => device.deviceId);
    return resolveInputDeviceId(stored, inputs);
  } catch {
    return null;
  }
}
