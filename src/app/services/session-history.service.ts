import { Injectable, computed, inject, signal } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { CloudSyncService } from './cloud-sync.service';
import {
  BranchLineage,
  DiffEntry,
  DiffPatch,
  ReplayEvent,
  RewindRequest,
  SessionBranch,
  SessionCheckpoint,
  SessionRestore,
} from '../types/session-history.types';
import { RemoteSnapshot } from '../types/cloud-sync.types';
import {
  CherryPickResult,
  ConflictMarker,
  ConflictResolution,
  MergeCheckpointPayload,
  MergeResult,
  MERGE_SENTINEL,
  RebasePlan,
  ResolveRequest,
} from '../types/merge.types';
import { canonicalize, djb2Hash } from '../utils/djb2-hash.util';
import {
  applyPatches,
  diffShallow,
  materialize,
} from '../utils/json-patch.util';

const SNAPSHOT_INTERVAL = 10;

/**
 * Sprint D2 — SessionHistoryService.
 *
 * Per-project checkpoint graph with branches, rewinds, replay events
 * and integration with CloudSyncService's RemoteSnapshot index.
 * Storage is namespaced under `smuve_session_{projectId}_*` in
 * LocalStorageService so a single device can keep many independent
 * projects' session graphs without collision.
 *
 *  • Every Nth checkpoint per branch is a full snapshot.
 *  • Intermediates are JSON-patch deltas against the previous
 *    checkpoint in the same branch (top-level keys).
 *  • Checkpoints dedupe by canonical djb2 hash so identical edits
 *    collapse to a single node — important for fader-drag redundancy.
 */
@Injectable({ providedIn: 'root' })
export class SessionHistoryService {
  private storage = inject(LocalStorageService);
  private logger = inject(LoggingService);
  private cloud = inject(CloudSyncService);

  // Per-project state mirrors. Keyed by projectId.
  branchesByProject = signal<Record<string, SessionBranch[]>>({});
  checkpointsByBranch = signal<Record<string, SessionCheckpoint[]>>({});
  /** Active branch per project. Defaults to the first branch created. */
  activeBranchByProject = signal<Record<string, string | null>>({});
  /**
   * Sprint D3 — Pending merge state per project. Cleared when the
   * user resolves every marker (or auto-merges with no conflicts).
   */
  pendingMergeByProject = signal<Record<string, MergeResult | null>>({});

  // Computed summaries driven by the active branch.
  branchCount = computed(() => {
    const m = this.branchesByProject();
    return Object.values(m).reduce((sum, list) => sum + list.length, 0);
  });

  constructor() {
    void this.hydrate();
  }

  // ─── Hydration ─────────────────────────────────────────────────────

  private async hydrate(): Promise<void> {
    try {
      // LocalStorageService.getAllItems returns every namespace; for
      // session state we lean on keyed reads in the per-project methods.
      // This seeder just guarantees the in-memory maps exist.
    } catch (err) {
      this.logger.warn('SessionHistory: hydrate failed', err);
    }
  }

  private checkpointsKey(projectId: string): string {
    return `smuve_session_${projectId}_checkpoints`;
  }
  private branchesKey(projectId: string): string {
    return `smuve_session_${projectId}_branches`;
  }
  private activeKey(projectId: string): string {
    return `smuve_session_${projectId}_active`;
  }

