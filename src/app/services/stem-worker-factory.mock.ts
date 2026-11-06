/**
 * Jest mapping target for `stem-worker-factory`.
 *
 * Constructing a real Worker here would fail in JSDOM, and the service already
 * falls back to main-thread separation, so tests exercise that path.
 */
export function createStemWorker(): Worker {
  throw new Error("Web Worker is unavailable in tests");
}
