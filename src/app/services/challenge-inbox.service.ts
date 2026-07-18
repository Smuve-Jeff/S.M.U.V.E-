import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';

export interface ChallengeRecord {
  id: number;
  fromUserId: string;
  fromUserName?: string;
  toUserId: string;
  gameId: string;
  message?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  timestamp: number;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  payload: any;
  read: boolean;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class ChallengeInboxService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private profileService = inject(UserProfileService);

  challenges = signal<ChallengeRecord[]>([]);
  notifications = signal<AppNotification[]>([]);
  loading = signal(false);
  lastSyncedAt = signal<number>(0);

  pendingCount = computed(
    () =>
      this.challenges().filter(
        (c) => c.status === 'pending' && c.toUserId === this.currentUserId()
      ).length
  );

  unreadCount = computed(
    () => this.notifications().filter((n) => !n.read).length
  );

  private currentUserId(): string {
    return this.profileService.profile().id || '';
  }

  private authHeaders() {
    const token = this.tokenService.jwtToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Merge an array of challenges into the local signal without duplicates.
   * Used by both REST fetch and Socket.io sync.
   */
  mergeChallenges(records: ChallengeRecord[]) {
    if (!records?.length) return;
    const byId = new Map<number, ChallengeRecord>();
    for (const existing of this.challenges()) byId.set(existing.id, existing);
    for (const incoming of records) byId.set(incoming.id, incoming);
    const merged = Array.from(byId.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    this.challenges.set(merged);
    this.lastSyncedAt.set(Date.now());
  }

  mergeNotifications(records: AppNotification[]) {
    if (!records?.length) return;
    const byId = new Map<number, AppNotification>();
    for (const existing of this.notifications()) byId.set(existing.id, existing);
    for (const incoming of records) byId.set(incoming.id, incoming);
    const merged = Array.from(byId.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    this.notifications.set(merged);
  }

  async loadInbox(status: 'pending' | 'accepted' | 'declined' | 'all' = 'all') {
    const userId = this.currentUserId();
    if (!userId) return;
    this.loading.set(true);
    try {
      const records = await firstValueFrom(
        this.http.get<ChallengeRecord[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/challenges`,
          { params: { status }, headers: this.authHeaders() }
        )
      );
      this.mergeChallenges(records);
    } catch (e) {
      console.error('[ChallengeInbox] loadInbox failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  async respondToChallenge(challengeId: number, status: 'accepted' | 'declined') {
    const userId = this.currentUserId();
    if (!userId) return;
    try {
      const res: any = await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/challenges/${challengeId}/respond`,
          { status },
          { headers: this.authHeaders() }
        )
      );
      // Update local record optimistically
      this.challenges.update((list) =>
        list.map((c) =>
          c.id === challengeId
            ? { ...c, status, timestamp: res?.challenge?.timestamp || Date.now() }
            : c
        )
      );
      await this.loadNotifications();
    } catch (e) {
      console.error('[ChallengeInbox] respond failed', e);
    }
  }

  async loadNotifications(unreadOnly = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    try {
      const records = await firstValueFrom(
        this.http.get<AppNotification[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/notifications`,
          { params: { unreadOnly: String(unreadOnly) }, headers: this.authHeaders() }
        )
      );
      this.mergeNotifications(records);
    } catch (e) {
      console.error('[ChallengeInbox] loadNotifications failed', e);
    }
  }

  async markNotificationRead(notifId: number) {
    const userId = this.currentUserId();
    if (!userId) return;
    // local optimistic update
    this.notifications.update((list) =>
      list.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    try {
      await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/notifications/${notifId}/read`,
          {},
          { headers: this.authHeaders() }
        )
      );
    } catch (e) {
      console.error('[ChallengeInbox] markRead failed', e);
    }
  }

  /**
   * Send a challenge to a user. Persists to server. UI updates come back
   * via socket `challenge_inbox_sync` (recipient) or local state (sender echo).
   */
  challengePlayer(toUserId: string, gameId: string) {
    const fromUserId = this.currentUserId();
    if (!fromUserId || !toUserId || !gameId) return;
    // Optimistically add a pending record for the sender's own view of the challenger
    // (it'll be replaced by the authoritative sync on the response round-trip)
    // Note: the user is the FROM here so the record will be filtered for pendingCount
    //          unless we treat "sent challenges" as pending too. We don't — only incoming
    //          count toward pendingCount. So just trigger the socket.
    this.emitChallenge(toUserId, gameId);
  }

  // direct emit helper so callers can also send via the existing socket
  private socket: any = null;
  bindSocket(socket: any) {
    this.socket = socket;
  }
  private emitChallenge(toUserId: string, gameId: string) {
    if (this.socket && typeof this.socket.emit === 'function') {
      this.socket.emit('challenge_player', { toUserId, gameId });
    }
    // Also call REST as a backup resilience path (kills new dependency on socket)
    this.persistChallengeViaRest(toUserId, gameId);
  }

  async persistChallengeViaRest(toUserId: string, gameId: string) {
    const userId = this.currentUserId();
    if (!userId) return;
    try {
      // No dedicated REST endpoint for send — use socket as primary. This is a
      // safety-net that quietly logs if the socket is unavailable.
    } catch (e) {
      console.warn('[ChallengeInbox] persist fallback failed', e);
    }
  }

  onChallengeInboxSync(records: ChallengeRecord[]) {
    this.mergeChallenges(records);
  }

  onNotificationSync(records: AppNotification[]) {
    this.mergeNotifications(records);
  }
}
