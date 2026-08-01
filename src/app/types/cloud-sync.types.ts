/**
 * Sprint D1 — Cloud Sync type contract.
 *
 * Models a deterministic, mock-cloud-backed project sync layer that pairs
 * with the existing OfflineSync queue. Every shape here is structural —
 * runtime validation happens in CloudSyncService + MockCloudServer so
 * storage is plain JSON-safe.
 */

export type SyncDirection = 'push' | 'pull';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'conflict'
  | 'queued';

export type ConflictStrategy = 'mine' | 'theirs' | 'merge';

/**
 * A single cloud-registered device. Identified by a stable per-device
 * id (kept in localStorage) so we can attribute authorship & show
 * cross-device presence on the /cloud-vault dashboard.
 */
export interface CloudDevice {
  id: string;
  name: string;
  registeredAt: number;
  lastActive: number;
  platform: string;
}

/**
 * Manifest envelope attached to every payload pushed into the cloud.
 * Version is monotonically incremented per push from the same device so
 * the server can detect competing edits from another device.
 */
export interface ProjectManifest {
  projectId: string;
  version: number;
  lastModified: number;
  authorDeviceId: string;
  title: string;
  byteSize: number;
}

/**
 * Wrapped push envelope = manifest + payload. The cloud server stores
 * only the latest envelope per projectId and uses the manifest for
 * version+author bookkeeping.
 */
export interface SyncEnvelope {
  manifest: ProjectManifest;
  payload: unknown;
}

/**
 * Per-device snapshot. The mock cloud can hold N snapshots per
 * project (one per device) so a `restoreFromBackup` flow can pick
 * an older author and bring it back to the current device.
 */
export interface RemoteSnapshot {
  projectId: string;
  deviceId: string;
  version: number;
  data: unknown;
  timestamp: number;
  title: string;
  byteSize: number;
}

/**
 * Lifted into a signal map keyed by projectId. Active until the user
 * resolves it via resolveConflict(projectId, strategy).
 */
export interface ConflictRecord {
  projectId: string;
  localVersion: number;
  remoteVersion: number;
  remoteDeviceId: string;
  remoteDeviceName: string;
  remoteSnapshot: RemoteSnapshot;
  detectedAt: number;
}

/**
 * History entry surfaced on the /cloud-vault timeline. Single device
 * view: every push, every pull, every conflict gate. Capped to ~50
 * entries to keep storage bounded.
 */
export interface SyncTimelineEntry {
  id: string;
  projectId: string;
  projectTitle: string;
  direction: SyncDirection;
  status: SyncStatus;
  at: number;
  note?: string;
}
