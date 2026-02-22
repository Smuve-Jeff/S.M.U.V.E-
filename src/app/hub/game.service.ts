import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './game';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

const MOCK_GAMES: Game[] = [
  { id: '1', name: 'Tha Battlefield', genre: 'Arena', rating: 4.8, playersOnline: 15400, image: 'https://picsum.photos/seed/battle/300/200', description: 'Competitive music battle arena.', url: '/tha-spot' },
  { id: '2', name: 'Remix Arena', genre: 'Music Battle', rating: 4.9, playersOnline: 22000, image: 'https://picsum.photos/seed/remix/300/200', description: 'Collaborative remix competition.', url: '/remix-arena' },
  { id: '3', name: 'Hextris', genre: 'Puzzle', rating: 4.5, playersOnline: 12000, image: 'https://picsum.photos/seed/hextris/300/200', description: 'Fast-paced hexagonal puzzle game.', url: '/tha-spot' },
  { id: '4', name: 'Pacman', genre: 'Arcade', rating: 4.7, playersOnline: 45000, image: 'https://picsum.photos/seed/pacman/300/200', description: 'Classic arcade action.', url: '/tha-spot' },
  { id: '5', name: 'Rhythm Rebel', genre: 'Rhythm', rating: 4.6, playersOnline: 8000, image: 'https://picsum.photos/seed/rhythm/300/200', description: 'Match the beat to stay alive.', url: '/tha-spot' }
];

const GAMES_API_URL = 'https://firebasestorage.googleapis.com/v0/b/builder-406918.appspot.com/o/gaming-pwa%2Fgames.json?alt=media';

const MOCK_GAMES: Game[] = [
  {
    id: '1',
    name: 'Tha Battlefield',
    url: '/assets/games/battlefield/index.html',
    description: 'High-stakes tactical rap battle arena.',
    genre: 'Music Battle',
    tags: ['PvP', 'Duel', 'Rap'],
    rating: 4.9,
    playersOnline: 1250,
  },
  {
    id: '2',
    name: 'Remix Arena',
    url: '/assets/games/remix-arena/index.html',
    description: 'Collaborative real-time remixing challenge.',
    genre: 'Rhythm',
    tags: ['Co-op', 'Music'],
    rating: 4.7,
    playersOnline: 850,
  },
  {
    id: '3',
    name: 'Beat Runner',
    url: 'https://htmlgames.com/game/Beat+Runner',
    description: 'Sprint through neon landscapes synced to the beat.',
    genre: 'Runner',
    tags: ['Solo', 'Arcade'],
    rating: 4.5,
    playersOnline: 2100,
  },
  {
    id: '14',
    name: 'Strategic Duel',
    url: '/assets/games/duel/index.html',
    description: 'AI-driven card game for music industry dominance.',
    genre: 'Arena',
    tags: ['PvP', 'Strategy', 'Duel'],
    rating: 4.8,
    playersOnline: 450,
  },
];

@Injectable({
  providedIn: 'root',
})
export class GameService implements OnDestroy {
  private http = inject(HttpClient);

  listGames(
    filters: { genre?: string; tag?: string; query?: string },
    filters: { genre?: string; query?: string },
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
        // TODO: Replace with a `createdAt` timestamp field on Game for reliable ordering.
        // Falls back to original order when IDs are non-numeric (e.g. UUIDs).
        filtered.sort((a, b) => {
          const idA = parseInt(a.id, 10);
          const idB = parseInt(b.id, 10);
          if (isNaN(idA) || isNaN(idB)) return 0;
          return idB - idA;
        });
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

  ngOnDestroy() {}
}
