import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, inject, signal, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PeerNetworkingService } from './peer-networking.service';
import { ChallengeInboxService } from './challenge-inbox.service';
import { io, Socket } from 'socket.io-client';
import { TokenService } from './token.service';
import { NotificationService } from './notification.service';
import {
  AsyncCollaborationPacket,
  StudioCollaborationRole,
  StudioSessionEventEnvelope,
  StudioSessionSyncState,
} from '../types/studio-orchestration.types';

export interface OnlineUser {
  userId: string;
  artistName?: string;
  primaryGenre?: string;
  avatarImage?: string;
  inGame?: boolean;
  profileSetupCompleted?: boolean;
  online?: boolean;
  location?: string;
  eliteScore?: number;
  squadCount?: number;
  /** Chat room this user is currently in (server presence; null when fresh). */
  currentRoom?: string | null;
}

export interface PrivateMessage {
  fromUserId: string;
  fromUserName?: string;
  toUserId?: string;
  message: string;
  timestamp: number;
}

export interface RoomMessage {
  roomId: string;
  fromUserId: string;
  fromUserName?: string;
  message: string;
  timestamp: number;
}

export interface Challenge {
  id?: number;
  fromUserId: string;
  fromUserName?: string;
  toUserId?: string;
  gameId: string;
  timestamp: number;
  status?: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface StreamTelemetry {
  viewers: number;
  health: 'Good' | 'Fair' | 'Poor';
  platform: string;
  bitrate: string;
}

export type StreamQuality = '480p' | '720p' | '1080p';

/** Resolution + bitrate targets per quality tier. */
export const STREAM_QUALITY_PRESETS: Record<
  StreamQuality,
  { width: number; height: number; bitrate: number }
> = {
  '480p': { width: 854, height: 480, bitrate: 2500 },
  '720p': { width: 1280, height: 720, bitrate: 4500 },
  '1080p': { width: 1920, height: 1080, bitrate: 6000 },
};

@Injectable({ providedIn: 'root' })
export class SocialNetworkingService {
  private profileService = inject(UserProfileService);
  private socket?: Socket;
  /** Notifications (snackbar/toast) — injected to avoid a circular dep. */
  private notifications = inject(NotificationService);
  /** True while the socket.io transport is connected and authenticated. */
  socketConnected = signal(false);

  /** Public accessor so ChallengeInboxService can bind to socket without fragile `any` casts */
  getSocket(): Socket | undefined {
    return this.socket;
  }
  private injector = inject(Injector);
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);

  onlineUsers = signal<OnlineUser[]>([]);
  messages = signal<PrivateMessage[]>([]);
  roomMessages = signal<RoomMessage[]>([]);
  /** Players the current user has blocked (server-authoritative list). */
  blockedUsers = signal<OnlineUser[]>([]);
  // challenges moved to ChallengeInboxService (single source of truth)
  friends = signal<OnlineUser[]>([]);
  partyMembers = signal<OnlineUser[]>([]);
  activeHubTab = signal<'room' | 'dm' | 'stream' | 'friends' | 'party'>('room');
  currentPartyId = signal<string | null>(null);

  /**
   * Count of OTHER online players currently present in a chat room.
   * 'all' / unset rooms aggregate the full global presence list (the hub's
   * default view). Named rooms use the server's room-scoped presence
   * (currentRoom); until the server publishes room membership, fall back to
   * the global count so an empty state can never fire while rivals are
   * online elsewhere.
   */
  onlineInRoom(roomId: string | null | undefined): number {
    const users = this.onlineUsers();
    if (!roomId || roomId === 'all') return users.length;
    const inRoom = users.filter((u) => u.currentRoom === roomId);
    if (inRoom.length > 0) return inRoom.length;
    // Truly empty only when the presence feed actually carries room info.
    const anyRoomTracked = users.some((u) => !!u.currentRoom);
    return anyRoomTracked ? 0 : users.length;
  }

  // Go Live State
  isStreaming = signal(false);
  currentPlatform = signal<string | null>(null);
  streamTelemetry = signal<StreamTelemetry>({
    viewers: 0,
    health: 'Good',
    platform: 'NONE',
    bitrate: '0 kbps',
  });
  simulatedLiveChat = signal<RoomMessage[]>([]);

