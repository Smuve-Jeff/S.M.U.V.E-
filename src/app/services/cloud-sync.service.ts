import { Injectable, computed, inject, signal } from '@angular/core';
import { OfflineSyncService } from './offline-sync.service';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { MockCloudServer } from './mock-cloud-server';
import {
  CloudDevice,
  ConflictRecord,
  ConflictStrategy,
  ProjectManifest,
  RemoteSnapshot,
  SyncStatus,
  SyncTimelineEntry,
} from '../types/cloud-sync.types';

const DEVICE_KEY = 'smuve_cloud_device';
const TIMELINE_KEY = 'smuve_cloud_timeline';
const PROJECTS_KEY = 'smuve_cloud_projects';
const LOCAL_CACHE_STORE = 'offline_local_cache';
const OFFLINE_PUSH_ENDPOINT = '/mock-cloud/push';
const PLATFORM =
  typeof navigator !== 'undefined' && navigator.platform
    ? navigator.platform
    : 'web';

/**
 * Sprint D1 — CloudSyncService.
 *
 * Signal-driven orchestrator on top of MockCloudServer + OfflineSync.
 * Responsibilities:
 *   • Stable per-device id + CloudDevice registry (persisted).
 *   • Push/pull envelopes with version-stamped manifests.
 *   • Detect competing edits and surface them as a ConflictRecord map.
 *   • Resolve conflicts by strategy (mine, theirs, merge-deep).
 *   • Restore older per-device snapshots back to the current device.
 *   • Degrade gracefully: if the cloud is unreachable, queue a sync
 *     through the existing OfflineSync queue so the user keeps
 *     shipping edits offline.
 */
@Injectable({ providedIn: 'root' })
export class CloudSyncService {
  private cloud = inject(MockCloudServer);
  private offlineSync = inject(OfflineSyncService);
  private storage = inject(LocalStorageService);
  private logger = inject(LoggingService);

  private readonly TIMELINE_CAP = 50;

  /** Stable per-device id, persisted across reloads. */
  readonly deviceId = signal<string>(this.loadOrMintDeviceId());
  readonly deviceName = signal<string>(this.loadOrMintDeviceName());

  /** Local project manifest mirror — one entry per authored project. */
  readonly localManifests = signal<Record<string, ProjectManifest>>({});

  /** Conflict map keyed by projectId. */
  readonly conflictMap = signal<Record<string, ConflictRecord>>({});

  /** Push status — coarse-grained so the header pill can light up. */
  readonly pushStatus = signal<SyncStatus>('idle');

  /** Pull status (kept separate so the dashboard can show both). */
  readonly pullStatus = signal<SyncStatus>('idle');

  /** Last successful push timestamp. */
  readonly lastSyncedAt = signal<number | null>(null);

  /** Dashboard-visible remote snapshot index, refreshed by refresh(). */
  readonly cloudProjects = signal<RemoteSnapshot[]>([]);

  /** Most recent ~50 sync timeline entries. */
  readonly timeline = signal<SyncTimelineEntry[]>([]);
  private unregisterOfflinePushHandler: (() => void) | null = null;

  /**
   * Manual chaos switch — set to false in code to simulate offline
   * even when navigator says we're connected. UI toggles this so the
   * user can witness the offline-sync queue behaviour on demand.
   */
  readonly simulatedNetworkOnline = signal<boolean>(true);

