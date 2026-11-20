import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PeerNetworkingService } from './peer-networking.service';
import { ChallengeInboxService } from './challenge-inbox.service';
import {
  androidScreenCapture,
  nativeScreenCaptureAvailable,
} from './android-screen-capture.service';
import { io, Socket } from 'socket.io-client';
import { TokenService } from './token.service';
import { NotificationService } from './notification.service';
import {
  AsyncCollaborationPacket,
  StudioCollaborationRole,
  StudioSessionEventEnvelope,
  StudioSessionSyncState,
} from '../types/studio-orchestration.types';
import {
  DEFAULT_LIVE_COMPOSITE_LAYOUT,
  LiveCaptureCompositorService,
  type LiveCompositeLayout,
  type LiveCompositeSession,
} from './live-capture-compositor.service';

export interface OnlineUser {
  userId: string;
  /** Friendship state; present on entries that come from the friends list. */
  status?: 'pending' | 'accepted' | 'declined';
  /** Pending requests only: who sent it. */
  direction?: 'incoming' | 'outgoing';
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
  /**
   * Live-stream identity published through presence. `live` flips false when
   * the host ends the broadcast; the token is the same one `?live=` links use,
   * so peers can open the stream without the host sending a link.
   */
  live?: boolean;
  livePlatform?: string;
  liveShareToken?: string;
  liveGameId?: string;
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
export type StreamVideoSource = 'camera' | 'screen' | 'camera-pip';

export interface HostStreamUpdate {
  /** Rebuilt host media: camera and/or screen video, mic, system sound. */
  stream: MediaStream;
  /** Which picture the host is showing — the viewer's display follows it. */
  videoSource: StreamVideoSource;
  /** Viewers hear game sound only while this is set. */
  screenAudioOnly: boolean;
}

export const STREAM_QUALITY_PRESETS: Record<
  StreamQuality,
  { width: number; height: number; bitrate: number }
> = {
  '480p': { width: 854, height: 480, bitrate: 2500 },
  '720p': { width: 1280, height: 720, bitrate: 4500 },
  '1080p': { width: 1920, height: 1080, bitrate: 6000 },
};

/**
 * Why this shell cannot capture a display, or null when it can.
 *
 * A Capacitor WebView (the Android and iOS builds) exposes no
 * `getDisplayMedia`, and nothing native bridges MediaProjection or ReplayKit
 * into the page yet, so the switch has to say so instead of failing on press.
 * The Electron shell answers the request in its main process and is allowed.
 */
const describeScreenShareUnavailable = (): string | null => {
  if (typeof navigator === 'undefined') return null;
  const shell =
    typeof window !== 'undefined'
      ? (
          window as {
            Capacitor?: { getPlatform?: () => string };
          }
        ).Capacitor?.getPlatform?.()
      : undefined;
  if (shell === 'android') {
    // The Android app captures through MediaProjection; an older build without
    // the bridge has to say so rather than fail on press.
    return nativeScreenCaptureAvailable()
      ? null
      : 'SCREEN SHARING NEEDS THE UPDATED ANDROID APP — REINSTALL IT, OR STREAM FROM A DESKTOP BROWSER';
  }
  if (shell === 'ios') {
    return 'iOS DOES NOT ALLOW SCREEN CAPTURE — STREAM THE GAME FROM THE DESKTOP APP';
  }
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
    return 'THIS BROWSER CANNOT CAPTURE THE DISPLAY — USE DESKTOP CHROME, EDGE OR SAFARI';
  }
  return null;
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
  /** Extra presence metadata contributed by services (live-stream identity). */
  private presenceExtras: (() => Record<string, unknown>) | null = null;
  /** Last status update emitted while offline; flushed on the next connect. */
  private pendingStatus: Record<string, unknown> | null = null;
  private injector = inject(Injector);
  private compositor = inject(LiveCaptureCompositorService);
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);

  onlineUsers = signal<OnlineUser[]>([]);
  /** Dismiss the go-live card once it has been joined or ignored. */
  clearFriendLive(): void {
    this.friendWentLive.set(null);
  }

  /**
   * The most recent "a friend went live" alert. The server raises it on every
   * go-live (socket or REST) so an online friend gets a join card instead of
   * having to notice the LIVE badge on the NET tab.
   */
  readonly friendWentLive = signal<{
    hostId: string;
    hostDisplayName: string;
    platform: string;
    gameId: string | null;
    shareToken: string;
    ts: number;
  } | null>(null);
  messages = signal<PrivateMessage[]>([]);
  roomMessages = signal<RoomMessage[]>([]);
  /** Players the current user has blocked (server-authoritative list). */
  blockedUsers = signal<OnlineUser[]>([]);
  // challenges moved to ChallengeInboxService (single source of truth)
  friends = signal<OnlineUser[]>([]);
  /**
   * Friends merged with live presence. The REST friends list carries no
   * stream identity, so a broadcasting friend used to look offline in the
   * NET tab even while their LIVE metadata was on the wire.
   */
  readonly friendsDirectory = computed<OnlineUser[]>(() => {
    const presence = new Map(this.onlineUsers().map((u) => [u.userId, u]));
    return this.friends().map((friend) => {
      const live = presence.get(friend.userId);
      if (!live) return friend;
      return {
        ...friend,
        online: true,
        live: live.live,
        livePlatform: live.livePlatform,
        liveShareToken: live.liveShareToken,
        liveGameId: live.liveGameId,
        currentRoom: live.currentRoom,
      };
    });
  });
  /**
   * Every peer currently broadcasting, friend or not — the LIVE NOW list.
   * Blocked users are removed here so every discovery surface (directory,
   * badges, future consumers) inherits the same filter.
   */
  readonly liveNow = computed(() => {
    const blocked = new Set(this.blockedUsers().map((u) => String(u.userId)));
    return this.onlineUsers().filter(
      (u) =>
        u.live === true && !!u.liveShareToken && !blocked.has(String(u.userId)),
    );
  });
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
  /** Local capture is live for preflight only: no stream row, no viewers. */
  previewActive = signal(false);
  /** A preview capture request is waiting on a browser permission picker. */
  previewStarting = signal(false);
  /** The last pending preview was deliberately stopped before it resolved. */
  previewCancelled = signal(false);
  /** Invalidates a capture that resolves after STOP or a newer start. */
  private captureRound = 0;
  private previewStartPromise: Promise<boolean> | null = null;
  private liveStarting = false;
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
  /**
   * The browser (or the OS) refuses capture outright: the site permission is
   * `denied`, so a retry cannot raise a prompt and the host has to change it
   * in browser settings. Distinct from a one-off refusal, which a retry can
   * still fix.
   */
  captureBlocked = signal(false);
  streamQuality = signal<StreamQuality>('720p');
  cameraEnabled = signal(true);
  micEnabled = signal(true);
  streamError = signal<string | null>(null);
  /**
   * Host video source for S.M.U.V.E Live: front camera or shared screen.
   * Sticky across the pre-stream picker and live switches — startStream()
   * honors it, so choosing SCREEN before going live opens only the screen
   * picker (no camera-then-screen double prompt).
   */
  videoSource = signal<StreamVideoSource>('camera');
  /** Camera PiP layout while a composite source is active. */
  readonly compositeLayout = signal<LiveCompositeLayout>({
    ...DEFAULT_LIVE_COMPOSITE_LAYOUT,
  });
  /**
   * getDisplayMedia availability: desktop browsers and the Electron shell.
   * Absent in the mobile app builds, where the switch explains the gap.
   */
  readonly screenShareSupported = signal(
    describeScreenShareUnavailable() === null,
  );
  /** Why screen capture cannot run here, or null when it is usable. */
  readonly screenShareUnavailableReason = signal(
    describeScreenShareUnavailable(),
  );
  /** The live screen capture carries game/system sound, not just the mic. */
  readonly screenAudioAvailable = signal(false);
  /** A source whose capture can carry game sound: the screen or its composite. */
  readonly screenSourceActive = computed(
    () => this.videoSource() === 'screen' || this.videoSource() === 'camera-pip',
  );
  /** GAME ONLY is offered only while captured game sound can replace the mic. */
  readonly gameAudioOnlyAvailable = computed(
    () => this.screenSourceActive() && this.screenAudioAvailable(),
  );
  /**
   * How the host gets game sound to viewers when the share came back silent.
   * GAME ONLY is blocked while this is set: muting the mic would leave the
   * audience with no audio at all.
   */
  readonly screenAudioWarning = computed(() => {
    if (
      (this.videoSource() !== 'screen' &&
        this.videoSource() !== 'camera-pip') ||
      this.screenAudioAvailable()
    ) {
      return null;
    }
    return nativeScreenCaptureAvailable()
      ? 'NO GAME SOUND YET — START THE GAME; IF IT STAYS SILENT THIS DEVICE WILL NOT SHARE PLAYBACK AUDIO'
      : 'NO GAME AUDIO CAPTURED — TICK "SHARE TAB AUDIO" (OR SYSTEM AUDIO) IN THE PICKER, OR VIEWERS HEAR YOUR MIC ONLY';
  });
  /**
   * What the host must fix in the local preflight before viewers arrive.
   * The video monitor is muted, so a missing or muted mic was invisible
   * until after GO LIVE.
   */
  readonly previewAudioWarning = computed(() => {
    if (!this.previewActive()) return null;
    if (this.screenAudioOnly()) return this.screenAudioWarning();
    const stream = this.localStream();
    if (!stream) return null;
    const mic = stream
      .getAudioTracks()
      .find((track) => this.audioRoleOf(track) === 'mic');
    if (!mic) {
      return 'NO MICROPHONE IN PREVIEW — VIEWERS WILL HEAR SILENCE';
    }
    if (!mic.enabled) {
      return 'MICROPHONE IS MUTED — VIEWERS WILL HEAR SILENCE';
    }
    return this.screenAudioWarning();
  });

  /** Mic track ids, so a switch back to camera drops system audio but keeps voice. */
  private micTrackIds = new Set<string>();
  /** The active canvas composite and the raw tracks feeding it. */
  private compositeSession: LiveCompositeSession | null = null;
  private compositeRawTracks: MediaStreamTrack[] = [];

  /** What a host audio track carries: ledger voice, or system sound. */
  audioRoleOf(track: MediaStreamTrack): 'mic' | 'system' {
    if (track.kind !== 'audio') return 'mic';
    return this.micTrackIds.has(track.id) ? 'mic' : 'system';
  }
  /**
   * Screen-audio-only mode: while the source is the shared screen, the
   * mic stays out of the viewers' mix — game sound only. The mic toggle
   * keeps working underneath and takes over again on camera or on exit.
   */
  screenAudioOnly = signal(false);
  /** True while camera/screen switches are running — the UI locks until the queue drains. */
  switchingSource = signal(false);
  /** Latest requested source while a switch is in flight. */
  private pendingVideoSource: StreamVideoSource | null = null;
  /** The source whose picker/acquisition is currently running. */
  private switchingToVideoSource: StreamVideoSource | null = null;
  private videoSwitchLoop?: Promise<void>;
  /** Host-peer senders refresh when the source tracks change. */
  private hostStreamListeners = new Set<(update: HostStreamUpdate) => void>();

  /**
   * Subscribe to host stream rebuilds (camera ↔ screen, game-only audio).
   * The live video fan-out registers once per hosting session: it swaps
   * every viewer peer's sender tracks by role and tells watchers which
   * source is live — no re-negotiation, no rejoin.
   */
  onHostStreamReplaced(cb: (update: HostStreamUpdate) => void): () => void {
    this.hostStreamListeners.add(cb);
    return () => {
      this.hostStreamListeners.delete(cb);
    };
  }

  /** Move or resize the camera inset without re-prompting for capture. */
  setCompositeLayout(layout: Partial<LiveCompositeLayout>): void {
    const next = { ...this.compositeLayout(), ...layout };
    this.compositeLayout.set(next);
    this.compositeSession?.updateLayout(layout);
  }

  private stopComposite(
    session: LiveCompositeSession | null,
    raw: MediaStreamTrack[],
  ): void {
    session?.stop();
    raw.forEach((track) => track.stop());
  }

  /** Release the current canvas composite and both raw source tracks. */
  private releaseCompositeCapture(): void {
    const session = this.compositeSession;
    const raw = this.compositeRawTracks;
    this.compositeSession = null;
    this.compositeRawTracks = [];
    this.stopComposite(session, raw);
  }

  /**
   * Acquire the two pictures, hand them to the compositor, and keep the raw
   * tracks alive so a later layout change or source switch needs no second
   * permission prompt. Audio is never routed through the canvas.
   */
  private async buildCompositeStream(
    preset: { width: number; height: number },
    micAudio: MediaStreamTrack[],
  ): Promise<{
    stream: MediaStream;
    session: LiveCompositeSession;
    raw: MediaStreamTrack[];
  }> {
    const screen = await this.acquireScreenCapture(preset);
    let camera: MediaStreamTrack | null = null;
    let session: LiveCompositeSession | null = null;
    try {
      camera = await this.acquireCameraTrack(preset);
      session = this.compositor.create(
        new MediaStream([screen.video]),
        new MediaStream([camera]),
        {
          width: preset.width,
          height: preset.height,
          fps: 30,
          layout: this.compositeLayout(),
        },
      );
      const composite = session.stream.getVideoTracks()[0];
      if (!composite) throw new Error('LIVE_COMPOSITE_NO_VIDEO_TRACK');
      screen.video.addEventListener('ended', () => {
        if (
          this.videoSource() === 'camera-pip' &&
          this.captureActive() &&
          this.compositeRawTracks[0] === screen.video
        ) {
          void this.setVideoSource('camera').catch(() => undefined);
        }
      });
      return {
        stream: new MediaStream([
          composite,
          ...micAudio,
          ...screen.systemAudio,
        ]),
        session,
        raw: [screen.video, camera],
      };
    } catch (error) {
      session?.stop();
      [screen.video, camera, ...screen.systemAudio]
        .filter((track): track is MediaStreamTrack => !!track)
        .forEach((track) => track.stop());
      throw error;
    }
  }

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
  private wakeHooksInstalled = false;
  private lastConnectError: string | null = null;
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
          this.injector.get(ChallengeInboxService, null)?.bindSocket(null);
        }
        // A later login may belong to a different account. Never deliver a
        // previous user's unsent messages using the new user's credentials.
        this.pendingMessages = [];
      }
    });

    // Game-only is a promise about the audience mix: once the capture stops
    // carrying game sound it must switch itself off instead of showing an
    // active chip while the mic is still the only audio.
    effect(() => {
      if (this.screenAudioAvailable() || !this.screenAudioOnly()) return;
      this.screenAudioOnly.set(false);
      this.applyMicState();
    });
  }

  /**
   * Bring the socket back the moment the device is usable again.
   *
   * socket.io's own retry loop cannot run while a phone is asleep or a tab is
   * frozen, and it stops trying entirely once the attempt budget is spent —
   * which is why host and viewer connections "kept breaking" until a reload.
   */
  private installWakeHooks(): void {
    if (this.wakeHooksInstalled || typeof window === 'undefined') return;
    this.wakeHooksInstalled = true;
    const resume = () => {
      const sock = this.socket;
      if (!sock || sock.connected || !this.tokenService.jwtToken()) return;
      sock.connect();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resume();
    });
  }

  /**
   * Force the transport back to life. Auto-reconnect handles the ordinary
   * case; this is the manual escape hatch behind the reconnect banner.
   */
  reconnectSocket(): void {
    if (!this.tokenService.jwtToken()) return;
    if (!this.socket) {
      // A socket the server severed was dropped, not reconnecting.
      this.lastRejectedToken = undefined;
      const userId = this.profileService.profile().id;
      if (userId) this.initializeSocket(userId);
      return;
    }
    if (!this.socket.connected) this.socket.connect();
  }

  private initializeSocket(userId: string) {
    // Fresh token on EVERY (re)connect attempt: `auth` as a function is
    // re-invoked by socket.io for each connection attempt, so a login that
    // happens after the socket is created is picked up automatically.
    const sock = io(APP_SECURITY_CONFIG.socket_url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      // A phone that sleeps or a tunnel that blips easily outlasts ten
      // attempts, and a socket that gives up never comes back on its own:
      // no presence, no live signaling, no chat until a reload.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8_000,
      randomizationFactor: 0.5,
      auth: (cb) => cb({ token: this.tokenService.jwtToken() ?? undefined }),
    });
    this.socket = sock;
    this.installWakeHooks();
    // The socket is a plain field, not a signal: binding in an Angular effect
    // never reacts when it is created after the initial login.
    this.injector.get(ChallengeInboxService, null)?.bindSocket(sock);

    sock.on('connect', () => {
      this.socketConnected.set(true);
      this.lastConnectError = null;
      // Flush DMs queued while the socket was down.
      if (this.pendingMessages.length > 0) {
        const queued = this.pendingMessages;
        this.pendingMessages = [];
        for (const pending of queued) {
          this.socket?.emit('send_message', pending);
        }
        this.notifications?.show?.(
          `${queued.length} MESSAGE${queued.length === 1 ? '' : 'S'} SENT`,
          'success',
        );
      }
      this.socket?.emit('register_presence', {
        userId,
        metadata: this.presenceMetadata(),
        // Incognito must replace metadata so hidden profile fields do not
        // survive a reconnect from another tab/device.
        ...(this.isIncognito() ? { replace: true } : {}),
      });
      // A Go Live that happened while the socket was down (or just before
      // this connect handler ran) must not stay invisible to friends.
      if (this.pendingStatus) {
        const metadata = this.pendingStatus;
        this.pendingStatus = null;
        this.socket?.emit('update_status', { userId, metadata });
      }
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
        this.injector.get(ChallengeInboxService, null)?.bindSocket(null);
        sock.disconnect();
      }
    });

    this.socket.on('connect_error', (err) => {
      this.socketConnected.set(false);
      // Transient transport errors are expected during reconnect storms.
      const generic =
        err?.message === 'websocket error' || err?.message === 'xhr poll error';
      // The socket retries forever now, so log a given reason once instead of
      // once per attempt.
      if (err?.message && !generic && err.message !== this.lastConnectError) {
        this.lastConnectError = err.message;
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
        // Presence is re-broadcast continuously; filtering only when the user
        // blocks someone lets the next broadcast put the blocked account back
        // in the roster. Apply the current blocklist to every snapshot.
        const blocked = new Set(
          this.blockedUsers().map((u) => String(u.userId)),
        );
        this.onlineUsers.set(
          users.filter(
            (u) =>
              u.userId !== userId &&
              u.artistName !== 'Incognito' &&
              !blocked.has(String(u.userId)),
          ),
        );
      }
    });

    this.socket.on(
      'friend_went_live',
      (data: {
        hostId?: string;
        hostDisplayName?: string;
        platform?: string;
        gameId?: string | null;
        shareToken?: string;
        ts?: number;
      }) => {
        if (!data?.shareToken) return;
        const hostDisplayName = data.hostDisplayName || 'A FRIEND';
        this.friendWentLive.set({
          hostId: String(data.hostId ?? ''),
          hostDisplayName,
          platform: data.platform || 'smuve',
          gameId: data.gameId ?? null,
          shareToken: data.shareToken,
          ts: Number(data.ts) || Date.now(),
        });
        this.notifications?.show?.(
          `${hostDisplayName.toUpperCase()} IS LIVE - OPEN LIVE NOW TO WATCH`,
          'info',
        );
      },
    );

    this.socket.on(
      'friend_live_ended',
      (data: { shareToken?: string } = {}) => {
        // Retire only the card for the room that closed: a different friend
        // may have gone live in the meantime.
        const current = this.friendWentLive();
        if (!current || !data?.shareToken) return;
        if (current.shareToken !== data.shareToken) return;
        this.friendWentLive.set(null);
      },
    );

    this.socket.on(
      'friend_request_received',
      (data: { fromUserId?: string }) => {
        if (!data?.fromUserId) return;
        // The event only carries the sender id; reload so the request appears in
        // the friends list with its name, avatar, and incoming direction.
        void this.loadFriends();
        this.notifications?.show?.('NEW FRIEND REQUEST', 'info');
      },
    );

    this.socket.on('friend_requests_read', () => {
      // The server bulk-marked friend-request notifications when the friends
      // list was fetched; clear the unread dot on any loaded inbox.
      this.injector
        .get(ChallengeInboxService, null)
        ?.markFriendRequestsRead?.();
    });

    this.socket.on(
      'friend_request_resolved',
      (data: { otherUserId?: string }) => {
        if (!data?.otherUserId) return;
        // Accepted, declined, cancelled, or blocked: drop the stale request
        // row and reconcile the friends list for the other side too.
        this.injector
          .get(ChallengeInboxService, null)
          ?.removeFriendRequestsFrom?.(data.otherUserId);
        void this.loadFriends();
      },
    );

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
      },
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
          : sync,
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
                  : comment,
              ),
            }
          : sync,
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
                  : approval,
              ),
            }
          : sync,
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
                    (packet) => packet.id !== data.id,
                  ),
                  data,
                ],
              }
            : sync,
        );
      },
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
            : packet,
        ),
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
                  : packet,
              ),
            }
          : sync,
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
          : sync,
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
        members.filter((m) => m.userId !== data.userId),
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
          { headers },
        ),
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
    const merged = { ...(this.pendingStatus ?? {}), ...(metadata ?? {}) };
    // Not connected yet: hold the latest status and flush it right after the
    // next register_presence so a Go Live during (re)connect is never lost.
    if (!this.isSocketLive()) {
      this.pendingStatus = merged;
      return;
    }
    this.pendingStatus = null;
    this.socket?.emit('update_status', { userId, metadata: merged });
  }

  /**
   * Register metadata a service owns (the live-stream identity). It is merged
   * into every presence registration, including socket reconnects, because
   * `register_presence` replaces metadata wholesale on the server.
   */
  setPresenceExtrasProvider(provider: (() => Record<string, unknown>) | null) {
    this.presenceExtras = provider;
  }

  /** Profile fields plus any service-owned presence identity. */
  private presenceMetadata(): Record<string, unknown> {
    if (this.isIncognito()) {
      return { artistName: 'Incognito', profileSetupCompleted: false };
    }
    const profile = this.profileService.profile();
    return {
      artistName: profile.artistName,
      primaryGenre: profile.primaryGenre,
      avatarImage: profile.avatarImage,
      location: profile.location,
      profileSetupCompleted: profile.profileSetupCompleted,
      ...(this.presenceExtras?.() ?? {}),
    };
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
        {
          fromUserId,
          fromUserName,
          toUserId,
          message: text,
          timestamp: Date.now(),
        },
      ]);
      this.notifications?.show?.(
        'CONNECTION RECOVERING — MESSAGE QUEUED, WILL SEND WHEN ONLINE',
        'warning',
      );
      return;
    }
    this.socket?.emit('send_message', { toUserId, message: text });
    this.messages.update((msgs) => [
      ...msgs,
      {
        fromUserId,
        fromUserName,
        toUserId,
        message: text,
        timestamp: Date.now(),
      },
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

  /**
   * Start a live stream: acquires real camera + mic via getUserMedia,
   * reports telemetry at the selected quality tier, and reuses an existing
   * preflight capture instead of prompting the host a second time.
   */
  async startStream(platform: string): Promise<boolean> {
    if (this.liveStarting) return false;
    this.liveStarting = true;
    const startRound = this.captureRound;
    try {
      // GO LIVE while a preview picker is open: wait for that same capture,
      // then reuse it. A STOP during the wait invalidates the round.
      const pendingPreview = this.previewStartPromise;
      if (pendingPreview) await pendingPreview.catch(() => false);
      if (startRound !== this.captureRound) return false;

      const round = ++this.captureRound;
      this.streamError.set(null);
      this.previewActive.set(false);
      this.previewCancelled.set(false);
      if (!this.localStream()) {
        try {
          await this.acquireHostMedia();
          if (round === this.captureRound) this.captureBlocked.set(false);
        } catch (err: unknown) {
          if (round !== this.captureRound) {
            this.releaseInactiveCapture();
            return false;
          }
          this.streamError.set(this.describeCaptureError(err));
          void this.refreshCaptureBlocked();
        }
      }

      if (round !== this.captureRound) {
        this.releaseInactiveCapture();
        return false;
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
      return true;
    } finally {
      this.liveStarting = false;
    }
  }

  /**
   * One-tap capture retry from the host's "no feed" warning: ask for
   * camera/mic again after a refusal, without restarting the broadcast.
   * Returns whether there is now media to send.
   */
  async retryHostMedia(): Promise<boolean> {
    this.streamError.set(null);
    if (this.localStream()) return true;
    try {
      await this.acquireHostMedia();
      this.captureBlocked.set(false);
    } catch (err: unknown) {
      this.streamError.set(this.describeCaptureError(err));
      // Re-probe: the host may have unblocked the site since the last attempt.
      await this.refreshCaptureBlocked();
    }
    return !!this.localStream();
  }

  /**
   * Ask the Permissions API whether the camera is hard-blocked. Unsupported
   * browsers (Safari, some webviews) throw or omit it — unknown reads as "not
   * blocked", so the retry stays offered rather than telling the host
   * something we cannot verify.
   */
  private async refreshCaptureBlocked(): Promise<void> {
    const permissions = (navigator as Navigator & { permissions?: Permissions })
      .permissions;
    if (!permissions?.query) return;
    try {
      const camera = await permissions.query({
        name: 'camera' as PermissionName,
      });
      this.captureBlocked.set(camera.state === 'denied');
    } catch {
      this.captureBlocked.set(false);
    }
  }

  /** Operator-facing reason for a failed capture, shared by every caller. */
  private describeCaptureError(err: unknown): string {
    const name = (err as { name?: string } | null)?.name;
    return name === 'NotAllowedError'
      ? 'CAMERA_OR_MIC_DENIED — CHECK BROWSER PERMISSIONS'
      : 'MEDIA_CAPTURE_UNAVAILABLE — CHECK CAMERA AND MIC PERMISSIONS';
  }

  /**
   * Start local capture for a preflight preview. Double-clicks share one
   * acquisition promise, and STOP/leave invalidates a picker that resolves
   * late so it can never leave a camera or screen capture behind.
   */
  startPreview(): Promise<boolean> {
    if (this.previewActive()) return Promise.resolve(true);
    if (this.isStreaming() || this.liveStarting || this.switchingSource()) {
      return Promise.resolve(false);
    }
    if (this.previewStartPromise) return this.previewStartPromise;

    const round = ++this.captureRound;
    this.previewCancelled.set(false);
    this.previewStarting.set(true);
    const tracked = this.beginPreview(round).finally(() => {
      if (this.previewStartPromise === tracked) {
        this.previewStartPromise = null;
        this.previewStarting.set(false);
      }
    });
    this.previewStartPromise = tracked;
    return tracked;
  }

  private async beginPreview(round: number): Promise<boolean> {
    this.streamError.set(null);
    if (!this.localStream()) {
      try {
        await this.acquireHostMedia();
        if (round === this.captureRound) this.captureBlocked.set(false);
      } catch (err: unknown) {
        if (round !== this.captureRound) {
          this.releaseInactiveCapture();
          return false;
        }
        this.streamError.set(this.describeCaptureError(err));
        await this.refreshCaptureBlocked();
        return false;
      }
    }
    if (
      round !== this.captureRound ||
      this.isStreaming() ||
      !this.localStream()
    ) {
      this.releaseInactiveCapture();
      return false;
    }
    this.previewActive.set(true);
    return true;
  }

  /** Release capture that resolved after its preview was cancelled. */
  private releaseInactiveCapture(): void {
    if (this.isStreaming() || this.previewActive()) return;
    this.releaseCompositeCapture();
    this.localStream()
      ?.getTracks()
      .forEach((track) => track.stop());
    this.localStream.set(null);
    this.micTrackIds.clear();
    this.screenAudioAvailable.set(false);
    this.cameraEnabled.set(true);
    this.micEnabled.set(true);
    this.videoSource.set('camera');
    this.screenAudioOnly.set(false);
    void androidScreenCapture.stop();
  }

  /** Release a preflight preview, including a capture still awaiting permission. */
  stopPreview(): void {
    if (this.isStreaming()) return;
    this.captureRound++;
    if (this.previewStarting()) this.previewCancelled.set(true);
    this.previewActive.set(false);
    this.stopStream();
  }

  private captureActive(): boolean {
    return this.isStreaming() || this.previewActive();
  }

  /** Stop the stream and release camera/mic. */
  stopStream() {
    this.captureRound++;
    if (this.previewStarting()) this.previewCancelled.set(true);
    this.releaseCompositeCapture();
    this.pendingVideoSource = null;
    this.isStreaming.set(false);
    this.previewActive.set(false);
    this.currentPlatform.set(null);
    if (this.streamInterval) clearInterval(this.streamInterval);
    this.streamInterval = undefined;
    this.localStream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.localStream.set(null);
    this.cameraEnabled.set(true);
    this.micEnabled.set(true);
    this.videoSource.set('camera');
    this.screenAudioOnly.set(false);
    this.screenAudioAvailable.set(false);
    this.micTrackIds.clear();
    void androidScreenCapture.stop();
  }

  /**
   * Initial host capture honoring the pre-stream source choice. Screen
   * capture pairs the shared screen with the mic (narrate the game) and
   * adds system audio when the browser shares it; a refused screen picker
   * falls back to camera instead of killing the broadcast.
   */
  private async acquireHostMedia(): Promise<void> {
    const preset = STREAM_QUALITY_PRESETS[this.streamQuality()];
    if (this.videoSource() === 'camera-pip' && this.screenShareSupported()) {
      let mic: MediaStream | null = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const micTracks = mic.getAudioTracks();
        micTracks.forEach((track) => this.micTrackIds.add(track.id));
        const built = await this.buildCompositeStream(preset, micTracks);
        this.compositeSession = built.session;
        this.compositeRawTracks = built.raw;
        this.screenAudioAvailable.set(
          built.stream.getAudioTracks().length > micTracks.length,
        );
        this.setHostStream(built.stream, 'camera-pip');
        return;
      } catch (error) {
        mic?.getTracks().forEach((track) => track.stop());
        this.streamError.set(this.describeCaptureError(error));
        // A refused display picker should still leave a usable camera feed.
        this.videoSource.set('camera');
      }
    }
    if (this.videoSource() === 'screen' && this.screenShareSupported()) {
      let screen: { video: MediaStreamTrack; systemAudio: MediaStreamTrack[] } | null =
        null;
      try {
        screen = await this.acquireScreenCapture(preset);
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const micTracks = mic.getAudioTracks();
        micTracks.forEach((t) => this.micTrackIds.add(t.id));
        this.setHostStream(new MediaStream([screen.video, ...micTracks]), 'screen');
        // System sound joins alongside the mic; the player mixes both.
        screen.systemAudio.forEach((t) => this.localStream()?.addTrack(t));
        this.screenAudioAvailable.set(this.screenAudioReady(screen.systemAudio));
        return;
      } catch {
        // A cancelled picker, a denied mic, or an unsupported capture must not
        // leave the browser's screen-sharing indicator running.
        screen?.video.stop();
        screen?.systemAudio.forEach((track) => track.stop());
        this.videoSource.set('camera');
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        facingMode: 'user',
      },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getAudioTracks().forEach((t) => this.micTrackIds.add(t.id));
    this.screenAudioAvailable.set(false);
    this.setHostStream(stream, 'camera');
  }

  /**
   * One fresh screen video track plus any system-audio tracks the browser
   * offers. Stray sibling tracks are stopped so no hidden capture survives.
   * When the viewer presses the browser's own Stop sharing, the track's
   * `ended` event drops the broadcast back to camera — viewers stay on.
   */
  private async acquireScreenCapture(preset: {
    width: number;
    height: number;
  }): Promise<{ video: MediaStreamTrack; systemAudio: MediaStreamTrack[] }> {
    if (nativeScreenCaptureAvailable()) {
      // Android's WebView has no getDisplayMedia: the MediaProjection service
      // feeds JPEG frames that a canvas turns into a real video track. It has
      // no game audio, which the host is warned about separately.
      androidScreenCapture.onEnded = () => {
        if (this.videoSource() === 'screen' && this.captureActive()) {
          void this.setVideoSource('camera').catch(() => undefined);
        }
      };
      const nativeStream = await androidScreenCapture.start();
      const nativeVideo = nativeStream.getVideoTracks()[0];
      if (!nativeVideo) {
        void androidScreenCapture.stop();
        throw new Error('SCREEN_CAPTURE_NO_VIDEO_TRACK');
      }
      this.guardScreenCaptureEnd(nativeVideo);
      // The game-audio track always exists, but it carries silence until the
      // game actually plays something: only real signal clears the warning.
      androidScreenCapture.onAudioDetected = () => {
        if (this.videoSource() === 'screen') {
          this.screenAudioAvailable.set(true);
        }
      };
      this.screenAudioAvailable.set(androidScreenCapture.hasGameAudio);
      const nativeAudio = androidScreenCapture.audioTrack;
      return {
        video: nativeVideo,
        systemAudio: nativeAudio ? [nativeAudio] : [],
      };
    }
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: 30 },
      },
      audio: true,
    });
    const video = display.getVideoTracks()[0];
    const systemAudio = display.getAudioTracks();
    display.getTracks().forEach((t) => {
      if (t !== video && !systemAudio.includes(t)) t.stop();
    });
    if (!video) {
      display.getTracks().forEach((t) => t.stop());
      throw new Error('SCREEN_CAPTURE_NO_VIDEO_TRACK');
    }
    this.guardScreenCaptureEnd(video);
    return { video, systemAudio };
  }

  /**
   * Whether the share really carries game sound. The native Android bridge
   * always exposes an audio track, so possession is not proof: it has to have
   * produced signal.
   */
  private screenAudioReady(systemAudio: MediaStreamTrack[]): boolean {
    return nativeScreenCaptureAvailable()
      ? androidScreenCapture.hasGameAudio
      : systemAudio.length > 0;
  }

  /**
   * Identity-checked: only the track that is STILL the live picture falls back
   * to camera. A replaced track ending late (or a double-tap loser's track)
   * must never yank a newer session back to camera.
   */
  private guardScreenCaptureEnd(video: MediaStreamTrack): void {
    video.addEventListener('ended', () => {
      if (
        this.videoSource() === 'screen' &&
        this.captureActive() &&
        this.localStream()?.getVideoTracks()[0] === video
      ) {
        void this.setVideoSource('camera').catch(() => undefined);
      }
    });
  }

  /** One fresh front-camera video track (audio stays with the mic). */
  private async acquireCameraTrack(preset: {
    width: number;
    height: number;
  }): Promise<MediaStreamTrack> {
    const cam = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        facingMode: 'user',
      },
      audio: false,
    });
    const video = cam.getVideoTracks()[0];
    cam.getTracks().forEach((t) => {
      if (t !== video) t.stop();
    });
    if (!video) throw new Error('CAMERA_CAPTURE_NO_VIDEO_TRACK');
    return video;
  }

  /**
   * Live source switch: front camera ↔ screen recording. The mic survives
   * both directions; system audio joins on screen and leaves on camera.
   * Every connected viewer peer gets the new track via replaceTrack —
   * the audience watches straight through the cut, chat uninterrupted.
   */
  async setVideoSource(source: StreamVideoSource): Promise<void> {
    if (!this.captureActive()) return;
    if (this.switchingSource()) {
      // A picker already open cannot be replaced. If the latest request is
      // the source already being acquired, there is nothing left to queue.
      this.pendingVideoSource =
        source === this.switchingToVideoSource ? null : source;
      return this.videoSwitchLoop ?? Promise.resolve();
    }
    if (source === this.videoSource()) return;

    this.pendingVideoSource = source;

    this.switchingSource.set(true);
    const run = (async () => {
      try {
        while (this.pendingVideoSource && this.captureActive()) {
          const next = this.pendingVideoSource;
          this.pendingVideoSource = null;
          if (next === this.videoSource()) continue;
          this.switchingToVideoSource = next;
          try {
            await this.switchVideoSource(next);
          } finally {
            this.switchingToVideoSource = null;
          }
        }
      } finally {
        this.pendingVideoSource = null;
        this.switchingToVideoSource = null;
        this.switchingSource.set(false);
        this.videoSwitchLoop = undefined;
      }
    })();
    this.videoSwitchLoop = run;
    return run;
  }

  private async switchVideoSource(source: StreamVideoSource): Promise<void> {
    if (
      (source === 'screen' || source === 'camera-pip') &&
      !this.screenShareSupported()
    ) {
      this.streamError.set(
        this.screenShareUnavailableReason() ||
          'SCREEN_SHARE_UNSUPPORTED — USE DESKTOP CHROME, EDGE OR SAFARI',
      );
      return;
    }
    const current = this.localStream();
    if (!current) {
      this.streamError.set(
        'MEDIA_CAPTURE_UNAVAILABLE — CHECK CAMERA AND MIC PERMISSIONS',
      );
      return;
    }
    const preset = STREAM_QUALITY_PRESETS[this.streamQuality()];
    const previousVideo = current.getVideoTracks()[0];
    const previousComposite = this.compositeSession;
    const previousRaw = this.compositeRawTracks;
    try {
      let next: MediaStream;
      let nextComposite: {
        session: LiveCompositeSession;
        raw: MediaStreamTrack[];
      } | null = null;
      if (source === 'camera-pip') {
        const built = await this.buildCompositeStream(
          preset,
          this.micAudioOf(current),
        );
        next = built.stream;
        nextComposite = { session: built.session, raw: built.raw };
        this.screenAudioAvailable.set(
          built.stream.getAudioTracks().length >
            this.micAudioOf(current).length,
        );
      } else if (source === 'screen') {
        const { video, systemAudio } = await this.acquireScreenCapture(preset);
        const micAudio = this.micAudioOf(current);
        next = new MediaStream([video, ...micAudio, ...systemAudio]);
        this.screenAudioAvailable.set(this.screenAudioReady(systemAudio));
      } else {
        const video = await this.acquireCameraTrack(preset);
        next = new MediaStream([video, ...this.micAudioOf(current)]);
        this.screenAudioAvailable.set(false);
        // GAME ONLY only applies while the shared screen can carry game sound.
        // Leaving it on made viewers stay on the system-audio mix after the
        // host switched back to the camera.
        this.screenAudioOnly.set(false);
        void androidScreenCapture.stop();
      }
      if (!this.captureActive()) {
        // The session ended while the picker was open: release the fresh
        // tracks instead of publishing them into a dead broadcast.
        next.getTracks().forEach((t) => t.stop());
        nextComposite?.session.stop();
        nextComposite?.raw.forEach((track) => track.stop());
        return;
      }
      this.compositeSession = nextComposite?.session ?? null;
      this.compositeRawTracks = nextComposite?.raw ?? [];
      this.setHostStream(next, source);
      previousVideo?.stop();
      this.stopComposite(previousComposite, previousRaw);
      // The old screen track's system audio leaves with the switch.
      current.getAudioTracks().forEach((t) => {
        if (!this.micTrackIds.has(t.id)) t.stop();
      });
    } catch (err: any) {
      // Android's consent dialog denied: say so instead of a generic failure.
      if (String(err?.message || '').includes('SCREEN_CAPTURE_DENIED')) {
        this.streamError.set(
          'SCREEN SHARING WAS DENIED — ALLOW IT TO SHOW THE GAME',
        );
        return;
      }
      // Picker cancelled mid-show: stay on the current source.
      if (err?.name !== 'NotAllowedError') {
        this.streamError.set(
          'VIDEO_SOURCE_SWITCH_FAILED — STAYED ON ' +
            this.videoSource().toUpperCase(),
        );
      }
    }
  }

  /** The mic ledger first; every audio track when capture predates it. */
  private micAudioOf(stream: MediaStream): MediaStreamTrack[] {
    const mic = stream
      .getAudioTracks()
      .filter((t) => this.micTrackIds.has(t.id));
    return mic.length ? mic : stream.getAudioTracks();
  }

  /** Publish a rebuilt host stream and push the update to viewers. */
  private setHostStream(stream: MediaStream, source: StreamVideoSource): void {
    this.localStream.set(stream);
    this.videoSource.set(source);
    this.cameraEnabled.set(true);
    this.applyMicState();
    const update: HostStreamUpdate = {
      stream,
      videoSource: source,
      screenAudioOnly: this.screenAudioOnly(),
    };
    this.hostStreamListeners.forEach((cb) => {
      try {
        cb(update);
      } catch {
        /* a doomed peer must not break the switch */
      }
    });
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
    this.localStream()
      ?.getVideoTracks()
      .forEach((t) => (t.enabled = next));
  }

  /** Toggle the microphone (voice) tracks on the live stream. */
  toggleMic() {
    this.micEnabled.set(!this.micEnabled());
    this.applyMicState();
  }

  /**
   * Voice audibility for viewers: the mic toggle, minus screen-audio-only
   * mode. System (game) sound always rides along — viewers balance it
   * against the voice with their own per-source mix sliders.
   */
  private applyMicState(): void {
    const stream = this.localStream();
    if (!stream) return;
    // GAME ONLY is only safe when real game sound replaces the mic.
    const gameSoundCarriesTheMix =
      this.screenAudioOnly() &&
      this.screenSourceActive() &&
      this.screenAudioAvailable();
    const voiceOn = this.micEnabled() && !gameSoundCarriesTheMix;
    this.micAudioOf(stream).forEach((t) => {
      t.enabled = voiceOn;
    });
  }

  /** Viewers hear game sound only — the host's mic leaves their mix. */
  setScreenAudioOnly(on: boolean): void {
    // With no captured game audio this would mute the only sound available.
    if (on && !this.gameAudioOnlyAvailable()) return;
    this.screenAudioOnly.set(on);
    this.applyMicState();
  }

  /**
   * Template-facing alias of {@link toggleMic} — the Tha Spot stream
   * panel binds `socialService.toggleMicrophone()`. Kept as an alias so
   * both spellings stay safe against template renames.
   */
  toggleMicrophone() {
    this.toggleMic();
  }

  private updateStreamTelemetry(platform: string) {
    const preset = STREAM_QUALITY_PRESETS[this.streamQuality()];
    this.streamTelemetry.update((t) => ({
      ...t,
      platform,
      viewers: Math.max(0, t.viewers + Math.floor(this.getSecureRandom() * 5)),
      bitrate: `${Math.max(
        500,
        preset.bitrate + Math.floor(this.getSecureRandom() * 400) - 200,
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
      },
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
          { headers },
        ),
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
          { headers },
        ),
      );
      this.blockedUsers.set(blocked);
      // The blocklist usually arrives after the first presence snapshot. Purge
      // already-listed users so the roster is correct without waiting for the
      // next broadcast (or a refresh).
      const blockedIds = new Set(blocked.map((u) => String(u.userId)));
      this.onlineUsers.update((users) =>
        users.filter((u) => !blockedIds.has(String(u.userId))),
      );
      this.friends.update((users) =>
        users.filter((u) => !blockedIds.has(String(u.userId))),
      );
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
          { headers },
        ),
      );
      // Reflect locally: remove from discovery surfaces + drop their DMs.
      this.onlineUsers.update((users) =>
        users.filter((u) => u.userId !== targetUserId),
      );
      this.friends.update((users) =>
        users.filter((u) => u.userId !== targetUserId),
      );
      this.messages.update((msgs) =>
        msgs.filter((m) => m.fromUserId !== targetUserId),
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
          { headers },
        ),
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
          { headers },
        ),
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
          { headers },
        ),
      );
      await this.loadFriends();
    } catch (e) {
      console.error('Failed to add friend', e);
    }
  }

  async respondToFriendRequest(
    friendId: string,
    status: 'accepted' | 'declined',
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
          { headers },
        ),
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
          { headers },
        ),
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
  /**
   * Approve a pending neural-sync request.
   *
   * Returns false when there is nobody to approve or no live socket, so the
   * caller can tell the artist the approval never left the device instead of
   * announcing a sync that is not happening.
   */
  acceptNeuralSyncRequest(fromUserId: string): boolean {
    if (!fromUserId) return false;
    if (!this.socket) return false;
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
    // Same bounded wait as requestNeuralSync: an approval the server never
    // acknowledges must not leave the hub claiming a sync is under way.
    setTimeout(() => {
      if (this.neuralSyncStatus() === 'syncing') {
        console.warn('Neural sync approval was never acknowledged');
        this.neuralSyncStatus.set('idle');
      }
    }, 10_000);
    return true;
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
    role: StudioCollaborationRole = 'viewer',
  ) {
    this.socket?.emit('invite_to_studio_session', {
      sessionId,
      toUserId,
      role,
    });
  }

  joinStudioSession(
    sessionId: string,
    role: StudioCollaborationRole = 'viewer',
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
          },
        ),
      );
    } catch {
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
          { headers },
        ),
      );
    } catch {
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
      metadata: this.presenceMetadata(),
      // Turning incognito ON replaces metadata so hidden profile fields do
      // not linger; every other registration merges to keep live identity.
      ...(this.isIncognito() ? { replace: true } : {}),
    });
    if (this.isIncognito()) {
      this.onlineUsers.set([]);
    }
  }
}
