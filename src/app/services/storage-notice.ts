/**
 * Cross-store notice for a store whose saved value could not be read.
 *
 * A failed read is not an empty store: the hardened stores keep their last
 * stored copy and skip writing for the rest of the session. That protection is
 * silent on its own, so every store reports here and the app's notification
 * layer tells the artist once per store. Listening here keeps the read helpers
 * (some of them plain module functions) free of Angular dependencies.
 */
export type StorageNoticeListener = (message: string) => void;

const listeners = new Set<StorageNoticeListener>();
const reported = new Set<string>();
// Stores are read while the app boots, often before a listener exists; a
// boot-time failure must still reach the artist once one subscribes.
const pending: string[] = [];
/** Subscribe to unreadable-store notices. Returns the unsubscribe function. */
export function onStorageNotice(listener: StorageNoticeListener): () => void {
  listeners.add(listener);
  // Flush what was reported before the artist could be told, then clear it so
  // a later listener sees only new reports rather than replays.
  for (const message of pending.splice(0, pending.length)) listener(message);
  return () => {
    listeners.delete(listener);
  };
}

/** Emits once per key, buffering when nobody is listening yet. */
function emit(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  if (listeners.size === 0) {
    pending.push(message);
    return;
  }
  for (const listener of listeners) listener(message);
}

/**
 * Report that `store` could not be read, at most once per session so one
 * broken record cannot spam the artist on every save. Notices reported with
 * no listener yet are buffered for the first one to subscribe.
 */
export function reportUnreadableStore(store: string): void {
  emit(
    `read:${store}`,
    `${store} could not be read on this device. Changes made now will not be saved.`
  );
}

/**
 * True when a write failed because the device is out of room rather than
 * because the browser blocked storage. The two incidents need different
 * advice: one is fixable by freeing space, the other is not fixable by the
 * artist at all.
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/**
 * Report a save the device refused, once per store. Storage being full is not
 * an unreadable record: the data on disk is fine and the session keeps going,
 * but the artist has to know this change did not land.
 */
export function reportUnwritableStore(store: string, error: unknown): void {
  emit(
    `write:${store}`,
    isQuotaExceededError(error)
      ? `${store} could not be saved: this device's storage is full. Free up space and the next change will save.`
      : `${store} could not be saved on this device. This browser is blocking storage for the app.`
  );
}

/** Test helper: forget which stores have been reported and drop the buffer. */
export function resetStorageNotices(): void {
  reported.clear();
  pending.length = 0;
}
