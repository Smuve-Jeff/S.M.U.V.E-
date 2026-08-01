import { TestBed } from '@angular/core/testing';
import { SessionHistoryService } from './session-history.service';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { CloudSyncService } from './cloud-sync.service';

class StubStorage {
  private store = new Map<string, unknown>();
  async getItem(_namespace: string, key: string) {
    return this.store.get(`${_namespace}:${key}`) ?? null;
  }
  async saveItem(namespace: string, key: string, value: unknown) {
    this.store.set(`${namespace}:${key}`, value);
  }
  async deleteItem(_namespace: string, _key: string) {
    return;
  }
  async getAllItems(_namespace: string) {
    const out: unknown[] = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${_namespace}:`)) out.push(v);
    }
    return out;
  }
}

class StubCloud {
  cloudProjects = () => [];
  listSnapshots = () => [];
}

class StubLogger {
  info = (..._args: unknown[]) => undefined;
  warn = (..._args: unknown[]) => undefined;
  error = (..._args: unknown[]) => undefined;
  debug = (..._args: unknown[]) => undefined;
}

describe('SessionHistoryService (D2 + D3)', () => {
  let sut: SessionHistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SessionHistoryService,
        { provide: LocalStorageService, useClass: StubStorage },
        { provide: LoggingService, useClass: StubLogger },
        { provide: CloudSyncService, useClass: StubCloud },
      ],
    });
    sut = TestBed.inject(SessionHistoryService);
  });

  // ─── D2 — Session Replay ──────────────────────────────────────────

  it('auto-creates a main branch on first checkpoint', async () => {
    const cp = await sut.checkpoint('proj-1', 'init', { tempo: 128 });
    expect(cp).not.toBeNull();
    expect(sut.branches('proj-1').length).toBe(1);
    expect(sut.branches('proj-1')[0].name).toBe('main');
    expect(sut.activeBranch('proj-1')).toBe(sut.branches('proj-1')[0].id);
  });

  it('dedupes identical payloads to a single checkpoint', async () => {
    await sut.checkpoint('proj-2', 'a', { tempo: 128 });
    const second = await sut.checkpoint('proj-2', 'b', { tempo: 128 });
    expect(second).toBeNull();
    expect(sut.checkpoints('proj-2', sut.activeBranch('proj-2')!).length).toBe(1);
  });

  it('advances lineage + materializes intermediate deltas', async () => {
    await sut.checkpoint('proj-3', 'init', { tempo: 128, key: 'A minor' });
    await sut.checkpoint('proj-3', 'bump tempo', { tempo: 140, key: 'A minor' });
    await sut.checkpoint('proj-3', 'swap key', { tempo: 140, key: 'C minor' });
    const cps = sut.checkpoints('proj-3', sut.activeBranch('proj-3')!);
    expect(cps.length).toBe(3);
    expect(cps[0].isFullSnapshot).toBe(true);
    expect(cps[1].isFullSnapshot).toBe(false);
    expect(cps[2].isFullSnapshot).toBe(false);
    const state = sut.materializeSnapshot('proj-3', cps[2].id);
    expect(state).toEqual({ tempo: 140, key: 'C minor' });
  });

  it('promotes every 10th checkpoint to a full snapshot', async () => {
    for (let i = 0; i < 12; i++) {
      await sut.checkpoint('proj-4', `step ${i}`, { tempo: 100 + i });
    }
    const cps = sut.checkpoints('proj-4', sut.activeBranch('proj-4')!);
    const fullSnapshots = cps.filter((c) => c.isFullSnapshot);
    expect(fullSnapshots.length).toBeGreaterThanOrEqual(2);
    expect(cps[0].isFullSnapshot).toBe(true);
    expect(cps[10].isFullSnapshot).toBe(true);
  });

  it('forks a branch from a historical checkpoint', async () => {
    await sut.checkpoint('proj-5', 'init', { tempo: 120 });
    await sut.checkpoint('proj-5', 'move 1', { tempo: 130 });
    const cps = sut.checkpoints('proj-5', sut.activeBranch('proj-5')!);
    const branch = await sut.createBranch('proj-5', 'experiment', cps[0].id);
    expect(branch.forkFromCheckpointId).toBe(cps[0].id);
    expect(sut.branches('proj-5').length).toBe(2);
  });

  it('switchBranch returns the head payload of the target branch', async () => {
    await sut.checkpoint('proj-6', 'init', { tempo: 120 });
    const mainId = sut.activeBranch('proj-6')!;
    await sut.checkpoint('proj-6', 'main move', { tempo: 130 });
    const newBranch = await sut.createBranch('proj-6', 'alt', sut.checkpoints('proj-6', mainId)[0].id);
    await sut.setActiveBranch('proj-6', newBranch.id);
    await sut.checkpoint('proj-6', 'alt move', { tempo: 110 });
    const restore = await sut.switchBranch('proj-6', mainId);
    expect(restore?.payload).toEqual({ tempo: 130 });
  });

  it('rewind restores the exact payload at the target checkpoint', async () => {
    await sut.checkpoint('proj-7', 'init', { tempo: 120 });
    await sut.checkpoint('proj-7', 'bump', { tempo: 128 });
    await sut.checkpoint('proj-7', 'drop', { tempo: 90 });
    const mainId = sut.activeBranch('proj-7')!;
    const cps = sut.checkpoints('proj-7', mainId);
    const restore = await sut.rewind({
      branchId: mainId,
      targetCheckpointId: cps[1].id,
    });
    expect(restore?.payload).toEqual({ tempo: 128 });
  });

  it('diff returns top-level before/after between two checkpoints', async () => {
    await sut.checkpoint('proj-8', 'init', { tempo: 120, key: 'Am' });
    await sut.checkpoint('proj-8', 'change', { tempo: 140, key: 'Am' });
    const mainId = sut.activeBranch('proj-8')!;
    const cps = sut.checkpoints('proj-8', mainId);
    const entries = sut.diff('proj-8', mainId, cps[0].id, cps[1].id);
    const tempo = entries.find((e) => e.field === 'tempo');
    expect(tempo?.before).toBe(120);
    expect(tempo?.after).toBe(140);
    const key = entries.find((e) => e.field === 'key');
    expect(key).toBeUndefined();
  });

  it('replayEvents enumerates checkpoints in ascending order with running state', async () => {
    await sut.checkpoint('proj-9', 'init', { tempo: 100 });
    await sut.checkpoint('proj-9', 'edit', { tempo: 110 });
    await sut.checkpoint('proj-9', 'edit', { tempo: 120 });
    const mainId = sut.activeBranch('proj-9')!;
    const events = sut.replayEvents('proj-9', mainId);
    expect(events.length).toBe(3);
    expect(events[0].payload).toEqual({ tempo: 100 });
    expect(events[1].payload).toEqual({ tempo: 110 });
    expect(events[2].payload).toEqual({ tempo: 120 });
    expect(events[2].index).toBe(2);
    expect(events[2].total).toBe(3);
  });

  it('restoreToCloudCheckpoint records a fresh checkpoint labelled with the device', async () => {
    const branch = await sut.createBranch('proj-10', 'main', null);
    await sut.setActiveBranch('proj-10', branch.id);
    const cp = await sut.restoreToCloudCheckpoint(branch.id, {
      projectId: 'proj-10',
      deviceId: 'dev_phone',
      version: 7,
      data: { tempo: 132, key: 'F#m' },
      timestamp: Date.now(),
      title: 'First Beat Demo',
      byteSize: 32,
    });
    expect(cp?.label).toContain('cloud:dev_phone');
    expect(cp?.payload).toEqual({ tempo: 132, key: 'F#m' });
  });

  it('chapters returns only full-snapshot checkpoints', async () => {
    for (let i = 0; i < 5; i++) {
      await sut.checkpoint('proj-11', `step ${i}`, { tempo: 100 + i });
    }
    const mainId = sut.activeBranch('proj-11')!;
    const cps = sut.checkpoints('proj-11', mainId);
    const chapters = sut.chapters('proj-11', mainId);
    expect(chapters.length).toBe(cps.filter((c) => c.isFullSnapshot).length);
    expect(chapters[0].isFullSnapshot).toBe(true);
  });

  it('renameBranch updates the name; deleteBranch refuses if active', async () => {
    const branch = await sut.createBranch('proj-12', 'main', null);
    await sut.setActiveBranch('proj-12', branch.id);
    await sut.renameBranch('proj-12', branch.id, 'Trunk');
    expect(sut.branches('proj-12')[0].name).toBe('Trunk');

    const other = await sut.createBranch('proj-12', 'experiment', null);
    await sut.deleteBranch('proj-12', other.id);
    expect(sut.branches('proj-12').length).toBe(1);

    await sut.deleteBranch('proj-12', branch.id);
    expect(sut.branches('proj-12').length).toBe(1);
  });

  // ─── D3 — Branching & Merge ───────────────────────────────────────

  it('findAncestor returns the LCA on a forked graph', async () => {
    await sut.checkpoint('proj-13', 'a', { tempo: 100 });
    await sut.checkpoint('proj-13', 'b', { tempo: 110 });
    const mainId = sut.activeBranch('proj-13')!;
    const fork = await sut.createBranch(
      'proj-13',
      'alt',
      sut.checkpoints('proj-13', mainId)[0].id
    );
    await sut.setActiveBranch('proj-13', fork.id);
    await sut.checkpoint('proj-13', 'alt-1', { tempo: 200 });

    const lca = sut.findAncestor('proj-13', mainId, fork.id);
    expect(lca?.id).toBe(sut.checkpoints('proj-13', mainId)[0].id);
  });

  it('findAncestor returns null when lineages are completely disjoint', async () => {
    const branchA = await sut.createBranch('proj-14', 'A', null);
    await sut.setActiveBranch('proj-14', branchA.id);
    await sut.checkpoint('proj-14', 'only-A', { tempo: 90 });
    const branchB = await sut.createBranch('proj-14', 'B', null);
    await sut.setActiveBranch('proj-14', branchB.id);
    await sut.checkpoint('proj-14', 'only-B', { tempo: 80 });

    expect(sut.findAncestor('proj-14', branchA.id, branchB.id)).toBeNull();
  });

  it('threeWayMerge yields clean status + auto-resolved fields when edits are disjoint', async () => {
    await sut.checkpoint('proj-15', 'init', { tempo: 100, gain: 0.7 });
    const mainId = sut.activeBranch('proj-15')!;
    await sut.checkpoint('proj-15', 'main moves gain', { tempo: 100, gain: 0.8 });

    const fork = await sut.createBranch(
      'proj-15',
      'alt',
      sut.checkpoints('proj-15', mainId)[0].id
    );
    await sut.setActiveBranch('proj-15', fork.id);
    await sut.checkpoint('proj-15', 'alt moves tempo', { tempo: 130, gain: 0.7 });

    await sut.setActiveBranch('proj-15', mainId);
    const result = await sut.threeWayMerge('proj-15', fork.id, mainId);
    expect(result?.status).toBe('clean');
    expect(result?.conflicts.length).toBe(0);
    expect(result?.autoResolved['tempo']).toBe(130);
    expect(result?.autoResolved['gain']).toBe(0.8);
  });

  it('threeWayMerge yields conflict status with markers on same-field disagreements', async () => {
    await sut.checkpoint('proj-16', 'init', { tempo: 100 });
    const mainId = sut.activeBranch('proj-16')!;
    await sut.checkpoint('proj-16', 'main: tempo 120', { tempo: 120 });

    const fork = await sut.createBranch(
      'proj-16',
      'alt',
      sut.checkpoints('proj-16', mainId)[0].id
    );
    await sut.setActiveBranch('proj-16', fork.id);
    await sut.checkpoint('proj-16', 'alt: tempo 140', { tempo: 140 });

    await sut.setActiveBranch('proj-16', mainId);
    const result = await sut.threeWayMerge('proj-16', fork.id, mainId);
    expect(result?.status).toBe('conflicts');
    expect(result?.conflicts.length).toBe(1);
    expect(result?.conflicts[0].field).toBe('tempo');
    expect(result?.conflicts[0].base).toBe(100);
    expect(result?.conflicts[0].mine).toBe(120);
    expect(result?.conflicts[0].theirs).toBe(140);
  });

  it('resolveConflicts produces a final non-merge checkpoint with the merged payload', async () => {
    await sut.checkpoint('proj-17', 'init', { tempo: 100 });
    const mainId = sut.activeBranch('proj-17')!;
    await sut.checkpoint('proj-17', 'main: tempo 120', { tempo: 120 });

    const fork = await sut.createBranch(
      'proj-17',
      'alt',
      sut.checkpoints('proj-17', mainId)[0].id
    );
    await sut.setActiveBranch('proj-17', fork.id);
    await sut.checkpoint('proj-17', 'alt: tempo 140', { tempo: 140 });

    await sut.setActiveBranch('proj-17', mainId);
    const merge = await sut.threeWayMerge('proj-17', fork.id, mainId);
    expect(merge?.status).toBe('conflicts');

    const finalCp = await sut.resolveConflicts({
      projectId: 'proj-17',
      mergeCheckpointId: merge!.mergeCheckpointId,
      resolutions: [{ field: 'tempo', pick: 'mine', value: 120 }],
    });
    expect(finalCp?.label).toBe('merge resolution');
    const finalState = sut.materializeSnapshot('proj-17', finalCp!.id);
    expect(finalState?.['tempo']).toBe(120);
    expect(sut.pendingMergeByProject()['proj-17']).toBeNull();
  });

  it('rebase replays checkpoints from LCA onto target with new ids', async () => {
    await sut.checkpoint('proj-18', 'a', { tempo: 100 });
    const mainId = sut.activeBranch('proj-18')!;
    await sut.checkpoint('proj-18', 'main: tempo 110', { tempo: 110 });

    const fork = await sut.createBranch(
      'proj-18',
      'alt',
      sut.checkpoints('proj-18', mainId)[0].id
    );
    await sut.setActiveBranch('proj-18', fork.id);
    await sut.checkpoint('proj-18', 'alt: tempo 130', { tempo: 130 });
    await sut.checkpoint('proj-18', 'alt: tempo 140', { tempo: 140 });

    await sut.setActiveBranch('proj-18', mainId);
    const plan = await sut.rebase('proj-18', fork.id, mainId);
    expect(plan?.newCheckpointIds.length).toBe(2);
    expect(plan?.replayedCheckpointIds.length).toBe(2);
    expect(sut.checkpoints('proj-18', mainId).length).toBeGreaterThan(2);
  });

  it('cherryPick applies a single delta onto target cleanly when unrelated', async () => {
    await sut.checkpoint('proj-19', 'a', { tempo: 100, gain: 0.5 });
    const mainId = sut.activeBranch('proj-19')!;
    await sut.checkpoint('proj-19', 'main: gain', { tempo: 100, gain: 0.6 });

    const fork = await sut.createBranch(
      'proj-19',
      'alt',
      sut.checkpoints('proj-19', mainId)[0].id
    );
    await sut.setActiveBranch('proj-19', fork.id);
    await sut.checkpoint('proj-19', 'alt: tempo', { tempo: 130, gain: 0.5 });

    const srcCp = sut.checkpoints('proj-19', fork.id).at(-1)!;
    await sut.setActiveBranch('proj-19', mainId);
    const result = await sut.cherryPick(
      'proj-19',
      fork.id,
      srcCp.id,
      mainId
    );
    expect(result?.status).toBe('clean');
    const finalState = sut.materializeSnapshot('proj-19', result!.newCheckpointId);
    expect(finalState?.['tempo']).toBe(130);
    expect(finalState?.['gain']).toBe(0.6);
  });

  it('cherryPick reports conflicts when the target already moved the same field', async () => {
    await sut.checkpoint('proj-20', 'a', { tempo: 100 });
    const mainId = sut.activeBranch('proj-20')!;
    await sut.checkpoint('proj-20', 'main: tempo 110', { tempo: 110 });

    const fork = await sut.createBranch(
      'proj-20',
      'alt',
      sut.checkpoints('proj-20', mainId)[0].id
    );
    await sut.setActiveBranch('proj-20', fork.id);
    await sut.checkpoint('proj-20', 'alt: tempo 130', { tempo: 130 });
    const srcCp = sut.checkpoints('proj-20', fork.id).at(-1)!;

    await sut.setActiveBranch('proj-20', mainId);
    const result = await sut.cherryPick(
      'proj-20',
      fork.id,
      srcCp.id,
      mainId
    );
    expect(result?.status).toBe('conflict');
    expect(result?.conflicts.length).toBeGreaterThan(0);
    expect(result?.conflicts[0].field).toBe('tempo');
  });

  it('readConflicts returns the markers from a pending merge checkpoint', async () => {
    await sut.checkpoint('proj-21', 'init', { tempo: 100 });
    const mainId = sut.activeBranch('proj-21')!;
    await sut.checkpoint('proj-21', 'main: tempo 120', { tempo: 120 });

    const fork = await sut.createBranch(
      'proj-21',
      'alt',
      sut.checkpoints('proj-21', mainId)[0].id
    );
    await sut.setActiveBranch('proj-21', fork.id);
    await sut.checkpoint('proj-21', 'alt: tempo 140', { tempo: 140 });

    await sut.setActiveBranch('proj-21', mainId);
    const result = await sut.threeWayMerge('proj-21', fork.id, mainId);
    expect(result?.status).toBe('conflicts');
    const markers = sut.readConflicts('proj-21', result!.mergeCheckpointId);
    expect(markers.length).toBe(result!.conflicts.length);
    expect(markers[0].field).toBe('tempo');
  });
});
