/** Input trim bounds and dB→linear conversion for the recorder preamp stage. */
export const INPUT_TRIM_MIN_DB = -24;
export const INPUT_TRIM_MAX_DB = 24;

export function clampInputTrimDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    INPUT_TRIM_MIN_DB,
    Math.min(INPUT_TRIM_MAX_DB, Math.round(value)),
  );
}

export function inputTrimGain(db: number): number {
  return Math.pow(10, clampInputTrimDb(db) / 20);
}

/** Per-device trims, so switching interfaces never reuses the wrong gain. */
export const INPUT_TRIM_BY_DEVICE_KEY = "smuve_studio_input_trim_by_device";
export const DEFAULT_INPUT_TRIM_KEY = "__default__";

function trimStorageKey(deviceId: string | null): string {
  const id = deviceId?.trim();
  return id ? id : DEFAULT_INPUT_TRIM_KEY;
}

/** Parse a stored device→trim map, dropping corrupt or out-of-range entries. */
export function readStoredInputTrimMap(
  raw: string | null | undefined,
): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const map: Record<string, number> = {};
    for (const [deviceId, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        map[deviceId] = clampInputTrimDb(value);
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** The trim remembered for one input (null is the system default). */
export function readStoredInputTrimForDevice(
  raw: string | null | undefined,
  deviceId: string | null,
): number {
  return readStoredInputTrimMap(raw)[trimStorageKey(deviceId)] ?? 0;
}

/** The persisted trim for this device, or 0 dB when none was stored. */
export function readInputTrimDbForDevice(deviceId: string | null): number {
  try {
    return readStoredInputTrimForDevice(
      localStorage.getItem(INPUT_TRIM_BY_DEVICE_KEY),
      deviceId,
    );
  } catch {
    return 0;
  }
}

/** Remember this device's trim; 0 dB removes the entry instead of storing it. */
export function rememberInputTrimDbForDevice(
  deviceId: string | null,
  db: number,
): void {
  const key = trimStorageKey(deviceId);
  const value = clampInputTrimDb(db);
  try {
    const map = readStoredInputTrimMap(
      localStorage.getItem(INPUT_TRIM_BY_DEVICE_KEY),
    );
    if (value === 0) delete map[key];
    else map[key] = value;

    if (Object.keys(map).length === 0) {
      localStorage.removeItem(INPUT_TRIM_BY_DEVICE_KEY);
    } else {
      localStorage.setItem(INPUT_TRIM_BY_DEVICE_KEY, JSON.stringify(map));
    }
  } catch {
    // Keep the in-memory trim when storage is unavailable.
  }
}
