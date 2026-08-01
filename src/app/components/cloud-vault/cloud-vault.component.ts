import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CloudSyncService } from '../../services/cloud-sync.service';
import { ConflictRecord, RemoteSnapshot } from '../../types/cloud-sync.types';
import {
  OfflineSyncService,
} from '../../services/offline-sync.service';

@Component({
  selector: 'app-cloud-vault',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './cloud-vault.component.html',
  styleUrl: './cloud-vault.component.css',
})
export class CloudVaultComponent {
  cloud = inject(CloudSyncService);
  offline = inject(OfflineSyncService);
  private router = inject(Router);

  /** Push a demo project used for interactive showcase. */
  readonly demoProjectId = signal<string>('proj_demo_001');
  readonly demoTitle = signal<string>('First Beat Demo');
  readonly demoPayload = signal<string>(
    '{"tempo":128,"key":"A minor","tracks":["drums","bass","chords","lead"]}'
  );

  /** Per-project extra payload editors for quick push demos. */
  readonly seedProjects = signal<Array<{ id: string; title: string; bytes: number }>>([
    { id: 'proj_demo_001', title: 'First Beat Demo', bytes: 88 },
    { id: 'proj_demo_002', title: 'Lo-Fi Study Loop', bytes: 134 },
    { id: 'proj_demo_003', title: 'Trap Crown', bytes: 156 },
  ]);

  readonly recentCloudProjects = computed(() =>
    this.cloud.cloudProjects().slice(0, 8)
  );

  readonly pushBusy = computed(
    () => this.cloud.pushStatus() === 'syncing'
  );

  readonly conflictRows = computed<ConflictRecord[]>(() =>
    Object.values(this.cloud.conflictMap())
  );

  /** Snapshot picker keyed by projectId. */
  readonly snapshotsFor = signal<Record<string, RemoteSnapshot[]>>({});

  constructor() {
    this.cloud.refresh();
  }

  goBack(): void {
    void this.router.navigate(['/hub']);
  }

  toggleOffline(): void {
    this.cloud.toggleSimulatedOffline();
  }

  seedOtherDevice(): void {
    // Quick demo helper — manually push a competing edit from a
    // different device so the user can see a conflict fire.
    this.cloud.refresh();
    const targetId = this.demoProjectId();
    const currentRemote = this.cloud
      .cloudProjects()
      .find((p) => p.projectId === targetId);
    const stubVersion = (currentRemote?.version ?? 0) + 2;
    (this.cloud as any).cloud.__seed?.([
      ...this.cloud.cloudProjects(),
      {
        projectId: targetId,
        deviceId: 'dev_remote_phone',
        version: stubVersion,
        data: { remote: true, editedAt: Date.now() },
        timestamp: Date.now(),
        title: currentRemote?.title ?? 'First Beat Demo',
        byteSize: 64,
      },
    ]);
    // Refresh internal store accessor name.
    this.cloud.refresh();
  }

  parsePayload(): unknown {
    try {
      return JSON.parse(this.demoPayload());
    } catch {
      return { raw: this.demoPayload() };
    }
  }

  async pushDemo(): Promise<void> {
    await this.cloud.push(
      this.demoProjectId(),
      this.demoTitle(),
      this.parsePayload()
    );
    this.cloud.refresh();
  }

  async pullDemo(): Promise<void> {
    const snap = await this.cloud.pull(this.demoProjectId());
    if (snap) {
      this.cloud.refresh();
    }
  }

  async resolve(projectId: string, strategy: 'mine' | 'theirs' | 'merge'): Promise<void> {
    const payload = strategy === 'merge' ? this.parsePayload() : undefined;
    await this.cloud.resolveConflict(projectId, strategy, payload);
    this.cloud.refresh();
  }

  loadSnapshots(projectId: string): void {
    this.snapshotsFor.update((m) => ({
      ...m,
      [projectId]: this.cloud.listSnapshots(projectId),
    }));
  }

  restore(projectId: string, snapshot: RemoteSnapshot): void {
    this.cloud.restoreFromBackup(projectId, snapshot, this.parsePayload());
  }

  trackById = (_: number, item: { id: string }): string => item.id;
  trackByProjectId = (_: number, item: RemoteSnapshot): string =>
    item.projectId + ':' + item.deviceId;
}
