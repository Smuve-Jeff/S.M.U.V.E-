import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { GameService } from './game.service';
import { UserProfileService } from '../services/user-profile.service';
import { NotificationService } from '../services/notification.service';
import { HapticService } from '../services/haptic.service';
import { TokenService } from '../services/token.service';
import { Game } from './game';

// ── Matchmaking Types (same shape as server-side payloads) ──

export type LobbyStatus = 'idle' | 'searching' | 'matched' | 'ready' | 'in-progress' | 'cancelled';
export type ChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

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

const SERVER_URL = 'https://smuve-v4-backend-9951606049235487441.onrender.com';

function serverToClientChallenge(sc: ServerChallenge): PlayerChallenge {
  return {
    id: `chal-${sc.id}`,
    fromId: sc.fromUserId,
    fromName: sc.fromUserName || sc.fromUserId,
    toId: sc.toUserId,
    toName: sc.toUserId,
    gameId: sc.gameId,
    gameName: sc.gameId,
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

  // ── Socket.io ──
  private socket: Socket | null = null;
  private connected = signal(false);

  // ── State (Angular Signals) ──
  readonly activeLobbies = signal<CoOpLobby[]>([]);
  readonly myLobby = signal<CoOpLobby | null>(null);
  readonly myChallenges = signal<PlayerChallenge[]>([]);
  readonly outgoingChallenges = signal<PlayerChallenge[]>([]);
  readonly isSearching = signal(false);
  readonly onlineUsers = signal<{ userId: string; artistName?: string; online: boolean }[]>([]);
  readonly partyMembers = signal<PartyMember[]>([]);
  readonly matchFound = signal<{ opponentId: string; gameId: string } | null>(null);

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

  // ── Auto-Launch Countdown ──
  readonly countdownSeconds = signal(0);
  readonly countdownActive = signal(false);
  private countdownTimerId: any = null;

  // ── Host detection ──
  readonly isHost = computed(() => {
    const lobby = this.myLobby();
    return lobby ? lobby.hostId === this.playerId() : false;
  });

  readonly playerId = computed(() => this.profile.profile().id || 'local-player');
  readonly playerName = computed(() => this.profile.profile().artistName || 'Unknown Player');

  constructor() {
    this.connectSocket();
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  // ── Socket Connection ──

  private connectSocket(): void {
    const token = this.tokenService.jwtToken();
    if (!token) {
      console.warn('[Matchmaking] No auth token available — Socket.io will reject connection');
      return;
    }

    this.socket = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      console.log('[Matchmaking] Socket.io connected:', this.socket?.id);
      this.connected.set(true);
      // Register presence + request inbox sync
      this.socket?.emit('register_presence', {
        metadata: { artistName: this.playerName(), status: 'online' },
      });
      this.socket?.emit('request_inbox_sync');
    });

    this.socket.on('disconnect', () => {
      console.log('[Matchmaking] Socket.io disconnected');
      this.connected.set(false);
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
      const mapped = challenges.map(serverToClientChallenge);
      this.myChallenges.set(mapped.filter((c) => c.toId === this.playerId()));
      this.outgoingChallenges.set(mapped.filter((c) => c.fromId === this.playerId()));
    });

    this.socket.on('incoming_challenge', (sc: ServerChallenge) => {
      const challenge = serverToClientChallenge(sc);
      this.myChallenges.update((c) => [...c, challenge]);
      this.haptic.medium();
      this.notify.show(`${challenge.fromName} challenges you to ${challenge.gameId}!`, 'info');
    });

    this.socket.on('challenge_response', (data: { id: number; responderId: string; gameId: string; status: string; timestamp: number }) => {
      const mappedStatus = data.status as ChallengeStatus;
      this.outgoingChallenges.update((c) =>
        c.map((ch) => ch.id === `chal-${data.id}` ? { ...ch, status: mappedStatus } : ch)
      );
      if (mappedStatus === 'accepted') {
        this.notify.show(`Challenge accepted — lobby ready for ${data.gameId}`, 'success');
      } else if (mappedStatus === 'rejected') {
        this.notify.show(`Challenge declined`, 'warning');
      }
    });

    this.socket.on('challenge_persisted', (sc: ServerChallenge) => {
      // Server confirmed persistence — update local ID
      const challenge = serverToClientChallenge(sc);
      this.outgoingChallenges.update((c) =>
        c.map((ch) => ch.fromId === sc.fromUserId && !ch.id.startsWith('chal-')
          ? challenge : ch)
      );
    });

    this.socket.on('party_created', (data: ServerParty) => {
      const lobby = this.partyToLobby(data);
      this.myLobby.set(lobby);
      this.activeLobbies.update((l) => [...l, lobby]);
      this.partyMembers.set(data.members);
      this.isSearching.set(true);
      this.notify.show(`Co-op lobby created for ${lobby.gameName}`, 'success');
    });

    this.socket.on('party_invite', (data: { fromUserId: string; fromUserName: string; partyId: string; gameId: string }) => {
      this.notify.show(`${data.fromUserName} invited you to join a ${data.gameId} lobby`, 'info');
    });

    this.socket.on('user_joined_party', (data: { userId: string; artistName: string }) => {
      this.partyMembers.update((m) => {
        if (m.find((p) => p.userId === data.userId)) return m;
        return [...m, { userId: data.userId, artistName: data.artistName }];
      });
      const lobby = this.myLobby();
      if (lobby) {
        const updated = { ...lobby, playerIds: [...new Set([...lobby.playerIds, data.userId])] };
        this.myLobby.set(updated);
        this.updateLobbyInState(updated);
      }
      // Reset ready state when a new player joins
      this.isReady.set(false);
      this.readyPlayers.update(s => { const ns = new Set(s); ns.delete(data.userId); return ns; });
    });

    this.socket.on('user_left_party', (data: { userId: string }) => {
      this.partyMembers.update((m) => m.filter((p) => p.userId !== data.userId));
      const lobby = this.myLobby();
      if (lobby) {
        // Host transfer: if host left, promote next player
        let newHostId = lobby.hostId;
        let newHostName = lobby.hostName;
        if (data.userId === lobby.hostId) {
          const remaining = lobby.playerIds.filter((id) => id !== data.userId);
          if (remaining.length > 0) {
            newHostId = remaining[0];
            newHostName = newHostId === this.playerId() ? this.playerName() : ('PLAYER_' + newHostId.slice(0, 6));
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
      this.readyPlayers.update(s => { const ns = new Set(s); ns.delete(data.userId); return ns; });
      this.cancelCountdown();
    });

    // ── Host Transfer Event ──
    this.socket.on('host_transferred', (data: { partyId: string; newHostId: string; newHostName: string }) => {
      const lobby = this.myLobby();
      if (lobby && lobby.id === data.partyId) {
        const updated = { ...lobby, hostId: data.newHostId, hostName: data.newHostName };
        this.myLobby.set(updated);
        this.updateLobbyInState(updated);
        if (data.newHostId === this.playerId()) {
          this.notify.show('YOU ARE NOW THE LOBBY HOST', 'info');
          this.haptic.medium();
        }
      }
    });

    // ── Ready-Up Events ──
    this.socket.on('player_ready', (data: { userId: string; partyId: string }) => {
      this.setPlayerReady(data.userId, true);
    });

    this.socket.on('player_unready', (data: { userId: string; partyId: string }) => {
      this.setPlayerReady(data.userId, false);
    });

    this.socket.on('all_players_ready', (data: { partyId: string; gameId: string }) => {
      this.notify.show(`All players ready for ${data.gameId} — launch now!`, 'success');
    });

    this.socket.on('party_launch_game', (data: { partyId: string; gameId: string }) => {
      this.notify.show(`Party leader launched ${data.gameId} — joining now!`, 'success');
      // Navigation to the game is handled by the Tha Spot component
    });

    this.socket.on('match_found', (data: { opponentId: string; gameId: string }) => {
      this.matchFound.set(data);
      this.isSearching.set(false);
      this.haptic.medium();
      this.notify.show(`Match found! Opponent ready for ${data.gameId}`, 'success');
    });
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
    this.notify.show(`Co-op lobby created for ${lobby.gameName}`, 'success');
    return lobby;
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
      status: lobby.playerIds.length + 1 >= lobby.maxPlayers ? 'ready' : 'searching',
    };
    this.updateLobbyInState(updated);
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
      this.readyPlayers.update(s => { const ns = new Set(s); ns.add(this.playerId()); return ns; });
      this.socket?.emit('player_ready', { partyId: lobby.id });
    } else {
      this.readyPlayers.update(s => { const ns = new Set(s); ns.delete(this.playerId()); return ns; });
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
    this.readyPlayers.update(s => {
      const ns = new Set(s);
      if (ready) ns.add(playerId); else ns.delete(playerId);
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
        await navigator.share({ title: 'S.M.U.V.E. Co-Op Lobby', text, url: link });
        return;
      } catch { /* fall through */ }
    }
    this.copyLobbyInviteLink();
  }

  pendingLobbyChallenges = computed(() =>
    this.myChallenges().filter(c => c.status === 'pending')
  );

  launchGameFromParty(gameId: string): void {
    const lobby = this.myLobby();
    if (!lobby) return;
    this.socket?.emit('party_launch_game', { partyId: lobby.id, gameId });
  }

  // ── Challenge Operations (backed by Socket.io + REST) ──

  sendChallenge(
    toUserId: string,
    toName: string,
    gameId: string,
    message = 'Challenge accepted! Let\'s battle!'
  ): PlayerChallenge {
    this.haptic.light();
    if (!this.socket?.connected) {
      this.notify.show('Connection lost — challenge may not deliver', 'warning');
    }
    this.socket?.emit('challenge_player', {
      toUserId,
      gameId,
      message,
    });
    const challenge: PlayerChallenge = {
      id: `pending-${Date.now()}`,
      fromId: this.playerId(),
      fromName: this.playerName(),
      toId: toUserId,
      toName,
      gameId,
      gameName: gameId,
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
    const numericId = challengeId.startsWith('chal-') ? challengeId.slice(5) : challengeId;
    const token = this.tokenService.jwtToken();
    if (!token) return;

    this.http
      .post(`${SERVER_URL}/api/users/${this.playerId()}/challenges/${numericId}/respond`, { status: 'accepted' }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .subscribe({
        next: () => {
          this.myChallenges.update((c) =>
            c.map((ch) => ch.id === challengeId ? { ...ch, status: 'accepted' as ChallengeStatus } : ch)
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
    const numericId = challengeId.startsWith('chal-') ? challengeId.slice(5) : challengeId;
    const token = this.tokenService.jwtToken();
    if (!token) return;

    this.http
      .post(`${SERVER_URL}/api/users/${this.playerId()}/challenges/${numericId}/respond`, { status: 'declined' }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .subscribe({
        next: () => {
          this.myChallenges.update((c) =>
            c.map((ch) => ch.id === challengeId ? { ...ch, status: 'rejected' as ChallengeStatus } : ch)
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

  cancelMatchQueue(gameId: string): void {
    this.isSearching.set(false);
    this.socket?.emit('cancel_match', { gameId });
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
    return this.activeLobbies().find((l) => l.id === lobbyId)?.playerIds.length ?? 0;
  }

  // ── Helpers ──

  private partyToLobby(party: ServerParty): CoOpLobby {
    return {
      id: party.partyId,
      hostId: party.leaderId,
      hostName: party.members[0]?.artistName ?? party.leaderId,
      gameId: party.gameId ?? 'global',
      gameName: party.gameId ?? 'Global',
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
    this.activeLobbies.update((lobbies) => lobbies.filter((l) => l.id !== lobbyId));
    if (this.myLobby()?.id === lobbyId) {
      this.myLobby.set(null);
    }
  }
}
