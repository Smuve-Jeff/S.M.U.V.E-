/**
 * Sprint D4 — Merge graph visualization types.
 *
 * Pure layout output consumed by the SVG renderer inside the
 * SessionTimelineComponent. The layout function
 * (src/app/utils/session-graph.util.ts) turns branches + checkpoints
 * into a git-log-style coordinate grid.
 */

/** A single rendered node on the graph. */
export interface GraphNode {
  checkpointId: string;
  branchId: string;
  branchName: string;
  label: string;
  isFullSnapshot: boolean;
  isMergeNode: boolean;
  /** Lane index (x axis) — 0-based branch column. */
  lane: number;
  /** Row index (y axis) — chronological order across ALL branches. */
  row: number;
  parentId: string | null;
}

/** Connector kind that drives the SVG stroke style. */
export type GraphEdgeKind = 'linear' | 'fork' | 'merge' | 'cherry';

export interface GraphEdge {
  fromId: string;
  toId: string;
  kind: GraphEdgeKind;
}

/**
 * Complete graph for one project. `nodes` are positioned in a
 * lane × row grid; `edges` connect checkpoint ids.
 */
export interface SessionGraph {
  projectId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Branch id → lane index, in creation order. */
  lanes: Record<string, number>;
  /** Branch id → display name, for the lane headers. */
  branchNames: Record<string, string>;
}
