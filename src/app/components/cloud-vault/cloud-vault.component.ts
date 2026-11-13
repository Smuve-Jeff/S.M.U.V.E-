import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CloudSyncService } from '../../services/cloud-sync.service';
import { ConflictRecord, RemoteSnapshot } from '../../types/cloud-sync.types';
import {
  OfflineSyncService,
} from '../../services/offline-sync.service';
import { WorkProtectionService } from '../../studio/work-protection.service';

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
  private readonly workProtection = inject(WorkProtectionService);

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
    void this.cloud.refresh();
  }

  goBack(): void {
    void this.router.navigate(['/hub']);
  }

  toggleOffline(): void {
    this.cloud.toggleSimulatedOffline();
  }

  async seedOtherDevice(): Promise<void> {
    // Quick demo helper — waits for the real cloud index, then injects a
    // competing remote version into the conflict view. No mock-only hooks.
    await this.cloud.refresh();
    const targetId = this.demoProjectId();
    if (!this.cloud.cloudProjects().some((p) => p.projectId === targetId)) {
      await this.cloud.push(targetId, this.demoTitle(), this.parsePayload());
    }
    this.cloud.seedDemoConflict(targetId);
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
    void this.cloud.refresh();
  }

  async pullDemo(): Promise<void> {
    const snap = await this.cloud.pull(this.demoProjectId());
    if (snap) {
      await this.cloud.refresh();
    }
  }

  async resolve(projectId: string, strategy: 'mine' | 'theirs' | 'merge'): Promise<void> {
    const payload = strategy === 'merge' ? this.parsePayload() : undefined;
    await this.cloud.resolveConflict(projectId, strategy, payload);
    await this.cloud.refresh();
  }

  loadSnapshots(projectId: string): void {
    this.snapshotsFor.update((m) => ({
      ...m,
      [projectId]: this.cloud.listSnapshots(projectId),
    }));
  }

  async restore(projectId: string, snapshot: RemoteSnapshot): Promise<void> {
    // Restoring a cloud version replaces the open session, so the same gate
    // that protects imports must run before it lands.
    if (
      !(await this.workProtection.preserveBeforeReplace("cloud_restore_vault"))
    ) {
      return;
    }
    // Restore the snapshot's own payload — NOT the demo-project editor
    // textarea (which is only for the push demo).
    await this.cloud.restoreFromBackup(projectId, snapshot);
  }

  /** Conflict rows carry no id of their own; the index is the stable key. */
  trackById = (index: number, item: unknown): string | number =>
    (item as { id?: string } | null)?.id ?? index;
  trackByProjectId = (_: number, item: RemoteSnapshot): string =>
    item.projectId + ':' + item.deviceId;
}
