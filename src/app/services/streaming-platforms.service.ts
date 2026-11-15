import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { SocialNetworkingService } from './social-networking.service';
import { SnackbarService } from './snackbar.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';

export type StreamingPlatformId =
  | 'twitch'
  | 'youtube'
  | 'kick'
  | 'tiktok'
  | 'instagram'
  | 'discord'
  | 'x';

export interface StreamingPlatform {
  id: StreamingPlatformId;
  label: string;
  /**
   * Whether a broadcast can be routed here today. Instagram, Discord and X are
   * listed so the surface is complete, but they have no ingest path yet.
   */
  broadcast: boolean;
  /** The server has a real OAuth implementation for this provider. */
  connectable: boolean;
}

export const STREAMING_PLATFORMS: readonly StreamingPlatform[] = [
  { id: 'twitch', label: 'TWITCH', broadcast: true, connectable: true },
  { id: 'youtube', label: 'YOUTUBE', broadcast: true, connectable: true },
  { id: 'kick', label: 'KICK', broadcast: true, connectable: false },
  { id: 'tiktok', label: 'TIKTOK', broadcast: true, connectable: false },
  { id: 'instagram', label: 'INSTAGRAM', broadcast: false, connectable: false },
  { id: 'discord', label: 'DISCORD', broadcast: false, connectable: false },
  { id: 'x', label: 'X', broadcast: false, connectable: false },
];

interface PlatformConnection {
  /** Channel/user name the provider reported at connect time. */
  displayName: string;
  connectedAt: string;
  lastSyncedAt: string;
}

interface PlatformConnectionDto {
  platform?: string;
  displayName?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
}

interface ConnectionsResponse {
  connections?: PlatformConnectionDto[];
}

interface AuthorizeResponse {
  authorizeUrl?: string;
}

interface SyncResponse extends ConnectionsResponse {
  refreshed?: number;
  disconnected?: string[];
}

/**
 * The host's streaming accounts, backed by the API.
 *
 * The browser never sees a provider token: it asks the server for a signed
 * authorize URL, the provider redirects the popup back to the server, and the
 * server exchanges and stores the grant. This service only mirrors the visible
 * result (which platform is linked, to which channel, and when it was last
 * confirmed) and owns the popup plumbing.
 */
@Injectable({ providedIn: 'root' })
export class StreamingPlatformsService {
  private readonly http = inject(HttpClient);
  private readonly social = inject(SocialNetworkingService);
  private readonly profile = inject(UserProfileService);
  private readonly tokenService = inject(TokenService);
  private readonly snackbar = inject(SnackbarService);

  readonly platforms = STREAMING_PLATFORMS;
  readonly connections =
    signal<Partial<Record<StreamingPlatformId, PlatformConnection>>>({});
  /** When the server state was last read successfully, or null if never. */
  readonly syncedAt = signal<number | null>(null);
  readonly syncing = signal(false);
  /** The platform whose connect popup is open, if any. */
  readonly connecting = signal<StreamingPlatformId | null>(null);

  readonly connectedCount = computed(
    () =>
      this.platforms.filter((platform) => !!this.connections()[platform.id])
        .length,
  );

  constructor() {
    // Connections belong to the signed-in account: a profile change reloads
    // them instead of showing the previous account's channels.
    effect(() => {
      const userId = this.profile.profile()?.id ?? '';
      if (!userId) {
        this.connections.set({});
        this.syncedAt.set(null);
        return;
      }
      void this.load();
    });
  }

  isConnected(id: StreamingPlatformId): boolean {
    return !!this.connections()[id];
  }

  displayName(id: StreamingPlatformId): string {
    return this.connections()[id]?.displayName ?? '';
  }

