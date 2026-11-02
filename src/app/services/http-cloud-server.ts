import { Injectable } from '@angular/core';
import { APP_SECURITY_CONFIG } from '../app.security';
import {
  ConflictRecord,
  RemoteSnapshot,
  SyncEnvelope,
} from '../types/cloud-sync.types';
import type { CloudServerClient } from './cloud-server-client';

const TOKEN_KEY = 'smuve_jwt_token';

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

  async push(
    envelope: SyncEnvelope,
  ): Promise<
    | { success: true; snapshot: RemoteSnapshot }
    | { success: false; conflict: ConflictRecord }
  > {
    return this.request('/push', {
      method: 'POST',
      body: JSON.stringify(envelope),
    });
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (typeof fetch !== 'function') {
      throw this.error('Cloud sync requires a network-capable browser.');
    }
    const token =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(TOKEN_KEY)
        : null;
    if (!token) {
      throw this.error('Sign in to sync projects to the cloud.', 401);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
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
