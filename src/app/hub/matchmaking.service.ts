import { Injectable, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { GameService } from './game.service';
import { UserProfileService } from '../services/user-profile.service';
import { NotificationService } from '../services/notification.service';
import { HapticService } from '../services/haptic.service';
import { TokenService } from '../services/token.service';
import { ShareableInviteService, InviteMode } from '../services/shareable-invite.service';
import { Game } from './game';
import { APP_SECURITY_CONFIG } from '../app.security';

// ── Matchmaking Types (same shape as server-side payloads) ──

export type LobbyStatus =
  | 'idle'
  | 'searching'
  | 'matched'
  | 'ready'
  | 'in-progress'
  | 'cancelled';
export type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface ServerChallenge {
  id: number;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  gameId: string;
  message?: string;
  status: string;
  timestamp: number;
}

export interface PartyMember {
  userId: string;
  artistName: string;
}

export interface ServerParty {
  partyId: string;
  leaderId: string;
  members: PartyMember[];
  gameId?: string;
}

export interface LobbyChatMessage {
  id: string;
  lobbyId: string;
  fromUserId: string;
  fromUserName: string;
  text: string;
  timestamp: number;
}

export interface GameStateSnapshot {
  id: string;
  lobbyId: string;
  gameId: string;
  timestamp: number;
  recordedBy: string;
  state: Record<string, any>;
  label?: string;
}

export interface SpectatorReaction {
  id: string;
  lobbyId: string;
  fromUserId: string;
  fromUserName: string;
  emoji: string;
  timestamp: number;
}

export interface GameStateUpdate {
  lobbyId: string;
  gameId: string;
  playerId: string;
  playerName: string;
  score?: number;
  progress?: number;
  level?: string;
  alive?: boolean;
  position?: { x: number; y: number };
  custom?: Record<string, any>;
  timestamp: number;
}

export interface CoOpLobby {
  id: string;
  hostId: string;
  hostName: string;
  gameId: string;
  gameName: string;
  roomId?: string;
  status: LobbyStatus;
  playerIds: string[];
  maxPlayers: number;
  created: number;
  expiresAt: number;
  tags: string[];
}

export interface PlayerChallenge {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  gameId: string;
  gameName: string;
  lobbyId?: string;
  status: ChallengeStatus;
  message: string;
  created: number;
  expiresAt: number;
}

/**
 * Online split-screen session: each player runs the game on their own
 * device; the server relays state snapshots between them so play feels
 * synchronized. The "local" copy is the player on THIS device; snapshots
 * from the peer arrive via the `split_screen_snapshot` socket event.
 */
export interface SplitScreenSession {
  id: string;
  gameId: string;
  gameName: string;
  hostId: string;
  guestId: string;
  role: 'host' | 'guest';
  status: 'lobby' | 'ready' | 'in-progress' | 'ended';
  created: number;
}

export interface SplitScreenSnapshot {
  score?: number;
  progress?: number;
  level?: string;
  position?: { x: number; y: number };
  turn?: 'host' | 'guest';
  ts: number;
}

/**
 * Matchmaking talks to the SAME backend as SocialNetworkingService.
 * Previously this was a hardcoded, stale Render URL — a split-brain that
 * made lobbies/presence/challenges live on a different server than chat.
 */
const SERVER_URL = (() => {
  if (typeof window === 'undefined') return 'https://smuvejeffpresents.com';
  return APP_SECURITY_CONFIG.api_url.replace(/\/api\/?$/, '');
})();

function serverToClientChallenge(
  sc: ServerChallenge,
  resolveGameName?: (gameId: string) => string | undefined
): PlayerChallenge {
  return {
    id: `chal-${sc.id}`,
    fromId: sc.fromUserId,
    fromName: sc.fromUserName || sc.fromUserId,
    toId: sc.toUserId,
    toName: sc.toUserId,
    gameId: sc.gameId,
    gameName: resolveGameName?.(sc.gameId) || sc.gameId,
    status: sc.status as ChallengeStatus,
    message: sc.message || '',
    created: sc.timestamp,
    expiresAt: sc.timestamp + 7 * 24 * 60 * 60 * 1000,
  };
}

@Injectable({ providedIn: 'root' })
export class MatchmakingService implements OnDestroy {
  private http = inject(HttpClient);
  private gameService = inject(GameService);
  private profile = inject(UserProfileService);
  private notify = inject(NotificationService);
  private haptic = inject(HapticService);
  private tokenService = inject(TokenService);
  private shares = inject(ShareableInviteService);

  // ── Socket.io ──
  private socket: Socket | null = null;
  private connected = signal(false);
  /** Token the server rejected — prevents an immediate rebuild hot-loop. */
  private lastRejectedToken: string | null | undefined;

  // ── State (Angular Signals) ──
  readonly activeLobbies = signal<CoOpLobby[]>([]);
  readonly myLobby = signal<CoOpLobby | null>(null);
  readonly myChallenges = signal<PlayerChallenge[]>([]);
  readonly outgoingChallenges = signal<PlayerChallenge[]>([]);
  readonly isSearching = signal(false);
  readonly onlineUsers = signal<
    { userId: string; artistName?: string; online: boolean }[]
  >([]);
  readonly partyMembers = signal<PartyMember[]>([]);
  readonly matchFound = signal<{ opponentId: string; gameId: string } | null>(
    null
  );

  // ── Ready-Up System ──
  readonly readyPlayers = signal<Set<string>>(new Set());
  readonly isReady = signal(false);
  readonly isAllReady = computed(() => {
    const lobby = this.myLobby();
    if (!lobby || lobby.playerIds.length < 2) return false;
    if (this.readyPlayers().size !== lobby.playerIds.length) return false;
    return true;
  });
  readonly readyCount = computed(() => this.readyPlayers().size);

  /** Quick-play: true while auto-searching for the fastest available lobby. */
  readonly isQuickPlaying = signal(false);

  // ── Auto-Launch Countdown ──
  readonly countdownSeconds = signal(0);
  readonly countdownActive = signal(false);
  private countdownTimerId: any = null;

  // ── Host detection ──
  readonly isHost = computed(() => {
    const lobby = this.myLobby();
    return lobby ? lobby.hostId === this.playerId() : false;
  });

  // ── Persistent Lobby Chat ──
  readonly lobbyChatMessages = signal<LobbyChatMessage[]>([]);
  private readonly LOBBY_CHAT_PREFIX = 'smuve_lobby_chat_';

  // ── Lobby Replay Recording ──
  readonly lobbyReplaySnapshots = signal<GameStateSnapshot[]>([]);
  readonly isReplaying = signal(false);
  readonly replayCurrentIndex = signal(0);
  private replayTimerId: any = null;
  private readonly REPLAY_PREFIX = 'smuve_lobby_replay_';

  // ── Game State Sync ──
  readonly gameStateUpdates = signal<GameStateUpdate[]>([]);
  readonly latestGameState = signal<Record<string, GameStateUpdate>>({});

  // ── Spectator Mode ──
  readonly isSpectating = signal(false);
  readonly spectateTargetLobby = signal<CoOpLobby | null>(null);
  readonly inProgressLobbies = computed(() =>
    this.activeLobbies().filter((l) => l.status === 'in-progress')
  );
  readonly spectatorReactions = signal<SpectatorReaction[]>([]);
  readonly spectatorChatMessages = signal<LobbyChatMessage[]>([]);

  // ── Split-Screen (online synced co-op) ──
  readonly activeSplitLobby = signal<SplitScreenSession | null>(null);
  readonly latestSplitScreenSnapshots = signal<
    Record<string, SplitScreenSnapshot | undefined>
  >({});

  readonly playerId = computed(
    () => this.profile.profile().id || 'local-player'
  );
  readonly playerName = computed(
    () => this.profile.profile().artistName || 'Unknown Player'
  );

  constructor() {
    // Connect once an API token exists, and rebuild after logout → login.
    // The server verifies handshake.auth.token and disconnects token-less
    // sockets, so we never open a doomed connection.
    effect(() => {
      const token = this.tokenService.jwtToken();
      if (token) {
        // Skip tokens the server already rejected so we don't hot-loop.
        if (!this.socket && token !== this.lastRejectedToken) {
          this.connectSocket();
        }
      } else {
        // Logout — tear down and clear the guard so a new login always tries.
        this.lastRejectedToken = undefined;
        if (this.socket) {
          this.socket.disconnect();
          this.socket = null;
          this.connected.set(false);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  // ── Shareable link + split-screen helpers ──

  /**
   * Build a shareable URL for the given game + mode and dispatch it via
   * the share intent pipeline (native share → clipboard fallback). Returns
   * the URL.
   */
  async shareGame(
    gameId: string,
    mode: InviteMode = 'online'
  ): Promise<string | null> {
    const game = this.gameService.getGameById(gameId);
    const intent = this.shares.buildShareIntent({
      gameId,
      gameName: game?.name,
      mode,
      fromName: this.playerName(),
    });
    const result = await this.shares.share(intent);
    return result.url;
  }

  /** Always returns the URL string (no dispatch). Useful for QR or copy-only UIs. */
  buildShareableGameLink(gameId: string, mode: InviteMode = 'online'): string {
    return this.shares.buildPublicShareUrl({
      gameId,
      mode,
      fromUserId: this.playerId() || undefined,
    });
  }

  /** Host-side: open a split-screen session and emit register + share a link. */
  startSplitScreenLobby(gameId: string): SplitScreenSession | null {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      this.notify.show('GAME_NOT_FOUND — cannot start split-screen', 'warning');
      return null;
    }
    if (!this.socket?.connected) {
      this.notify.show('SOCKET OFFLINE — sharing link only', 'warning');
    }
    const lobbyId = `split_${Date.now()}_${this.playerId().slice(0, 8)}`;
    const session: SplitScreenSession = {
      id: lobbyId,
      gameId,
      gameName: game.name || gameId,
      hostId: this.playerId(),
      guestId: '',
      role: 'host',
      status: 'lobby',
      created: Date.now(),
    };
    this.activeSplitLobby.set(session);
    this.socket?.emit('split_screen_register', {
      lobbyId,
      role: 'host',
    });
    return session;
  }

  /** Guest-side: enter a split-screen session after redeeming a token. */
  joinSplitScreenLobby(lobbyId: string): SplitScreenSession | null {
    const gameIdFromLobby = this.activeLobbies().find(
      (l) => l.id === lobbyId
    )?.gameId;
    const session: SplitScreenSession = {
      id: lobbyId,
      gameId: gameIdFromLobby ?? 'unknown',
      gameName: this.gameService.getGameById(gameIdFromLobby ?? '')?.name ||
        (gameIdFromLobby ?? 'Lobby'),
      hostId: '',
      guestId: this.playerId(),
      role: 'guest',
      status: 'lobby',
      created: Date.now(),
    };
    this.activeSplitLobby.set(session);
    this.socket?.emit('split_screen_register', {
      lobbyId,
      role: 'guest',
    });
    return session;
  }

  /** Leave any split-screen session in progress. */
  exitSplitScreen(): void {
    const cur = this.activeSplitLobby();
    if (!cur) return;
    this.socket?.emit('split_screen_drop', { lobbyId: cur.id });
    this.activeSplitLobby.set(null);
    this.latestSplitScreenSnapshots.set({});
  }

  /** Broadcast the local game-state snapshot to the split-screen peer. */
  pushSplitScreenSnapshot(snapshot: Omit<SplitScreenSnapshot, 'ts'>): void {
    const cur = this.activeSplitLobby();
    if (!cur) {
      console.debug('[SplitScreen] no active lobby — drop snapshot');
      return;
    }
    if (!this.socket?.connected) {
      console.debug('[SplitScreen] socket offline — drop snapshot');
      return;
    }
    this.socket?.emit('split_screen_sync', {
      lobbyId: cur.id,
      snapshot: { ...snapshot, ts: Date.now() },
    });
  }

  // ── Socket Connection ──

  private connectSocket(): void {
    if (this.socket) return;

    const sock = io(APP_SECURITY_CONFIG.socket_url, {
      // Fresh token on EVERY (re)connect attempt — the server verifies
      // handshake.auth.token and disconnects unauthenticated sockets.
      auth: (cb) => cb({ token: this.tokenService.jwtToken() ?? undefined }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    this.socket = sock;

    sock.on('connect', () => {
      console.log('[Matchmaking] Socket.io connected:', this.socket?.id);
      this.connected.set(true);
      // Register presence + request inbox sync.
      // Same payload contract as SocialNetworkingService.register_presence
      // (userId + metadata) so the backend indexes us on the same socket.
      this.socket?.emit('register_presence', {
        userId: this.playerId(),
        metadata: {
          artistName: this.playerName(),
          primaryGenre: this.profile.profile().primaryGenre,
          avatarImage: this.profile.profile().avatarImage,
          status: 'online',
        },
      });
      this.socket?.emit('request_inbox_sync');
    });

    sock.on('disconnect', (reason) => {
      console.log('[Matchmaking] Socket.io disconnected:', reason);
      this.connected.set(false);
      // Server severed the connection (invalid/expired token) — drop the
      // socket and remember the rejected token so the constructor effect
      // does NOT immediately rebuild into the same rejection loop.
      // The `this.socket === sock` guard ensures a stale handler can never
      // tear down a newer socket created after a re-login.
      if (reason === 'io server disconnect' && this.socket === sock) {
        this.lastRejectedToken = this.tokenService.jwtToken();
        this.socket = null;
        sock.disconnect();
      }
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Matchmaking] Socket.io connect error:', err.message);
      this.connected.set(false);
    });

    // ── Inbound events ──

    this.socket.on('users_online', (users: any[]) => {
      this.onlineUsers.set(users);
    });

    this.socket.on('challenge_inbox_sync', (challenges: ServerChallenge[]) => {
      const mapped = challenges.map((c) =>
        serverToClientChallenge(c, (id) => this.gameService.getGameById(id)?.name)
      );
      this.myChallenges.set(mapped.filter((c) => c.toId === this.playerId()));
      this.outgoingChallenges.set(
        mapped.filter((c) => c.fromId === this.playerId())
      );
    });

    this.socket.on('incoming_challenge', (sc: ServerChallenge) => {
      const challenge = serverToClientChallenge(sc, (id) =>
        this.gameService.getGameById(id)?.name
      );
      this.myChallenges.update((c) => [...c, challenge]);
      this.haptic.medium();
      this.notify.show(
        `${challenge.fromName} challenges you to ${challenge.gameName}!`,
        'info'
      );
    });

    this.socket.on(
      'challenge_response',
      (data: {
        id: number;
        responderId: string;
        gameId: string;
        status: string;
        timestamp: number;
      }) => {
        const mappedStatus = data.status as ChallengeStatus;
        this.outgoingChallenges.update((c) =>
          c.map((ch) =>
            ch.id === `chal-${data.id}` ? { ...ch, status: mappedStatus } : ch
          )
        );
        if (mappedStatus === 'accepted') {
          this.notify.show(
            `Challenge accepted — lobby ready for ${data.gameId}`,
            'success'
          );
        } else if (mappedStatus === 'rejected') {
          this.notify.show(`Challenge declined`, 'warning');
        }
      }
    );

    this.socket.on('challenge_persisted', (sc: ServerChallenge) => {
      // Server confirmed persistence — update local ID
      const challenge = serverToClientChallenge(sc, (id) =>
        this.gameService.getGameById(id)?.name
      );
      this.outgoingChallenges.update((c) =>
        c.map((ch) =>
          ch.fromId === sc.fromUserId && !ch.id.startsWith('chal-')
            ? challenge
            : ch
        )
      );
    });

    this.socket.on('party_created', (data: ServerParty) => {
      const lobby = this.partyToLobby(data);
      this.myLobby.set(lobby);
      this.activeLobbies.update((l) => [...l, lobby]);
      this.partyMembers.set(data.members);
      this.isSearching.set(true);
      this.initLobbyChat(lobby.id);
      this.notify.show(`Co-op lobby created for ${lobby.gameName}`, 'success');
    });

    this.socket.on(
      'party_invite',
      (data: {
        fromUserId: string;
        fromUserName: string;
        partyId: string;
        gameId: string;
      }) => {
        this.notify.show(
          `${data.fromUserName} invited you to join a ${data.gameId} lobby`,
          'info'
        );
      }
    );

    this.socket.on(
      'user_joined_party',
      (data: { userId: string; artistName: string }) => {
        this.partyMembers.update((m) => {
          if (m.find((p) => p.userId === data.userId)) return m;
          return [...m, { userId: data.userId, artistName: data.artistName }];
        });
        const lobby = this.myLobby();
        if (lobby) {
          const updated = {
            ...lobby,
            playerIds: [...new Set([...lobby.playerIds, data.userId])],
          };
          this.myLobby.set(updated);
          this.updateLobbyInState(updated);
        }
        // Reset ready state when a new player joins
        this.isReady.set(false);
        this.readyPlayers.update((s) => {
          const ns = new Set(s);
          ns.delete(data.userId);
          return ns;
        });
      }
    );

    this.socket.on('user_left_party', (data: { userId: string }) => {
      this.partyMembers.update((m) =>
        m.filter((p) => p.userId !== data.userId)
      );
      const lobby = this.myLobby();
      if (lobby) {
        // Host transfer: if host left, promote next player
        let newHostId = lobby.hostId;
        let newHostName = lobby.hostName;
        if (data.userId === lobby.hostId) {
          const remaining = lobby.playerIds.filter((id) => id !== data.userId);
          if (remaining.length > 0) {
            newHostId = remaining[0];
            newHostName =
              newHostId === this.playerId()
                ? this.playerName()
                : 'PLAYER_' + newHostId.slice(0, 6);
            if (newHostId === this.playerId()) {
              this.notify.show('YOU ARE NOW THE LOBBY HOST', 'info');
              this.haptic.medium();
            }
          }
        }
        const updated = {
          ...lobby,
          hostId: newHostId,
          hostName: newHostName,
          playerIds: lobby.playerIds.filter((id) => id !== data.userId),
        };
        this.myLobby.set(updated);
        this.updateLobbyInState(updated);
      }
      // Remove departed player from ready set & cancel countdown
      this.readyPlayers.update((s) => {
        const ns = new Set(s);
        ns.delete(data.userId);
        return ns;
      });
      this.cancelCountdown();
    });

    // ── Host Transfer Event ──
    this.socket.on(
      'host_transferred',
      (data: { partyId: string; newHostId: string; newHostName: string }) => {
        const lobby = this.myLobby();
        if (lobby && lobby.id === data.partyId) {
          const updated = {
            ...lobby,
            hostId: data.newHostId,
            hostName: data.newHostName,
          };
          this.myLobby.set(updated);
          this.updateLobbyInState(updated);
          if (data.newHostId === this.playerId()) {
            this.notify.show('YOU ARE NOW THE LOBBY HOST', 'info');
            this.haptic.medium();
          }
        }
      }
    );

    // ── Ready-Up Events ──
    this.socket.on(
      'player_ready',
      (data: { userId: string; partyId: string }) => {
        this.setPlayerReady(data.userId, true);
      }
    );

    this.socket.on(
      'player_unready',
      (data: { userId: string; partyId: string }) => {
        this.setPlayerReady(data.userId, false);
      }
    );

    this.socket.on(
      'all_players_ready',
      (data: { partyId: string; gameId: string }) => {
        this.notify.show(
          `All players ready for ${data.gameId} — launch now!`,
          'success'
        );
      }
    );

    this.socket.on(
      'party_launch_game',
      (data: { partyId: string; gameId: string }) => {
        this.notify.show(
          `Party leader launched ${data.gameId} — joining now!`,
          'success'
        );
        // Navigation to the game is handled by the Tha Spot component
      }
    );

    this.socket.on(
      'match_found',
      (data: { opponentId: string; gameId: string }) => {
        this.matchFound.set(data);
        this.isSearching.set(false);
        this.haptic.medium();
        this.notify.show(
          `Match found! Opponent ready for ${data.gameId}`,
          'success'
        );
      }
    );

    // ── Lobby Chat Events ──
    this.socket.on('lobby_chat_message', (msg: LobbyChatMessage) => {
      const lobby = this.myLobby();
      if (lobby && msg.lobbyId === lobby.id) {
        this.lobbyChatMessages.update((m) => {
          if (m.find((existing) => existing.id === msg.id)) return m;
          return [...m, msg];
        });
        this.saveLobbyChatHistory(msg.lobbyId);
      }
    });

    // ── Game State Sync Events ──
    this.socket.on('game_state_update', (update: GameStateUpdate) => {
      this.gameStateUpdates.update((u) => [...u.slice(-100), update]);
      this.latestGameState.update((s) => ({
        ...s,
        [update.playerId]: update,
      }));
    });

    // ── Replay Recording Events ──
    this.socket.on('replay_snapshot', (snapshot: GameStateSnapshot) => {
      const lobby = this.myLobby();
      if (lobby && snapshot.lobbyId === lobby.id) {
        this.lobbyReplaySnapshots.update((s) => [...s, snapshot]);
        this.saveReplayHistory(lobby.id);
      }
    });

    // ── Spectator reaction events (emoji from spectators of in-progress lobbies) ──
    this.socket.on('spectator_reaction', (r: SpectatorReaction) => {
      this.spectatorReactions.update((list) => {
        // De-dupe by reaction id
        if (list.find((x) => x.id === r.id)) return list;
        const next = [...list, r];
        // Trim oldest past 50
        return next.slice(-50);
      });
      // Auto-clear after 4s for UI flash
      setTimeout(() => {
        this.spectatorReactions.update((list) =>
          list.filter((x) => x.id !== r.id)
        );
      }, 4000);
    });

    // ── Spectator chat messages (live chat in spectator overlay) ──
    this.socket.on('spectator_chat_message', (msg: LobbyChatMessage) => {
      this.spectatorChatMessages.update((list) => {
        if (list.find((x) => x.id === msg.id)) return list;
        return [...list, msg].slice(-100);
      });
    });

    // ── Shareable game invite socket events (live path; mirrors REST) ──
    sock.on('game_invite_issued', (record: any) => {
      this.shares.lastIssued.set(record);
      this.notify.show('INVITE READY — SEND IT TO A FRIEND', 'success');
    });

    sock.on(
      'split_screen_snapshot',
      (data: { lobbyId: string; fromUserId: string; snapshot: any }) => {
        this.latestSplitScreenSnapshots.update((map) => ({
          ...map,
          [data.fromUserId]: data.snapshot,
        }));
      }
    );

    sock.on(
      'split_screen_ready',
      (data: { lobbyId: string; hostId: string; guestId: string }) => {
        const cur = this.activeSplitLobby();
        if (!cur || cur.id !== data.lobbyId) return;
        this.activeSplitLobby.update((slot) =>
          slot
            ? {
                ...slot,
                hostId: data.hostId,
                guestId: data.guestId,
                status: 'ready',
              }
            : slot
        );
        this.notify.show('SPLIT-SCREEN PEER CONNECTED', 'success');
      }
    );

    sock.on(
      'split_screen_role_assigned',
      (data: {
        lobbyId: string;
        role: 'host' | 'guest';
        requestedRole: 'host' | 'guest';
      }) => {
        const cur = this.activeSplitLobby();
        if (!cur || cur.id !== data.lobbyId) return;
        if (data.role !== data.requestedRole) {
          this.notify.show(
            `HOST SLOT ALREADY TAKEN — JOINED AS ${data.role.toUpperCase()}`,
            'warning'
          );
        }
        this.activeSplitLobby.update((slot) =>
          slot ? { ...slot, role: data.role } : slot
        );
      }
    );

    sock.on(
      'split_screen_ended',
      (data: { lobbyId: string; reason?: string }) => {
        const cur = this.activeSplitLobby();
        if (!cur || cur.id !== data.lobbyId) return;
        this.activeSplitLobby.set(null);
        this.notify.show(
          data.reason === 'peer_disconnected'
            ? 'SPLIT-SCREEN PEER DISCONNECTED'
            : 'SPLIT-SCREEN SESSION ENDED',
          'warning'
        );
      }
    );
  }

  // ── Lobby Operations (backed by Socket.io parties) ──

  createLobby(gameId: string, maxPlayers = 4): CoOpLobby {
    this.haptic.light();
    if (!this.socket?.connected) {
      this.notify.show('Connection lost — cannot create lobby', 'warning');
      return this.fallbackCreateLobby(gameId, maxPlayers);
    }
    const partyId = `party_${Date.now()}_${this.playerId().slice(0, 8)}`;
    this.socket.emit('create_party', { partyId, gameId });
    // Return a placeholder; actual lobby set via party_created event
    return {
      id: partyId,
      hostId: this.playerId(),
      hostName: this.playerName(),
      gameId,
      gameName: gameId,
      status: 'searching',
      playerIds: [this.playerId()],
      maxPlayers,
      created: Date.now(),
      expiresAt: Date.now() + 300_000,
      tags: [],
    };
  }

  private fallbackCreateLobby(gameId: string, maxPlayers: number): CoOpLobby {
    const lobby: CoOpLobby = {
      id: `lobby-${Date.now()}`,
      hostId: this.playerId(),
      hostName: this.playerName(),
      gameId,
      gameName: gameId,
      status: 'searching',
      playerIds: [this.playerId()],
      maxPlayers,
      created: Date.now(),
      expiresAt: Date.now() + 300_000,
      tags: [],
    };
    this.myLobby.set(lobby);
    this.activeLobbies.update((l) => [...l, lobby]);
    this.isSearching.set(true);
    this.initLobbyChat(lobby.id);
    this.notify.show(`Co-op lobby created for ${lobby.gameName}`, 'success');
    return lobby;
  }

  // ── Quick-Play: auto-join the fastest available multiplayer lobby ──

  /**
   * Quick-play: finds the fastest game to join by scanning active lobbies
   * for one with open slots, falling back to creating a new lobby for the
   * most popular multiplayer title.
   */
  quickPlay(): void {
    if (this.isQuickPlaying()) return;
    this.isQuickPlaying.set(true);
    this.haptic.medium();

    // 1) Look for an existing lobby with open slots
    const openLobbies = this.activeLobbies()
      .filter((l) => l.status !== 'in-progress' && l.status !== 'cancelled')
      .filter((l) => l.playerIds.length < l.maxPlayers)
      .sort((a, b) => b.playerIds.length - a.playerIds.length); // most full first

    if (openLobbies.length > 0) {
      const target = openLobbies[0];
      this.joinLobby(target.id);
      this.isQuickPlaying.set(false);
      this.notify.show(`Quick-play: joined ${target.gameName}`, 'success');
      return;
    }

    // 2) No open lobby — create one for a popular multiplayer title
    const popularMultiGames = ['shell-shockers-elite', 'bullet-force-elite', 'basketball-stars-elite', '1v1-lol-elite'];
    const gameId = popularMultiGames[Math.floor(Math.random() * popularMultiGames.length)];
    this.createLobby(gameId, 4);
    // Auto-ready after creating
    setTimeout(() => {
      this.isReady.set(true);
      this.readyPlayers.update((s) => {
        const ns = new Set(s);
        ns.add(this.playerId());
        return ns;
      });
    }, 500);

    this.isQuickPlaying.set(false);
  }

  /**
   * Lobby ready-check: host starts a 5-second countdown. If all players
   * are ready when it expires, launch the game.
   */
  startReadyCheck(): void {
    const lobby = this.myLobby();
    if (!lobby || !this.isHost()) {
      this.notify.show('Only the host can start the ready check', 'warning');
      return;
    }
    if (lobby.playerIds.length < 2) {
      this.notify.show('Need at least 2 players for a match', 'warning');
      return;
    }
    // Auto-set host ready
    if (!this.isReady()) {
      this.toggleReady();
    }
    // Emit ready-check signal to all lobby members
    this.socket?.emit('ready_check_start', {
      partyId: lobby.id,
      hostId: this.playerId(),
    });
    this.startCountdown();
    this.notify.show('Ready check started — 5 seconds!', 'info');
  }

  /**
   * Join spectate mode for an in-progress lobby. Viewers can watch game
   * state updates and send emoji reactions.
   */
  joinSpectate(lobbyId: string): void {
    const lobby = this.inProgressLobbies().find((l) => l.id === lobbyId);
    if (!lobby) {
      this.notify.show('Lobby not found or no longer in progress', 'warning');
      return;
    }
    this.isSpectating.set(true);
    this.spectateTargetLobby.set(lobby);
    this.socket?.emit('join_spectate', { lobbyId, userId: this.playerId() });
    this.spectatorReactions.set([]);
    this.spectatorChatMessages.set([]);
    this.notify.show(`Spectating ${lobby.gameName}`, 'info');
  }

  joinLobby(lobbyId: string): CoOpLobby | null {
    this.haptic.light();
    if (!this.socket?.connected) {
      this.notify.show('Connection lost', 'warning');
      return this.fallbackJoinLobby(lobbyId);
    }
    this.socket.emit('join_party', { partyId: lobbyId });
    return this.activeLobbies().find((l) => l.id === lobbyId) ?? null;
  }

  private fallbackJoinLobby(lobbyId: string): CoOpLobby | null {
    const lobby = this.activeLobbies().find((l) => l.id === lobbyId);
    if (!lobby) {
      this.notify.show('Lobby not found', 'warning');
      return null;
    }
    if (lobby.playerIds.length >= lobby.maxPlayers) {
      this.notify.show('Lobby is full', 'warning');
      return null;
    }
    const updated: CoOpLobby = {
      ...lobby,
      playerIds: [...new Set([...lobby.playerIds, this.playerId()])],
      status:
        lobby.playerIds.length + 1 >= lobby.maxPlayers ? 'ready' : 'searching',
    };
    this.updateLobbyInState(updated);
    this.initLobbyChat(lobbyId);
    return updated;
  }

  leaveLobby(lobbyId: string): void {
    this.haptic.light();
    this.socket?.emit('leave_party', { partyId: lobbyId });
    this.removeLobbyFromState(lobbyId);
    if (this.myLobby()?.id === lobbyId) {
      this.myLobby.set(null);
      this.isSearching.set(false);
    }
  }

  cancelMyLobby(): void {
    this.cancelCountdown();
    const lobby = this.myLobby();
    if (lobby) {
      this.readyPlayers.set(new Set());
      this.isReady.set(false);
      this.leaveLobby(lobby.id);
    }
  }

  // ── Ready-Up System ──

  toggleReady(): void {
    const lobby = this.myLobby();
    if (!lobby) return;
    this.haptic.light();
    const next = !this.isReady();
    this.isReady.set(next);
    if (next) {
      this.readyPlayers.update((s) => {
        const ns = new Set(s);
        ns.add(this.playerId());
        return ns;
      });
      this.socket?.emit('player_ready', { partyId: lobby.id });
    } else {
      this.readyPlayers.update((s) => {
        const ns = new Set(s);
        ns.delete(this.playerId());
        return ns;
      });
      this.socket?.emit('player_unready', { partyId: lobby.id });
      // Cancel countdown if someone un-readies
      this.cancelCountdown();
    }
  }

  // ── Auto-Launch Countdown ──

  startCountdown(): void {
    if (this.countdownActive()) return;
    this.countdownActive.set(true);
    this.countdownSeconds.set(5);
    this.haptic.medium();
    this.countdownTimerId = setInterval(() => {
      const current = this.countdownSeconds();
      if (current <= 1) {
        this.cancelCountdown();
        const lobby = this.myLobby();
        if (lobby) {
          this.launchGameFromParty(lobby.gameId);
        }
        return;
      }
      this.countdownSeconds.set(current - 1);
      this.haptic.light();
    }, 1000);
  }

  cancelCountdown(): void {
    this.countdownActive.set(false);
    this.countdownSeconds.set(0);
    if (this.countdownTimerId) {
      clearInterval(this.countdownTimerId);
      this.countdownTimerId = null;
    }
  }

  /** Called by socket event when another player toggles ready */
  setPlayerReady(playerId: string, ready: boolean): void {
    this.readyPlayers.update((s) => {
      const ns = new Set(s);
      if (ready) ns.add(playerId);
      else ns.delete(playerId);
      return ns;
    });
    if (playerId === this.playerId()) {
      this.isReady.set(ready);
    }
  }

  // ── Lobby Invite Sharing ──

  readonly lobbyInviteLink = computed(() => {
    const lobby = this.myLobby();
    if (!lobby) return '';
    const baseUrl = window.location.origin + '/tha-spot';
    const params = new URLSearchParams();
    params.set('partyId', lobby.id);
    params.set('gameId', lobby.gameId);
    params.set('mission', lobby.gameName);
    return `${baseUrl}?${params.toString()}`;
  });

  copyLobbyInviteLink(): boolean {
    const link = this.lobbyInviteLink();
    if (!link) return false;
    try {
      navigator.clipboard.writeText(link);
      this.notify.show('LOBBY INVITE LINK COPIED', 'success');
      return true;
    } catch {
      this.notify.show('FAILED TO COPY LINK', 'warning');
      return false;
    }
  }

  async shareLobbyInvite(): Promise<void> {
    const link = this.lobbyInviteLink();
    const lobby = this.myLobby();
    if (!link || !lobby) return;
    const text = `🎮 Join my ${lobby.gameName} co-op lobby on S.M.U.V.E.! ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'S.M.U.V.E. Co-Op Lobby',
          text,
          url: link,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    this.copyLobbyInviteLink();
  }

  pendingLobbyChallenges = computed(() =>
    this.myChallenges().filter((c) => c.status === 'pending')
  );

  launchGameFromParty(gameId: string): void {
    const lobby = this.myLobby();
    if (!lobby) return;
    // Move lobby to in-progress for spectator discovery
    const updated: CoOpLobby = { ...lobby, status: 'in-progress' };
    this.myLobby.set(updated);
    this.updateLobbyInState(updated);
    // ── Auto-record: record initial snapshot on game launch ──
    this.recordGameSnapshot(
      { event: 'GAME_LAUNCH', gameId, playerCount: lobby.playerIds.length },
      'Game Launch'
    );
    this.socket?.emit('party_launch_game', { partyId: lobby.id, gameId });
    this.socket?.emit('party_started', { partyId: lobby.id, gameId });
  }

  // ── Challenge Operations (backed by Socket.io + REST) ──

  sendChallenge(
    toUserId: string,
    toName: string,
    gameId: string,
    message = "Challenge accepted! Let's battle!"
  ): PlayerChallenge {
    this.haptic.light();
    if (!this.socket?.connected) {
      this.notify.show(
        'Connection lost — challenge may not deliver',
        'warning'
      );
    }
    this.socket?.emit('challenge_player', {
      toUserId,
      gameId,
      message,
      gameName: this.gameService.getGameById(gameId)?.name || gameId,
    });
    const challenge: PlayerChallenge = {
      id: `pending-${Date.now()}`,
      fromId: this.playerId(),
      fromName: this.playerName(),
      toId: toUserId,
      toName,
      gameId,
      gameName: this.gameService.getGameById(gameId)?.name || gameId,
      status: 'pending',
      message,
      created: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    this.outgoingChallenges.update((c) => [...c, challenge]);
    this.notify.show(`Challenge sent to ${toName}`, 'success');
    return challenge;
  }

  acceptChallenge(challengeId: string): void {
    this.haptic.medium();
    const numericId = challengeId.startsWith('chal-')
      ? challengeId.slice(5)
      : challengeId;
    const token = this.tokenService.jwtToken();
    if (!token) return;

    this.http
      .post(
        `${SERVER_URL}/api/users/${this.playerId()}/challenges/${numericId}/respond`,
        { status: 'accepted' },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .subscribe({
        next: () => {
          this.myChallenges.update((c) =>
            c.map((ch) =>
              ch.id === challengeId
                ? { ...ch, status: 'accepted' as ChallengeStatus }
                : ch
            )
          );
          this.notify.show('Challenge accepted — connecting...', 'success');
        },
        error: (err) => {
          console.error('Accept challenge error:', err);
          this.notify.show('Failed to accept challenge', 'warning');
        },
      });
  }

  rejectChallenge(challengeId: string): void {
    this.haptic.light();
    const numericId = challengeId.startsWith('chal-')
      ? challengeId.slice(5)
      : challengeId;
    const token = this.tokenService.jwtToken();
    if (!token) return;

    this.http
      .post(
        `${SERVER_URL}/api/users/${this.playerId()}/challenges/${numericId}/respond`,
        { status: 'declined' },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .subscribe({
        next: () => {
          this.myChallenges.update((c) =>
            c.map((ch) =>
              ch.id === challengeId
                ? { ...ch, status: 'rejected' as ChallengeStatus }
                : ch
            )
          );
          this.notify.show('Challenge declined', 'info');
        },
        error: (err) => {
          console.error('Reject challenge error:', err);
        },
      });
  }

  // ── Matchmaking Queue ──

  queueForMatch(gameId: string): void {
    this.haptic.light();
    this.isSearching.set(true);
    this.socket?.emit('queue_for_match', { gameId });
    this.notify.show(`Searching for opponent in ${gameId}...`, 'info');
  }

  /** Clear stale match-found/searching state so a new queue starts clean. */
  clearMatchState(): void {
    this.matchFound.set(null);
    this.isSearching.set(false);
  }

  cancelMatchQueue(gameId: string): void {
    this.clearMatchState();
    this.socket?.emit('cancel_match', { gameId });
  }

  // ── Persistent Lobby Chat ──

  sendLobbyChatMessage(text: string): void {
    const lobby = this.myLobby();
    if (!lobby || !text.trim()) return;
    const msg: LobbyChatMessage = {
      id: `lobby-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lobbyId: lobby.id,
      fromUserId: this.playerId(),
      fromUserName: this.playerName(),
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.lobbyChatMessages.update((m) => [...m, msg]);
    this.saveLobbyChatHistory(lobby.id);
    // Also emit via socket for live sync
    this.socket?.emit('lobby_chat_message', msg);
  }

  private loadLobbyChatHistory(lobbyId: string): void {
    try {
      const raw = localStorage.getItem(this.LOBBY_CHAT_PREFIX + lobbyId);
      if (raw) {
        const msgs: LobbyChatMessage[] = JSON.parse(raw);
        this.lobbyChatMessages.set(msgs.slice(-50)); // Keep last 50
        return;
      }
    } catch {
      /* ignore corrupt data */
    }
    this.lobbyChatMessages.set([]);
  }

  private saveLobbyChatHistory(lobbyId: string): void {
    try {
      const msgs = this.lobbyChatMessages();
      localStorage.setItem(
        this.LOBBY_CHAT_PREFIX + lobbyId,
        JSON.stringify(msgs.slice(-50))
      );
    } catch {
      /* storage full */
    }
  }

  // Wire chat loading into lobby join / create
  private initLobbyChat(lobbyId: string): void {
    this.loadLobbyChatHistory(lobbyId);
  }

  // ── Spectator reactions (spectator overlays / live lobbies) ──

  /** Fire an emoji reaction while spectating an in-progress lobby. */
  sendSpectatorReaction(lobbyId: string, emoji: string): void {
    if (!this.isSpectating()) return;
    if (!lobbyId || !emoji) return;
    const r: SpectatorReaction = {
      id: 'react-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      lobbyId,
      fromUserId: this.playerId(),
      fromUserName: this.playerName(),
      emoji,
      timestamp: Date.now(),
    };
    // Locally flash + emit
    this.spectatorReactions.update((list) => [...list, r].slice(-50));
    this.socket?.emit('spectator_reaction', r);
    setTimeout(() => {
      this.spectatorReactions.update((list) =>
        list.filter((x) => x.id !== r.id)
      );
    }, 4000);
    this.haptic.light();
  }

  /** Send a chat message as a spectator. */
  sendSpectatorChat(lobbyId: string, text: string): void {
    if (!this.isSpectating() || !lobbyId || !text.trim()) return;
    const msg: LobbyChatMessage = {
      id:
        'spec-msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      lobbyId,
      fromUserId: this.playerId(),
      fromUserName: this.playerName(),
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.spectatorChatMessages.update((list) => [...list, msg].slice(-100));
    this.socket?.emit('spectator_chat_message', msg);
  }

  /** Record a game state snapshot for the current lobby */
  recordGameSnapshot(state: Record<string, any>, label?: string): void {
    const lobby = this.myLobby();
    if (!lobby) return;
    const snapshot: GameStateSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lobbyId: lobby.id,
      gameId: lobby.gameId,
      timestamp: Date.now(),
      recordedBy: this.playerName(),
      state,
      label,
    };
    this.lobbyReplaySnapshots.update((s) => [...s, snapshot]);
    this.saveReplayHistory(lobby.id);
    // Broadcast to lobby peers
    this.socket?.emit('replay_snapshot', snapshot);
  }

  /** Load replay history from localStorage for a given lobby */
  private loadReplayHistory(lobbyId: string): void {
    try {
      const raw = localStorage.getItem(this.REPLAY_PREFIX + lobbyId);
      if (raw) {
        const snaps: GameStateSnapshot[] = JSON.parse(raw);
        this.lobbyReplaySnapshots.set(snaps.slice(-200));
        return;
      }
    } catch {
      /* ignore */
    }
    this.lobbyReplaySnapshots.set([]);
  }

  /** Persist replay snapshots to localStorage */
  private saveReplayHistory(lobbyId: string): void {
    try {
      const snaps = this.lobbyReplaySnapshots();
      localStorage.setItem(
        this.REPLAY_PREFIX + lobbyId,
        JSON.stringify(snaps.slice(-200))
      );
    } catch {
      /* storage full */
    }
  }

  /** Start replay playback from snapshots */
  startReplay(lobbyId: string): void {
    this.loadReplayHistory(lobbyId);
    const snaps = this.lobbyReplaySnapshots();
    if (snaps.length === 0) {
      this.notify.show('No replay data available for this lobby', 'warning');
      return;
    }
    this.isReplaying.set(true);
    this.replayCurrentIndex.set(0);
    this.notify.show(`Replaying ${snaps.length} snapshots`, 'info');

    // Auto-advance replay frames
    this.replayTimerId = setInterval(() => {
      const idx = this.replayCurrentIndex();
      if (idx >= snaps.length - 1) {
        this.stopReplay();
        return;
      }
      this.replayCurrentIndex.set(idx + 1);
    }, 500);
  }

  /** Stop replay playback */
  stopReplay(): void {
    this.isReplaying.set(false);
    this.replayCurrentIndex.set(0);
    if (this.replayTimerId) {
      clearInterval(this.replayTimerId);
      this.replayTimerId = null;
    }
  }

  /** Computed: current replay frame state */
  readonly currentReplayFrame = computed(() => {
    if (!this.isReplaying()) return null;
    const snaps = this.lobbyReplaySnapshots();
    const idx = this.replayCurrentIndex();
    return snaps[idx] || null;
  });

  // ── Game State Sync ──

  /** Broadcast game state from an iframe to the lobby via Socket.io */
  broadcastGameState(state: {
    score?: number;
    progress?: number;
    level?: string;
    alive?: boolean;
    position?: { x: number; y: number };
    custom?: Record<string, any>;
  }): void {
    const lobby = this.myLobby();
    if (!lobby) return;
    const update: GameStateUpdate = {
      lobbyId: lobby.id,
      gameId: lobby.gameId,
      playerId: this.playerId(),
      playerName: this.playerName(),
      ...state,
      timestamp: Date.now(),
    };
    // Add to local state
    this.gameStateUpdates.update((u) => [...u.slice(-100), update]);
    this.latestGameState.update((s) => ({
      ...s,
      [this.playerId()]: update,
    }));
    // Broadcast to lobby
    this.socket?.emit('game_state_update', update);
  }

  // ── Spectator Mode ──

  startSpectateLobby(lobbyId: string): void {
    const lobby = this.activeLobbies().find((l) => l.id === lobbyId);
    if (!lobby || lobby.status !== 'in-progress') {
      this.notify.show('Lobby is not currently playing', 'warning');
      return;
    }
    this.isSpectating.set(true);
    this.spectateTargetLobby.set(lobby);
    this.socket?.emit('spectate_lobby', { partyId: lobbyId });
    this.notify.show(`Spectating ${lobby.gameName} lobby`, 'info');
  }

  stopSpectateLobby(): void {
    const lobby = this.spectateTargetLobby();
    if (lobby) {
      this.socket?.emit('stop_spectating', { partyId: lobby.id });
    }
    this.isSpectating.set(false);
    this.spectateTargetLobby.set(null);
  }

  // ── Discovery ──

  findLobbiesForGame(gameId: string): CoOpLobby[] {
    return this.activeLobbies().filter(
      (l) => l.gameId === gameId && l.status === 'searching'
    );
  }

  isPlayerInAnyLobby(playerId: string): boolean {
    return this.activeLobbies().some((l) => l.playerIds.includes(playerId));
  }

  getLobbyPlayerCount(lobbyId: string): number {
    return (
      this.activeLobbies().find((l) => l.id === lobbyId)?.playerIds.length ?? 0
    );
  }

  // ── Helpers ──

  private partyToLobby(party: ServerParty): CoOpLobby {
    const gameId = party.gameId ?? 'global';
    return {
      id: party.partyId,
      hostId: party.leaderId,
      hostName: party.members[0]?.artistName ?? party.leaderId,
      gameId,
      gameName: this.gameService.getGameById(gameId)?.name || gameId,

      status: 'searching',
      playerIds: party.members.map((m) => m.userId),
      maxPlayers: 4,
      created: Date.now(),
      expiresAt: Date.now() + 300_000,
      tags: [],
    };
  }

  private updateLobbyInState(lobby: CoOpLobby): void {
    this.activeLobbies.update((lobbies) =>
      lobbies.map((l) => (l.id === lobby.id ? lobby : l))
    );
    if (this.myLobby()?.id === lobby.id) {
      this.myLobby.set(lobby);
    }
  }

  private removeLobbyFromState(lobbyId: string): void {
    this.activeLobbies.update((lobbies) =>
      lobbies.filter((l) => l.id !== lobbyId)
    );
    if (this.myLobby()?.id === lobbyId) {
      this.myLobby.set(null);
    }
  }
}
