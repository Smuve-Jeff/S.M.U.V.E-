import { reportUnwritableStore } from './storage-notice';

export type StoreBackend = 'localStorage' | 'sessionStorage';

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