  // ── Real media capture (getUserMedia) + quality tiers ──
  localStream = signal<MediaStream | null>(null);
  streamQuality = signal<StreamQuality>('720p');
  cameraEnabled = signal(true);
  micEnabled = signal(true);
  streamError = signal<string | null>(null);

  neuralSyncStatus = signal<'idle' | 'syncing' | 'synced'>('idle');
  lastSyncedData = signal<any>(null);
  matchmakingStatus = signal<'idle' | 'searching' | 'matched'>('idle');
  currentMatch = signal<{ opponentId: string; gameId: string } | null>(null);

  // Voice chat state
  remoteSignals = signal<any[]>([]);
  typingUsers = signal<Record<string, boolean>>({});
  isIncognito = signal(false);

  // ── Inbound user-to-user invites (non-blocking, banner-driven) ──
  /** Pending squad (party) invite awaiting an accept/decline decision. */
  readonly pendingPartyInvite = signal<{
    partyId: string;
    fromUserId: string;
    fromUserName: string;
    gameId?: string;
  } | null>(null);
  /** Pending neural-sync request awaiting an accept/decline decision. */
  readonly pendingNeuralSync = signal<{
    fromUserId: string;
    fromUserName: string;
  } | null>(null);
  studioSessionEvents = signal<StudioSessionEventEnvelope[]>([]);
  sessionSyncState = signal<StudioSessionSyncState | null>(null);
  studioSessionInvites = signal<any[]>([]);
  asyncCollaborationPackets = signal<AsyncCollaborationPacket[]>([]);

  private currentRoomId: string | null = null;
  /** Token the server rejected — prevents an immediate rebuild hot-loop. */
  private lastRejectedToken: string | null | undefined;
  private get peerService() {
    return this.injector.get(PeerNetworkingService);
  }

  private getSecureRandom(): number {
    const array = new Uint32Array(1);
    (window as any).crypto.getRandomValues(array);
    return array[0] / (0xffffffff + 1);
  }

  constructor() {
    // Open the socket once we have BOTH a profile id and an API token. The
    // server verifies handshake.auth.token and disconnects token-less
    // sockets, so waiting for the token avoids opening a doomed connection.
    effect(() => {
      const profile = this.profileService.profile();
      const token = this.tokenService.jwtToken();
      if (
        profile.id &&
        token &&
        !this.socket &&
        token !== this.lastRejectedToken
      ) {
        this.initializeSocket(profile.id);
      }
    });

    // Tear the socket down on logout so a fresh one is built on next login.
    // Also clear the rejection guard so a brand-new login always attempts.
    effect(() => {
      if (!this.tokenService.jwtToken()) {
        this.lastRejectedToken = undefined;
        if (this.socket) {
          this.socket.disconnect();
          this.socket = undefined;
          this.socketConnected.set(false);
        }
      }
    });

    // Auto-bind ChallengeInboxService to socket when it becomes available
    effect(() => {
      const sock = this.socket;
      if (sock) {
        try {
          const inbox = this.injector.get(ChallengeInboxService, null);
          if (inbox) inbox.bindSocket(sock);
        } catch (_) {
          /* noop */
        }
      }
    });
  }

  private initializeSocket(userId: string) {
    // Fresh token on EVERY (re)connect attempt: `auth` as a function is
    // re-invoked by socket.io for each connection attempt, so a login that
    // happens after the socket is created is picked up automatically.
    const sock = io(APP_SECURITY_CONFIG.socket_url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      auth: (cb) => cb({ token: this.tokenService.jwtToken() ?? undefined }),
    });
    this.socket = sock;

    sock.on('connect', () => {
      this.socketConnected.set(true);
      // Flush DMs queued while the socket was down.
      if (this.pendingMessages.length > 0) {
        const queued = this.pendingMessages;
        this.pendingMessages = [];
        for (const pending of queued) {
          this.socket?.emit('send_message', pending);
        }
        this.notifications?.show?.(
          `${queued.length} MESSAGE${queued.length === 1 ? '' : 'S'} SENT`,
          'success'
        );
      }
      const profile = this.profileService.profile();
      this.socket?.emit('register_presence', {
        userId,
        metadata: this.isIncognito()
          ? { artistName: 'Incognito', profileSetupCompleted: false }
          : {
              artistName: profile.artistName,
              primaryGenre: profile.primaryGenre,
              avatarImage: profile.avatarImage,
              location: profile.location,
              profileSetupCompleted: profile.profileSetupCompleted,
            },
      });
      if (this.currentRoomId) {
        this.socket?.emit('join_room', this.currentRoomId);
      }
    });

