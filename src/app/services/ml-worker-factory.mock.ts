/**
 * Jest mock for `ml-worker-factory` — Jest auto-loaded via `moduleNameMapper`.
 * Returns a fake Worker that accepts postMessage/terminate so production code
 * paths that touch the worker (e.g. cancel signals) execute without crashing.
 */
export function createMlWorker(): unknown {
  return {
    postMessage: () => undefined,
    terminate: () => undefined,
    onmessage: null,
    onerror: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  };
}
