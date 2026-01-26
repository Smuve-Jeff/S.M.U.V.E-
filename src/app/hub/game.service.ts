import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './game';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

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

const MOCK_GAMES: Game[] = [
  {
    id: '1',
    name: 'Tha Battlefield',
    url: '/assets/games/battlefield/index.html',
    description: 'High-stakes tactical rap battle arena.',
    genre: 'Music Battle',
    rating: 4.9,
    playersOnline: 1250,
  },
  {
    id: '2',
    name: 'Remix Arena',
    url: '/assets/games/remix-arena/index.html',
    description: 'Collaborative real-time remixing challenge.',
    genre: 'Rhythm',
    rating: 4.7,
    playersOnline: 850,
  },
  {
    id: '3',
    name: 'Beat Runner',
    url: 'https://htmlgames.com/game/Beat+Runner',
    description: 'Sprint through neon landscapes synced to the beat.',
    genre: 'Runner',
    rating: 4.5,
    playersOnline: 2100,
  },
  {
    id: '14',
    name: 'Strategic Duel',
    url: '/assets/games/duel/index.html',
    description: 'AI-driven card game for music industry dominance.',
    genre: 'Arena',
    rating: 4.8,
    playersOnline: 450,
  },
];

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
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.http.get<Game[]>(GAMES_API_URL).pipe(
      catchError(() => of(MOCK_GAMES)),
      map((games) => this.applyFiltersAndSort(games, filters, sort))
    );
  }

  getGame(id: string): Observable<Game | undefined> {
    return this.listGames({}).pipe(
      map((games) => games.find((g) => g.id === id))
    );
  }

  getTrending(): Observable<Game[]> {
    return this.listGames({}, 'Popular').pipe(map((games) => games.slice(0, 5)));
  }

  getNew(): Observable<Game[]> {
    return this.listGames({}, 'Newest').pipe(map((games) => games.slice(0, 5)));
  }

  private applyFiltersAndSort(
    games: Game[],
    filters: { genre?: string; tag?: string; query?: string },
    sort: 'Popular' | 'Rating' | 'Newest'
  ): Game[] {
    let filtered = [...games];

    if (filters.genre) {
      filtered = filtered.filter((g) => g.genre === filters.genre);
    }

    if (filters.tag) {
      filtered = filtered.filter((g) => g.tags?.includes(filters.tag!));
    }

    if (filters.query) {
      const q = filters.query.toLowerCase();
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q)
      );
    }

    // Apply Sorting
    switch (sort) {
      case 'Popular':
        filtered.sort((a, b) => (b.playersOnline || 0) - (a.playersOnline || 0));
        break;
      case 'Rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'Newest':
        // For mock, just use ID descending as proxy for newness
        filtered.sort((a, b) => b.id.localeCompare(a.id));
        break;
    }

    return filtered;
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
