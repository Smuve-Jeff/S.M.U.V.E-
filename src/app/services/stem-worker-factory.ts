/**
 * S.M.U.V.E. 2.0 — Stem worker factory.
 *
 * Kept in its own module so Angular's esbuild can see the
 * `new Worker(new URL(..., import.meta.url))` pattern and emit the worker as a
 * separate chunk. Jest maps this module to `stem-worker-factory.mock.ts`
 * because its CommonJS transform cannot parse `import.meta.url`.
 */
export function createStemWorker(): Worker {
  return new Worker(new URL("../workers/stem-dsp.worker", import.meta.url), {
    type: "module",
  });
}
