import { DiffEntry, DiffPatch } from '../types/session-history.types';

/**
 * Shallow top-level key diff between two plain-object shapes. Cheaper
 * than a deep walk and good enough for project-level checkpoints where
 * most edits are top-level field mutations (tempo, key, gain values,
 * section headers, etc.). Returns DiffEntry[] ordered by field name.
 */
export function diffShallow(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): DiffEntry[] {
  if (!before && !after) return [];
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const out: DiffEntry[] = [];
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor') continue;
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (!shallowEqual(av, bv)) {
      out.push({ field: key, before: av, after: bv });
    }
  }
  out.sort((x, y) => x.field.localeCompare(y.field));
  return out;
}

/**
 * Apply a list of DiffPatch entries on top of a base shape. Returns a
 * new copy — never mutates the input. Safe for use during rewind.
 */
export function applyPatches<T extends Record<string, unknown>>(
  base: T,
  patches: DiffPatch[] | unknown
): T {
  if (!Array.isArray(patches)) {
    // Full snapshot payload case — caller can short-circuit and just
    // return `patches` as-is.
    return patches as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const patch of patches) {
    if (patch && typeof patch === 'object' && 'field' in patch) {
      out[(patch as DiffPatch).field] = (patch as DiffPatch).value;
    }
  }
  return out as T;
}

/**
 * Reconstruct a historical state by applying patches starting from
 * the nearest full snapshot at or before targetId, ending with the
 * patches through targetId. Handles the mixed-snapshot-delta stream.
 */
export function materialize(
  orderedCheckpoints: Array<{
    id: string;
    isFullSnapshot: boolean;
    payload: Record<string, unknown> | DiffPatch[];
  }>,
  targetId: string
): Record<string, unknown> | null {
  let baseline: Record<string, unknown> | null = null;
  for (const cp of orderedCheckpoints) {
    if (cp.isFullSnapshot) {
      baseline = cp.payload as Record<string, unknown>;
    } else if (baseline) {
      baseline = applyPatches(baseline, cp.payload);
    }
    if (cp.id === targetId) return baseline;
  }
  return baseline;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