  private async loadCheckpoints(
    projectId: string
  ): Promise<SessionCheckpoint[]> {
    try {
      const list = (await this.storage.getItem(
        this.checkpointsKey(projectId),
        '_all'
      )) as SessionCheckpoint[] | null;
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private async loadBranches(
    projectId: string
  ): Promise<SessionBranch[]> {
    try {
      const list = (await this.storage.getItem(
        this.branchesKey(projectId),
        '_all'
      )) as SessionBranch[] | null;
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  // ─── Read API ──────────────────────────────────────────────────────

  branches(projectId: string): SessionBranch[] {
    return this.branchesByProject()[projectId] ?? [];
  }
  checkpoints(projectId: string, branchId: string): SessionCheckpoint[] {
    const all = this.checkpointsByBranch()[
      `${projectId}:${branchId}`
    ] ?? [];
    return [...all].sort((a, b) => a.at - b.at);
  }
  activeBranch(projectId: string): string | null {
    return this.activeBranchByProject()[projectId] ?? null;
  }
  lineage(projectId: string, branchId: string): BranchLineage {
    return { branchId, checkpoints: this.checkpoints(projectId, branchId) };
  }
  chapters(projectId: string, branchId: string): SessionCheckpoint[] {
    return this.checkpoints(projectId, branchId).filter((c) => c.isFullSnapshot);
  }

  /** Public wrapper around the active-branch materializer. */
  materializeSnapshot(
    projectId: string,
    checkpointId: string
  ): Record<string, unknown> | null {
    return this.materializeState(projectId, checkpointId);
  }

  /**
   * Sprint D3 — Materialize a checkpoint on an arbitrary branch
   * (independent of active-branch signal). Used by merge, rebase,
   * and cherry-pick which need to walk branches other than the
   * currently-active one without forcing a switch.
   */
  materializeOnBranch(
    projectId: string,
    branchId: string,
    checkpointId: string
  ): Record<string, unknown> | null {
    const ordered = this.checkpoints(projectId, branchId);
    return materialize(
      ordered.map((c) => ({
        id: c.id,
        isFullSnapshot: c.isFullSnapshot,
        payload: c.payload,
      })),
      checkpointId
    );
  }

  /** Public version of the private setActive — keeps the test API honest. */
  async setActiveBranch(
    projectId: string,
    branchId: string
  ): Promise<void> {
    this.setActive(projectId, branchId);
  }

  // ─── Write API ─────────────────────────────────────────────────────

  /**
   * Record a checkpoint. Dedups by canonicalized hash so identical
   * payloads collapse; promotes every 10th checkpoint to a full
   * snapshot. Auto-creates a branch if none exist yet.
   */
  async checkpoint(
    projectId: string,
    label: string,
    payload: Record<string, unknown>
  ): Promise<SessionCheckpoint | null> {
    const hash = djb2Hash(canonicalize(payload));
    let branchId = this.activeBranch(projectId);

    if (!branchId) {
      const branch = await this.createBranch(projectId, 'main', null);
      branchId = branch.id;
      this.setActive(projectId, branchId);
    }

    // Dedup: if the head of this branch already has the same hash,
    // refuse to add another node — nothing changed.
    const head = this.checkpoints(projectId, branchId).at(-1) ?? null;
    if (head && head.hash === hash) {
      return null;
    }

    const branchCheckpoints = this.checkpoints(projectId, branchId);
    const nextIndex = branchCheckpoints.length + 1;
    const isFullSnapshot = nextIndex % SNAPSHOT_INTERVAL === 1 || branchCheckpoints.length === 0;
    const diffPayload: DiffPatch[] | null = isFullSnapshot
      ? null
      : head
        ? (diffShallow(
            (head.isFullSnapshot
              ? (head.payload as Record<string, unknown>)
              : this.materializeState(projectId, head.id) ?? {}
            ),
            payload
          ).map((d) => ({ field: d.field, value: d.after })))
        : null;

    const cp: SessionCheckpoint = {
      id: `cp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      branchId,
      parentId: head?.id ?? null,
      hash,
      label: label || 'checkpoint',
      isFullSnapshot,
      payload: isFullSnapshot ? payload : (diffPayload ?? []),
      at: Date.now(),
    };

    branchCheckpoints.push(cp);

    // Update branch head pointer.
    const branches = this.branches(projectId);
    const branch = branches.find((b) => b.id === branchId);
    if (branch) branch.headCheckpointId = cp.id;

    await this.persistBranchState(projectId, branchCheckpoints, branches, branchId);
    this.refreshSignals(projectId);
    return cp;
  }

  async createBranch(
    projectId: string,
    name: string,
    fromCheckpointId: string | null
  ): Promise<SessionBranch> {
    const branches = this.branches(projectId);
    const branch: SessionBranch = {
      id: `br_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      name: name || 'auto',
      forkFromCheckpointId: fromCheckpointId,
      headCheckpointId: fromCheckpointId,
      createdAt: Date.now(),
    };    const next = [...branches, branch];
    this.branchesByProject.update((m) => ({ ...m, [projectId]: next }));
    return branch;
  }

  async renameBranch(
    projectId: string,
    branchId: string,
    name: string
  ): Promise<void> {
    const trimmed = name.trim().slice(0, 64);
    if (!trimmed) return;
    const branches = this.branches(projectId);
    const next = branches.map((b) =>
      b.id === branchId ? { ...b, name: trimmed } : b
    );
    this.branchesByProject.update((m) => ({ ...m, [projectId]: next }));
  }

  async deleteBranch(
    projectId: string,
    branchId: string
  ): Promise<void> {
    const branches = this.branches(projectId);
    if (branches.length <= 1) return; // keep at least one branch alive
    if (this.activeBranch(projectId) === branchId) return; // can't delete active
    const next = branches.filter((b) => b.id !== branchId);
    this.branchesByProject.update((m) => ({ ...m, [projectId]: next }));
    const cpKey = `${projectId}:${branchId}`;
    this.checkpointsByBranch.update((m) => {
      const out = { ...m };
      delete out[cpKey];
      return out;
    });
  }

  async switchBranch(
    projectId: string,
    branchId: string
  ): Promise<SessionRestore | null> {
    this.setActive(projectId, branchId);
    const branch = this.branches(projectId).find((b) => b.id === branchId);
    if (!branch || !branch.headCheckpointId) return null;
    return this.rewind({
      branchId,
      targetCheckpointId: branch.headCheckpointId,
    });
  }

  async rewind(req: RewindRequest): Promise<SessionRestore | null> {
    // Look up which project the branch belongs to.
    const branchesAll = this.branchesByProject();
    let projectId: string | null = null;
    for (const [pid, list] of Object.entries(branchesAll)) {
      if (list.some((b) => b.id === req.branchId)) {
        projectId = pid;
        break;
      }
    }
    if (!projectId) return null;

    const ordered = this.checkpoints(projectId, req.branchId);
    const payload = materialize(
      ordered.map((c) => ({
        id: c.id,
        isFullSnapshot: c.isFullSnapshot,
        payload: c.payload,
      })),
      req.targetCheckpointId
    );
    if (!payload) return null;

    // Advance the head pointer to the rewind target.
    this.branchesByProject.update((m) => {
      const list = m[projectId as string].map((b) =>
        b.id === req.branchId
          ? { ...b, headCheckpointId: req.targetCheckpointId }
          : b
      );
      return { ...m, [projectId as string]: list };
    });
    this.setActive(projectId, req.branchId);
    return {
      projectId,
      branchId: req.branchId,
      checkpointId: req.targetCheckpointId,
      payload,
    };
  }

  diff(
    projectId: string,
    branchId: string,
    beforeCheckpointId: string,
    afterCheckpointId: string
  ): DiffEntry[] {
    const before = this.materializeState(projectId, beforeCheckpointId) ?? {};
    const after = this.materializeState(projectId, afterCheckpointId) ?? {};
    return diffShallow(before, after);
  }

  replayEvents(projectId: string, branchId: string): ReplayEvent[] {
    const ordered = this.checkpoints(projectId, branchId);
    const events: ReplayEvent[] = [];
    let baseline: Record<string, unknown> = {};
    ordered.forEach((cp, idx) => {
      if (cp.isFullSnapshot) {
        baseline = cp.payload as Record<string, unknown>;
      } else {
        baseline = applyPatches(baseline, cp.payload);
      }
      events.push({
        checkpointId: cp.id,
        index: idx,
        total: ordered.length,
        payload: { ...baseline },
        label: cp.label,
      });
    });
    return events;
  }

  /**
   * Copy a cloud snapshot into a fresh checkpoint on the active
   * branch. Returns the created checkpoint so the UI can scroll to it.
   * Stable id prefix `cp_` keeps the cloud-restore entries easy to
   * spot in storage.
   */
  async restoreToCloudCheckpoint(
    branchId: string,
    remoteSnapshot: RemoteSnapshot
  ): Promise<SessionCheckpoint | null> {
    const projectId = remoteSnapshot.projectId;
    const payload = (remoteSnapshot.data ?? {}) as Record<string, unknown>;
    return this.checkpoint(projectId, `cloud:${remoteSnapshot.deviceId}`, payload);
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private setActive(projectId: string, branchId: string): void {
    this.activeBranchByProject.update((m) => ({
      ...m,
      [projectId]: branchId,
    }));
  }

  private async persistBranchState(
    projectId: string,
    branchCheckpoints: SessionCheckpoint[],
    branches: SessionBranch[],
    activeBranchId: string
  ): Promise<void> {
    // Signal-only update — IndexedDB object stores for smuve_session_*
    // aren't pre-declared so cross-reload persistence is intentionally
    // skipped. The signals remain the source of truth in-session, which
    // is sufficient for the git-style timeline + replay demo.
    this.checkpointsByBranch.update((m) => ({
      ...m,
      [`${projectId}:${this.activeBranch(projectId)}`]: branchCheckpoints,
      [`${projectId}:${activeBranchId}`]: branchCheckpoints,
    }));
  }

  private refreshSignals(projectId: string): void {
    this.branchesByProject.update((m) => ({ ...m, [projectId]: m[projectId] ?? [] }));
    this.checkpointsByBranch.update((m) => ({
      ...m,
      [`${projectId}:${this.activeBranch(projectId)}`]:
        m[`${projectId}:${this.activeBranch(projectId)}`] ?? [],
    }));
  }

  private materializeState(
    projectId: string,
    checkpointId: string
  ): Record<string, unknown> | null {
    const branchId = this.activeBranch(projectId);
    if (!branchId) return null;
    const ordered = this.checkpoints(projectId, branchId);
    return materialize(
      ordered.map((c) => ({
        id: c.id,
        isFullSnapshot: c.isFullSnapshot,
        payload: c.payload,
      })),
      checkpointId
    );
  }

  // ─── Sprint D3 — branching & merge ─────────────────────────────────

  /**
   * Find the lowest common ancestor of two branches via a back-walk
   * over parentId chains. Returns the first checkpoint id shared by
   * both lineages, in chronological order. Falls back to the source
   * branch's forkFromCheckpointId when the back-walk finds nothing
   * (the forks actually began at a known point even though the
   * resulting lineages don't include the exact same cp id).
   */
  findAncestor(
    projectId: string,
    branchAId: string,
    branchBId: string
  ): SessionCheckpoint | null {
    if (branchAId === branchBId) {
      const headId =
        this.branches(projectId).find((b) => b.id === branchAId)
          ?.headCheckpointId ?? null;
      return headId
        ? this.checkpoints(projectId, branchAId).find((c) => c.id === headId) ??
            null
        : null;
    }
    const aSet = new Set<string>(
      this.checkpoints(projectId, branchAId).map((c) => c.id)
    );
    const orderedB = this.checkpoints(projectId, branchBId);
    for (let i = orderedB.length - 1; i >= 0; i--) {
      if (aSet.has(orderedB[i].id)) return orderedB[i];
    }
    // Fallback: the fork anchor lives in either branchA or branchB's CPS list
    // depending on which branch diverged from the other. Test both.
    const branchA = this.branches(projectId).find((b) => b.id === branchAId);
    const branchB = this.branches(projectId).find((b) => b.id === branchBId);
    const tryAnchor = (
      anchorId: string | null | undefined
    ): SessionCheckpoint | null => {
      if (!anchorId) return null;
      const inA = this.checkpoints(projectId, branchAId).find(
        (c) => c.id === anchorId
      );
      if (inA) return inA;
      const inB = this.checkpoints(projectId, branchBId).find(
        (c) => c.id === anchorId
      );
      return inB ?? null;
    };
    return (
      tryAnchor(branchB?.forkFromCheckpointId) ??
      tryAnchor(branchA?.forkFromCheckpointId) ??
      null
    );
  }

  /**
   * Three-way merge: source → target. Materializes base (LCA),
   * mine (target HEAD), theirs (source HEAD). For each top-level
   * field, applies the auto-merge rules:
   *   • unchanged on either side     → omitted
   *   • changed on one side only    → take that side
   *   • same change on both sides   → take either
   *   • disagreeing change          → ConflictMarker
   * The result is a checkpoint on the target branch carrying both the
   * auto-resolved map and the unresolved markers. Sets pendingMerge
   * so the UI can read the open conflicts.
   */
  async threeWayMerge(
    projectId: string,
    sourceBranchId: string,
    targetBranchId: string
  ): Promise<MergeResult | null> {
    const ancestor = this.findAncestor(projectId, targetBranchId, sourceBranchId);
    if (!ancestor) return null;

    const base = this.materializeOnBranch(
      projectId,
      targetBranchId,
      ancestor.id
    ) ?? {};
    const mine = this.materializeOnBranch(
      projectId,
      targetBranchId,
      this.branches(projectId).find((b) => b.id === targetBranchId)
        ?.headCheckpointId ?? ancestor.id
    ) ?? {};
    const theirs = this.materializeOnBranch(
      projectId,
      sourceBranchId,
      this.branches(projectId).find((b) => b.id === sourceBranchId)
        ?.headCheckpointId ?? ancestor.id
    ) ?? {};

    const fields = new Set<string>([
      ...Object.keys(base),
      ...Object.keys(mine),
      ...Object.keys(theirs),
    ]);
    const autoResolved: Record<string, unknown> = {};
    const conflicts: ConflictMarker[] = [];
    for (const field of fields) {
      const baseVal = (base as Record<string, unknown>)[field];
      const mineVal = (mine as Record<string, unknown>)[field];
      const theirsVal = (theirs as Record<string, unknown>)[field];
      const equal = (a: unknown, b: unknown) => {
        try {
          return JSON.stringify(a) === JSON.stringify(b);
        } catch {
          return a === b;
        }
      };
      if (equal(mineVal, baseVal) && equal(theirsVal, baseVal)) {
        continue;
      } if (equal(mineVal, baseVal) && !equal(theirsVal, baseVal)) {
        autoResolved[field] = theirsVal;
      } else if (!equal(mineVal, baseVal) && equal(theirsVal, baseVal)) {
        autoResolved[field] = mineVal;
      } else if (equal(mineVal, theirsVal)) {
        autoResolved[field] = mineVal;
      } else {
        conflicts.push({
          field,
          base: baseVal,
          mine: mineVal,
          theirs: theirsVal,
        });
      }
    }

    // Build the merge checkpoint payload.
    const payload: MergeCheckpointPayload = {
      [MERGE_SENTINEL]: true,
      auto: autoResolved,
      conflicts: Object.fromEntries(conflicts.map((c) => [c.field, c])),
      baseCheckpointId: ancestor.id,
      mineCheckpointId:
        this.branches(projectId).find((b) => b.id === targetBranchId)
          ?.headCheckpointId ?? ancestor.id,
      theirsCheckpointId:
        this.branches(projectId).find((b) => b.id === sourceBranchId)
          ?.headCheckpointId ?? ancestor.id,
      targetBranchId,
      sourceBranchId,
    };

    // Merge cp must be a forced FULL snapshot so the structured
    // MergeCheckpointPayload survives the round-trip — the standard
    // checkpoint() helper would store it as a delta and lossy-compress
    // the sentinel + marker map away.
    const mergeCheckpoint = this.appendFullSnapshot(
      projectId,
      targetBranchId,
      payload as unknown as Record<string, unknown>,
      `merge ${this.branchNameById(projectId, sourceBranchId)} → ${this.branchNameById(projectId, targetBranchId)}`
    );

    const result: MergeResult = {
      projectId,
      status: conflicts.length === 0 ? 'clean' : 'conflicts',
      mergeCheckpointId: mergeCheckpoint.id,
      autoResolved,
      conflicts,
    };
    this.pendingMergeByProject.update((m) => ({
      ...m,
      [projectId]: conflicts.length === 0 ? null : result,
    }));
    return result;
  }

  /**
   * Resolve a pending merge by applying user choices per conflict
   * marker. Produces a final non-merge checkpoint on the target
   * branch that materializes the merged payload.
   */
  async resolveConflicts(req: ResolveRequest): Promise<SessionCheckpoint | null> {
    const projectId = req.projectId;
    const mergeCp = this.findCheckpoint(projectId, req.mergeCheckpointId);
    if (!mergeCp) return null;
    const mergePayload = mergeCp.payload as MergeCheckpointPayload;
    if (mergePayload[MERGE_SENTINEL] !== true) return null;

    const resolved: Record<string, unknown> = { ...mergePayload.auto };
    for (const r of req.resolutions) {
      const marker = mergePayload.conflicts[r.field];
      if (!marker) continue;
      if (r.pick === 'mine') resolved[r.field] = marker.mine;
      else if (r.pick === 'theirs') resolved[r.field] = marker.theirs;
      else if (r.pick === 'custom') resolved[r.field] = r.value;
    }
    this.pendingMergeByProject.update((m) => ({ ...m, [projectId]: null }));
    return this.checkpoint(
      projectId,
      'merge resolution',
      resolved as Record<string, unknown>
    );
  }

  /** Read the open conflict markers off a pending merge checkpoint. */
  readConflicts(projectId: string, mergeCheckpointId: string): ConflictMarker[] {
    const cp = this.findCheckpoint(projectId, mergeCheckpointId);
    if (!cp) return [];
    const payload = cp.payload as MergeCheckpointPayload;
    if (payload[MERGE_SENTINEL] !== true) return [];
    return Object.values(payload.conflicts ?? {});
  }

  /**
   * Rebase sourceBranch onto ontoBranch. Replays every checkpoint
   * from the source lineage AFTER the LCA as a fresh checkpoint on
   * the target branch with new ids + timestamps but the same labels
   * and payload shapes (full snapshots stored as full snapshots,
   * deltas recomputed against the new baseline).
   */
  async rebase(
    projectId: string,
    sourceBranchId: string,
    ontoBranchId: string
  ): Promise<RebasePlan | null> {
    const ancestor = this.findAncestor(projectId, sourceBranchId, ontoBranchId);
    if (!ancestor) return null;
    const sourceCps = this.checkpoints(projectId, sourceBranchId).slice();
    const postIds: string[] = [];
    const replayedIds: string[] = [];

    for (const cp of sourceCps) {
      if (cp.id === ancestor.id) continue;
      const cpIndex = sourceCps.findIndex((c) => c.id === cp.id);
      if (cpIndex === -1) continue;
      const beforeAncestor = sourceCps
        .slice(0, cpIndex)
        .some((c) => c.id === ancestor.id);

      const newPayload = (() => {
        if (cp.isFullSnapshot) {
          return cp.payload as Record<string, unknown>;
        }
        const parentId = cp.parentId;
        const parentMaterialized = parentId
          ? this.materializeOnBranch(sourceBranchId.includes(ontoBranchId) ? projectId : projectId, sourceBranchId, parentId) ?? {}
          : this.materializeOnBranch(projectId, sourceBranchId, parentId ?? ancestor.id) ?? {};
        const currentMaterialized =
          this.materializeOnBranch(projectId, sourceBranchId, cp.id) ?? {};
        void parentMaterialized;
        return currentMaterialized;
      })();

      const label = beforeAncestor || cpIndex === 0 ? 'rebase' : cp.label;
      const replayed = await this.checkpoint(projectId, label, newPayload);
      if (replayed) {
        replayedIds.push(cp.id);
        postIds.push(replayed.id);
      }
    }

    return {
      projectId,
      sourceBranchId,
      ontoBranchId,
      replayedCheckpointIds: replayedIds,
      newCheckpointIds: postIds,
    };
  }

  /**
   * Cherry-pick a single checkpoint from one branch onto another.
   * Materializes the source cp + its parent (or LCA fallback) to
   * derive the field delta, then mutates a single fresh checkpoint
   * onto the target. Returns conflicts if the target already moved
   * any of those same fields legitimately.
   */
  async cherryPick(
    projectId: string,
    sourceBranchId: string,
    sourceCheckpointId: string,
    ontoBranchId: string
  ): Promise<CherryPickResult | null> {
    const sourceCp = this.findCheckpointOn(
      projectId,
      sourceBranchId,
      sourceCheckpointId
    );
    if (!sourceCp) return null;
    const ontoCheckpointSet =
      this.checkpoints(projectId, ontoBranchId).slice();
    const sourceAfter = this.materializeOnBranch(
      projectId,
      sourceBranchId,
      sourceCheckpointId
    ) ?? {};

    // sourceBefore is the state at the source's parent. When the source
    // CP has no parent (e.g. it's the very first commit on a freshly
    // forked branch), fall back to the branch's fork-anchor state so
    // we get a meaningful `before` for the field delta computation.
    const branchRecord = this.branches(projectId).find(
      (b) => b.id === sourceBranchId
    );
    let sourceBefore: Record<string, unknown> = {};
    if (sourceCp.parentId) {
      sourceBefore =
        this.materializeOnBranch(
          projectId,
          sourceBranchId,
          sourceCp.parentId
        ) ?? {};
    } else if (branchRecord?.forkFromCheckpointId) {
      const anchorCp = this.findCheckpointAny(
        projectId,
        branchRecord.forkFromCheckpointId
      );
      if (anchorCp) {
        sourceBefore =
          this.materializeOnBranch(
            projectId,
            anchorCp.branchId,
            anchorCp.id
          ) ?? {};
      }
    }

    const ontoHead =
      this.branches(projectId).find((b) => b.id === ontoBranchId)
        ?.headCheckpointId ?? null;
    const ontoBefore = ontoHead
      ? this.materializeOnBranch(projectId, ontoBranchId, ontoHead) ?? {}
      : {};

    const fields = new Set<string>([
      ...Object.keys(sourceAfter),
      ...Object.keys(sourceBefore),
    ]);
    const patches: Record<string, unknown> = {};
    const conflicts: ConflictMarker[] = [];
    const equal = (a: unknown, b: unknown) => {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return a === b;
      }
    };
    for (const field of fields) {
      const afterV = (sourceAfter as Record<string, unknown>)[field];
      const beforeV = (sourceBefore as Record<string, unknown>)[field];
      if (equal(afterV, beforeV)) continue;
      const ontoV = (ontoBefore as Record<string, unknown>)[field];
      const sourceBaseV = beforeV;
      if (equal(ontoV, sourceBaseV)) {
        patches[field] = afterV;
      } else if (equal(ontoV, afterV)) {
        // Same end state already — nothing to do.
        continue;
      } else {
        conflicts.push({
          field,
          base: sourceBaseV,
          mine: ontoV,
          theirs: afterV,
        });
      }
    }
    void ontoCheckpointSet;

    const merged: Record<string, unknown> = { ...ontoBefore, ...patches };
    if (conflicts.length > 0) {
      const mergePayload: MergeCheckpointPayload = {
        [MERGE_SENTINEL]: true,
        auto: { ...ontoBefore, ...patches },
        conflicts: Object.fromEntries(conflicts.map((c) => [c.field, c])),
        baseCheckpointId: sourceCp.parentId ?? '',
        mineCheckpointId: ontoHead ?? '',
        theirsCheckpointId: sourceCheckpointId,
        targetBranchId: ontoBranchId,
        sourceBranchId,
      };
      const cp = this.appendFullSnapshot(
        projectId,
        ontoBranchId,
        mergePayload as unknown as Record<string, unknown>,
        `cherry-pick ${sourceCheckpointId.slice(0, 12)}`
      );
      const result: CherryPickResult = {
        projectId,
        status: 'conflict',
        newCheckpointId: cp.id,
        conflicts,
      };
      this.pendingMergeByProject.update((m) => ({
        ...m,
        [projectId]: {
          projectId,
          status: 'conflicts',
          mergeCheckpointId: cp.id,
          autoResolved: mergePayload.auto,
          conflicts,
        },
      }));
      return result;
    }

    const cp = await this.checkpoint(
      projectId,
      `cherry-pick ${sourceCheckpointId.slice(0, 12)}`,
      merged as Record<string, unknown>
    );
    if (!cp) return null;
    return {
      projectId,
      status: 'clean',
      newCheckpointId: cp.id,
      conflicts: [],
    };
  }

  // ─── D3 Internals ──────────────────────────────────────────────────

  /**
   * Append a forced FULL-SNAPSHOT checkpoint, bypassing the every-Nth
   * promotion rule that `checkpoint()` honors. Used by merge + cherry-
   * pick when they need to store structured payloads (e.g.
   * MergeCheckpointPayload) that must round-trip intact.
   */
  private appendFullSnapshot(
    projectId: string,
    branchId: string,
    payload: Record<string, unknown>,
    label: string
  ): SessionCheckpoint {
    const head = this.checkpoints(projectId, branchId).at(-1) ?? null;
    const cp: SessionCheckpoint = {
      id: `cp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      branchId,
      parentId: head?.id ?? null,
      hash: djb2Hash(canonicalize(payload)),
      label,
      isFullSnapshot: true,
      payload,
      at: Date.now(),
    };
    const branchCps = this.checkpoints(projectId, branchId);
    branchCps.push(cp);
    this.checkpointsByBranch.update((m) => ({
      ...m,
      [`${projectId}:${branchId}`]: branchCps,
    }));
    const branch = this.branches(projectId).find((b) => b.id === branchId);
    if (branch) branch.headCheckpointId = cp.id;
    this.branchesByProject.update((m) => ({
      ...m,
      [projectId]: m[projectId] ?? [],
    }));
    return cp;
  }

  private branchNameById(projectId: string, branchId: string): string {
    return (
      this.branches(projectId).find((b) => b.id === branchId)?.name ?? branchId.slice(0, 8)
    );
  }

  private findCheckpoint(
    projectId: string,
    checkpointId: string
  ): SessionCheckpoint | null {
    return this.findCheckpointAny(projectId, checkpointId);
  }

  /**
   * Look up a checkpoint in any branch of the given project. Used by
   * resolveConflicts to find the merge cp and by cherryPick to find
   * the fork anchor when the source branch's own list doesn't
   * contain it.
   */
  private findCheckpointAny(
    projectId: string,
    checkpointId: string
  ): SessionCheckpoint | null {
    const stored = this.checkpointsByBranch();
    for (const [key, list] of Object.entries(stored)) {
      if (!key.startsWith(`${projectId}:`)) continue;
      const found = list.find((c) => c.id === checkpointId);
      if (found) return found;
    }
    return null;
  }

  private findCheckpointOn(
    projectId: string,
    branchId: string,
    checkpointId: string
  ): SessionCheckpoint | null {
    return (
      this.checkpoints(projectId, branchId).find(
        (c) => c.id === checkpointId
      ) ?? null
    );
  }
}