    sock.on('disconnect', (reason) => {
      this.socketConnected.set(false);
      // Server actively severed the connection (e.g. invalid/expired token).
      // Drop the socket and remember the rejected token so the constructor
      // effects do NOT immediately rebuild into the same rejection loop.
      // The `this.socket === sock` guard ensures a stale handler can never
      // tear down a newer socket created after a re-login.
      if (reason === 'io server disconnect' && this.socket === sock) {
        this.lastRejectedToken = this.tokenService.jwtToken();
        this.socket = undefined;
        sock.disconnect();
      }
    });

    this.socket.on('connect_error', (err) => {
      this.socketConnected.set(false);
      // Transient transport errors are expected during reconnect storms.
      const generic =
        err?.message === 'websocket error' || err?.message === 'xhr poll error';
      if (err?.message && !generic) {
        console.warn('[Social] Socket connect_error:', err.message);
      }
    });

    this.socket.on('users_online', (users: OnlineUser[]) => {
      if (!Array.isArray(users)) {
        this.onlineUsers.set([]);
        return;
      }
      if (this.isIncognito()) {
        this.onlineUsers.set([]);
      } else {
        this.onlineUsers.set(
          users.filter(
            (u) => u.userId !== userId && u.artistName !== 'Incognito'
          )
        );
      }
    });

    this.socket.on('neural_sync_invite', (data: any) => {
      if (!data?.fromUserId) return;
      // Surface as a non-blocking in-app banner instead of a native
      // confirm() — native dialogs freeze the whole WebView and are
      // janky on Android, and they offer no way to review the request.
      this.pendingNeuralSync.set({
        fromUserId: data.fromUserId,
        fromUserName: data.fromUserName || 'A RIVAL',
      });
    });

    this.socket.on('neural_sync_complete', (data: any) => {
      this.neuralSyncStatus.set('synced');
      this.lastSyncedData.set({
        syncedWith: data.fromUserName,
        timestamp: Date.now(),
        remoteData: data.syncData,
      });
    });

    this.socket.on('message', (data: any) => {
      this.messages.update((msgs) => [...msgs, data]);
    });
    this.socket.on('private_message', (data: any) => {
      this.messages.update((msgs) => [
        ...msgs,
        { ...data, timestamp: Date.now() },
      ]);
    });

    this.socket.on('room_message', (data: any) => {
      this.roomMessages.update((msgs) => [...msgs, data]);
    });

    // Server persists room chat; `room_history` replaces the local buffer
    // with authoritative history (oldest-first) on join/refresh.
    this.socket.on('room_history', (data: any) => {
      if (!data?.roomId || !Array.isArray(data.messages)) return;
      if (this.currentRoomId === data.roomId) {
        this.roomMessages.set(data.messages);
      }
    });

    // incoming_challenge + challenge_inbox_sync are dispatched by ChallengeInboxComponent
    // (the inbox owns the persisted challenge signal; see ChallengeInboxService).

    this.socket.on(
      'studio_session_event',
      (data: StudioSessionEventEnvelope) => {
        this.studioSessionEvents.update((events) => [...events, data]);
      }
    );

    this.socket.on('studio_session_invite', (data: any) => {
      this.studioSessionInvites.update((invites) => [...invites, data]);
    });

    this.socket.on('session_sync', (data: StudioSessionSyncState) => {
      this.sessionSyncState.set(data);
      if (Array.isArray(data?.asyncPackets)) {
        this.asyncCollaborationPackets.set(data.asyncPackets);
      }
    });

    this.socket.on('studio_comment_added', (data: any) => {
      this.sessionSyncState.update((sync) =>
        sync
          ? {
              ...sync,
              comments: [
                data,
                ...sync.comments.filter((comment) => comment.id !== data.id),
              ],
            }
          : sync
      );
    });

    this.socket.on('studio_comment_resolved', (data: any) => {
      this.sessionSyncState.update((sync) =>
        sync
          ? {
              ...sync,
              comments: sync.comments.map((comment) =>
                comment.id === data.commentId
                  ? { ...comment, resolved: true, updatedAt: Date.now() }
                  : comment
              ),
            }
          : sync
      );
    });

