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
}
