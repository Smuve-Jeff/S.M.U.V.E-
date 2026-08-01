import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionHistoryService } from '../../services/session-history.service';
import { CloudSyncService } from '../../services/cloud-sync.service';
import {
  DiffEntry,
  ReplayEvent,
  SessionBranch,
  SessionCheckpoint,
} from '../../types/session-history.types';
import { RemoteSnapshot } from '../../types/cloud-sync.types';
import {
  ConflictMarker,
  ConflictResolution,
  MergeResult,
} from '../../types/merge.types';
import {
  GraphEdge,
  GraphNode,
  SessionGraph,
} from '../../types/session-graph.types';
import {
  graphDimensions,
  GRAPH_LANE_W,
  GRAPH_PAD_X,
  GRAPH_PAD_Y,
  GRAPH_ROW_H,
} from '../../utils/session-graph.util';

@Component({
  selector: 'app-session-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './session-timeline.component.html',
  styleUrl: './session-timeline.component.css',
})
export class SessionTimelineComponent {
  history = inject(SessionHistoryService);
  cloud = inject(CloudSyncService);
  private router = inject(Router);

  readonly projectId = signal<string>('proj_demo_session');
  readonly newBranchName = signal<string>('');
  readonly draftLabel = signal<string>('checkpoint');
  readonly draftPayload = signal<string>(
    '{"tempo":124,"key":"A minor","tracks":["drums","bass","chords","lead"]}'
  );
  readonly replayIndex = signal<number>(0);
  readonly isReplaying = signal<boolean>(false);

  // ─── Sprint D3 — Merge / Rebase / Cherry-pick controls ────────────
  readonly mergeSource = signal<string>('');
  readonly mergeTarget = signal<string>('');
  readonly cherryPickSourceCheckpoint = signal<string>('');
  readonly cherryPickTarget = signal<string>('');
  /** Pending conflict resolution picks — one entry per ConflictMarker. */
  readonly conflictPicks = signal<
    Record<string, ConflictResolution>
  >({});
  private replayTimer: ReturnType<typeof setInterval> | null = null;

  readonly branches = computed<SessionBranch[]>(() =>
    this.history.branches(this.projectId())
  );
  readonly activeBranchId = computed<string | null>(
    () => this.history.activeBranch(this.projectId())
  );
  readonly checkpoints = computed<SessionCheckpoint[]>(() => {
    const id = this.activeBranchId();
    return id ? this.history.checkpoints(this.projectId(), id) : [];
  });
  readonly chapters = computed<SessionCheckpoint[]>(() => {
    const id = this.activeBranchId();
    return id ? this.history.chapters(this.projectId(), id) : [];
  });
  readonly replayEvents = computed<ReplayEvent[]>(() => {
    const id = this.activeBranchId();
    return id
      ? this.history.replayEvents(this.projectId(), id)
      : [];
  });
  readonly currentReplay = computed<ReplayEvent | null>(() => {
    const events = this.replayEvents();
    if (events.length === 0) return null;
    const idx = Math.min(this.replayIndex(), events.length - 1);
    return events[idx] ?? null;
  });
  readonly diffSelected = computed<DiffEntry[]>(() => {
    const id = this.activeBranchId();
    if (!id) return [];
    const events = this.replayEvents();
    if (events.length < 2) return [];
    return this.history.diff(
      this.projectId(),
      id,
      events[0].checkpointId,
      events[events.length - 1].checkpointId
    );
  });
  readonly cloudSnapshots = computed<RemoteSnapshot[]>(() =>
    this.cloud.cloudProjects()
  );

  /**
   * The currently-active (per-project) pending merge — drives the
   * conflict-resolution modal. Null when the user has no open merge.
   */
  readonly pendingMerge = computed<MergeResult | null>(() =>
    this.history.pendingMergeByProject()[this.projectId()] ?? null
  );

  // ─── Sprint D4 — merge graph visualization ────────────────────────
  readonly graph = computed<SessionGraph>(() =>
    this.history.buildGraph(this.projectId())
  );
  readonly graphDims = computed(() => graphDimensions(this.graph()));
  readonly graphByCpId = computed(() => {
    const m: Record<string, GraphNode> = {};
    for (const n of this.graph().nodes) m[n.checkpointId] = n;
    return m;
  });
  readonly graphPos = (node: GraphNode) => ({
    x: this.graphDims().nodeX(node),
    y: this.graphDims().nodeY(node),
  });

