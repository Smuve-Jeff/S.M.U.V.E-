import { Injectable, inject } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import {
  ConflictRecord,
  RemoteSnapshot,
  SyncEnvelope,
} from '../types/cloud-sync.types';

/** Per-device version cap — old versions roll off, newest always kept. */
export const MAX_VERSIONS_PER_DEVICE = 20;
/** Global cap across every project/device so the IndexedDB record stays small. */
const MAX_TOTAL_VERSIONS = 120;
const CACHE_STORE = 'offline_local_cache';
const SNAPSHOT_KEY = 'cloud_version_history_v1';

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
 *
 * Version history is persisted through LocalStorageService (IndexedDB) so a
 * reload does not wipe the history, and each snapshot is capped per device.
 */
@Injectable({ providedIn: 'root' })
export class MockCloudServer {
  private readonly storage = inject(LocalStorageService);
  private readonly logger = inject(LoggingService);

  /** projectId → the latest RemoteSnapshot across devices. */
  private latestByProject = new Map<string, RemoteSnapshot>();
  /** `${projectId}:${deviceId}` → per-device snapshot history. */
  private historyByDevice = new Map<string, RemoteSnapshot[]>();
  /** One-shot hydration of the persisted history. */
  private hydrated: Promise<void> | null = null;

  /** Test-only seed hook. */
  __seed(snapshots: RemoteSnapshot[]): void {
    this.latestByProject.clear();
    this.historyByDevice.clear();
    for (const s of snapshots) {
      this.record(s);
    }
    this.persist();
  }

  /** Read-only inspection helper for /cloud-vault dashboard. */
  listProjects(): RemoteSnapshot[] {
    return Array.from(this.latestByProject.values()).sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        b.version - a.version ||
        a.projectId.localeCompare(b.projectId)
    );
  }

  listSnapshots(projectId: string): RemoteSnapshot[] {
    const out: RemoteSnapshot[] = [];
    for (const [key, list] of this.historyByDevice.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        out.push(...list);
      }
    }
    return out.sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        b.version - a.version ||
        a.deviceId.localeCompare(b.deviceId)
    );
  }

  async push(
    envelope: SyncEnvelope
  ): Promise<{ success: true; snapshot: RemoteSnapshot } | { success: false; conflict: ConflictRecord }> {
    await this.ensureHydrated();
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
          remoteDeviceName: latest.deviceName ?? latest.deviceId,
          remoteSnapshot: latest,
          detectedAt: Date.now(),
        },
      };
    }

    const snapshot: RemoteSnapshot = {
      projectId: envelope.manifest.projectId,
      deviceId: envelope.manifest.authorDeviceId,
      deviceName: envelope.manifest.deviceName,
      version: envelope.manifest.version,
      data: envelope.payload,
      timestamp: Date.now(),
      title: envelope.manifest.title,
      byteSize: envelope.manifest.byteSize,
    };

    this.record(snapshot);
    this.persist();
    return { success: true, snapshot };
  }

  async pull(projectId: string): Promise<RemoteSnapshot | null> {
    await this.ensureHydrated();
    await this.simulateLatency();
    return this.latestByProject.get(projectId) ?? null;
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private record(snapshot: RemoteSnapshot): void {
    const previous = this.latestByProject.get(snapshot.projectId);
    if (!previous || snapshot.version >= previous.version) {
      this.latestByProject.set(snapshot.projectId, snapshot);
    }

    const key = this.historyKey(snapshot.projectId, snapshot.deviceId);
    const list = this.historyByDevice.get(key) ?? [];
    list.push(snapshot);
    list.sort((a, b) => a.timestamp - b.timestamp || a.version - b.version);
    if (list.length > MAX_VERSIONS_PER_DEVICE) {
      list.splice(0, list.length - MAX_VERSIONS_PER_DEVICE);
    }
    this.historyByDevice.set(key, list);
    this.pruneGlobalCap();
  }

  /** Evict the oldest stored versions once the global cap is exceeded. */
  private pruneGlobalCap(): void {
    const total = () =>
      Array.from(this.historyByDevice.values()).reduce(
        (sum, list) => sum + list.length,
        0,
      );
    while (total() > MAX_TOTAL_VERSIONS) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [key, list] of this.historyByDevice.entries()) {
        const oldest = list[0];
        if (oldest && oldest.timestamp < oldestAt) {
          oldestAt = oldest.timestamp;
          oldestKey = key;
        }
      }
      if (!oldestKey) return;
      const list = this.historyByDevice.get(oldestKey)!;
      list.shift();
      if (list.length === 0) this.historyByDevice.delete(oldestKey);
    }
  }

  private historyKey(projectId: string, deviceId: string): string {
    return `${projectId}:${deviceId}`;
  }

  // ─── Persistence (best-effort) ─────────────────────────────────────

  private ensureHydrated(): Promise<void> {
    if (!this.hydrated) this.hydrated = this.hydrate();
    return this.hydrated;
  }

  private async hydrate(): Promise<void> {
    try {
      const stored = await this.storage.getItem(CACHE_STORE, SNAPSHOT_KEY);
      const value =
        stored && typeof stored === 'object' && 'value' in stored
          ? (stored as { value: unknown }).value
          : stored;
      const snapshots = (value as { snapshots?: RemoteSnapshot[] } | null)
        ?.snapshots;
      if (!Array.isArray(snapshots)) return;
      // Never clobber freshly seeded state (test hook).
      if (this.historyByDevice.size > 0) return;
      for (const snapshot of snapshots) {
        if (isRemoteSnapshot(snapshot)) this.record(snapshot);
      }
      this.logger.info(
        `CloudSync: hydrated ${snapshots.length} stored version(s)`,
      );
    } catch (err) {
      this.logger.warn('CloudSync: version history hydrate failed', err);
    }
  }

  private persist(): void {
    const snapshots: RemoteSnapshot[] = [];
    for (const list of this.historyByDevice.values()) {
      snapshots.push(...list);
    }
    snapshots.sort((a, b) => a.timestamp - b.timestamp || a.version - b.version);
    void this.storage
      .saveItem(CACHE_STORE, { id: SNAPSHOT_KEY, value: { snapshots } })
      .catch((err) =>
        this.logger.warn('CloudSync: version history persist failed', err),
      );
  }

  private simulateLatency(): Promise<void> {
    const delay = 350 + Math.floor(Math.random() * 350);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function isRemoteSnapshot(value: unknown): value is RemoteSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RemoteSnapshot>;
  return (
    typeof snapshot.projectId === 'string' &&
    typeof snapshot.deviceId === 'string' &&
    typeof snapshot.version === 'number' &&
    typeof snapshot.timestamp === 'number'
  );
}
