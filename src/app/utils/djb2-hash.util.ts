/**
 * djb2 string hash. Tiny deterministic fingerprint used by the session
 * history service to dedup checkpoints whose canonicalized payload is
 * identical. Returns a 32-bit unsigned int as a lowercase hex string.
 *
 * djb2 is good enough for content-fingerprinting local snapshots
 * (collision probability ≈ 1 in 4 billion per million checkpoints).
 * Not suitable for cryptographic use.
 */
export function djb2Hash(input: string | null | undefined): string {
  if (!input) return '0';
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    // hash * 33 + char, kept as a 32-bit unsigned int via bit ops.
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  // Force unsigned.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical JSON serializer: sorts object keys at every depth so that
 * `{a:1,b:2}` and `{b:2,a:1}` produce the same byte sequence, which
 * means the same djb2 hash, which means dedup catches structural
 * rearrangements that don't change meaning.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k])
  );
  return '{' + parts.join(',') + '}';
}