  /** Cloud is reachable iff: navigator.onLine AND offline-sync queue says online AND no manual override. */
  readonly isCloudReachable = computed(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (this.offlineSync.networkStatus() === 'offline') return false;
    return this.simulatedNetworkOnline();
  });

  /** Conflict count for header badge. */
  readonly conflictCount = computed(
    () => Object.keys(this.conflictMap()).length
  );

  constructor() {
    this.unregisterOfflinePushHandler = this.offlineSync.registerEndpointHandler(
      OFFLINE_PUSH_ENDPOINT,
      (item) => this.replayOfflinePush(item)
    );
    void this.hydrate();
  }

  // ─── Registration / hydration ──────────────────────────────────────

  private loadOrMintDeviceId(): string {
    if (typeof localStorage === 'undefined') {
      return this.mintDeviceId();
    }
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as CloudDevice;
        return parsed.id;
      } catch {
        /* fall through */
      }
    }
    const id = this.mintDeviceId();
    const device: CloudDevice = {
      id,
      name: this.suggestedDeviceName(),
      registeredAt: Date.now(),
      lastActive: Date.now(),
      platform: PLATFORM,
    };
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    return id;
  }

  private loadOrMintDeviceName(): string {
    if (typeof localStorage === 'undefined') return this.suggestedDeviceName();
    try {
      const raw = localStorage.getItem(DEVICE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CloudDevice;
        return parsed.name;
      }
    } catch {
      /* fall through */
    }
    return this.suggestedDeviceName();
  }

  private mintDeviceId(): string {
    return 'dev_' + Math.random().toString(36).slice(2, 10);
  }

  private suggestedDeviceName(): string {
    const ua =
      typeof navigator !== 'undefined' && navigator.userAgent
        ? navigator.userAgent
        : '';
    if (/iPhone|iPad/.test(ua)) return 'iOS Studio';
    if (/Android/.test(ua)) return 'Android Studio';
    if (/Mac/.test(ua)) return 'Mac Studio';
    if (/Windows/.test(ua)) return 'Win Studio';
    return 'S.M.U.V.E. Studio';
  }

  setDeviceName(name: string): void {
    const trimmed = name.trim().slice(0, 64);
    if (!trimmed) return;
    this.deviceName.set(trimmed);
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEVICE_KEY);
      const parsed = stored
        ? (JSON.parse(stored) as CloudDevice)
        : {
            id: this.deviceId(),
            name: trimmed,
            registeredAt: Date.now(),
            lastActive: Date.now(),
            platform: PLATFORM,
          };
      parsed.name = trimmed;
      parsed.lastActive = Date.now();
      localStorage.setItem(DEVICE_KEY, JSON.stringify(parsed));
    }
  }

  /** Pull historical state out of LocalStorageService into the signals. */
  private async hydrate(): Promise<void> {
    try {
      const stored = await this.readLocalValue<Record<string, ProjectManifest>>(
        PROJECTS_KEY
      );
      if (stored && typeof stored === 'object') {
        this.localManifests.set(stored);
      }
      const timeline = await this.readLocalValue<SyncTimelineEntry[]>(
        TIMELINE_KEY
      );
      if (Array.isArray(timeline)) this.timeline.set(timeline);
    } catch (err) {
      this.logger.warn('CloudSync: hydrate failed', err);
    }
  }

  // ─── Sync primitives ───────────────────────────────────────────────

  /**
   * Push a project payload to the cloud. Increments local version,
   * sends an envelope, and writes the timeline. On conflict, the entry
   * is added to conflictMap for the resolver.
   */
  async push(
    projectId: string,
    title: string,
    payload: unknown
  ): Promise<SyncStatus> {
    const existingManifest = this.localManifests()[projectId];
    const nextVersion = (existingManifest?.version ?? 0) + 1;
    const manifest: ProjectManifest = {
      projectId,
      version: nextVersion,
      lastModified: Date.now(),
      authorDeviceId: this.deviceId(),
      title: title || existingManifest?.title || 'Untitled Project',
      byteSize: this.byteSize(payload),
    };

    if (!this.isCloudReachable()) {
      await this.offlineSync.queueOperation(
        'UPDATE',
        OFFLINE_PUSH_ENDPOINT,
        { projectId, manifest, payload }
      );
      this.pushStatus.set('queued');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: manifest.title,
        direction: 'push',
        status: 'queued',
        at: Date.now(),
        note: 'Offline — queued for sync',
      });
      return 'queued';
    }

    this.pushStatus.set('syncing');
    try {
      const result = await this.cloud.push({ manifest, payload });
      if (result.success === false) {
        const conflict = result.conflict;
        this.conflictMap.update((m) => ({
          ...m,
          [projectId]: conflict,
        }));
        this.pushStatus.set('conflict');
        this.appendTimeline({
          id: this.timelineId(),
          projectId,
          projectTitle: manifest.title,
          direction: 'push',
          status: 'conflict',
          at: Date.now(),
          note: `Remote v${conflict.remoteVersion} > local v${conflict.localVersion}`,
        });
        return 'conflict';
      }
      await this.persistManifest(projectId, manifest);
      this.lastSyncedAt.set(Date.now());
      this.pushStatus.set('success');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: manifest.title,
        direction: 'push',
        status: 'success',
        at: Date.now(),
      });
      this.cloudProjects.set(this.cloud.listProjects());
      return 'success';
    } catch (err) {
      this.logger.error('CloudSync: push failed', err);
      this.pushStatus.set('error');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: manifest.title,
        direction: 'push',
        status: 'error',
        at: Date.now(),
        note: 'Network error',
      });
      return 'error';
    }
  }

  /**
   * Pull a project snapshot from the cloud and overwrite the local
   * manifest mirror. Does NOT mutate user-project state — the caller
   * decides what to do with the returned RemoteSnapshot (typically
   * write it through ProjectService or stage it for review).
   */
  async pull(projectId: string): Promise<RemoteSnapshot | null> {
    if (!this.isCloudReachable()) {
      this.pullStatus.set('queued');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: this.localManifests()[projectId]?.title ?? 'Project',
        direction: 'pull',
        status: 'queued',
        at: Date.now(),
        note: 'Offline — pull will retry',
      });
      return null;
    }

    this.pullStatus.set('syncing');
    try {
      const snapshot = await this.cloud.pull(projectId);
      if (!snapshot) {
        this.pullStatus.set('idle');
        return null;
      }
      const manifest: ProjectManifest = {
        projectId,
        version: snapshot.version,
        lastModified: snapshot.timestamp,
        authorDeviceId: snapshot.deviceId,
        title: snapshot.title,
        byteSize: snapshot.byteSize,
      };
      await this.persistManifest(projectId, manifest);
      this.pullStatus.set('success');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: snapshot.title,
        direction: 'pull',
        status: 'success',
        at: Date.now(),
      });
      return snapshot;
    } catch (err) {
      this.logger.error('CloudSync: pull failed', err);
      this.pullStatus.set('error');
      return null;
    }
  }

  // ─── Conflict resolution ───────────────────────────────────────────

  async resolveConflict(
    projectId: string,
    strategy: ConflictStrategy,
    payloadOverride?: unknown
  ): Promise<void> {
    const conflict = this.conflictMap()[projectId];
    if (!conflict) return;

    let resolvedPayload: unknown;
    let targetVersion: number;
    switch (strategy) {
      case 'mine':
        resolvedPayload = payloadOverride;
        targetVersion = conflict.remoteVersion + 1;
        break;
      case 'theirs':
        resolvedPayload = conflict.remoteSnapshot.data;
        targetVersion = conflict.remoteVersion;
        break;
      case 'merge':
        resolvedPayload = this.mergeDeep(
          payloadOverride ?? {},
          conflict.remoteSnapshot.data
        );
        targetVersion = Math.max(
          conflict.localVersion,
          conflict.remoteVersion
        ) + 1;
        break;
    }

    // Clear conflict first so the subsequent push isn't blocked by it.
    this.conflictMap.update((m) => {
      const copy = { ...m };
      delete copy[projectId];
      return copy;
    });

    // Stage the local manifest so push() increments from a non-stale
    // baseline (otherwise it re-detects the conflict and re-adds it).
    await this.persistManifest(projectId, {
      projectId,
      version: Math.max(targetVersion - 1, 0),
      lastModified: Date.now(),
      authorDeviceId: this.deviceId(),
      title: conflict.remoteSnapshot.title,
      byteSize: this.byteSize(resolvedPayload),
    });

    await this.push(projectId, conflict.remoteSnapshot.title, resolvedPayload);

    this.appendTimeline({
      id: this.timelineId(),
      projectId,
      projectTitle: conflict.remoteSnapshot.title,
      direction: 'pull',
      status: 'success',
      at: Date.now(),
      note: `Resolved (${strategy})`,
    });
  }

  ngOnDestroy(): void {
    this.unregisterOfflinePushHandler?.();
    this.unregisterOfflinePushHandler = null;
  }

  private async replayOfflinePush(item: {
    payload: { projectId: string; manifest: ProjectManifest; payload: unknown };
  }): Promise<void> {
    const envelope = item.payload;
    if (
      !envelope ||
      typeof envelope.projectId !== 'string' ||
      !envelope.manifest ||
      !('payload' in envelope)
    ) {
      const error = new Error('Invalid queued cloud push payload') as Error & {
        statusCode?: number;
      };
      error.statusCode = 422;
      throw error;
    }

    const result = await this.cloud.push({
      manifest: envelope.manifest,
      payload: envelope.payload,
    });
    if (result.success === false) {
      this.conflictMap.update((m) => ({
        ...m,
        [envelope.projectId]: result.conflict,
      }));
      this.pushStatus.set('conflict');
      const error = new Error('Queued cloud push conflicted with a newer remote version') as Error & {
        statusCode?: number;
      };
      error.statusCode = 409;
      throw error;
    }

    await this.persistManifest(envelope.projectId, envelope.manifest);
    this.lastSyncedAt.set(Date.now());
    this.pushStatus.set('success');
    this.appendTimeline({
      id: this.timelineId(),
      projectId: envelope.projectId,
      projectTitle: envelope.manifest.title,
      direction: 'push',
      status: 'success',
      at: Date.now(),
      note: 'Queued edit replayed after network recovery',
    });
    this.cloudProjects.set(this.cloud.listProjects());
  }

  // ─── Restore / refresh ─────────────────────────────────────────────

  async restoreFromBackup(
    projectId: string,
    snapshot: RemoteSnapshot,
    localPayload?: unknown
  ): Promise<void> {
    // Restore brings the SNAPSHOT's content back into the local store and
    // stages it for the next push. We bump version to remoteVersion + 1 so
    // the server will accept it without re-conflicting. `localPayload` is
    // only a fallback for snapshots that carry no data (defensive — every
    // push stores its payload, so snapshot.data is normally present).
    const restoredPayload = snapshot.data ?? localPayload;
    const manifest: ProjectManifest = {
      projectId,
      version: snapshot.version + 1,
      lastModified: Date.now(),
      authorDeviceId: this.deviceId(),
      title: snapshot.title,
      byteSize: snapshot.byteSize,
    };
    await this.persistManifest(projectId, manifest);
    await this.push(projectId, snapshot.title, restoredPayload);
  }

  /** Pull the cloud's latest snapshots into the local index. */
  refresh(): void {
    this.cloudProjects.set(this.cloud.listProjects());
  }

  listSnapshots(projectId: string): RemoteSnapshot[] {
    return this.cloud.listSnapshots(projectId);
  }

  // ─── Network toggle for the dashboard ──────────────────────────────

  toggleSimulatedOffline(): void {
    this.simulatedNetworkOnline.update((v) => !v);
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private async persistManifest(
    projectId: string,
    manifest: ProjectManifest
  ): Promise<void> {
    const next = { ...this.localManifests(), [projectId]: manifest };
    this.localManifests.set(next);
    try {
      await this.writeLocalValue(PROJECTS_KEY, next);
    } catch (err) {
      this.logger.warn('CloudSync: persist manifest failed', err);
    }
  }

  private appendTimeline(entry: SyncTimelineEntry): void {
    const next = [entry, ...this.timeline()].slice(0, this.TIMELINE_CAP);
    this.timeline.set(next);
    void this.writeLocalValue(TIMELINE_KEY, next).catch(() => undefined);
  }

  private async readLocalValue<T>(key: string): Promise<T | null> {
    const stored = await this.storage.getItem(LOCAL_CACHE_STORE, key);
    if (stored && typeof stored === 'object' && 'value' in stored) {
      return (stored as { value: T }).value;
    }
    return (stored as T | null) ?? null;
  }

  private writeLocalValue(key: string, value: unknown): Promise<void> {
    return this.storage.saveItem(LOCAL_CACHE_STORE, { id: key, value });
  }

  private timelineId(): string {
    return 'sync_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  private byteSize(payload: unknown): number {
    try {
      return JSON.stringify(payload ?? null).length;
    } catch {
      return 0;
    }
  }

  /**
   * Tiny deep-merge for the 'merge' conflict strategy. Top-level keys
   * are union'd; primitive collisions keep the local value. Shallow
   * enough to keep the user in control — anything they care about can
   * still be hand-tweaked after the merge.
   */
  private mergeDeep(local: unknown, remote: unknown): unknown {
    if (typeof local !== 'object' || local === null) return local;
    if (typeof remote !== 'object' || remote === null) return local;
    const out: Record<string, unknown> = { ...(remote as Record<string, unknown>) };
    for (const [k, v] of Object.entries(local as Record<string, unknown>)) {
      out[k] = v;
    }
    return out;
  }
}