    this.socket.on('studio_approval_updated', (data: any) => {
      this.sessionSyncState.update((sync) =>
        sync
          ? {
              ...sync,
              approvals: sync.approvals.map((approval) =>
                approval.id === data.approvalId
                  ? {
                      ...approval,
                      overallStatus: data.overallStatus,
                      decisions: {
                        ...approval.decisions,
                        [data.approverId]: {
                          status: data.status,
                          timestamp: Date.now(),
                        },
                      },
                      updatedAt: Date.now(),
                    }
                  : approval
              ),
            }
          : sync
      );
    });

    this.socket.on(
      'async_packet_received',
      (data: AsyncCollaborationPacket) => {
        this.asyncCollaborationPackets.update((packets) => [...packets, data]);
        this.sessionSyncState.update((sync) =>
          sync
            ? {
                ...sync,
                asyncPackets: [
                  ...sync.asyncPackets.filter(
                    (packet) => packet.id !== data.id
                  ),
                  data,
                ],
              }
            : sync
        );
      }
    );

    this.socket.on('async_packet_applied', (data: any) => {
      this.asyncCollaborationPackets.update((packets) =>
        packets.map((packet) =>
          packet.id === data.packetId
            ? {
                ...packet,
                status: 'applied',
                appliedAt: Date.now(),
              }
            : packet
        )
      );
      this.sessionSyncState.update((sync) =>
        sync
          ? {
              ...sync,
              asyncPackets: sync.asyncPackets.map((packet) =>
                packet.id === data.packetId
                  ? {
                      ...packet,
                      status: 'applied',
                      appliedAt: Date.now(),
                    }
                  : packet
              ),
            }
          : sync
      );
    });

    this.socket.on('remix_lineage_created', (data: any) => {
      this.sessionSyncState.update((sync) =>
        sync
          ? {
              ...sync,
              remixLineage: [
                data,
                ...sync.remixLineage.filter((record) => record.id !== data.id),
              ],
            }
          : sync
      );
    });

    this.socket.on('match_found', (data: any) => {
      this.matchmakingStatus.set('matched');
      this.currentMatch.set(data);
    });

    this.socket.on('party_created', (data: any) => {
      this.currentPartyId.set(data.partyId);
      this.partyMembers.set([
        {
          userId: data.leaderId,
          artistName: this.profileService.profile().artistName,
        },
      ]);
    });

    this.socket.on('user_joined_party', (data: any) => {
      this.partyMembers.update((members) => {
        if (!members.find((m) => m.userId === data.userId)) {
          return [
            ...members,
            { userId: data.userId, artistName: data.artistName },
          ];
        }
        return members;
      });
    });

    this.socket.on('party_invite', (data: any) => {
      if (!data?.partyId) return;
      // Surface as a non-blocking in-app banner (accept/decline) instead of
      // a native confirm() so the invite never freezes the WebView and the
      // recipient can review who is asking before committing.
      this.pendingPartyInvite.set({
        partyId: data.partyId,
        fromUserId: data.fromUserId,
        fromUserName: data.fromUserName || 'A RIVAL',
        gameId: data.gameId,
      });
    });
    this.socket.on('user_left_party', (data: any) => {
      this.partyMembers.update((members) =>
        members.filter((m) => m.userId !== data.userId)
      );
    });

    this.socket.on('party_message', (data: any) => {
      this.roomMessages.update((msgs) => [...msgs, data]);
    });

    this.socket.on('party_launch_game', (data: any) => {
      if (typeof data?.gameId !== 'string') return;
      this.roomMessages.update((msgs) => [
        ...msgs,
        {
          roomId: 'party',
          fromUserId: 'system',
          fromUserName: 'SQUAD_COMMAND',
          message: `SQUAD_LEADER_LAUNCHING: ${data.gameId.toUpperCase()}. PREPARE_FOR_JOINT_MISSION.`,
          timestamp: Date.now(),
          metadata: { type: 'GAME_INVITE', gameId: data.gameId },
        },
      ]);
    });

    this.socket.on('user_typing', (data: any) => {
      this.typingUsers.update((users) => ({
        ...users,
        [data.fromUserId]: data.isTyping,
      }));
    });

