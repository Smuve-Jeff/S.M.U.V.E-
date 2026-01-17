import { Injectable, signal, OnDestroy } from '@angular/core';
import { Game } from './game';
import { of, Observable, BehaviorSubject } from 'rxjs';
import { delay } from 'rxjs/operators';

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

@Injectable({
  providedIn: 'root',
})
export class GameService implements OnDestroy {
  private allGames: Game[] = [
    {
      id: '15',
      name: 'Remix Arena',
      url: '/play/remix-arena',
      image: 'https://picsum.photos/seed/remix-arena/640/360',
      genre: 'Music Contest',
      tags: ['Creative', 'AI', 'Community'],
      rating: 4.8,
      playersOnline: 0,
      modes: ['solo'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Weekly remix contests judged by AI. Showcase your creativity and production skills.',
      bannerImage: 'https://picsum.photos/seed/remix-arena-banner/1280/360',
    },
    {
      id: '14',
      name: 'Tha Battlefield',
      url: '/play/tha-battlefield',
      image: 'https://picsum.photos/seed/battlefield/640/360',
      genre: 'Music Battle',
      tags: ['PvP', 'Music', 'Duel'],
      rating: 4.6,
      playersOnline: 150,
      modes: ['duel', 'team'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Battle other online artists using songs created inside the app.',
      bannerImage: 'https://picsum.photos/seed/battlefield-banner/1280/360',
    },
    {
      id: '4',
      name: 'Krunker',
      url: 'https://krunker.io/',
      image: 'https://picsum.photos/seed/krunker/640/360',
      genre: 'Shooter',
      tags: ['PvP', 'Arena'],
      rating: 4.5,
      playersOnline: 1200,
      modes: ['duel', 'team'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Krunker.io is a fast-paced pixelated first-person shooter. In this game, players drop into a pixelated world and fight against other players from all over the world.',
      bannerImage: 'https://picsum.photos/seed/krunker-banner/1280/360',
    },
    {
      id: '5',
      name: 'Shell Shockers',
      url: 'https://shellshock.io/',
      image: 'https://picsum.photos/seed/shell/640/360',
      genre: 'Shooter',
      tags: ['PvP'],
      rating: 4.3,
      playersOnline: 850,
      modes: ['duel', 'team'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Shell Shockers is a multiplayer .io FPS game featuring eggs armed with guns. You take control of a violent egg and battle other players in a variety of maps.',
      bannerImage: 'https://picsum.photos/seed/shell-banner/1280/360',
    },
    {
      id: '6',
      name: 'Venge.io',
      url: 'https://venge.io/',
      image: 'https://picsum.photos/seed/venge/640/360',
      genre: 'Shooter',
      tags: ['PvP', 'Arena'],
      rating: 4.2,
      playersOnline: 640,
      modes: ['duel', 'team'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Venge.io is an objective-based first-person shooter. Every match is an intense, unique experience with the different weapons and maps.',
      bannerImage: 'https://picsum.photos/seed/venge-banner/1280/360',
    },
    {
      id: '7',
      name: 'Slither.io',
      url: 'https://slither.io/',
      image: 'https://picsum.photos/seed/slither/640/360',
      genre: 'Arcade',
      tags: ['PvP', 'Casual'],
      rating: 4.1,
      playersOnline: 3100,
      modes: ['solo'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Slither.io is a multiplayer online video game available for iOS, Android, and web browsers, developed by Steve Howse. Players control an avatar resembling a worm, which consumes multicolored pellets, both from other players and ones that naturally spawn on the map in the game, to grow in size.',
      bannerImage: 'https://picsum.photos/seed/slither-banner/1280/360',
    },
    {
      id: '8',
      name: 'Little Alchemy 2',
      url: 'https://littlealchemy2.com/',
      image: 'https://picsum.photos/seed/alchemy/640/360',
      genre: 'Puzzle',
      tags: ['Casual'],
      rating: 4.0,
      playersOnline: 230,
      modes: ['solo'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Little Alchemy 2 is a game where you combine elements to create new ones. Start with four basic items and mix and match them to create more and more awesome things.',
      bannerImage: 'https://picsum.photos/seed/alchemy-banner/1280/360',
    },
    {
      id: '9',
      name: '2048',
      url: 'https://play2048.co/',
      image: 'https://picsum.photos/seed/2048/640/360',
      genre: 'Puzzle',
      tags: ['Casual'],
      rating: 3.8,
      playersOnline: 190,
      modes: ['solo'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        "2048 is a single-player sliding tile puzzle video game written by Italian web developer Gabriele Cirulli. The game's objective is to slide numbered tiles on a grid to combine them to create a tile with the number 2048.",
      bannerImage: 'https://picsum.photos/seed/2048-banner/1280/360',
    },
    {
      id: '16',
      name: 'Hextris',
      url: 'https://hextris.github.io/hextris/',
      image: 'https://picsum.photos/seed/hextris/640/360',
      genre: 'Puzzle',
      tags: ['Arcade', 'Neon'],
      rating: 4.7,
      playersOnline: 320,
      modes: ['solo'],
      description: 'A fast-paced hexagonal puzzle game with a vibrant neon aesthetic. Clear lines by matching colors in a 360-degree arena.',
      bannerImage: 'https://picsum.photos/seed/hextris-banner/1280/360',
    },
    {
      id: '17',
      name: 'Pacman (Cyber Edition)',
      url: 'https://macek.github.io/google_pacman/',
      image: 'https://picsum.photos/seed/pacman/640/360',
      genre: 'Arcade',
      tags: ['Classic', 'Retro'],
      rating: 4.9,
      playersOnline: 1500,
      modes: ['solo'],
      description: 'The definitive arcade classic, optimized for the S.M.U.V.E. ecosystem with enhanced visual overlays.',
      bannerImage: 'https://picsum.photos/seed/pacman-banner/1280/360',
    },
    {
      id: '10',
      name: 'Neon Arena',
      url: '/play/neon-arena',
      image: 'https://picsum.photos/seed/neon/640/360',
      genre: 'Arena',
      tags: ['PvP', 'Duel'],
      rating: 4.4,
      playersOnline: 220,
      modes: ['duel', 'team'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'A fast-paced, futuristic arena shooter with a neon aesthetic.',
      bannerImage: 'https://picsum.photos/seed/neon-banner/1280/360',
    },
    {
      id: '11',
      name: 'Grid Runner',
      url: '/play/grid-runner',
      image: 'https://picsum.photos/seed/grid/640/360',
      genre: 'Runner',
      tags: ['Time Trial'],
      rating: 3.9,
      playersOnline: 64,
      modes: ['solo'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'Race against the clock in a challenging, procedurally generated grid.',
      bannerImage: 'https://picsum.photos/seed/grid-banner/1280/360',
    },
    {
      id: '12',
      name: 'Cipher Clash',
      url: '/play/cipher-clash',
      image: 'https://picsum.photos/seed/cipher/640/360',
      genre: 'Puzzle',
      tags: ['Duel'],
      rating: 4.1,
      playersOnline: 73,
      modes: ['duel'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description: 'A head-to-head puzzle game of logic and deduction.',
      bannerImage: 'https://picsum.photos/seed/cipher-banner/1280/360',
    },
    {
      id: '13',
      name: 'Rhythm Rumble',
      url: '/play/rhythm-rumble',
      image: 'https://picsum.photos/seed/rhythm/640/360',
      genre: 'Rhythm',
      tags: ['PvP'],
      rating: 4.3,
      playersOnline: 95,
      modes: ['duel', 'team'],
      previewVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
      description:
        'A competitive rhythm game where you battle opponents with your timing and accuracy.',
      bannerImage: 'https://picsum.photos/seed/rhythm-banner/1280/360',
    },
  ];

  games = signal<Game[]>([]);
  public webSocket: MockSocket;

  constructor() {
    this.games.set([...this.allGames]);
    this.webSocket = new MockSocket();
    this.webSocket.messages.subscribe((msg) => this.handleSocketMessage(msg));
  }

  // --- Catalog Methods ---

  listGames(
    filters: { genre?: string; tag?: string; query?: string },
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    let filteredGames = [...this.allGames];

    if (filters.query) {
      filteredGames = filteredGames.filter((g) =>
        g.name.toLowerCase().includes(filters.query!.toLowerCase())
      );
    }
    if (filters.genre) {
      filteredGames = filteredGames.filter((g) => g.genre === filters.genre);
    }
    if (filters.tag) {
      filteredGames = filteredGames.filter((g) =>
        g.tags?.includes(filters.tag!)
      );
    }

    switch (sort) {
      case 'Popular':
        filteredGames.sort(
          (a, b) => (b.playersOnline || 0) - (a.playersOnline || 0)
        );
        break;
      case 'Rating':
        filteredGames.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'Newest':
        filteredGames.sort((a, b) => parseInt(b.id) - parseInt(a.id));
        break;
    }

    return of(filteredGames).pipe(delay(200)); // Simulate network latency
  }

  getGame(id: string): Observable<Game | undefined> {
    const game = this.allGames.find((g) => g.id === id);
    return of(game).pipe(delay(100));
  }

  getTrending(): Observable<Game[]> {
    const trendingGames = [...this.allGames]
      .sort((a, b) => (b.playersOnline || 0) - (a.playersOnline || 0))
      .slice(0, 5);
    return of(trendingGames);
  }

  getNew(): Observable<Game[]> {
    const newGames = [...this.allGames]
      .sort((a, b) => parseInt(b.id) - parseInt(a.id))
      .slice(0, 5);
    return of(newGames);
  }

  // --- Matchmaking & Lobby Stubs ---

  queue(
    gameId: string,
    mode: 'duel' | 'team' | 'solo'
  ): Observable<{ status: string; queueTime: number }> {
    console.log(`Queueing for game ${gameId} in mode ${mode}`);
    return of({ status: 'in_queue', queueTime: 0 }).pipe(delay(500));
  }

  leaveQueue(gameId: string): Observable<{ status: string }> {
    console.log(`Leaving queue for game ${gameId}`);
    return of({ status: 'left_queue' }).pipe(delay(200));
  }

  createLobby(
    gameId: string,
    settings: LobbySettings
  ): Observable<{ lobbyId: string; status: string }> {
    const lobbyId = `lobby_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Creating lobby for game ${gameId} with settings:`, settings);
    this.webSocket.send({ type: 'create_lobby', lobbyId, settings });
    return of({ lobbyId, status: 'created' }).pipe(delay(300));
  }

  joinLobby(lobbyId: string): Observable<{ status: string }> {
    console.log(`Joining lobby ${lobbyId}`);
    this.webSocket.send({ type: 'join_lobby', lobbyId });
    return of({ status: 'joining' }).pipe(delay(200));
  }

  leaveLobby(lobbyId: string): Observable<{ status: string }> {
    console.log(`Leaving lobby ${lobbyId}`);
    this.webSocket.send({ type: 'leave_lobby', lobbyId });
    return of({ status: 'left_lobby' }).pipe(delay(200));
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
    return of({ status: 'invite_sent' }).pipe(delay(100));
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
