import {
  GraphEdge,
  GraphNode,
  SessionGraph,
} from '../types/session-graph.types';
import {
  SessionBranch,
  SessionCheckpoint,
} from '../types/session-history.types';
import { MERGE_SENTINEL } from '../types/merge.types';

export const GRAPH_LANE_W = 96;
export const GRAPH_ROW_H = 56;
export const GRAPH_PAD_X = 20;
export const GRAPH_PAD_Y = 28;

/**
 * Sprint D4 — layoutSessionGraph.
 *
 * Pure, deterministic layout of a project's checkpoint graph into a
 * git-log-style lane × row grid:
 *
 *   • One lane per branch, assigned in branch-creation order.
 *   • One row per checkpoint, assigned in global chronological order
 *     (so edits across branches interleave on the y axis like git log).
 *   • linear edges chain consecutive checkpoints within a branch.
 *   • fork edges connect the forkFromCheckpointId ancestor to the
 *     first checkpoint of each derived branch.
 *   • merge edges connect the merge provenance heads (mine = target
 *     head, theirs = source head) into any MERGE_SENTINEL checkpoint.
 *   • cherry edges connect the provenance source into cherry-pick
 *     conflict checkpoints (labelled 'cherry-pick').
 *
 * Input is plain data — no Angular imports — so the layout is unit
 * testable in isolation.
 */
export function layoutSessionGraph(
  projectId: string,
  branches: SessionBranch[],
  checkpointsByBranch: Record<string, SessionCheckpoint[]>
): SessionGraph {
  // 1. Assign lanes in branch creation order.
  const lanes: Record<string, number> = {};
  const branchNames: Record<string, string> = {};
  branches.forEach((b, i) => {
    lanes[b.id] = i;
    branchNames[b.id] = b.name;
  });

  // 2. Dedup + collect every checkpoint across all branches.
  const seen = new Set<string>();
  const allCps: SessionCheckpoint[] = [];
  for (const branch of branches) {
    const list = checkpointsByBranch[branch.id] ?? [];
    for (const cp of list) {
      if (seen.has(cp.id)) continue;
      seen.add(cp.id);
      allCps.push(cp);
    }
  }
  allCps.sort((a, b) => a.at - b.at);

  // 3. Row assignment (chronological index) + node build.
  const nodes: GraphNode[] = [];
  const rowByCpId = new Map<string, number>();
  allCps.forEach((cp, row) => {
    rowByCpId.set(cp.id, row);
    nodes.push({
      checkpointId: cp.id,
      branchId: cp.branchId,
      branchName: branchNames[cp.branchId] ?? cp.branchId,
      label: cp.label,
      isFullSnapshot: cp.isFullSnapshot,
      isMergeNode: isMergePayload(cp.payload),
      lane: lanes[cp.branchId] ?? 0,
      row,
      parentId: cp.parentId,
    });
  });

  // 4. Edges.
  const edges: GraphEdge[] = [];
  const linearSeen = new Set<string>();
  for (const branch of branches) {
    const list = (checkpointsByBranch[branch.id] ?? [])
      .slice()
      .sort((a, b) => a.at - b.at);
    for (let i = 1; i < list.length; i++) {
      const key = `${list[i - 1].id}→${list[i].id}`;
      if (linearSeen.has(key)) continue;
      linearSeen.add(key);
      edges.push({ fromId: list[i - 1].id, toId: list[i].id, kind: 'linear' });
    }
    // Fork edge: ancestor → first cp of this derived branch.
    const first = list[0];
    if (first && branch.forkFromCheckpointId && branch.forkFromCheckpointId !== first.id) {
      const hasFork = edges.some(
        (e) => e.kind === 'fork' && e.toId === first.id
      );
      if (!hasFork && rowByCpId.has(branch.forkFromCheckpointId)) {
        edges.push({
          fromId: branch.forkFromCheckpointId,
          toId: first.id,
          kind: 'fork',
        });
      }
    }
  }

  // 5. Merge + cherry edges from provenance inside merge payloads.
  for (const cp of allCps) {
    if (!isMergePayload(cp.payload)) continue;
    const p = cp.payload as Record<string, unknown>;
    const mine = p['mineCheckpointId'] as string | undefined;
    const theirs = p['theirsCheckpointId'] as string | undefined;
    if (mine && mine !== cp.id && rowByCpId.has(mine)) {
      edges.push({ fromId: mine, toId: cp.id, kind: 'merge' });
    }
    if (theirs && theirs !== cp.id && rowByCpId.has(theirs)) {
      const kind: GraphEdge['kind'] = cp.label.startsWith('cherry-pick')
        ? 'cherry'
        : 'merge';
      edges.push({ fromId: theirs, toId: cp.id, kind });
    }
  }

  return { projectId, nodes, edges, lanes, branchNames };
}

/** Check whether a checkpoint payload carries the merge sentinel. */
export function isMergePayload(
  payload: unknown
): payload is Record<string, unknown> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>)[MERGE_SENTINEL] === true
  );
}

/** Convert a SessionGraph into SVG viewBox coordinates helpers. */
export function graphDimensions(graph: SessionGraph): {
  width: number;
  height: number;
  nodeX: (node: GraphNode) => number;
  nodeY: (node: GraphNode) => number;
} {
  const laneCount = Math.max(1, Object.keys(graph.lanes).length);
  const rowCount = Math.max(1, graph.nodes.length);
  const width = GRAPH_PAD_X * 2 + laneCount * GRAPH_LANE_W;
  const height = GRAPH_PAD_Y * 2 + rowCount * GRAPH_ROW_H;
  const nodeX = (node: GraphNode) =>
    GRAPH_PAD_X + node.lane * GRAPH_LANE_W + GRAPH_LANE_W / 2;
  const nodeY = (node: GraphNode) =>
    GRAPH_PAD_Y + node.row * GRAPH_ROW_H;
  return { width, height, nodeX, nodeY };
}
