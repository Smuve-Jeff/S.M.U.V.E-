/**
 * S.M.U.V.E. 2.0 — On-Device ML Web Worker Factory
 *
 * Extracted from `stem-separation.service.ts` so Angular's esbuild can still
 * see the `new Worker(new URL(..., import.meta.url))` AST pattern (required
 * for bundling the worker as a separate chunk in production), while Jest's
 * CommonJS-transpile path _never_ touches `import.meta.url`.
 *
 * Jest maps this module to `ml-worker-factory.mock.ts` via moduleNameMapper.
 */
export function createMlWorker(): Worker {
  return new Worker(
    new URL('../workers/stem-separation.worker', import.meta.url),
    { type: 'module' },
  );
}
