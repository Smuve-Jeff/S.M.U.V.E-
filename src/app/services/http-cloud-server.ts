import { Injectable, signal } from '@angular/core';
import { APP_SECURITY_CONFIG } from '../app.security';
import {
  ConflictRecord,
  RemoteSnapshot,
  SyncEnvelope,
} from '../types/cloud-sync.types';
import type { CloudServerClient } from './cloud-server-client';

const TOKEN_KEY = 'smuve_jwt_token';
/** Above this size the client switches to resumable multipart upload. */
const RESUMABLE_THRESHOLD_BYTES = 2 * 1024 * 1024;
const MIN_PART_BYTES = 5 * 1024 * 1024;
/** Per-part attempts before the whole upload is aborted. */
const PART_MAX_ATTEMPTS = 3;

type CloudRequestInit = RequestInit & { contentType?: string };

interface CloudError extends Error {
  statusCode?: number;
}

/**
 * Authenticated project-cloud client.
 *
 * The API stores every accepted push as a versioned snapshot owned by the
 * signed-in account. Ownership comes from the JWT on the server; the browser
 * never supplies a user id. Offline queueing stays in `CloudSyncService`.
 */
@Injectable({ providedIn: 'root' })
export class HttpCloudServer implements CloudServerClient {
  private readonly baseUrl = `${APP_SECURITY_CONFIG.api_url}/cloud`;

  /**
   * Multipart progress for the current large push (null when idle). The
   * vault reads this to show part X/Y instead of a stuck spinner.
   */
  readonly uploadProgress = signal<{
    uploadId: string;
    doneParts: number;
    totalParts: number;
  } | null>(null);

  async push(
    envelope: SyncEnvelope,
  ): Promise<
    | { success: true; snapshot: RemoteSnapshot }
    | { success: false; conflict: ConflictRecord }
  > {
    const body = JSON.stringify(envelope);
    const bytes = new TextEncoder().encode(body);
    if (bytes.byteLength > RESUMABLE_THRESHOLD_BYTES) {
      return this.pushResumable(envelope, bytes);
    }
    return this.request('/push', { method: 'POST', body });
  }

  /**
   * Upload a large snapshot as S3/R2 multipart parts. The server returns the
   * key and upload id; only the completed object is linked to the snapshot row.
   */
  private async pushResumable(
    envelope: SyncEnvelope,
    bytes: Uint8Array,
  ): Promise<
    | { success: true; snapshot: RemoteSnapshot }
    | { success: false; conflict: ConflictRecord }
  > {
    const init = await this.request<
      | { uploadId: string; key: string; partSize: number }
      | { success: false; conflict: ConflictRecord }
    >('/uploads', {
      method: 'POST',
      body: JSON.stringify({ manifest: envelope.manifest }),
    });
    if (!('uploadId' in init)) return init;

    const partSize = Math.max(
      MIN_PART_BYTES,
      Math.floor(Number(init.partSize) || 0),
    );
    const totalParts = Math.max(
      1,
      Math.ceil(bytes.byteLength / partSize),
    );
    const parts: Array<{ partNumber: number; etag: string }> = [];
    this.uploadProgress.set({ uploadId: init.uploadId, doneParts: 0, totalParts });
    try {
      for (let offset = 0, partNumber = 1; offset < bytes.byteLength; offset += partSize, partNumber += 1) {
        const chunk = bytes.slice(offset, Math.min(bytes.byteLength, offset + partSize));
        // Resume, don't restart: a dropped part is retried in place so a
        // flaky radio doesn't rewind the parts that already landed.
        const uploaded = await this.putPartWithRetry(
          init.uploadId,
          init.key,
          partNumber,
          chunk,
        );
        parts.push({ partNumber, etag: uploaded.etag });
        this.uploadProgress.update((p) =>
          p ? { ...p, doneParts: partNumber } : p,
        );
      }

      const result = await this.request<
        | { success: true; snapshot: RemoteSnapshot }
        | { success: false; conflict: ConflictRecord }
      >('/uploads/' + encodeURIComponent(init.uploadId) + '/complete', {
        method: 'POST',
        body: JSON.stringify({
          key: init.key,
          parts,
          manifest: envelope.manifest,
        }),
      });
      this.uploadProgress.set(null);
      return result;
    } catch (error) {
      await this.request(
        `/uploads/${encodeURIComponent(init.uploadId)}?key=${encodeURIComponent(init.key)}`,
        { method: 'DELETE' },
      ).catch(() => undefined);
      this.uploadProgress.set(null);
      throw error;
    }
  }

  /**
   * PUT one part, retrying transient failures in place. A 4xx is the
   * server refusing the part (bad key, expired upload) — retrying
   * cannot heal it, so it fails fast to the abort path. Network loss
   * and 5xx responses get PART_MAX_ATTEMPTS before giving up.
   */
  private async putPartWithRetry(
    uploadId: string,
    key: string,
    partNumber: number,
    chunk: Uint8Array<ArrayBuffer>,
  ): Promise<{ etag: string }> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.request<{ etag: string }>(
          `/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}?key=${encodeURIComponent(key)}`,
          {
            method: 'PUT',
            body: chunk,
            contentType: 'application/octet-stream',
          },
        );
      } catch (error) {
        const status = (error as CloudError)?.statusCode;
        const retryable = status === 0 || status === undefined || status >= 500;
        if (!retryable || attempt >= PART_MAX_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  pull(projectId: string): Promise<RemoteSnapshot | null> {
    return this.request(`/projects/${encodeURIComponent(projectId)}/latest`);
  }

  listProjects(): Promise<RemoteSnapshot[]> {
    return this.request('/projects');
  }

  listSnapshots(projectId: string): Promise<RemoteSnapshot[]> {
    return this.request(
      `/projects/${encodeURIComponent(projectId)}/snapshots`,
    );
  }

  private async request<T>(path: string, init: CloudRequestInit = {}): Promise<T> {
    if (typeof fetch !== 'function') {
      throw this.error('Cloud sync requires a network-capable browser.');
    }
    let token: string | null = null;
    try {
      token =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TOKEN_KEY)
          : null;
    } catch {
      // Treat an unreadable store as signed out so the request fails cleanly.
      token = null;
    }
    if (!token) {
      throw this.error('Sign in to sync projects to the cloud.', 401);
    }

    const { contentType, headers: initHeaders, ...requestInit } = init;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (requestInit.body !== undefined && requestInit.body !== null) {
      headers['Content-Type'] = contentType ?? 'application/json';
    }
    Object.assign(headers, initHeaders ?? {});

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...requestInit,
        headers,
      });
    } catch (cause) {
      throw this.error(
        'The cloud could not be reached. Your edit is queued locally.',
        0,
        cause,
      );
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail =
          typeof body?.error === 'string'
            ? body.error
            : typeof body?.message === 'string'
              ? body.message
              : '';
      } catch {
        /* non-JSON error body */
      }
      throw this.error(
        detail || `Cloud sync failed (HTTP ${response.status}).`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  private error(message: string, statusCode?: number, cause?: unknown): CloudError {
    const error = new Error(message) as CloudError;
    if (statusCode !== undefined) error.statusCode = statusCode;
    if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
    return error;
  }
}
