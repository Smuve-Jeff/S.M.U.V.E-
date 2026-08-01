/**
 * Sprint D2 — Session Replay + Project Version History types.
 *
 * A session is a per-project graph of branches × checkpoints. Each
 * checkpoint is either a full snapshot or a delta patch relative to
 * the previous checkpoint in the same branch. Branches fork from an
 * arbitrary checkpoint and own their own head pointer.
 */

/** Compact representation of one field-level delta. */
export interface DiffPatch {
  field: string;
  value: unknown;
}

/** Symmetric before/after entry used by the timeline diff preview. */
export interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * A single checkpoint in the session graph. `payload` is either a
 * full snapshot (Record<string, unknown>) when `isFullSnapshot` is
 * true, or a DiffPatch[] when false.
 */
export interface SessionCheckpoint {
  id: string;
  projectId: string;
  branchId: string;
  parentId: string | null;
  hash: string;
  label: string;
  isFullSnapshot: boolean;
  payload: Record<string, unknown> | DiffPatch[];
  at: number;
}

/**
 * A named fork on the session graph. Branches share global checkpoint
 * ids but own their own head pointer so they can diverge without
 * affecting other branches.
 */
export interface SessionBranch {
  id: string;
  projectId: string;
  name: string;
  /** The checkpoint from which this branch was forked. */
  forkFromCheckpointId: string | null;
  headCheckpointId: string | null;
  createdAt: number;
}

/**
 * Ordered list of checkpoints in a single branch — oldest first.
 * Drives UI timelines and replay events.
 */
export interface BranchLineage {
  branchId: string;
  checkpoints: SessionCheckpoint[];
}

/**
 * Rewind request shape. UI calls rewind(branchId, targetId) which
 * returns the reconstructed state payload.
 */
export interface RewindRequest {
  branchId: string;
  targetCheckpointId: string;
}

/** Reconstructed state payload returned from rewind() / materialize(). */
export interface SessionRestore {
  projectId: string;
  branchId: string;
  checkpointId: string;
  payload: Record<string, unknown>;
}

/** Single event the timeline scrubber consumes during replay. */
export interface ReplayEvent {
  checkpointId: string;
  index: number;
  total: number;
  payload: Record<string, unknown>;
  label: string;
}
