import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SocialNetworkingService } from './social-networking.service';
import { SnackbarService } from './snackbar.service';
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
   * connect-only until an ingest path exists, so the UI says so instead of
   * offering a Go Live that cannot deliver.
   */
  broadcast: boolean;
}

export const STREAMING_PLATFORMS: readonly StreamingPlatform[] = [
  { id: 'twitch', label: 'TWITCH', broadcast: true },
  { id: 'youtube', label: 'YOUTUBE', broadcast: true },
  { id: 'kick', label: 'KICK', broadcast: true },
  { id: 'tiktok', label: 'TIKTOK', broadcast: true },
  { id: 'instagram', label: 'INSTAGRAM', broadcast: false },
  { id: 'discord', label: 'DISCORD', broadcast: false },
  { id: 'x', label: 'X', broadcast: false },
];

interface PlatformConnection {
  connectedAt: number;
  lastSyncedAt: number;
}

interface StoredConnections {
  userId: string;
  connections: Partial<Record<StreamingPlatformId, PlatformConnection>>;
  syncedAt: number | null;
}

const STORAGE_KEY = 'smuve.stream-platforms.v1';

/**
 * The host's streaming accounts.
 *
 * The provider popup contract is the existing `/api/auth/:platform` page, which
 * answers with `<PLATFORM>_AUTH_SUCCESS`. This service owns the consequence of
 * that answer: which platforms this account has connected, when each was last
 * confirmed, and the ability to re-read that state after another tab (or a
 * second device on the same profile) changes it. Connections are stored per
 * user id so signing into a different account never inherits them.
 */
@Injectable({ providedIn: 'root' })
export class StreamingPlatformsService {
  private readonly social = inject(SocialNetworkingService);
  private readonly profile = inject(UserProfileService);
  private readonly snackbar = inject(SnackbarService);

  readonly platforms = STREAMING_PLATFORMS;
  readonly connections =
    signal<Partial<Record<StreamingPlatformId, PlatformConnection>>>({});
  /** When the saved state was last read back, or null if never. */
  readonly syncedAt = signal<number | null>(null);
  readonly syncing = signal(false);
  /** The platform whose connect popup is open, if any. */
  readonly connecting = signal<StreamingPlatformId | null>(null);

  readonly connectedCount = computed(
    () => this.platforms.filter((platform) => !!this.connections()[platform.id]).length,
  );

  constructor() {
    // Connections belong to the signed-in account, so a profile change re-reads
    // the store instead of carrying the previous account's platforms over.
    effect(() => {
      const userId = this.profile.profile()?.id ?? '';
      this.hydrate(userId);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY) return;
        this.hydrate(this.profile.profile()?.id ?? '');
      });
    }
  }

  isConnected(id: StreamingPlatformId): boolean {
    return !!this.connections()[id];
  }

  /** Platform names to show on the Go Live surface, connected ones first. */
  connectedPlatforms(): StreamingPlatform[] {
    return this.platforms.filter((platform) => this.isConnected(platform.id));
  }

  /**
   * Open the provider's connect popup. A success callback records the account;
   * pressing it on a connected platform re-authorises and refreshes the stamp.
   */
  connect(id: StreamingPlatformId): void {
    const platform = this.platforms.find((entry) => entry.id === id);
    if (!platform) return;
    this.connecting.set(id);
    this.social.startOAuthFlow(id, () => {
      const now = Date.now();
      this.connecting.set(null);
      this.connections.update((current) => ({
        ...current,
        [id]: { connectedAt: current[id]?.connectedAt ?? now, lastSyncedAt: now },
      }));
      this.persist();
      this.snackbar.success(`${platform.label} CONNECTED`);
    });
    // A popup the host abandons must not leave the button spinning forever.
    setTimeout(() => {
      if (this.connecting() === id) this.connecting.set(null);
    }, 15_000);
  }

  disconnect(id: StreamingPlatformId): void {
    const platform = this.platforms.find((entry) => entry.id === id);
    if (!platform) return;
    this.connections.update((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    this.persist();
    this.snackbar.info(`${platform.label} DISCONNECTED`);
  }

  /**
   * Re-read the connections saved for this account (another tab may have
   * changed them) and report what is live.
   */
  sync(): void {
    this.syncing.set(true);
    this.hydrate(this.profile.profile()?.id ?? '');
    this.syncedAt.set(Date.now());
    this.persist();
    this.syncing.set(false);
    const count = this.connectedCount();
    this.snackbar.info(
      count === 0
        ? 'NO STREAMING PLATFORMS CONNECTED YET'
        : `SYNCED — ${count} PLATFORM${count === 1 ? '' : 'S'} CONNECTED`,
    );
  }

  private hydrate(userId: string): void {
    if (typeof localStorage === 'undefined') return;
    if (!userId) {
      this.connections.set({});
      this.syncedAt.set(null);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.connections.set({});
        this.syncedAt.set(null);
        return;
      }
      const stored = JSON.parse(raw) as StoredConnections;
      if (stored?.userId !== userId) {
        this.connections.set({});
        this.syncedAt.set(null);
        return;
      }
      this.connections.set(stored.connections ?? {});
      this.syncedAt.set(stored.syncedAt ?? null);
    } catch {
      // A corrupt store is worth less than a clean slate.
      this.connections.set({});
      this.syncedAt.set(null);
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    const userId = this.profile.profile()?.id ?? '';
    if (!userId) return;
    try {
      const payload: StoredConnections = {
        userId,
        connections: this.connections(),
        syncedAt: this.syncedAt(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or disabled: the session still works, it just will not
      // survive a reload.
    }
  }
}
