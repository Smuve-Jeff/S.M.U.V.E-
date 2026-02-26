import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './game';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

const MOCK_GAMES: Game[] = [
  {
    id: '1',
    name: 'Tha Battlefield',
    url: '/assets/games/battlefield/index.html',
    description: 'High-stakes tactical rap battle arena.',
    genre: 'Music Battle',
    rating: 4.9,
    playersOnline: 1250,
    image: 'https://picsum.photos/seed/battle/300/200'
  },
  {
    id: '2',
    name: 'Remix Arena',
    url: '/assets/games/remix-arena/index.html',
    description: 'Collaborative real-time remixing challenge.',
    genre: 'Rhythm',
    rating: 4.7,
    playersOnline: 850,
    image: 'https://picsum.photos/seed/remix/300/200'
  },
  {
    id: '3',
    name: 'Beat Runner',
    url: 'https://htmlgames.com/game/Beat+Runner',
    description: 'Sprint through neon landscapes synced to the beat.',
    genre: 'Runner',
    rating: 4.5,
    playersOnline: 2100,
    image: 'https://picsum.photos/seed/beat/300/200'
  },
  {
    id: '14',
    name: 'Strategic Duel',
    url: '/assets/games/duel/index.html',
    description: 'AI-driven card game for music industry dominance.',
    genre: 'Arena',
    rating: 4.8,
    playersOnline: 450,
    image: 'https://picsum.photos/seed/duel/300/200'
  },
];

const GAMES_API_URL = 'https://firebasestorage.googleapis.com/v0/b/builder-406918.appspot.com/o/gaming-pwa%2Fgames.json?alt=media';

@Injectable({
  providedIn: 'root',
})
export class GameService implements OnDestroy {
  private http = inject(HttpClient);

  listGames(
    filters: { genre?: string; query?: string } = {},
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
    filters: { genre?: string; query?: string },
    sort: 'Popular' | 'Rating' | 'Newest'
  ): Game[] {
    let filtered = [...games];

    if (filters.genre) {
      filtered = filtered.filter((g) => g.genre === filters.genre);
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

  ngOnDestroy() {}
}
