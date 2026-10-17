import {
  graphDimensions,
  layoutSessionGraph,
} from './session-graph.util';
import {
  SessionBranch,
  SessionCheckpoint,
} from '../types/session-history.types';
import { MERGE_SENTINEL } from '../types/merge.types';

function cp(
  id: string,
  branchId: string,
  at: number,
  partial: Partial<SessionCheckpoint> = {}
): SessionCheckpoint {
  return {
    id,
    projectId: 'proj',
    branchId,
    parentId: null,
    hash: id,
    label: id,
    isFullSnapshot: true,
    payload: { tempo: 100 },
    at,
    ...partial,
  };
}

function branch(id: string, name: string, fork?: string): SessionBranch {
  return {
    id,
    projectId: 'proj',
    name,
    forkFromCheckpointId: fork ?? null,
    headCheckpointId: null,
    createdAt: 0,
  };
}

describe('layoutSessionGraph (D4)', () => {
  it('assigns lanes in branch creation order', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'experiment');
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 1)],
      alt: [cp('c2', 'alt', 2)],
    });
    expect(graph.lanes['main']).toBe(0);
    expect(graph.lanes['alt']).toBe(1);
    expect(graph.branchNames['alt']).toBe('experiment');
  });

  it('orders rows chronologically across all branches', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'alt');
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 100), cp('c3', 'main', 300)],
      alt: [cp('c2', 'alt', 200)],
    });
    const rows = graph.nodes.map((n) => n.row);
    expect(rows).toEqual([0, 1, 2]);
    expect(graph.nodes.find((n) => n.checkpointId === 'c2')?.row).toBe(1);
  });

  it('chains consecutive checkpoints within a branch as linear edges', () => {
    const main = branch('main', 'main');
    const graph = layoutSessionGraph('proj', [main], {
      main: [cp('c1', 'main', 1), cp('c2', 'main', 2), cp('c3', 'main', 3)],
    });
    const linear = graph.edges.filter((e) => e.kind === 'linear');
    expect(linear.length).toBe(2);
    expect(linear[0]).toMatchObject({ fromId: 'c1', toId: 'c2' });
    expect(linear[1]).toMatchObject({ fromId: 'c2', toId: 'c3' });
  });

  it('draws a fork edge from the ancestor to the derived branch first cp', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'alt', 'c1');
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 1), cp('c2', 'main', 2)],
      alt: [cp('c3', 'alt', 3)],
    });
    const fork = graph.edges.find((e) => e.kind === 'fork');
    expect(fork).toMatchObject({ fromId: 'c1', toId: 'c3' });
  });

  it('draws a merge edge from the theirs head into a merge checkpoint', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'alt', 'c1');
    const mergeCp = cp('c4', 'main', 4, {
      label: 'merge alt → main',
      payload: {
        [MERGE_SENTINEL]: true,
        auto: {},
        conflicts: {},
        baseCheckpointId: 'c1',
        mineCheckpointId: 'c2',
        theirsCheckpointId: 'c3',
        targetBranchId: 'main',
        sourceBranchId: 'alt',
      },
    });
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 1), cp('c2', 'main', 2), mergeCp],
      alt: [cp('c3', 'alt', 3)],
    });
    const merges = graph.edges.filter((e) => e.kind === 'merge');
    expect(merges.length).toBe(2); // mine c2 + theirs c3
    expect(merges.some((e) => e.fromId === 'c3' && e.toId === 'c4')).toBe(true);
    expect(merges.some((e) => e.fromId === 'c2' && e.toId === 'c4')).toBe(true);
    const node = graph.nodes.find((n) => n.checkpointId === 'c4');
    expect(node?.isMergeNode).toBe(true);
  });

  it('uses cherry edge kind for cherry-pick conflict checkpoints', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'alt', 'c1');
    const cherryCp = cp('c4', 'main', 4, {
      label: 'cherry-pick c3abc123',
      payload: {
        [MERGE_SENTINEL]: true,
        auto: {},
        conflicts: {},
        baseCheckpointId: 'c1',
        mineCheckpointId: 'c2',
        theirsCheckpointId: 'c3',
        targetBranchId: 'main',
        sourceBranchId: 'alt',
      },
    });
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 1), cp('c2', 'main', 2), cherryCp],
      alt: [cp('c3', 'alt', 3)],
    });
    const cherry = graph.edges.find((e) => e.kind === 'cherry');
    expect(cherry).toMatchObject({ fromId: 'c3', toId: 'c4' });
  });

  it('dedupes checkpoint ids that appear on multiple branches', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'alt', 'c1');
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 1), cp('c2', 'main', 2)],
      alt: [cp('c1', 'alt', 1), cp('c3', 'alt', 3)],
    });
    const c1s = graph.nodes.filter((n) => n.checkpointId === 'c1');
    expect(c1s.length).toBe(1);
    expect(graph.nodes.length).toBe(3);
  });

  it('produces viewBox dimensions scaled to lanes + rows', () => {
    const main = branch('main', 'main');
    const alt = branch('alt', 'alt');
    const graph = layoutSessionGraph('proj', [main, alt], {
      main: [cp('c1', 'main', 1), cp('c2', 'main', 2)],
      alt: [cp('c3', 'alt', 3)],
    });
    const dim = graphDimensions(graph);
    expect(dim.width).toBeGreaterThan(2 * 96);
    expect(dim.height).toBeGreaterThan(3 * 56);
    const c1 = graph.nodes[0];
    expect(dim.nodeX(c1)).toBeGreaterThan(0);
    expect(dim.nodeY(c1)).toBeGreaterThan(0);
  });
});