    this.socket.on('voice_signal', (data: any) => {
      this.remoteSignals.update((sigs) => [...sigs, data]);
      this.peerService.handleSignal(data.fromUserId, data.signal);
    });
  }

  joinRoom(roomId: string) {
    this.currentRoomId = roomId;
    this.roomMessages.set([]);
    this.socket?.emit('join_room', roomId);
  }

  /** Fetch persisted room history on demand (survives reloads). */
  async loadRoomHistory(roomId: string): Promise<RoomMessage[]> {
    const userId = this.profileService.profile().id;
    if (!userId || !roomId) return [];
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const history = await firstValueFrom(
        this.http.get<RoomMessage[]>(
          `${APP_SECURITY_CONFIG.api_url}/rooms/${encodeURIComponent(roomId)}/messages`,
          { headers }
        )
      );
      if (this.currentRoomId === roomId) {
        this.roomMessages.set(history);
      }
      return history;
    } catch (e) {
      console.error('Failed to load room history', e);
      return [];
    }
  }

  sendRoomMessage(roomId: string, message: string) {
    const fromUserId = this.profileService.profile().id;
    const fromUserName = this.profileService.profile().artistName;
    this.socket?.emit('send_room_message', {
      roomId,
      message,
      fromUserId,
      fromUserName,
    });
  }

  sendTypingStatus(toUserId: string, isTyping: boolean) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('typing', { toUserId, isTyping, fromUserId });
  }
  updateStatus(metadata: any) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    this.socket?.emit('update_status', { userId, metadata });
  }
  /**
   * DMs sent while the socket is down. Flushed on the next successful
   * connection so a message composed during a reconnect window isn't
   * silently dropped (the old code emitted into the void but still showed
   * the message as sent).
   */
  private pendingMessages: { toUserId: string; message: string }[] = [];

  sendMessage(toUserId: string, message: string) {
    const fromUserId = this.profileService.profile().id;
    const fromUserName = this.profileService.profile().artistName;
    const text = (message || '').trim();
    if (!fromUserId || !text) return;

    if (!this.isSocketLive()) {
      this.pendingMessages.push({ toUserId, message: text });
      this.messages.update((msgs) => [
        ...msgs,
        { fromUserId, fromUserName, toUserId, message: text, timestamp: Date.now() },
      ]);
      this.notifications?.show?.(
        'CONNECTION RECOVERING — MESSAGE QUEUED, WILL SEND WHEN ONLINE',
        'warning'
      );
      return;
    }
    this.socket?.emit('send_message', { toUserId, message: text });
    this.messages.update((msgs) => [
      ...msgs,
      { fromUserId, fromUserName, toUserId, message: text, timestamp: Date.now() },
    ]);
  }

  /** True only when the socket is live (present + emitting). */
  isSocketLive(): boolean {
    return !!this.socket && this.socket.connected === true;
  }

  // challengePlayer() moved to ChallengeInboxService (single source of truth).

  sendVoiceSignal(toUserId: string, signal: any) {
    const fromUserId = this.profileService.profile().id;
    this.socket?.emit('voice_signal', { toUserId, signal, fromUserId });
  }

  // STREAMING LOGIC
  private streamInterval?: any;

  startTwitchAuth() {
    this.startOAuthFlow('twitch');
  }

  startOAuthFlow(platform: string) {
    const width = 500,
      height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    const url = `${APP_SECURITY_CONFIG.api_url}/auth/${platform}`;

    const popup = window.open(
      url,
      `${platform} Auth`,
      `width=${width},height=${height},left=${left},top=${top}`
    );

    window.addEventListener(
      'message',
      (event) => {
        if (event.data.type === `${platform.toUpperCase()}_AUTH_SUCCESS`) {
          this.currentPlatform.set(`${platform} (Connected)`);
        }
      },
      { once: true }
    );
  }
  /**
   * Start a live stream: acquires real camera + mic via getUserMedia,
   * reports telemetry at the selected quality tier, and simulates an
   * audience chat feed (no ingest server is configured client-side).
   */
  async startStream(platform: string): Promise<void> {
    this.streamError.set(null);
    if (!this.localStream()) {
      try {
        const preset = STREAM_QUALITY_PRESETS[this.streamQuality()];
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        this.localStream.set(stream);
      } catch (err: any) {
        this.streamError.set(
          err?.name === 'NotAllowedError'
            ? 'CAMERA_OR_MIC_DENIED — CHECK BROWSER PERMISSIONS'
            : 'MEDIA_CAPTURE_UNAVAILABLE — USING SIMULATION ONLY'
        );
      }
    }

    this.isStreaming.set(true);
    this.currentPlatform.set(platform);
    this.simulatedLiveChat.set([]);
    const preset = STREAM_QUALITY_PRESETS[this.streamQuality()];
    this.streamTelemetry.set({
      viewers: Math.floor(this.getSecureRandom() * 24),
      health: 'Good',
      platform,
      bitrate: `${preset.bitrate} kbps`,
    });

    if (this.streamInterval) clearInterval(this.streamInterval);
    this.streamInterval = setInterval(() => {
      this.updateStreamTelemetry(platform);
      if (this.getSecureRandom() > 0.6) {
        this.generateSimulatedComment();
      }
    }, 3000);
  }

  /** Stop the stream and release camera/mic. */
  stopStream() {
    this.isStreaming.set(false);
    this.currentPlatform.set(null);
    if (this.streamInterval) clearInterval(this.streamInterval);
    this.streamInterval = undefined;
    this.localStream()?.getTracks().forEach((t) => t.stop());
    this.localStream.set(null);
    this.cameraEnabled.set(true);
    this.micEnabled.set(true);
  }

  /** Switch quality tier live — re-negotiates the video track. */
  async setStreamQuality(q: StreamQuality): Promise<void> {
    this.streamQuality.set(q);
    const stream = this.localStream();
    if (!stream) return;
    const preset = STREAM_QUALITY_PRESETS[q];
    try {
      const track = stream.getVideoTracks()[0];
      if (track) {
        await track.applyConstraints({
          width: { ideal: preset.width },
          height: { ideal: preset.height },
        });
      }
      this.streamTelemetry.update((t) => ({
        ...t,
        bitrate: `${preset.bitrate} kbps`,
      }));
    } catch {
      /* constraints not supported — keep current */
    }
  }

  /** Toggle the camera track on the live stream. */
  toggleCamera() {
    const next = !this.cameraEnabled();
    this.cameraEnabled.set(next);
    this.localStream()?.getVideoTracks().forEach((t) => (t.enabled = next));
  }

  /** Toggle the microphone track on the live stream. */
  toggleMic() {
    const next = !this.micEnabled();
    this.micEnabled.set(next);
    this.localStream()?.getAudioTracks().forEach((t) => (t.enabled = next));
  }

  private updateStreamTelemetry(platform: string) {
    const preset = STREAM_QUALITY_PRESETS[this.streamQuality()];
    this.streamTelemetry.update((t) => ({
      ...t,
      platform,
      viewers: Math.max(0, t.viewers + Math.floor(this.getSecureRandom() * 5)),
      bitrate: `${Math.max(
        500,
        preset.bitrate + Math.floor(this.getSecureRandom() * 400) - 200
      )} kbps`,
      health: this.getSecureRandom() > 0.9 ? 'Fair' : 'Good',
    }));
  }

  private generateSimulatedComment() {
    const fans = [
      'EliteGamer',
      'SMUVE_Fan_99',
      'BeatMaker_Pro',
      'VibeCheck',
      'Rival_Zero',
      'StreamSnip3r',
      'Lurker_One',
      'GiftingSubz',
      'ChatMod_Alpha',
    ];
    const comments = [
      'This track is fire!',
      'How do you get that snare sound?',
      'Elite skills right here.',
      'S.M.U.V.E 2.0 looking clean!',
      'Challenge me next?',
      'Wait, is this live??',
      'Big vibes!',
      'LFG!',
      'Is this on Kick too?',
      'Tiktok fam where you at?',
      'Clip that!!',
      'The Absolute goat',
      'Streaming quality is insane',
      'Discord link?',
    ];

    const newComment: RoomMessage = {
      roomId: 'simulated',
      fromUserId: 'fan',
      fromUserName: fans[Math.floor(this.getSecureRandom() * fans.length)],
      message: comments[Math.floor(this.getSecureRandom() * comments.length)],
      timestamp: Date.now(),
    };

    this.simulatedLiveChat.update((msgs) => {
      const updated = [...msgs, newComment];
      return updated.slice(-10); // Keep last 10
    });
  }

  requestNeuralSync(toUserId: string) {
    this.neuralSyncStatus.set('syncing');

    // Set timeout to reset status if no response received
    const syncTimeout = setTimeout(() => {
      if (this.neuralSyncStatus() === 'syncing') {
        console.warn('Neural sync request timed out');
        this.neuralSyncStatus.set('idle');
      }
    }, 10000); // 10 second timeout

    this.socket?.emit(
      'neural_sync_request',
      {
        toUserId,
        syncType: 'FULL_DASHBOARD',
      },
      (response: any) => {
        clearTimeout(syncTimeout);
        // Handle acknowledgment or error
        if (response?.error) {
          console.error('Neural sync failed:', response.error);
          this.neuralSyncStatus.set('idle');
        }
      }
    );
  }

  async loadMessageHistory(friendId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const history = await firstValueFrom(
        this.http.get<any[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/messages/${friendId}`,
          { headers }
        )
      );
      this.messages.set(history);
    } catch (e) {
      console.error('Failed to load message history', e);
    }
  }
  /** Load the server-authoritative blocklist for the current user. */
  async loadBlockedUsers(): Promise<OnlineUser[]> {
    const userId = this.profileService.profile().id;
    if (!userId) return [];
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const blocked = await firstValueFrom(
        this.http.get<OnlineUser[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/blocks`,
          { headers }
        )
      );
      this.blockedUsers.set(blocked);
      return blocked;
    } catch (e) {
      console.error('Failed to load blocked users', e);
      return [];
    }
  }

  /** Block a player: REST persists the record and invalidates the server cache. */
  async blockUser(targetUserId: string): Promise<boolean> {
    const userId = this.profileService.profile().id;
    if (!userId || !targetUserId || targetUserId === userId) return false;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(
        this.http.put(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/blocks/${targetUserId}`,
          {},
          { headers }
        )
      );
      // Reflect locally: remove from discovery surfaces + drop their DMs.
      this.onlineUsers.update((users) =>
        users.filter((u) => u.userId !== targetUserId)
      );
      this.friends.update((users) =>
        users.filter((u) => u.userId !== targetUserId)
      );
      this.messages.update((msgs) =>
        msgs.filter((m) => m.fromUserId !== targetUserId)
      );
      await this.loadBlockedUsers();
      return true;
    } catch (e) {
      console.error('Failed to block user', e);
      return false;
    }
  }

  /** Unblock a player. */
  async unblockUser(targetUserId: string): Promise<boolean> {
    const userId = this.profileService.profile().id;
    if (!userId || !targetUserId) return false;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(
        this.http.delete(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/blocks/${targetUserId}`,
          { headers }
        )
      );
      await this.loadBlockedUsers();
      return true;
    } catch (e) {
      console.error('Failed to unblock user', e);
      return false;
    }
  }

  async loadFriends() {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const friends = await firstValueFrom(
        this.http.get<OnlineUser[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends`,
          { headers }
        )
      );
      this.friends.set(friends);
    } catch (e) {
      console.error('Failed to load friends', e);
    }
  }

  async addFriend(friendId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends/${friendId}`,
          {},
          { headers }
        )
      );
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to add friend', e);
    }
  }

  async respondToFriendRequest(
    friendId: string,
    status: 'accepted' | 'declined'
  ) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(
        this.http.patch(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends/${friendId}`,
          { status },
          { headers }
        )
      );
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to respond to friend request', e);
    }
  }

  async removeFriend(friendId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await firstValueFrom(
        this.http.delete(
          `${APP_SECURITY_CONFIG.api_url}/users/${userId}/friends/${friendId}`,
          { headers }
        )
      );
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to remove friend', e);
    }
  }

  createParty(gameId: string) {
    const partyId = Math.random().toString(36).substring(7);
    this.socket?.emit('create_party', {
      partyId,
      gameId,
    });
  }

  inviteToParty(toUserId: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    this.socket?.emit('invite_to_party', {
      toUserId,
      partyId,
      gameId: 'global',
    });
  }
  joinParty(partyId: string) {
    this.socket?.emit('join_party', { partyId });
    this.currentPartyId.set(partyId);
  }

  /** Accept a pending squad invite: join the party and open the squad tab. */
  acceptPartyInvite(partyId: string) {
    if (!partyId) return;
    this.joinParty(partyId);
    this.activeHubTab.set('party');
    this.pendingPartyInvite.set(null);
  }

  /** Decline a pending squad invite without joining. */
  declinePartyInvite() {
    this.pendingPartyInvite.set(null);
  }

  /** Accept an incoming neural-sync request and exchange profile data. */
  acceptNeuralSyncRequest(fromUserId: string) {
    if (!fromUserId) return;
    this.pendingNeuralSync.set(null);
    const currentProfile = this.profileService.profile();
    this.socket?.emit('neural_sync_approve', {
      toUserId: fromUserId,
      syncData: {
        eliteScore: (currentProfile as any).eliteScore,
        squadCount: (currentProfile as any).squadCount,
      },
    });
    this.neuralSyncStatus.set('syncing');
  }

  /** Decline an incoming neural-sync request. */
  declineNeuralSyncRequest() {
    this.pendingNeuralSync.set(null);
    this.neuralSyncStatus.set('idle');
  }

  leaveParty() {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    this.socket?.emit('leave_party', { partyId });
    this.currentPartyId.set(null);
  }

  createStudioSession(data: {
    sessionId: string;
    projectId: string | null;
    sessionName?: string;
    invitedUserIds?: string[];
    role?: StudioCollaborationRole;
  }) {
    this.socket?.emit('create_studio_session', data);
  }

  inviteToStudioSession(
    sessionId: string,
    toUserId: string,
    role: StudioCollaborationRole = 'viewer'
  ) {
    this.socket?.emit('invite_to_studio_session', {
      sessionId,
      toUserId,
      role,
    });
  }

  joinStudioSession(
    sessionId: string,
    role: StudioCollaborationRole = 'viewer'
  ) {
    this.socket?.emit('join_studio_session', { sessionId, role });
  }

  leaveStudioSession(sessionId: string) {
    this.socket?.emit('leave_studio_session', { sessionId });
  }

  sendStudioSessionEvent(sessionId: string, event: unknown) {
    this.socket?.emit('studio_session_event', { sessionId, event });
  }

  requestSessionSync(sessionId: string) {
    this.socket?.emit('request_session_sync', { sessionId });
  }

  addStudioComment(data: Record<string, unknown>) {
    this.socket?.emit('add_studio_comment', data);
  }

  resolveStudioComment(data: Record<string, unknown>) {
    this.socket?.emit('resolve_studio_comment', data);
  }

  createApprovalRequest(data: Record<string, unknown>) {
    this.socket?.emit('create_approval_request', data);
  }

  submitStudioApproval(data: Record<string, unknown>) {
    this.socket?.emit('submit_approval', data);
  }

  sendAsyncCollaborationPacket(data: Record<string, unknown>) {
    this.socket?.emit('send_async_packet', data);
  }

  applyAsyncCollaborationPacket(data: Record<string, unknown>) {
    this.socket?.emit('apply_async_packet', data);
  }

  createRemixLineage(data: Record<string, unknown>) {
    this.socket?.emit('create_remix', data);
  }

  launchPartyGame(gameId: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    this.socket?.emit('party_launch_game', { partyId, gameId });
  }

  sendPartyMessage(message: string) {
    const partyId = this.currentPartyId();
    if (!partyId) return;
    this.socket?.emit('send_party_message', { partyId, message });
  }

  async searchUsers(query: string): Promise<OnlineUser[]> {
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      return await firstValueFrom(
        this.http.get<OnlineUser[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/search`,
          {
            params: { q: query },
            headers,
          }
        )
      );
    } catch (e) {
      return [];
    }
  }

  async getFeaturedUsers(): Promise<OnlineUser[]> {
    try {
      const token = this.tokenService.jwtToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      return await firstValueFrom(
        this.http.get<OnlineUser[]>(
          `${APP_SECURITY_CONFIG.api_url}/users/featured`,
          { headers }
        )
      );
    } catch (e) {
      return [];
    }
  }

  queueForMatch(gameId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    this.matchmakingStatus.set('searching');
    this.socket?.emit('queue_for_match', { userId, gameId });
  }

  cancelMatch(gameId: string) {
    const userId = this.profileService.profile().id;
    if (!userId) return;
    this.matchmakingStatus.set('idle');
    this.socket?.emit('cancel_match', { userId, gameId });
  }
  toggleIncognito() {
    this.isIncognito.update((v) => !v);
    const profile = this.profileService.profile();
    this.socket?.emit('register_presence', {
      userId: profile.id,
      metadata: this.isIncognito()
        ? { artistName: 'Incognito', profileSetupCompleted: false }
        : {
            artistName: profile.artistName,
            primaryGenre: profile.primaryGenre,
            avatarImage: profile.avatarImage,
            location: profile.location,
            profileSetupCompleted: profile.profileSetupCompleted,
          },
    });
    if (this.isIncognito()) {
      this.onlineUsers.set([]);
    }
  }
}
