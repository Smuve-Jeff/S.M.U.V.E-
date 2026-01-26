import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './game';
import { Observable, BehaviorSubject } from 'rxjs';

// --- WebSocket Message Interfaces ---

interface PresenceUpdateMessage {
  type: 'presence_update';
  userId: number;
  status: 'online' | 'offline' | 'in-game';
}

interface LobbyJoinedMessage {
  type: 'lobby_joined';
  lobbyId: string;
}

interface LobbyCreatedMessage {
  type: 'create_lobby';
  lobbyId: string;
  settings: LobbySettings;
}

interface JoinLobbyMessage {
  type: 'join_lobby';
  lobbyId: string;
}

interface LeaveLobbyMessage {
  type: 'leave_lobby';
  lobbyId: string;
}

interface ChatMessage {
  type: 'chat_message';
  lobbyId: string;
  message: string;
}

interface InviteMessage {
  type: 'invite';
  lobbyId: string;
  userId: string;
}

type WebSocketMessage =
  | PresenceUpdateMessage
  | LobbyJoinedMessage
  | LobbyCreatedMessage
  | JoinLobbyMessage
  | LeaveLobbyMessage
  | ChatMessage
  | InviteMessage;

// --- Lobby Settings Interface ---

interface LobbySettings {
  maxPlayers: number;
  mode: string;
  isPrivate: boolean;
}

// Mock WebSocket for simulating real-time events
class MockSocket {
  private subject = new BehaviorSubject<WebSocketMessage | null>(null);
  public messages = this.subject.asObservable();
  private intervalId: number;

  constructor() {
    this.intervalId = setInterval(() => {
      const message: PresenceUpdateMessage = {
        type: 'presence_update',
        userId: Math.floor(Math.random() * 100),
        status: 'online',
      };
      this.subject.next(message);
    }, 5000) as unknown as number; // Using `as unknown as number` for Node.js compatibility
  }

  send(message: WebSocketMessage) {
    console.log('MockSocket sent:', message);
    if (message.type === 'join_lobby') {
      setTimeout(
        () =>
          this.subject.next({ type: 'lobby_joined', lobbyId: message.lobbyId }),
        500
      );
    }
  }

  close() {
    clearInterval(this.intervalId);
    this.subject.complete();
  }
}

const GAMES_API_URL =
  'https://firebasestorage.googleapis.com/v0/b/builder-406918.appspot.com/o/gaming-pwa%2Fgames.json?alt=media';

@Injectable({
  providedIn: 'root',
})
export class GameService implements OnDestroy {
  private http = inject(HttpClient);
  public webSocket: MockSocket;

  constructor() {
    this.webSocket = new MockSocket();
    this.webSocket.messages.subscribe((msg) => this.handleSocketMessage(msg));
  }

  // --- Catalog Methods ---

  listGames(
    filters: { genre?: string; tag?: string; query?: string },
    _sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.http.get<Game[]>(GAMES_API_URL);
  }

  getGame(id: string): Observable<Game | undefined> {
    return this.http.get<Game>(`${GAMES_API_URL}/${id}`);
  }

  getTrending(): Observable<Game[]> {
    return this.http.get<Game[]>(`${GAMES_API_URL}/trending`);
  }

  getNew(): Observable<Game[]> {
    return this.http.get<Game[]>(`${GAMES_API_URL}/new`);
  }

  // --- Matchmaking & Lobby Stubs ---

  queue(
    gameId: string,
    mode: 'duel' | 'team' | 'solo'
  ): Observable<{ status: string; queueTime: number }> {
    console.log(`Queueing for game ${gameId} in mode ${mode}`);
    return this.http.post<{ status: string; queueTime: number }>(
      `${GAMES_API_URL}/${gameId}/queue`,
      { mode }
    );
  }

  leaveQueue(gameId: string): Observable<{ status: string }> {
    console.log(`Leaving queue for game ${gameId}`);
    return this.http.delete<{ status: string }>(
      `${GAMES_API_URL}/${gameId}/queue`
    );
  }

  createLobby(
    gameId: string,
    settings: LobbySettings
  ): Observable<{ lobbyId: string; status: string }> {
    const lobbyId = `lobby_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Creating lobby for game ${gameId} with settings:`, settings);
    this.webSocket.send({ type: 'create_lobby', lobbyId, settings });
    return this.http.post<{ lobbyId: string; status: string }>(
      `${GAMES_API_URL}/${gameId}/lobbies`,
      { settings }
    );
  }

  joinLobby(lobbyId: string): Observable<{ status: string }> {
    console.log(`Joining lobby ${lobbyId}`);
    this.webSocket.send({ type: 'join_lobby', lobbyId });
    return this.http.post<{ status: string }>(
      `${GAMES_API_URL}/lobbies/${lobbyId}/join`,
      {}
    );
  }

  leaveLobby(lobbyId: string): Observable<{ status: string }> {
    console.log(`Leaving lobby ${lobbyId}`);
    this.webSocket.send({ type: 'leave_lobby', lobbyId });
    return this.http.post<{ status: string }>(
      `${GAMES_API_URL}/lobbies/${lobbyId}/leave`,
      {}
    );
  }

  sendLobbyMessage(lobbyId: string, message: string): void {
    console.log(`Sending message to lobby ${lobbyId}: ${message}`);
    this.webSocket.send({ type: 'chat_message', lobbyId, message });
  }

  inviteToLobby(
    lobbyId: string,
    userId: string
  ): Observable<{ status: string }> {
    console.log(`Inviting user ${userId} to lobby ${lobbyId}`);
    this.webSocket.send({ type: 'invite', lobbyId, userId });
    return this.http.post<{ status: string }>(
      `${GAMES_API_URL}/lobbies/${lobbyId}/invite`,
      { userId }
    );
  }

  // --- WebSocket Handling ---

  private handleSocketMessage(message: WebSocketMessage | null): void {
    if (!message) return;
    console.log('Received socket message:', message);
    // Here you would handle incoming messages like presence updates,
    // matchmaking status changes, lobby invites etc.
  }

  // --- Lifecycle ---

  ngOnDestroy() {
    this.webSocket.close();
  }
}
