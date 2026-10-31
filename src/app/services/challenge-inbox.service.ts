import { Injectable, Injector, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { APP_SECURITY_CONFIG } from "../app.security";
import { TokenService } from "./token.service";
import { UserProfileService } from "./user-profile.service";

export interface ChallengeRecord {
  id: number;
  fromUserId: string;
  fromUserName?: string;
  toUserId: string;
  gameId: string;
  message?: string | null;
  status: "pending" | "accepted" | "declined" | "expired";
  timestamp: number;
  isNew?: boolean;
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

@Injectable({ providedIn: "root" })
export class ChallengeInboxService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private profileService = inject(UserProfileService);
  private injector = inject(Injector);

  /**
   * Resolve a gameId to its display name WITHOUT pulling the full Tha Spot
   * catalog (894 games) into the app-shell startup bundle. GameService is
   * only statically imported by lazy gaming surfaces, so this service — an
   * eager app-shell dependency — lazy-loads it on first challenge send.
   * Falls back to the raw gameId when the catalog is unavailable.
   */
  private async resolveGameName(gameId: string): Promise<string> {
    try {
      const { GameService } = await import("../hub/game.service");
      const gameService = this.injector.get(GameService);
      const cached = gameService.getGameById(gameId)?.name;
      if (cached) return cached;
      await gameService.loadFeedIfNeeded();
      return gameService.getGameById(gameId)?.name || gameId;
    } catch {
      return gameId;
    }
  }

  challenges = signal<ChallengeRecord[]>([]);
  notifications = signal<AppNotification[]>([]);
  loading = signal(false);
  lastSyncedAt = signal<number>(0);
  /** Why the last load failed — the inbox must not read as empty instead. */
  loadError = signal<string>("");
  lastChallengeError = signal<string | null>(null);

  pendingCount = computed(
    () =>
      this.challenges().filter(
        (c) => c.status === "pending" && c.toUserId === this.currentUserId(),
      ).length,
  );

  unreadCount = computed(
    () => this.notifications().filter((n) => !n.read).length,
  );

  private currentUserId(): string {
    return this.profileService.profile().id || "";
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
    if (!Array.isArray(records)) return;
    const byId = new Map<number, ChallengeRecord>();
    for (const existing of this.challenges()) byId.set(existing.id, existing);
    for (const incoming of records) {
      if (incoming && Number.isFinite(incoming.id))
        byId.set(incoming.id, incoming);
    }
    const merged = Array.from(byId.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    this.challenges.set(merged);
    this.lastSyncedAt.set(Date.now());
  }

  mergeNotifications(records: AppNotification[]) {
    if (!Array.isArray(records)) return;
    const byId = new Map<number, AppNotification>();
    for (const existing of this.notifications())
      byId.set(existing.id, existing);
    for (const incoming of records) {
      if (incoming && Number.isFinite(incoming.id))
        byId.set(incoming.id, incoming);
    }
    const merged = Array.from(byId.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    this.notifications.set(merged);
  }

  async loadInbox(status: "pending" | "accepted" | "declined" | "all" = "all") {
    const userId = this.currentUserId();
    if (!userId) return;
    this.loading.set(true);
    this.loadError.set("");
    try {
      const records = await firstValueFrom(
        this.http.get<ChallengeRecord[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/challenges`,
          { params: { status }, headers: this.authHeaders() },
        ),
      );
      if (Array.isArray(records)) {
        const byId = new Map<number, ChallengeRecord>();
        for (const record of this.challenges()) byId.set(record.id, record);
        for (const record of records) {
          if (record && Number.isFinite(record.id)) byId.set(record.id, record);
        }
        this.challenges.set(
          Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp),
        );
        this.lastSyncedAt.set(Date.now());
      }
    } catch (e) {
      console.error("[ChallengeInbox] loadInbox failed", e);
      this.loadError.set(
        "The inbox could not be loaded. Check your connection and retry.",
      );
    } finally {
      this.loading.set(false);
    }
  }

  async respondToChallenge(
    challengeId: number,
    status: "accepted" | "declined",
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;
    try {
      const record: any = await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/challenges/${challengeId}/respond`,
          { status },
          { headers: this.authHeaders() },
        ),
      );
      // The API row is authoritative; only update local state after success.
      this.challenges.update((list) =>
        list.map((c) =>
          c.id === challengeId
            ? {
                ...c,
                status: record?.status || status,
                timestamp: record?.timestamp || c.timestamp,
              }
            : c,
        ),
      );
      this.lastChallengeError.set(null);
      await this.loadNotifications();
      return true;
    } catch (e) {
      console.error("[ChallengeInbox] respond failed", e);
      this.lastChallengeError.set(
        "Challenge response could not be saved. Try again.",
      );
      return false;
    }
  }

  async loadNotifications(unreadOnly = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    try {
      const records = await firstValueFrom(
        this.http.get<AppNotification[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/notifications`,
          {
            params: { unreadOnly: String(unreadOnly) },
            headers: this.authHeaders(),
          },
        ),
      );
      this.mergeNotifications(records);
    } catch (e) {
      console.error("[ChallengeInbox] loadNotifications failed", e);
    }
  }

  async markNotificationRead(notifId: number) {
    const userId = this.currentUserId();
    if (!userId) return;
    // local optimistic update
    this.notifications.update((list) =>
      list.map((n) => (n.id === notifId ? { ...n, read: true } : n)),
    );
    try {
      await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/notifications/${notifId}/read`,
          {},
          { headers: this.authHeaders() },
        ),
      );
    } catch (e) {
      console.error("[ChallengeInbox] markRead failed", e);
    }
  }

  /**
   * Send a challenge to a user. Persists to server via both socket and REST.
   * UI updates come back via socket `challenge_inbox_sync` (recipient) or
   * local state (sender echo).
   */
  async challengePlayer(toUserId: string, gameId: string): Promise<boolean> {
    const fromUserId = this.currentUserId();
    if (!fromUserId || !toUserId || !gameId || fromUserId === toUserId) {
      this.lastChallengeError.set("Choose another player and a valid game.");
      return false;
    }
    // Include resolved game title when emitting so the recipient gets a human
    // friendly name even if their client hasn't loaded the feed yet.
    const gameName = await this.resolveGameName(gameId);
    return this.emitChallenge(toUserId, gameId, gameName);
  }

  // direct emit helper so callers can also send via the existing socket
  private socket: any = null;
  private socketHandlers?: {
    incoming: (record: ChallengeRecord) => void;
    persisted: (record: ChallengeRecord) => void;
    response: (event: {
      id: number;
      status: ChallengeRecord["status"];
      timestamp?: number;
    }) => void;
    error: (event: { message?: string }) => void;
  };
  bindSocket(socket: any) {
    if (this.socket === socket) return;
    if (this.socket && this.socketHandlers) {
      this.socket.off?.("incoming_challenge", this.socketHandlers.incoming);
      this.socket.off?.("challenge_persisted", this.socketHandlers.persisted);
      this.socket.off?.("challenge_response", this.socketHandlers.response);
      this.socket.off?.("challenge_error", this.socketHandlers.error);
    }
    this.socket = socket;
    if (!socket?.on) return;
    this.socketHandlers = {
      incoming: (record) => this.mergeChallenges([record]),
      persisted: (record) => {
        this.mergeChallenges([record]);
        if (record?.isNew === false) {
          this.lastChallengeError.set(
            "A pending challenge for this game already exists.",
          );
        }
      },
      error: (event) =>
        this.lastChallengeError.set(
          event?.message || "Challenge could not be sent",
        ),
      response: (event) => {
        if (!event || !Number.isFinite(event.id)) return;
        this.challenges.update((records) =>
          records.map((record) =>
            record.id === event.id
              ? {
                  ...record,
                  status: event.status,
                  timestamp: event.timestamp || record.timestamp,
                }
              : record,
          ),
        );
      },
    };
    socket.on("incoming_challenge", this.socketHandlers.incoming);
    socket.on("challenge_persisted", this.socketHandlers.persisted);
    socket.on("challenge_response", this.socketHandlers.response);
    socket.on("challenge_error", this.socketHandlers.error);
  }
  private emitChallenge(
    toUserId: string,
    gameId: string,
    gameName?: string,
  ): Promise<boolean> {
    const socketLive =
      !!this.socket &&
      typeof this.socket.emit === "function" &&
      this.socket.connected === true;
    if (socketLive) {
      // Server acknowledges only after persistence and delivery work has
      // completed. On transport loss, REST is safe because server-side
      // createChallenge deduplicates an identical pending challenge.
      return new Promise((resolve) => {
        let settled = false;
        let acked = false;
        let sawChallengeError = false;
        let timeout: ReturnType<typeof setTimeout>;
        let onChallengeError:
          | ((event: { message?: string }) => void)
          | undefined;
        const onPersisted = (record: ChallengeRecord) => {
          if (
            !record ||
            record.fromUserId !== this.currentUserId() ||
            record.toUserId !== toUserId ||
            record.gameId !== gameId
          )
            return;
          this.mergeChallenges([record]);
          if (record.isNew === false) {
            this.lastChallengeError.set(
              "A pending challenge for this game already exists.",
            );
          } else {
            this.lastChallengeError.set(null);
          }
          finish(true);
        };
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.socket?.off?.("challenge_persisted", onPersisted);
          if (onChallengeError)
            this.socket?.off?.("challenge_error", onChallengeError);
          resolve(ok);
        };
        timeout = setTimeout(() => {
          if (!acked && !sawChallengeError) {
            acked = true;
            void this.persistChallengeViaRest(toUserId, gameId, gameName).then(
              finish,
            );
          }
        }, 8000);
        try {
          this.socket.on?.("challenge_persisted", onPersisted);
          onChallengeError = (event: { message?: string }) => {
            if (acked || settled) return;
            sawChallengeError = true;
            acked = true;
            this.lastChallengeError.set(
              event?.message || "Challenge could not be sent",
            );
            finish(false);
          };
          this.socket.on?.("challenge_error", onChallengeError);
          this.socket.emit(
            "challenge_player",
            { toUserId, gameId, gameName },
            (result: { ok?: boolean; error?: string }) => {
              if (settled) return;
              acked = true;
              if (result?.ok) {
                finish(true);
              } else if (result?.error) {
                sawChallengeError = true;
                this.lastChallengeError.set(result.error);
                finish(false);
              }
            },
          );
        } catch {
          finish(false);
        }
      });
    }
    // Fallback: socket unavailable — persist via REST so the challenge
    // survives and is delivered when the recipient next syncs.
    return this.persistChallengeViaRest(toUserId, gameId, gameName);
  }

  /**
   * REST fallback for challenge sending. Fires-and-forgets so the challenge
   * is persisted server-side even if the socket is unavailable.
   */
  async persistChallengeViaRest(
    toUserId: string,
    gameId: string,
    gameName?: string,
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;
    try {
      const record = await firstValueFrom(
        this.http.post<ChallengeRecord>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/challenges`,
          {
            toUserId,
            gameId,
            gameName: gameName || (await this.resolveGameName(gameId)),
          },
          { headers: this.authHeaders() },
        ),
      );
      this.mergeChallenges([record]);
      this.lastChallengeError.set(null);
      return true;
    } catch (e) {
      console.warn("[ChallengeInbox] REST challenge persist failed:", e);
      this.lastChallengeError.set("Challenge could not be sent. Try again.");
      return false;
    }
  }

  onChallengeInboxSync(records: ChallengeRecord[]) {
    this.mergeChallenges(records);
  }

  onNotificationSync(records: AppNotification[]) {
    this.mergeNotifications(records);
  }
}
