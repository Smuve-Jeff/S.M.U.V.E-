import { Injectable, inject, signal, computed } from '@angular/core';
import { GameService } from './game.service';
import { UserProfileService } from '../services/user-profile.service';
import { NotificationService } from '../services/notification.service';
import { HapticService } from '../services/haptic.service';
import { Game } from './game';

// ── Matchmaking Types ──

export type LobbyStatus = 'idle' | 'searching' | 'matched' | 'ready' | 'in-progress' | 'cancelled';
export type ChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
export type MatchRole = 'host' | 'joiner';

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

export interface MatchSession {
  id: string;
  lobbyId: string;
  gameId: string;
  players: { id: string; name: string; role: MatchRole }[];
  startedAt: number;
  objectives: string[];
}

@Injectable({ providedIn: 'root' })
export class MatchmakingService {
  private gameService = inject(GameService);
  private profile = inject(UserProfileService);
  private notify = inject(NotificationService);
  private haptic = inject(HapticService);

  // ── State (Angular Signals) ──

  readonly activeLobbies = signal<CoOpLobby[]>([]);
  readonly myLobby = signal<CoOpLobby | null>(null);
  readonly myChallenges = signal<PlayerChallenge[]>([]);
  readonly outgoingChallenges = signal<PlayerChallenge[]>([]);
  readonly activeSession = signal<MatchSession | null>(null);
  readonly isSearching = signal(false);

  readonly playerId = computed(() => this.profile.profile().id || 'local-player');
  readonly playerName = computed(() => this.profile.profile().artistName || 'Unknown Player');

  // ── Lobby Operations ──

  createLobby(gameId: string, maxPlayers = 4): CoOpLobby {
    this.haptic.light();
    const game = this.findGameSync(gameId);
    const lobby: CoOpLobby = {
      id: `lobby-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      hostId: this.playerId(),
      hostName: this.playerName(),
      gameId,
      gameName: game?.name ?? gameId,
      status: 'searching',
      playerIds: [this.playerId()],
      maxPlayers,
      created: Date.now(),
      expiresAt: Date.now() + 300_000, // 5 min expiry
      tags: game?.tags ?? [],
    };
    this.myLobby.set(lobby);
    this.activeLobbies.update((l) => [...l, lobby]);
    this.isSearching.set(true);
    this.notify.show(`Co-op lobby created for ${lobby.gameName}`, 'success');
    return lobby;
  }

  joinLobby(lobbyId: string): CoOpLobby | null {
    this.haptic.light();
    const lobby = this.activeLobbies().find((l) => l.id === lobbyId);
    if (!lobby) {
      this.notify.show('Lobby not found or expired', 'warning');
      return null;
    }
    if (lobby.playerIds.length >= lobby.maxPlayers) {
      this.notify.show('Lobby is full', 'warning');
      return null;
    }
    const pid = this.playerId();
    if (lobby.playerIds.includes(pid)) {
      this.notify.show('You are already in this lobby', 'info');
      return lobby;
    }
    const updated: CoOpLobby = {
      ...lobby,
      playerIds: [...lobby.playerIds, pid],
      status: lobby.playerIds.length + 1 >= lobby.maxPlayers ? 'ready' : 'searching',
    };
    this.updateLobbyInState(updated);
    if (updated.status === 'ready') {
      this.notify.show('Lobby full — starting match!', 'success');
    }
    return updated;
  }

  leaveLobby(lobbyId: string): void {
    this.haptic.light();
    const lobby = this.activeLobbies().find((l) => l.id === lobbyId);
    if (!lobby) return;
    const pid = this.playerId();
    const updated: CoOpLobby = {
      ...lobby,
      playerIds: lobby.playerIds.filter((id) => id !== pid),
      status: lobby.status === 'ready' ? 'searching' : lobby.status,
    };
    if (updated.playerIds.length === 0) {
      updated.status = 'cancelled';
      this.removeLobbyFromState(updated.id);
    } else {
      this.updateLobbyInState(updated);
    }
    if (this.myLobby()?.id === lobbyId) {
      this.myLobby.set(null);
      this.isSearching.set(false);
    }
    this.notify.show('Left lobby', 'info');
  }

  cancelMyLobby(): void {
    const lobby = this.myLobby();
    if (lobby) {
      this.haptic.light();
      const updated: CoOpLobby = { ...lobby, status: 'cancelled' };
      this.removeLobbyFromState(updated.id);
      this.myLobby.set(null);
      this.isSearching.set(false);
      this.notify.show('Lobby cancelled', 'info');
    }
  }

  startMatch(): MatchSession | null {
    const lobby = this.myLobby();
    if (!lobby || lobby.playerIds.length < 2) {
      this.notify.show('Need at least 2 players to start', 'warning');
      return null;
    }
    this.haptic.medium();
    const session: MatchSession = {
      id: `match-${Date.now()}`,
      lobbyId: lobby.id,
      gameId: lobby.gameId,
      players: lobby.playerIds.map((id, i) => ({
        id,
        name: id === this.playerId() ? this.playerName() : 'Opponent',
        role: i === 0 ? 'host' : ('joiner' as MatchRole),
      })),
      startedAt: Date.now(),
      objectives: [
        'Complete the level together',
        'Share resources',
        'Survive the enemy waves',
      ],
    };
    this.activeSession.set(session);
    this.notify.show(`Match started — ${lobby.gameName}`, 'success');
    return session;
  }

  endSession(): void {
    this.haptic.light();
    this.activeSession.set(null);
    const lobby = this.myLobby();
    if (lobby) {
      this.removeLobbyFromState(lobby.id);
      this.myLobby.set(null);
    }
    this.isSearching.set(false);
    this.notify.show('Session ended', 'info');
  }

  // ── Challenge Operations ──

  sendChallenge(
    toId: string,
    toName: string,
    gameId: string,
    message = 'Challenge accepted! Let\'s battle!'
  ): PlayerChallenge {
    this.haptic.light();
    const game = this.findGameSync(gameId);
    const challenge: PlayerChallenge = {
      id: `chal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromId: this.playerId(),
      fromName: this.playerName(),
      toId,
      toName,
      gameId,
      gameName: game?.name ?? gameId,
      status: 'pending',
      message,
      created: Date.now(),
      expiresAt: Date.now() + 120_000, // 2 min expiry
    };
    this.outgoingChallenges.update((c) => [...c, challenge]);
    // Auto-create a lobby for accepted challenges
    this.notify.show(`Challenge sent to ${toName}`, 'success');
    return challenge;
  }

