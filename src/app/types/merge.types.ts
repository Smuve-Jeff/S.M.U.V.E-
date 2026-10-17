/**
 * Sprint D3 — Branching & Merge types.
 *
 * Adds three-way merge, conflict markers, rebase plans, and
 * cherry-pick shapes to the per-project checkpoint graph that
 * SessionHistoryService authors.
 */

/** Single field conflict that the user must resolve manually. */
export interface ConflictMarker {
  field: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
}

/** User's resolution for one conflict marker. */
export interface ConflictResolution {
  field: string;
  pick: 'mine' | 'theirs' | 'custom';
  value?: unknown;
}

/** Request to merge a source branch into a target branch. */
export interface MergeRequest {
  projectId: string;
  sourceBranchId: string;
  targetBranchId: string;
}

/**
 * Outcome of threeWayMerge. Status 'clean' means every conflict
 * auto-resolved; 'conflicts' means at least one ConflictMarker is
 * waiting on the user.
 */
export interface MergeResult {
  projectId: string;
  status: 'clean' | 'conflicts';
  mergeCheckpointId: string;
  autoResolved: Record<string, unknown>;
  conflicts: ConflictMarker[];
}

/** Request that consumes a pending merge by submitting resolutions. */
export interface ResolveRequest {
  projectId: string;
  mergeCheckpointId: string;
  resolutions: ConflictResolution[];
}

/** Recorded rebase plan — every source checkpoint that was replayed. */
export interface RebasePlan {
  projectId: string;
  sourceBranchId: string;
  ontoBranchId: string;
  replayedCheckpointIds: string[];
  newCheckpointIds: string[];
}

/**
 * Cherry-pick a single checkpoint from one branch onto another.
 * Returns status='conflicts' if the target already moved the same
 * field the source mutated.
 */
export interface CherryPickRequest {
  projectId: string;
  sourceBranchId: string;
  sourceCheckpointId: string;
  ontoBranchId: string;
}

export interface CherryPickResult {
  projectId: string;
  status: 'clean' | 'conflict';
  newCheckpointId: string;
  conflicts: ConflictMarker[];
}

/** Sentinel payload field naming a checkpoint as a merge node. */
export const MERGE_SENTINEL = '__merge__' as const;

/**
 * Shape of the payload on a merge-bearing checkpoint. `auto` holds
 * fields that resolved without conflict; `conflicts` holds the raw
 * markers waiting on a resolve() call.
 */
export interface MergeCheckpointPayload extends Record<string, unknown> {
  [MERGE_SENTINEL]: true;
  auto: Record<string, unknown>;
  conflicts: Record<string, ConflictMarker>;
  /** Provenance fields for the merge. */
  baseCheckpointId: string;
  mineCheckpointId: string;
  theirsCheckpointId: string;
  targetBranchId: string;
  sourceBranchId: string;
}
