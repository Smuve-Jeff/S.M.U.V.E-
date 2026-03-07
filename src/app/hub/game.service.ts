import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './game';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

const MOCK_GAMES: Game[] = [
  // Music/Hub Originals
  {
    id: '1',
    name: 'Tha Battlefield',
    url: '/assets/games/battlefield/battlefield.html',
    description: 'High-stakes tactical rap battle arena. Dominate the mic in real-time PvP.',
    genre: 'Music Battle',
    rating: 4.9,
    playersOnline: 1250,
    image: 'https://picsum.photos/seed/battle/300/200'
  },
  {
    id: '2',
    name: 'Remix Arena',
    url: '/assets/games/remix-arena/remixarena.html',
    description: 'Collaborative real-time remixing challenge. Out-sequence your rivals.',
    genre: 'Rhythm',
    rating: 4.7,
    playersOnline: 850,
    image: 'https://picsum.photos/seed/remix/300/200'
  },
  {
    id: '3',
    name: 'Beat Runner',
    url: 'https://htmlgames.com/game/Beat+Runner',
    description: 'Sprint through neon landscapes synced to the beat. PvP Ranking enabled.',
    genre: 'Runner',
    rating: 4.5,
    playersOnline: 2100,
    image: 'https://picsum.photos/seed/beat/300/200'
  },

  // SHOOTER
  {
    id: '5',
    name: 'Vanguard: Neon Strike',
    url: 'https://html5.gamedistribution.com/694921971d9c4909a34d0b0b8c28373b/',
    description: 'Elite tactical shooter set in a dystopian neon future.',
    genre: 'Shooter',
    rating: 4.9,
    playersOnline: 3400,
    image: 'https://picsum.photos/seed/vanguard/300/200'
  },
  {
    id: '6',
    name: 'Cyber Assassin',
    url: 'https://html5.gamedistribution.com/5f65349479e04874983058869c0d4561/',
    description: 'Stealth and precision meet high-speed action in the underworld.',
    genre: 'Shooter',
    rating: 4.8,
    playersOnline: 1800,
    image: 'https://picsum.photos/seed/assassin/300/200'
  },
  {
    id: '17',
    name: 'Frontline Tactics',
    url: 'https://html5.gamedistribution.com/e37d544079814234850754876b5b91b5/',
    description: 'Coordinate your squad and dominate the frontline.',
    genre: 'Shooter',
    rating: 4.5,
    playersOnline: 900,
    image: 'https://picsum.photos/seed/frontline/300/200'
  },
  {
    id: '30',
    name: 'Elite SWAT',
    url: 'https://html5.gamedistribution.com/001479814234850754876b5b91b5e37d/',
    description: 'High-stakes counter-terrorism operations.',
    genre: 'Shooter',
    rating: 4.7,
    playersOnline: 1200,
    image: 'https://picsum.photos/seed/swat/300/200'
  },

  // ADVENTURE
  {
    id: '18',
    name: 'Mystic Realms',
    url: 'https://html5.gamedistribution.com/834311895a9d4530869d8540c6c64923/',
    description: 'Embark on an epic journey through mystical landscapes.',
    genre: 'Adventure',
    rating: 4.8,
    playersOnline: 3200,
    image: 'https://picsum.photos/seed/mystic/300/200'
  },
  {
    id: '19',
    name: 'Neon Explorer',
    url: 'https://html5.gamedistribution.com/39a676b779a547789178f9f8c148c903/',
    description: 'Navigate the vibrant neon landscapes of a distant future.',
    genre: 'Adventure',
    rating: 4.7,
    playersOnline: 1800,
    image: 'https://picsum.photos/seed/explorer/300/200'
  },

  // CLASSIC
  {
    id: '10',
    name: 'Hextris',
    url: 'https://hextris.io/',
    description: 'Fast-paced hexagonal puzzle challenge. Modern classic.',
    genre: 'Classic',
    rating: 4.8,
    playersOnline: 5200,
    image: 'https://picsum.photos/seed/hextris/300/200'
  },
  {
    id: '11',
    name: 'Pac-Man Retro',
    url: 'https://pacman.live/play.html',
    description: 'The definitive arcade experience, perfectly preserved.',
    genre: 'Classic',
    rating: 5.0,
    playersOnline: 15000,
    image: 'https://picsum.photos/seed/pacman/300/200'
  }
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