  graphEdgePath(edge: GraphEdge): string {
    const byId = this.graphByCpId();
    const from = byId[edge.fromId];
    const to = byId[edge.toId];
    if (!from || !to) return '';
    const dims = this.graphDims();
    const x1 = dims.nodeX(from);
    const y1 = dims.nodeY(from);
    const x2 = dims.nodeX(to);
    const y2 = dims.nodeY(to);
    const midY = (y1 + y2) / 2;
    if (edge.kind === 'linear') {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    // fork / merge / cherry sweep across lanes with an S-curve.
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }

  edgeLabelPos(edge: GraphEdge): { x: number; y: number } {
    const byId = this.graphByCpId();
    const from = byId[edge.fromId];
    const to = byId[edge.toId];
    if (!from || !to) return { x: 0, y: 0 };
    const dims = this.graphDims();
    return {
      x: (dims.nodeX(from) + dims.nodeX(to)) / 2,
      y: (dims.nodeY(from) + dims.nodeY(to)) / 2 - 6,
    };
  }

  edgeKindLabel(kind: GraphEdge['kind']): string {
    switch (kind) {
      case 'fork':
        return 'fork';
      case 'merge':
        return 'merge';
      case 'cherry':
        return 'cherry';
      default:
        return '';
    }
  }

  graphSvgViewBox(): string {
    const d = this.graphDims();
    return `0 0 ${d.width} ${d.height}`;
  }

  laneHeaderX(branchId: string): number {
    const lane = this.graph().lanes[branchId] ?? 0;
    return GRAPH_PAD_X + lane * GRAPH_LANE_W + GRAPH_LANE_W / 2;
  }

  graphNodeTitle(node: GraphNode): string {
    return `${node.label} · ${node.branchName} · ${node.isFullSnapshot ? 'snapshot' : 'delta'}${node.isMergeNode ? ' · merge' : ''}`;
  }

  graphNodeAria(node: GraphNode): string {
    return `Rewind to checkpoint ${node.label} on branch ${node.branchName}`;
  }

  graphNodeRadius(node: GraphNode): number {
    if (node.isMergeNode) return 11;
    return node.isFullSnapshot ? 7 : 5;
  }

  get graphPadY(): number {
    return GRAPH_PAD_Y;
  }
  get graphRowH(): number {
    return GRAPH_ROW_H;
  }
  get graphPadX(): number {
    return GRAPH_PAD_X;
  }

  readonly graphLaneKeys = computed<string[]>(() =>
    this.graph().nodes
      .map((n) => n.branchId)
      .filter((v, i, a) => a.indexOf(v) === i)
  );

  constructor() {
    // Touch the cloud snapshot index so the restore button has data.
    this.cloud.refresh();
    // Pre-populate merge selectors with anything we already know about.
    queueMicrotask(() => {
      const list = this.branches();
      if (list.length >= 2) {
        this.mergeSource.set(list[list.length - 1].id);
        this.mergeTarget.set(list[0].id);
        this.cherryPickTarget.set(list[0].id);
      }
    });
  }

  goBack(): void {
    void this.router.navigate(['/hub']);
  }

  async addCheckpoint(): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(this.draftPayload());
    } catch {
      payload = { raw: this.draftPayload() };
    }
    await this.history.checkpoint(
      this.projectId(),
      this.draftLabel(),
      payload
    );
  }

  async createBranch(): Promise<void> {
    const cps = this.checkpoints();
    const forkFrom = cps.at(-1)?.id ?? null;
    await this.history.createBranch(
      this.projectId(),
      this.newBranchName() || 'experiment',
      forkFrom
    );
    this.newBranchName.set('');
  }

  async switchBranch(branchId: string): Promise<void> {
    await this.history.switchBranch(this.projectId(), branchId);
    this.replayIndex.set(0);
    this.stopReplay();
  }

  async renameBranch(branch: SessionBranch, name: string): Promise<void> {
    await this.history.renameBranch(this.projectId(), branch.id, name);
  }

  async deleteBranch(branch: SessionBranch): Promise<void> {
    await this.history.deleteBranch(this.projectId(), branch.id);
  }

  async rewind(checkpointId: string): Promise<void> {
    const branchId = this.activeBranchId();
    if (!branchId) return;
    await this.history.rewind({ branchId, targetCheckpointId: checkpointId });
  }

  async restoreFromCloud(snapshot: RemoteSnapshot): Promise<void> {
    const branchId = this.activeBranchId();
    if (!branchId) return;
    await this.history.restoreToCloudCheckpoint(branchId, snapshot);
  }

  toggleReplay(): void {
    if (this.isReplaying()) {
      this.stopReplay();
    } else {
      this.startReplay();
    }
  }

  private startReplay(): void {
    const events = this.replayEvents();
    if (events.length === 0) return;
    this.isReplaying.set(true);
    this.replayTimer = setInterval(() => {
      const idx = this.replayIndex();
      if (idx >= events.length - 1) {
        this.stopReplay();
        return;
      }
      this.replayIndex.set(idx + 1);
    }, 700);
  }

  stopReplay(): void {
    this.isReplaying.set(false);
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
  }

  trackById = (_: number, item: { id: string }): string => item.id;
  trackByCheckpoint = (_: number, item: SessionCheckpoint): string => item.id;
  trackEdge = (_: number, item: GraphEdge): string =>
    item.fromId + '→' + item.toId + ':' + item.kind;
  trackGraphNode = (_: number, item: GraphNode): string => item.checkpointId;

  // ─── Sprint D3 — Merge / Rebase / Cherry-pick actions ─────────────

  setMergeSource(branchId: string): void {
    this.mergeSource.set(branchId);
  }
  setMergeTarget(branchId: string): void {
    this.mergeTarget.set(branchId);
  }
  setCherryPickTarget(branchId: string): void {
    this.cherryPickTarget.set(branchId);
  }
  setCherryPickSourceCheckpoint(cpId: string): void {
    this.cherryPickSourceCheckpoint.set(cpId);
  }

  async runMerge(): Promise<void> {
    if (!this.mergeSource() || !this.mergeTarget()) return;
    const result = await this.history.threeWayMerge(
      this.projectId(),
      this.mergeSource(),
      this.mergeTarget()
    );
    if (result?.status === 'conflicts') {
      // Pre-seed the conflict-picks with 'mine' default so the user
      // can submit immediately if they like the default.
      const picks: Record<string, ConflictResolution> = {};
      result.conflicts.forEach((m) => {
        picks[m.field] = { field: m.field, pick: 'mine' };
      });
      this.conflictPicks.set(picks);
    }
  }

  pickConflict(
    marker: ConflictMarker,
    pick: 'mine' | 'theirs' | 'custom',
    customValue?: unknown
  ): void {
    this.conflictPicks.update((m) => ({
      ...m,
      [marker.field]: { field: marker.field, pick, value: customValue },
    }));
  }

  customConflictValue(marker: ConflictMarker, value: string): void {
    const trimmed = value.trim();
    let parsed: unknown = trimmed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Hold raw text as-is if it isn't valid JSON.
    }
    this.pickConflict(marker, 'custom', parsed);
  }

  async submitResolve(): Promise<void> {
    const pending = this.pendingMerge();
    if (!pending) return;
    const resolutions: ConflictResolution[] = pending.conflicts.map((c) => {
      const pick = this.conflictPicks()[c.field];
      if (!pick) return { field: c.field, pick: 'mine' as const };
      return pick;
    });
    await this.history.resolveConflicts({
      projectId: pending.projectId,
      mergeCheckpointId: pending.mergeCheckpointId,
      resolutions,
    });
    this.conflictPicks.set({});
  }

  async runRebase(): Promise<void> {
    if (!this.mergeSource() || !this.mergeTarget()) return;
    await this.history.rebase(
      this.projectId(),
      this.mergeSource(),
      this.mergeTarget()
    );
  }

  async runCherryPick(): Promise<void> {
    if (
      !this.mergeSource() ||
      !this.cherryPickSourceCheckpoint() ||
      !this.cherryPickTarget()
    ) {
      return;
    }
    const result = await this.history.cherryPick(
      this.projectId(),
      this.mergeSource(),
      this.cherryPickSourceCheckpoint(),
      this.cherryPickTarget()
    );
    if (result?.status === 'conflict') {
      const picks: Record<string, ConflictResolution> = {};
      result.conflicts.forEach((c) => {
        picks[c.field] = { field: c.field, pick: 'mine' };
      });
      this.conflictPicks.set(picks);
    }
  }
}
