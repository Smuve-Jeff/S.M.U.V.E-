import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { OfflineSyncService } from './offline-sync.service';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import {
  CLOUD_SERVER,
  CloudServerClient,
} from './cloud-server-client';
import {
  CloudDevice,
  ConflictRecord,
  ConflictStrategy,
  ProjectManifest,
  RemoteSnapshot,
  SyncStatus,
  SyncTimelineEntry,
} from '../types/cloud-sync.types';
import { saveJson } from './guarded-storage';

/**
 * Pushes at or above this size earn a notice (and a metered-connection
 * confirm in the Studio): a song-length stereo set stringifies to tens of
 * megabytes, which is a rude surprise on a phone radio.
 */
export const LARGE_PUSH_BYTES = 8 * 1024 * 1024;

const DEVICE_KEY = 'smuve_cloud_device';
const TIMELINE_KEY = 'smuve_cloud_timeline';
const PROJECTS_KEY = 'smuve_cloud_projects';
const LOCAL_CACHE_STORE = 'offline_local_cache';
const OFFLINE_PUSH_ENDPOINT = '/cloud/push';
const PLATFORM =
  typeof navigator !== 'undefined' && navigator.platform
    ? navigator.platform
    : 'web';

/**
 * Approximate the JSON body size without materialising it. The estimate is
 * intentionally conservative for numbers and strings; its callers use it for
 * a byte-count badge and the large-upload warning, not storage accounting.
 */
function estimateJsonBytes(value: unknown): number {
  const seen = new WeakSet<object>();
  const walk = (entry: unknown): number => {
    if (entry === null || entry === undefined) return 4;
    switch (typeof entry) {
      case 'string':
        return entry.length + 2;
      case 'number':
        return Number.isFinite(entry) ? 16 : 4;
      case 'boolean':
        return entry ? 4 : 5;
      case 'bigint':
        return String(entry).length;
      case 'object': {
        if (seen.has(entry)) return 0;
        seen.add(entry);
        if (Array.isArray(entry)) {
          return 2 + entry.reduce((total, item, index) =>
            total + walk(item) + (index > 0 ? 1 : 0), 0);
        }
        if (ArrayBuffer.isView(entry)) {
          return 2 + entry.byteLength * 4;
        }
        const record = entry as Record<string, unknown>;
        let total = 2;
        let first = true;
        for (const [key, item] of Object.entries(record)) {
          if (item === undefined) continue;
          total += (first ? 0 : 1) + key.length + 3 + walk(item);
          first = false;
        }
        return total;
      }
      default:
        return 4;
    }
  };
  return walk(value);
}

