import { InjectionToken, type Signal } from '@angular/core';
import {
  ConflictRecord,
  RemoteSnapshot,
  SyncEnvelope,
} from '../types/cloud-sync.types';

export type MaybePromise<T> = T | Promise<T>;

/**
 * Transport contract for the project cloud.
 *
 * The local mock implements the same shape for tests, while the production
 * binding is `HttpCloudServer` and talks to the authenticated `/api/cloud`
 * routes. Reads may be synchronous in a test double; callers always `await`
 * them so both implementations behave identically.
 */
export interface CloudServerClient {
  push(
    envelope: SyncEnvelope,
  ): MaybePromise<
    | { success: true; snapshot: RemoteSnapshot }
    | { success: false; conflict: ConflictRecord }
  >;
  pull(projectId: string): MaybePromise<RemoteSnapshot | null>;
  listProjects(): MaybePromise<RemoteSnapshot[]>;
  listSnapshots(projectId: string): MaybePromise<RemoteSnapshot[]>;
  /**
   * Multipart progress for the in-flight large push, when the transport
   * reports one. Absent on transports that push in a single round-trip.
   */
  readonly uploadProgress?: Signal<{
    uploadId: string;
    doneParts: number;
    totalParts: number;
  } | null>;
}

export const CLOUD_SERVER = new InjectionToken<CloudServerClient>(
  'CLOUD_SERVER',
);