  /**
   * Ask the server for a signed authorize URL and open the provider popup.
   * Pressing it on a connected platform re-authorises and replaces the grant.
   */
  async connect(id: StreamingPlatformId): Promise<void> {
    const platform = this.platformFor(id);
    if (!platform) return;
    if (!platform.connectable) {
      this.snackbar.info(`${platform.label} CONNECT IS NOT AVAILABLE YET`);
      return;
    }
    this.connecting.set(id);
    try {
      const response = await firstValueFrom(
        this.http.post<AuthorizeResponse>(this.endpoint(`/${id}/authorize`), {}, {
          headers: this.headers(),
        }),
      );
      const authorizeUrl = response?.authorizeUrl;
      if (!authorizeUrl) {
        throw new Error('No authorize URL');
      }
      this.social.openConnectPopup(
        id,
        authorizeUrl,
        () => {
          this.connecting.set(null);
          void this.load().then(() =>
            this.snackbar.success(`${platform.label} CONNECTED`),
          );
        },
        (message) => {
          this.connecting.set(null);
          this.snackbar.error(
            message?.trim()
              ? message.trim().toUpperCase()
              : `${platform.label} CONNECT FAILED`,
          );
        },
      );
    } catch (error) {
      this.connecting.set(null);
      this.snackbar.error(this.describe(error, platform.label));
    }
  }

  /** Re-confirm every linked account with the provider and reload the list. */
  async sync(): Promise<void> {
    this.syncing.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<SyncResponse>(this.endpoint('/sync'), {}, {
          headers: this.headers(),
        }),
      );
      this.apply(result?.connections ?? []);
      const dropped = (result?.disconnected ?? []).map((id) => id.toUpperCase());
      if (dropped.length) {
        this.snackbar.warning(
          `${dropped.join(', ')} NEEDS TO BE RECONNECTED`,
        );
        return;
      }
      const count = this.connectedCount();
      this.snackbar.info(
        count === 0
          ? 'NO STREAMING PLATFORMS CONNECTED YET'
          : `SYNCED — ${count} PLATFORM${count === 1 ? '' : 'S'} CONNECTED`,
      );
    } catch (error) {
      this.snackbar.error(this.describe(error, 'SYNC'));
    } finally {
      this.syncing.set(false);
    }
  }

  async disconnect(id: StreamingPlatformId): Promise<void> {
    const platform = this.platformFor(id);
    if (!platform) return;
    try {
      await firstValueFrom(
        this.http.delete(this.endpoint(`/${id}`), { headers: this.headers() }),
      );
      this.connections.update((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      this.snackbar.info(`${platform.label} DISCONNECTED`);
    } catch (error) {
      this.snackbar.error(this.describe(error, platform.label));
    }
  }

  private platformFor(id: StreamingPlatformId): StreamingPlatform | undefined {
    return this.platforms.find((platform) => platform.id === id);
  }

  /** Silent read: a failed load keeps whatever the last good one showed. */
  private async load(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<ConnectionsResponse>(this.endpoint(), {
          headers: this.headers(),
        }),
      );
      this.apply(response?.connections ?? []);
    } catch {
      // Offline or signed out: stale counts are better than a false "none".
    }
  }

  private apply(rows: PlatformConnectionDto[]): void {
    const next: Partial<Record<StreamingPlatformId, PlatformConnection>> = {};
    for (const row of rows) {
      const id = String(row?.platform ?? '').toLowerCase() as StreamingPlatformId;
      if (!this.platforms.some((platform) => platform.id === id)) continue;
      next[id] = {
        displayName: row.displayName ?? id.toUpperCase(),
        connectedAt: row.connectedAt ?? new Date().toISOString(),
        lastSyncedAt: row.lastSyncedAt ?? new Date().toISOString(),
      };
    }
    this.connections.set(next);
    this.syncedAt.set(Date.now());
  }

  /** The server's own message is more useful than a status code. */
  private describe(error: unknown, label: string): string {
    const body = (error as { error?: { error?: unknown } } | null)?.error;
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    return message ? message.toUpperCase() : `${label} REQUEST FAILED`;
  }

  private endpoint(path = ''): string {
    return `${APP_SECURITY_CONFIG.api_url}/stream-accounts${path}`;
  }

  private headers(): Record<string, string> {
    const token = this.tokenService.jwtToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
