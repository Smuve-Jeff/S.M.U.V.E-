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

/** Subscribe to unreadable-store notices. Returns the unsubscribe function. */
export function onStorageNotice(listener: StorageNoticeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Report that `store` could not be read, at most once per session so one
 * broken record cannot spam the artist on every save.
 */
export function reportUnreadableStore(store: string): void {
  if (reported.has(store)) return;
  reported.add(store);
  const message = `${store} could not be read on this device. Changes made now will not be saved.`;
  for (const listener of listeners) listener(message);
}

/** Test helper: forget which stores have already been reported. */
export function resetStorageNotices(): void {
  reported.clear();
}
