import { reportUnwritableStore } from './storage-notice';

export type StoreBackend = 'localStorage' | 'sessionStorage';

/**
 * Artist-facing names for the keys that hold their data. The key itself is a
 * poor thing to put in a toast, and "Saved app data" is worse than naming the
 * thing that failed.
 */
const KEY_LABELS: [RegExp, string][] = [
  [/^smuve_cowrite/, 'Your co-write projects'],
  [/^smuve_store_/, 'Your storefront data'],
  [/^smuve_plugins_/, 'Your plugin setup'],
  [/^smuve_plugin_params/, 'Your plugin settings'],
  [/^smuve_sample_packs/, 'Your installed sample packs'],
  [/^smuve_fx_insert_presets/, 'Your saved insert presets'],
  [/^smuve_wasm_insert_presets/, 'Your saved plugin presets'],
  [/^smuve_game_ratings/, 'Your game ratings'],
  [/^smuve_daily_mission/, 'Your daily missions'],
  [/^smuve_action_ledger/, 'Full Control history'],
  [/^smuve_session_continuity/, 'Where you left off'],
  [/^smuve\.profile\.revision/, 'Your profile revision history'],
  [/^smuve_planned_date/, 'Your planned-date history'],
  [/^smuve_auth_session|^smuve_token/, 'Your sign-in'],
  [/^smuve_user_|^smuve_verification_/, 'Your account data'],
  [/^smuve_onboarding|^smuve_tour/, 'Your onboarding progress'],
  [/^smuve\.casefile/, "S.M.U.V.E.'s case file"],
  [/^smuve\.cinema\.viewer-health/, 'Your viewer-health overrides'],
  [/^smuve_session_|^smuve_chat/, 'Your saved replies'],
];

/** Best available name for a stored key. */
export function storeLabel(key: string): string {
  for (const [pattern, label] of KEY_LABELS) {
    if (pattern.test(key)) return label;
  }
  return 'Saved app data';
}

function resolve(storage: StoreBackend): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return (window as unknown as Record<string, Storage | undefined>)[
      storage
    ] ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes one JSON store and reports the failure instead of swallowing it.
 *
 * The read side already distinguishes "unreadable" from "empty"; this is the
 * matching write side. Callers keep their in-memory state regardless of the
 * result, so a full or blocked device costs persistence, never the session.
 * Returns whether the value reached storage.
 */
export function writeJsonStore(
  store: string,
  key: string,
  value: unknown,
  storage: StoreBackend = 'localStorage'
): boolean {
  const target = resolve(storage);
  if (!target) {
    reportUnwritableStore(store, null);
    return false;
  }
  try {
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    reportUnwritableStore(store, error);
    return false;
  }
}

/**
 * Persists a JSON value under its own key, deriving the artist-facing label
 * from the key. The short form every quiet write site can adopt.
 */
export function saveJson(
  key: string,
  value: unknown,
  storage: StoreBackend = 'localStorage'
): boolean {
  return writeJsonStore(storeLabel(key), key, value, storage);
}

/** Persists a plain string value (flags, ids, tokens), reporting failures. */
export function saveString(
  key: string,
  value: unknown,
  storage: StoreBackend = 'localStorage'
): boolean {
  const target = resolve(storage);
  if (!target) {
    reportUnwritableStore(storeLabel(key), null);
    return false;
  }
  try {
    target.setItem(key, String(value));
    return true;
  } catch (error) {
    reportUnwritableStore(storeLabel(key), error);
    return false;
  }
}

/** Removes one store, reporting a blocked removal the same way a write is. */
export function deleteSaved(
  key: string,
  storage: StoreBackend = 'localStorage'
): boolean {
  return removeStore(storeLabel(key), key, storage);
}

/** Removes one store, reporting a blocked removal the same way a write is. */
export function removeStore(
  store: string,
  key: string,
  storage: StoreBackend = 'localStorage'
): boolean {
  const target = resolve(storage);
  if (!target) {
    reportUnwritableStore(store, null);
    return false;
  }
  try {
    target.removeItem(key);
    return true;
  } catch (error) {
    reportUnwritableStore(store, error);
    return false;
  }
}
