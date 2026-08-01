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

  constructor() {
    // Touch the cloud snapshot index so the restore button has data.
    this.cloud.refresh();
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
}
