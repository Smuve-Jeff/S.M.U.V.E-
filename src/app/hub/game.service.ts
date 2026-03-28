import { Injectable } from '@angular/core';
import { Game } from './game';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSvgColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#10b981';
}

const COVER_HASH_SEED = 7;

/**
 * Generates a deterministic inline SVG cover image so Tha Spot always has local artwork
 * for curated titles, even when the browser cannot reach external image hosts.
 */
function buildGameCover(title: string, eyebrow: string, accentStart: string, accentEnd: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash = Array.from(`${title}|${eyebrow}|${accentStart}|${accentEnd}`).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    COVER_HASH_SEED
  );
  const gradientId = `g-cover-${slug || 'spot'}-${hash.toString(16)}`;
  const safeTitle = escapeSvgText(title);
  const safeEyebrow = escapeSvgText(eyebrow.toUpperCase());
  const safeAccentStart = sanitizeSvgColor(accentStart);
  const safeAccentEnd = sanitizeSvgColor(accentEnd);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" role="img" aria-label="${safeTitle} cover art">
      <title>${safeTitle} cover art</title>
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${safeAccentStart}" />
          <stop offset="100%" stop-color="${safeAccentEnd}" />
        </linearGradient>
      </defs>
      <rect width="300" height="200" rx="24" fill="#020617" />
      <rect x="12" y="12" width="276" height="176" rx="20" fill="url(#${gradientId})" opacity="0.95" />
      <circle cx="246" cy="54" r="42" fill="rgba(255,255,255,0.12)" />
      <circle cx="228" cy="138" r="56" fill="rgba(255,255,255,0.08)" />
      <text x="26" y="44" fill="rgba(255,255,255,0.82)" font-size="16" font-family="Arial, sans-serif" letter-spacing="2">${safeEyebrow}</text>
      <text x="26" y="116" fill="#ffffff" font-size="30" font-weight="700" font-family="Arial, sans-serif">${safeTitle}</text>
      <text x="26" y="152" fill="rgba(255,255,255,0.88)" font-size="14" font-family="Arial, sans-serif">Curated for Tha Spot</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const CURATED_GAMES: Game[] = [
  {
    id: '1',
    name: 'Tha Battlefield',
    url: '/assets/games/battlefield/battlefield.html',
    description:
      'High-stakes executive rap battle arena. Dominate the mic in real-time PvP.',
    genre: 'Music Battle',
    rating: 4.9,
    playersOnline: 1250,
    image: buildGameCover('Tha Battlefield', 'Hybrid', '#10b981', '#0f766e'),
    availability: 'Hybrid',
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
    image: buildGameCover('Remix Arena', 'Hybrid', '#22c55e', '#14b8a6'),
    availability: 'Hybrid',
    tags: ['Multiplayer', 'Original', 'Co-op', 'station-pod'],
  },
  {
    id: '3',
    name: 'Neon Drift X',
    url: '/assets/games/neon-drift/neon-drift.html',
    description:
      'Swap lanes through a neon expressway and survive precision traffic patterns offline.',
    genre: 'Racing',
    rating: 4.8,
    playersOnline: 420,
    image: buildGameCover('Neon Drift X', 'Offline', '#38bdf8', '#6366f1'),
    availability: 'Offline',
    tags: ['Arcade', 'Offline', 'Reflex', 'station-cabinet'],
  },
  {
    id: '4',
    name: 'Vinyl Vault',
    url: '/assets/games/vinyl-vault/vinyl-vault.html',
    description:
      'Crack the crate-digging memory board and chain perfect matches in an offline puzzle run.',
    genre: 'Puzzle',
    rating: 4.7,
    playersOnline: 260,
    image: buildGameCover('Vinyl Vault', 'Offline', '#f59e0b', '#f97316'),
    availability: 'Offline',
    tags: ['Puzzle', 'Offline', 'Memory', 'station-cabinet'],
  },
  {
    id: '5',
    name: 'Cipher Surge',
    url: '/assets/games/cipher-surge/cipher-surge.html',
    description:
      'A polished sequence-memory challenge with escalating AI pressure and instant offline play.',
    genre: 'Puzzle',
    rating: 4.8,
    playersOnline: 310,
    image: buildGameCover('Cipher Surge', 'Offline', '#8b5cf6', '#6d28d9'),
    availability: 'Offline',
    tags: ['AI', 'Offline', 'Puzzle', 'station-pod'],
  },
  {
    id: '6',
    name: 'Tempo Lockdown',
    url: '/assets/games/tempo-lockdown/tempo-lockdown.html',
    description:
      'Hit the beat window, build streaks, and hold the pulse in a responsive offline rhythm challenge.',
    genre: 'Rhythm',
    rating: 4.8,
    playersOnline: 390,
    image: buildGameCover('Tempo Lockdown', 'Offline', '#34d399', '#059669'),
    availability: 'Offline',
    tags: ['Rhythm', 'Offline', 'Arcade', 'station-pod'],
  },
  {
    id: '7',
    name: 'Hextris',
    url: 'https://hextris.github.io/hextris/',
    description: 'A proven online arcade puzzler with premium hex-stack gameplay.',
    genre: 'Classic',
    rating: 4.8,
    playersOnline: 5200,
    image: buildGameCover('Hextris', 'Online', '#06b6d4', '#2563eb'),
    availability: 'Online',
    tags: ['Classic', 'Arcade', 'station-cabinet'],
  },
  {
    id: '8',
    name: '2048 Championship',
    url: 'https://play2048.co/',
    description:
      'A reliable online number-combo classic for quick strategy sessions between studio work.',
    genre: 'Puzzle',
    rating: 4.7,
    playersOnline: 6300,
    image: buildGameCover('2048 Championship', 'Online', '#f97316', '#ea580c'),
    availability: 'Online',
    tags: ['Classic', 'AI', 'station-cabinet'],
  },
  {
    id: '9',
    name: 'Beat Runner',
    url: 'https://htmlgames.com/game/Beat+Runner',
    description:
      'Sprint through refined-glow landscapes synced to the beat with a streamlined online launch.',
    genre: 'Runner',
    rating: 4.5,
    playersOnline: 2100,
    image: buildGameCover('Beat Runner', 'Online', '#ec4899', '#db2777'),
    availability: 'Online',
    tags: ['Arcade', 'Reflex', 'station-pod'],
  },
  {
    id: '10',
    name: 'Mystic Realms',
    url: 'https://html5.gamedistribution.com/834311895a9d4530869d8540c6c64923/',
    description:
      'An online fantasy adventure pick for longer sessions when you want an expansive world to explore.',
    genre: 'Adventure',
    rating: 4.8,
    playersOnline: 3200,
    image: buildGameCover('Mystic Realms', 'Online', '#a855f7', '#4f46e5'),
    availability: 'Online',
    tags: ['RPG', 'Adventure', 'station-pod'],
  },
];

@Injectable({
  providedIn: 'root',
})
export class GameService {
  listGames(
    filters: { genre?: string; query?: string } = {},
    sort: 'Popular' | 'Rating' | 'Newest' = 'Popular'
  ): Observable<Game[]> {
    return of(CURATED_GAMES).pipe(
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
}
