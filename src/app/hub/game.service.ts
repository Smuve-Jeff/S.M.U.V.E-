import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game } from './game';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

const MOCK_GAMES: Game[] = [
  {
    id: '1',
    name: 'Tha Battlefield',
    url: '/assets/games/battlefield/battlefield.html',
    description:
      'High-stakes executive rap battle arena. Dominate the mic in real-time PvP.',
    genre: 'Music Battle',
    rating: 4.9,
    playersOnline: 1250,
    image: 'https://picsum.photos/seed/battle/300/200',
    tags: ['Multiplayer', 'Original', 'PvP', 'station-pod'],
  },
  {
    id: '2',
    name: 'Remix Arena',
    url: '/assets/games/remix-arena/remixarena.html',
    description:
      'Collaborative real-time remixing challenge. Out-sequence your rivals.',
    genre: 'Rhythm',
    rating: 4.7,
    playersOnline: 850,
    image: 'https://picsum.photos/seed/remix/300/200',
    tags: ['Multiplayer', 'Original', 'Co-op', 'station-pod'],
  },
  {
    id: '3',
    name: 'Beat Runner',
    url: 'https://htmlgames.com/game/Beat+Runner',
    description:
      'Sprint through refined-glow landscapes synced to the beat. PvP Ranking enabled.',
    genre: 'Runner',
    rating: 4.5,
    playersOnline: 2100,
    image: 'https://picsum.photos/seed/beat/300/200',
    tags: ['Multiplayer', 'Arcade', 'AI', 'station-cabinet'],
  },
  {
    id: '5',
    name: 'Vanguard: elegant Strike',
    url: 'https://html5.gamedistribution.com/694921971d9c4909a34d0b0b8c28373b/',
    description: 'Elite executive shooter set in a dystopian refined-glow future.',
    genre: 'Shooter',
    rating: 4.9,
    playersOnline: 3400,
    image: 'https://picsum.photos/seed/vanguard/300/200',
    tags: ['Multiplayer', 'PvP', 'FPS', 'station-pod'],
  },
  {
    id: '6',
    name: 'pro-grade Assassin',
    url: 'https://html5.gamedistribution.com/5f65349479e04874983058869c0d4561/',
    description: 'Stealth and precision meet high-speed action in the underworld.',
    genre: 'Shooter',
    rating: 4.8,
    playersOnline: 1800,
    image: 'https://picsum.photos/seed/assassin/300/200',
    tags: ['Single Player', 'Action', 'station-cabinet'],
  },
  {
    id: '30',
    name: 'Elite SWAT',
    url: 'https://html5.gamedistribution.com/001479814234850754876b5b91b5e37d/',
    description: 'High-stakes counter-terrorism operations.',
    genre: 'Shooter',
    rating: 4.7,
    playersOnline: 1200,
    image: 'https://picsum.photos/seed/swat/300/200',
    tags: ['Multiplayer', 'Tactical', 'station-pod'],
  },
  {
    id: '40',
    name: 'Neon Velocity',
    url: 'https://html5.gamedistribution.com/a4f3b7c8d9e0f1a2b3c4d5e6f7a8b9c0/',
    description: 'High-speed racing through neon-lit cityscapes.',
    genre: 'Racing',
    rating: 4.6,
    playersOnline: 2500,
    image: 'https://picsum.photos/seed/racing1/300/200',
    tags: ['Multiplayer', 'Racing', 'station-cabinet'],
  },
  {
    id: '41',
    name: 'Drift Masters',
    url: 'https://html5.gamedistribution.com/b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6/',
    description: 'Master the art of drifting in competitive global circuits.',
    genre: 'Racing',
    rating: 4.8,
    playersOnline: 1900,
    image: 'https://picsum.photos/seed/racing2/300/200',
    tags: ['Multiplayer', 'Competitive', 'station-pod'],
  },
  {
    id: '50',
    name: 'Street Hoops Pro',
    url: 'https://html5.gamedistribution.com/c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6/',
    description: 'Show your skills on the urban courts in 3v3 matches.',
    genre: 'Sports',
    rating: 4.7,
    playersOnline: 3100,
    image: 'https://picsum.photos/seed/sports1/300/200',
    tags: ['Multiplayer', 'Sports', 'station-cabinet'],
  },
  {
    id: '51',
    name: 'Global Soccer Duel',
    url: 'https://html5.gamedistribution.com/d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6/',
    description: 'Face off against players worldwide in high-stakes soccer duels.',
    genre: 'Sports',
    rating: 4.5,
    playersOnline: 4200,
    image: 'https://picsum.photos/seed/sports2/300/200',
    tags: ['Multiplayer', 'PvP', 'station-pod'],
  },
  {
    id: '60',
    name: 'Empire Command',
    url: 'https://html5.gamedistribution.com/e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6/',
    description: 'Build your empire and command your armies in real-time.',
    genre: 'Strategy',
    rating: 4.9,
    playersOnline: 5600,
    image: 'https://picsum.photos/seed/strategy1/300/200',
    tags: ['Multiplayer', 'RTS', 'AI', 'station-pod'],
  },
  {
    id: '61',
    name: 'Grandmaster Chess',
    url: 'https://html5.gamedistribution.com/f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6/',
    description: 'The ultimate board game, refined for the modern executive.',
    genre: 'Strategy',
    rating: 4.8,
    playersOnline: 2200,
    image: 'https://picsum.photos/seed/strategy2/300/200',
    tags: ['Multiplayer', 'Classic', 'AI', 'station-cabinet'],
  },
  {
    id: '70',
    name: 'Cyber Enigma',
    url: 'https://html5.gamedistribution.com/a1b2c3d4e5f67890abcdef1234567890/',
    description: 'Solve complex neural puzzles in a race against time.',
    genre: 'Puzzle',
    rating: 4.7,
    playersOnline: 1400,
    image: 'https://picsum.photos/seed/puzzle1/300/200',
    tags: ['Single Player', 'Logic', 'station-cabinet'],
  },
  {
    id: '71',
    name: 'Tetra Fusion',
    url: 'https://html5.gamedistribution.com/b2c3d4e5f67890abcdef1234567890a1/',
    description: 'A modern twist on the block-stacking classic with PvP modes.',
    genre: 'Puzzle',
    rating: 4.6,
    playersOnline: 3800,
    image: 'https://picsum.photos/seed/puzzle2/300/200',
    tags: ['Multiplayer', 'PvP', 'AI', 'station-pod'],
  },
  {
    id: '18',
    name: 'Mystic Realms',
    url: 'https://html5.gamedistribution.com/834311895a9d4530869d8540c6c64923/',
    description: 'Embark on an epic journey through mystical landscapes.',
    genre: 'Adventure',
    rating: 4.8,
    playersOnline: 3200,
    image: 'https://picsum.photos/seed/mystic/300/200',
    tags: ['Single Player', 'RPG', 'station-pod'],
  },
  {
    id: '10',
    name: 'Pac-Man Retro',
    url: 'https://html5.gamedistribution.com/602934415a2a4b8787c672b1a8f6d7c1/',
    description: 'The ultimate arcade classic, remastered for the S.M.U.V.E. network.',
    genre: 'Classic',
    rating: 4.9,
    playersOnline: 8500,
    image: 'https://picsum.photos/seed/pacman/300/200',
    tags: ['Single Player', 'Arcade', 'station-cabinet'],
  },
  {
    id: '11',
    name: 'Galaga Retro',
    url: 'https://html5.gamedistribution.com/9b7083834311895a9d4530869d8540c6/',
    description:
      'Defend the galaxy against swarms of alien invaders in this high-octane classic.',
    genre: 'Classic',
    rating: 4.8,
    playersOnline: 4200,
    image: 'https://picsum.photos/seed/galaga/300/200',
    tags: ['Single Player', 'Shooter', 'station-cabinet'],
  },
  {
    id: '12',
    name: 'Hextris',
    url: 'https://hextris.io/',
    description: 'Fast-paced hexagonal puzzle challenge. Modern classic.',
    genre: 'Classic',
    rating: 4.8,
    playersOnline: 5200,
    image: 'https://picsum.photos/seed/hextris/300/200',
    tags: ['Single Player', 'Arcade', 'station-cabinet'],
  },
  {
    id: '80',
    name: 'Neural Tactics Online',
    url: 'https://html5.gamedistribution.com/8faeb13cc3fc4f69a19907ac5f8f8a1f/',
    description:
      'AI-assisted tactical battleground with live multiplayer squad coordination.',
    genre: 'Strategy',
    rating: 4.9,
    playersOnline: 4700,
    image: 'https://picsum.photos/seed/neuraltactics/300/200',
    tags: ['Multiplayer', 'AI', 'Tactical', 'station-pod'],
  },
  {
    id: '81',
    name: 'Aether Kart League',
    url: 'https://html5.gamedistribution.com/9dfcf57d88ce49f2bb9df7adf2cc2677/',
    description:
      'High-speed online kart battles with AI ghost racing and live PvP tournaments.',
    genre: 'Racing',
    rating: 4.8,
    playersOnline: 5300,
    image: 'https://picsum.photos/seed/aetherkart/300/200',
    tags: ['Multiplayer', 'AI', 'PvP', 'station-cabinet'],
  },
  {
    id: '82',
    name: 'Cipher Strike Arena',
    url: 'https://html5.gamedistribution.com/e3e9eb7ff7bf41edbcd11a89f0d88e17/',
    description:
      'Precision shooter with adaptive AI opponents and ranked cross-region multiplayer.',
    genre: 'Shooter',
    rating: 4.7,
    playersOnline: 6100,
    image: 'https://picsum.photos/seed/cipherstrike/300/200',
    tags: ['Multiplayer', 'AI', 'Shooter', 'station-pod'],
  },
];

const GAMES_API_URL =
  'https://firebasestorage.googleapis.com/v0/b/builder-406918.appspot.com/o/gaming-pwa%2Fgames.json?alt=media';

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
    return this.listGames({}).pipe(map((games) => games.find((g) => g.id === id)));
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
