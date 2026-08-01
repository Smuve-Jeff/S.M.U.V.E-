import { Injectable } from '@angular/core';
import {
  ConflictRecord,
  RemoteSnapshot,
  SyncEnvelope,
} from '../types/cloud-sync.types';

/**
 * Sprint D1 — MockCloudServer.
 *
 * Drop-in shim that emulates a real cloud backend. The preview runs
 * end-to-end without a network so the user can witness push, pull,
 * conflict and restore behavior. Production swaps in a real client
 * via the same push/pull contract.
 *
 * Deterministic latency: 350-700ms per round-trip.
 * Multi-device storage: keyed `${projectId}:${deviceId}` so a
 * restoreFromBackup can pick the right author.
 */
@Injectable({ providedIn: 'root' })
export class MockCloudServer {
  /** projectId → the latest RemoteSnapshot across devices. */
  private latestByProject = new Map<string, RemoteSnapshot>();
  /** `${projectId}:${deviceId}` → per-device snapshot history. */
  private historyByDevice = new Map<string, RemoteSnapshot[]>();

  /** Test-only seed hook. */
  __seed(snapshots: RemoteSnapshot[]): void {
    this.latestByProject.clear();
    this.historyByDevice.clear();
    for (const s of snapshots) {
      this.latestByProject.set(s.projectId, s);
      const key = this.historyKey(s.projectId, s.deviceId);
      const list = this.historyByDevice.get(key) ?? [];
      list.push(s);
      this.historyByDevice.set(key, list);
    }
  }

  /** Read-only inspection helper for /cloud-vault dashboard. */
  listProjects(): RemoteSnapshot[] {
    return Array.from(this.latestByProject.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  listSnapshots(projectId: string): RemoteSnapshot[] {
    const out: RemoteSnapshot[] = [];
    for (const [key, list] of this.historyByDevice.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        out.push(...list);
      }
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }

  async push(
    envelope: SyncEnvelope
  ): Promise<{ success: true; snapshot: RemoteSnapshot } | { success: false; conflict: ConflictRecord }> {
    await this.simulateLatency();

    const latest = this.latestByProject.get(envelope.manifest.projectId);
    if (latest && latest.version > envelope.manifest.version) {
      return {
        success: false,
        conflict: {
          projectId: envelope.manifest.projectId,
          localVersion: envelope.manifest.version,
          remoteVersion: latest.version,
          remoteDeviceId: latest.deviceId,
          remoteDeviceName: latest.deviceId,
          remoteSnapshot: latest,
          detectedAt: Date.now(),
        },
      };
    }

    const snapshot: RemoteSnapshot = {
      projectId: envelope.manifest.projectId,
      deviceId: envelope.manifest.authorDeviceId,
      version: envelope.manifest.version,
      data: envelope.payload,
      timestamp: Date.now(),
      title: envelope.manifest.title,
      byteSize: envelope.manifest.byteSize,
    };

    this.latestByProject.set(snapshot.projectId, snapshot);
    const key = this.historyKey(snapshot.projectId, snapshot.deviceId);
    const list = this.historyByDevice.get(key) ?? [];
    list.push(snapshot);
    this.historyByDevice.set(key, list);

    return { success: true, snapshot };
  }

  async pull(projectId: string): Promise<RemoteSnapshot | null> {
    await this.simulateLatency();
    return this.latestByProject.get(projectId) ?? null;
  }

  private historyKey(projectId: string, deviceId: string): string {
    return `${projectId}:${deviceId}`;
  }

  private simulateLatency(): Promise<void> {
    const delay = 350 + Math.floor(Math.random() * 350);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