/**
 * Sprint D1 — CloudSyncService.
 *
 * Signal-driven orchestrator on top of the authenticated cloud client + OfflineSync.
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
  private cloud = inject<CloudServerClient>(CLOUD_SERVER);
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

  /**
   * Set when the last measured push crossed LARGE_PUSH_BYTES (cleared by
   * the next small push or a success). The Studio reads this before
   * pushing a big set over a metered connection.
   */
  readonly largePushNotice = signal<{
    bytes: number;
    threshold: number;
  } | null>(null);

  /** Pull status (kept separate so the dashboard can show both). */
  readonly pullStatus = signal<SyncStatus>('idle');

  /**
   * Live multipart progress from the transport (null when it reports
   * none — single-shot pushes and the mock stay null the whole way).
   */
  readonly uploadProgress = computed(() => this.cloud.uploadProgress?.() ?? null);

  /** Last successful push timestamp. */
  readonly lastSyncedAt = signal<number | null>(null);

  /** Dashboard-visible remote snapshot index, refreshed by refresh(). */
  readonly cloudProjects = signal<RemoteSnapshot[]>([]);

  /** Snapshot history cache so synchronous dashboards keep working. */
  readonly remoteSnapshots = signal<Record<string, RemoteSnapshot[]>>({});
  private refreshing = false;

  /** Most recent ~50 sync timeline entries. */
  readonly timeline = signal<SyncTimelineEntry[]>([]);

  /**
   * A project version is now confirmed in the cloud. The Studio listens so a
   * durable "queued" badge can become "in cloud" after an offline replay,
   * not just when the save first happened.
   */
  readonly pushSucceeded$ = new Subject<{
    projectId: string;
    at: number;
    /** Echo of the identity the caller queued, so a badge can match it. */
    uploadId?: string;
  }>();
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
    let existing: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        existing = localStorage.getItem(DEVICE_KEY);
      }
    } catch {
      existing = null;
    }
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
    saveJson(DEVICE_KEY, device, 'localStorage');
    return id;
  }

  private loadOrMintDeviceName(): string {
    try {
      if (typeof localStorage === 'undefined') return this.suggestedDeviceName();
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
    try {
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
        saveJson(DEVICE_KEY, parsed, 'localStorage');
      }
    } catch {
      // The in-memory name is enough when device storage is unavailable.
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
   * Approximate JSON size of a push payload. This deliberately avoids a full
   * JSON.stringify: a cloud bundle now carries base64 PCM, and materialising
   * another complete string just to update a manifest byte count is a large
   * avoidable allocation on the save path. The estimate is used for display
   * and the large-push threshold, not for storage accounting.
   */
  payloadBytes(payload: unknown): number {
    return estimateJsonBytes(payload);
  }

  /**
   * THE write path for versioned cloud history: build the next manifest
   * for this device and queue the envelope for the offline replay
   * adapter. When the radio is up the queue replays immediately, so
   * callers get one contract — queuePush — whether online or off.
   */
  async queuePush(
    projectId: string,
    title: string,
    payload: unknown,
    uploadId?: string
  ): Promise<string> {
    const existingManifest = this.localManifests()[projectId];
    const manifest: ProjectManifest = {
      projectId,
      version: (existingManifest?.version ?? 0) + 1,
      lastModified: Date.now(),
      authorDeviceId: this.deviceId(),
      deviceName: this.deviceName(),
      title: title || existingManifest?.title || 'Untitled Project',
      byteSize: this.payloadBytes(payload),
    };
    const syncId = await this.offlineSync.queueOperation(
      'UPDATE',
      OFFLINE_PUSH_ENDPOINT,
      { projectId, manifest, payload, ...(uploadId ? { uploadId } : {}) }
    );
    this.pushStatus.set('queued');
    this.appendTimeline({
      id: this.timelineId(),
      projectId,
      projectTitle: manifest.title,
      direction: 'push',
      status: 'queued',
      at: Date.now(),
      note: 'Queued for sync',
    });
    return syncId;
  }

  /**
   * Push a project payload to the cloud. Increments local version,
   * sends an envelope, and writes the timeline. On conflict, the entry
   * is added to conflictMap for the resolver.
   */
  async push(
    projectId: string,
    title: string,
    payload: unknown,
    uploadId?: string
  ): Promise<SyncStatus> {
    const bytes = this.payloadBytes(payload);
    this.largePushNotice.set(
      bytes >= LARGE_PUSH_BYTES ? { bytes, threshold: LARGE_PUSH_BYTES } : null
    );
    const existingManifest = this.localManifests()[projectId];
    const nextVersion = (existingManifest?.version ?? 0) + 1;
    const manifest: ProjectManifest = {
      projectId,
      version: nextVersion,
      lastModified: Date.now(),
      authorDeviceId: this.deviceId(),
      deviceName: this.deviceName(),
      title: title || existingManifest?.title || 'Untitled Project',
      byteSize: bytes,
    };

    if (!this.isCloudReachable()) {
      await this.queuePush(projectId, title, payload, uploadId);
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
      this.pushSucceeded$.next({ projectId, at: Date.now(), uploadId });
      this.lastSyncedAt.set(Date.now());
      this.pushStatus.set('success');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: manifest.title,
        direction: 'push',
        status: 'success',
        at: Date.now(),
        uploadId,
      });
      if (result.snapshot) this.rememberSnapshot(result.snapshot);
      await this.refresh();
      return 'success';
    } catch (err) {
      this.logger.error('CloudSync: push failed', err);
      // Resume, don't drop: the payload goes back through the offline
      // queue so a push that dies mid-upload is replayed after recovery
      // instead of vanishing into an 'error' pill. Unrecoverable payloads
      // (4xx) dead-letter there instead of retrying forever.
      await this.offlineSync.queueOperation(
        'UPDATE',
        OFFLINE_PUSH_ENDPOINT,
        { projectId, manifest, payload, ...(uploadId ? { uploadId } : {}) }
      );
      this.pushStatus.set('queued');
      this.appendTimeline({
        id: this.timelineId(),
        projectId,
        projectTitle: manifest.title,
        direction: 'push',
        status: 'queued',
        at: Date.now(),
        note: 'Upload failed mid-push — queued for retry',
      });
      return 'queued';
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
      this.rememberSnapshot(snapshot);
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
      deviceName: this.deviceName(),
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
    payload: {
      projectId: string;
      manifest: ProjectManifest;
      payload: unknown;
      uploadId?: string;
    };
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
    this.pushSucceeded$.next({
      projectId: envelope.projectId,
      at: Date.now(),
      uploadId: envelope.uploadId,
    });
    this.lastSyncedAt.set(Date.now());
    this.pushStatus.set('success');
    const replayedBytes = this.payloadBytes(envelope.payload);
    this.largePushNotice.set(
      replayedBytes >= LARGE_PUSH_BYTES
        ? { bytes: replayedBytes, threshold: LARGE_PUSH_BYTES }
        : null
    );
    this.appendTimeline({
      id: this.timelineId(),
      projectId: envelope.projectId,
      projectTitle: envelope.manifest.title,
      direction: 'push',
      status: 'success',
      at: Date.now(),
      uploadId: envelope.uploadId,
      note:
        replayedBytes >= LARGE_PUSH_BYTES
          ? 'Large queued upload replayed after network recovery'
          : 'Queued edit replayed after network recovery',
    });
    await this.refresh();
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
    if (restoredPayload === undefined || restoredPayload === null) {
      throw new Error('The selected cloud version has no restorable project data.');
    }
    const snapshots = await this.cloud.listSnapshots(projectId);
    const latest = snapshots[0];
    const manifest: ProjectManifest = {
      projectId,
      version: Math.max(latest?.version ?? 0, snapshot.version) + 1,
      lastModified: Date.now(),
      authorDeviceId: this.deviceId(),
      deviceName: this.deviceName(),
      title: snapshot.title,
      byteSize: this.byteSize(restoredPayload),
    };
    // Stage the restore at remote+1 so the deterministic push below lands
    // above every snapshot the cloud already holds.
    await this.persistManifest(projectId, manifest);
    const status = await this.push(projectId, snapshot.title, restoredPayload);
    if (status !== 'success') {
      throw new Error(`Could not preserve the restored version in cloud history (${status}).`);
    }
  }

  /**
   * Pull the cloud's latest projects and their histories into the local
   * index. HTTP reads are async; callers that fired `refresh()` synchronously
   * still get reactive updates when the request settles.
   */
  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const projects = await this.cloud.listProjects();
      this.cloudProjects.set(projects);
      const histories = await Promise.all(
        projects.map(async (project) => {
          const snapshots = await this.cloud.listSnapshots(project.projectId);
          return [project.projectId, snapshots] as const;
        }),
      );
      this.remoteSnapshots.set(Object.fromEntries(histories));
    } catch (err) {
      this.logger.warn('CloudSync: refresh failed', err);
    } finally {
      this.refreshing = false;
    }
  }

  /**
   * Newest snapshot for this project authored by ANOTHER device after the
   * local copy was saved. This is the "continue on this device" check
   * Studio runs at boot: snapshots without payload data cannot be
   * restored, so they never prompt.
   */
  newerRemoteSnapshot(
    projectId: string,
    localUpdatedAt: number
  ): RemoteSnapshot | null {
    const candidates = this.listSnapshots(projectId).filter(
      (snapshot) =>
        snapshot.deviceId !== 'local' &&
        snapshot.deviceId !== this.deviceId() &&
        (snapshot.timestamp ?? 0) > localUpdatedAt &&
        typeof (snapshot.data as { metadata?: { id?: unknown } } | null | undefined)?.metadata?.id === 'string'
    );
    candidates.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return candidates[0] ?? null;
  }

  /** Cached history for the synchronous version panels. */
  listSnapshots(projectId: string): RemoteSnapshot[] {
    const cached = this.remoteSnapshots()[projectId];
    if (cached) return cached;
    return this.cloudProjects().filter(
      (snapshot) => snapshot.projectId === projectId,
    );
  }

  /**
   * Demo-only conflict injection for the cloud vault: shows the conflict UI
   * without needing a second physical device or a mock-only seed hook.
   */
  seedDemoConflict(projectId: string): void {
    const latest = this.cloudProjects().find(
      (snapshot) => snapshot.projectId === projectId,
    );
    if (!latest) return;
    const remoteVersion = latest.version + 2;
    const remoteSnapshot: RemoteSnapshot = {
      ...latest,
      deviceId: 'dev_remote_phone',
      deviceName: 'Remote Phone',
      version: remoteVersion,
      timestamp: Date.now(),
      data: latest.data ?? { remote: true },
    };
    this.conflictMap.update((map) => ({
      ...map,
      [projectId]: {
        projectId,
        localVersion: latest.version,
        remoteVersion,
        remoteDeviceId: remoteSnapshot.deviceId,
        remoteDeviceName: remoteSnapshot.deviceName ?? remoteSnapshot.deviceId,
        remoteSnapshot,
        detectedAt: Date.now(),
      },
    }));
  }

  private rememberSnapshot(snapshot: RemoteSnapshot): void {
    this.remoteSnapshots.update((cache) => {
      const list = cache[snapshot.projectId] ?? [];
      const next = [snapshot, ...list.filter(
        (item) =>
          !(
            item.deviceId === snapshot.deviceId &&
            item.version === snapshot.version
          ),
      )];
      return { ...cache, [snapshot.projectId]: next };
    });
    this.cloudProjects.update((projects) => {
      const rest = projects.filter(
        (project) => project.projectId !== snapshot.projectId,
      );
      return [snapshot, ...rest].sort(
        (a, b) => b.timestamp - a.timestamp || b.version - a.version,
      );
    });
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
    return this.payloadBytes(payload);
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
