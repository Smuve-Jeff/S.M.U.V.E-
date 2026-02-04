import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './hub.models';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

const MOCK_GAMES: Game[] = [
  { id: '1', name: 'Tha Battlefield', genre: 'Arena', rating: 4.8, playersOnline: 15400, image: 'https://picsum.photos/seed/battle/300/200', description: 'Competitive music battle arena.', url: '/tha-spot' },
  { id: '2', name: 'Remix Arena', genre: 'Music Battle', rating: 4.9, playersOnline: 22000, image: 'https://picsum.photos/seed/remix/300/200', description: 'Collaborative remix competition.', url: '/remix-arena' },
  { id: '3', name: 'Hextris', genre: 'Puzzle', rating: 4.5, playersOnline: 12000, image: 'https://picsum.photos/seed/hextris/300/200', description: 'Fast-paced hexagonal puzzle game.', url: '/tha-spot' },
  { id: '4', name: 'Pacman', genre: 'Arcade', rating: 4.7, playersOnline: 45000, image: 'https://picsum.photos/seed/pacman/300/200', description: 'Classic arcade action.', url: '/tha-spot' },
  { id: '5', name: 'Rhythm Rebel', genre: 'Rhythm', rating: 4.6, playersOnline: 8000, image: 'https://picsum.photos/seed/rhythm/300/200', description: 'Match the beat to stay alive.', url: '/tha-spot' }
];

const GAMES_API_URL = 'https://firebasestorage.googleapis.com/v0/b/builder-406918.appspot.com/o/gaming-pwa%2Fgames.json?alt=media';

@Injectable({
  providedIn: 'root',
})
export class GameService implements OnDestroy {
  private http = inject(HttpClient);

  listGames(
    filters: { genre?: string; query?: string },
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return this.http.get<Game[]>(GAMES_API_URL).pipe(
      catchError(() => of(MOCK_GAMES)),
      map(games => {
        let filtered = [...games];
        if (filters.genre) {
          filtered = filtered.filter(g => g.genre === filters.genre);
        }
        if (filters.query) {
          const q = filters.query.toLowerCase();
          filtered = filtered.filter(g => g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q)));
        }

        if (sort === 'Popular') {
          filtered.sort((a, b) => (b.playersOnline || 0) - (a.playersOnline || 0));
        } else if (sort === 'Rating') {
          filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }
        return filtered;
      })
    );
  }

  ngOnDestroy() {}
}
