/**
 * Engine memory readouts for the Studio diagnostics card.
 *
 * The browser only exposes `performance.memory` in Chromium, so heap usage is
 * reported as nullable rather than guessed. The recorder's resident PCM is
 * measured directly by its bounded capture buffer and is always available.
 */
export interface HeapMemorySnapshot {
  usedBytes: number;
  totalBytes: number;
  limitBytes: number;
}

/** Read Chromium's non-standard heap counters, or null when unavailable. */
export function readHeapMemory(
  source: any = typeof performance !== "undefined" ? performance : null,
): HeapMemorySnapshot | null {
  const memory = source?.memory;
  if (!memory) return null;
  const usedBytes = Number(memory.usedJSHeapSize);
  const totalBytes = Number(memory.totalJSHeapSize);
  const limitBytes = Number(memory.jsHeapSizeLimit);
  if (
    !Number.isFinite(usedBytes) ||
    !Number.isFinite(totalBytes) ||
    !Number.isFinite(limitBytes) ||
    usedBytes < 0 ||
    totalBytes < 0 ||
    limitBytes <= 0
  ) {
    return null;
  }
  return { usedBytes, totalBytes, limitBytes };
}

/** Compact memory label for the metrics grid (MB below 1 GB, GB above). */
export function formatMemoryBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  }
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