  receiveChallenge(challenge: PlayerChallenge): void {
    this.myChallenges.update((c) => [...c, challenge]);
    this.haptic.medium();
    this.notify.show(
      `${challenge.fromName} challenges you to ${challenge.gameName}!`,
      'info'
    );
  }

  acceptChallenge(challengeId: string): CoOpLobby | null {
    this.haptic.medium();
    const idx = this.myChallenges().findIndex((c) => c.id === challengeId);
    if (idx < 0) return null;
    const challenge = { ...this.myChallenges()[idx], status: 'accepted' as ChallengeStatus };
    this.myChallenges.update((c) => c.map((ch) => ch.id === challengeId ? challenge : ch));
    // Create a lobby for the match
    const lobby = this.createLobby(challenge.gameId, 4);
    lobby.playerIds = [challenge.fromId, this.playerId()];
    lobby.status = 'ready';
    this.updateLobbyInState(lobby);
    this.myLobby.set(lobby);
    this.notify.show(`Challenge accepted — lobby ready for ${challenge.gameName}`, 'success');
    return lobby;
  }

  rejectChallenge(challengeId: string): void {
    this.haptic.light();
    this.myChallenges.update((c) =>
      c.map((ch) => ch.id === challengeId ? { ...ch, status: 'rejected' as ChallengeStatus } : ch)
    );
  }

  cancelOutgoingChallenge(challengeId: string): void {
    this.outgoingChallenges.update((c) =>
      c.map((ch) => ch.id === challengeId ? { ...ch, status: 'cancelled' as ChallengeStatus } : ch)
    );
  }

  // ── Discovery ──

  findLobbiesForGame(gameId: string): CoOpLobby[] {
    return this.activeLobbies().filter(
      (l) => l.gameId === gameId && l.status === 'searching'
    );
  }

  findLobbyByPlayer(playerId: string): CoOpLobby | null {
    return this.activeLobbies().find((l) => l.playerIds.includes(playerId)) ?? null;
  }

  getLobbyPlayerCount(lobbyId: string): number {
    return this.activeLobbies().find((l) => l.id === lobbyId)?.playerIds.length ?? 0;
  }

  isPlayerInAnyLobby(playerId: string): boolean {
    return this.activeLobbies().some((l) => l.playerIds.includes(playerId));
  }

  // ── Helpers ──

  private findGameSync(gameId: string): Game | undefined {
    let game: Game | undefined;
    this.gameService.getGame(gameId).subscribe((g) => (game = g));
    return game;
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
