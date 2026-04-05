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
    multiplayerType: 'Server',
    aiSupportLevel: 'Advanced',
    aiBriefing: 'Establish dominance in the rap battle arena. Neural sync active for rhythm precision.',
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
    multiplayerType: 'Server',
    aiSupportLevel: 'Neural',
    aiBriefing: 'Collaborative remix engine is live. S.M.U.V.E. is balancing the sonic stems.',
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
    aiSupportLevel: 'Neural',
    aiBriefing: 'S.M.U.V.E. is analyzing the logic matrix for optimal number combination strategies.',
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
  {
    id: '11',
    name: 'Pac-Man Classic',
    url: 'https://pacman.live/play.html',
    description: 'The definitive arcade classic. Navigate the maze, eat the dots, and avoid the ghosts.',
    genre: 'Classic',
    rating: 4.9,
    playersOnline: 15400,
    image: buildGameCover('Pac-Man', 'Arcade', '#facc15', '#eab308'),
    availability: 'Online',
    tags: ['Classic', 'Arcade', 'Retro'],
  },
  {
    id: '12',
    name: 'Sonic Edge',
    url: 'https://www.retrogames.cc/embed/40238-sonic-the-hedgehog-usa-europe.html',
    description: 'High-speed platforming action with the worlds fastest hedgehog.',
    genre: 'Platformer',
    rating: 4.8,
    playersOnline: 8200,
    image: buildGameCover('Sonic', 'Sega', '#3b82f6', '#1d4ed8'),
    availability: 'Online',
    tags: ['Classic', 'Speed', 'Platformer'],
  },
  {
    id: '13',
    name: 'Super Plumber Bros',
    url: 'https://supermarioplay.com/',
    description: 'A legendary journey through the Mushroom Kingdom to rescue the princess.',
    genre: 'Platformer',
    rating: 4.9,
    playersOnline: 25000,
    image: buildGameCover('Super Mario', 'Nintendo', '#ef4444', '#b91c1c'),
    availability: 'Online',
    tags: ['Classic', 'Adventure', 'Platformer'],
  },
  {
    id: '14',
    name: 'Street Brawler V',
    url: 'https://www.retrogames.cc/embed/10042-street-fighter-ii-the-world-warrior-world-910522.html',
    description: 'Master the art of combat in the ultimate world warrior tournament.',
    genre: 'Fighting',
    rating: 4.7,
    playersOnline: 4500,
    image: buildGameCover('Street Fighter', 'Combat', '#f97316', '#c2410c'),
    availability: 'Online',
    tags: ['Combat', 'Arcade', 'Versus'],
  },
  {
    id: '15',
    name: 'Fatal Kombat',
    url: 'https://www.retrogames.cc/embed/9355-mortal-kombat-world.html',
    description: 'Enter the tournament and finish your opponents with brutal precision.',
    genre: 'Fighting',
    rating: 4.7,
    playersOnline: 3900,
    image: buildGameCover('Mortal Kombat', 'Kombat', '#4b5563', '#111827'),
    availability: 'Online',
    tags: ['Combat', 'Arcade', 'Fatal'],
  },
  {
    id: '16',
    name: 'Grid City Heist',
    url: 'https://poki.com/en/g/grand-action-crime-auto-showdown',
    description: 'Explore a vast open world and rise through the ranks of the criminal underworld.',
    genre: 'Action',
    rating: 4.6,
    playersOnline: 12000,
    image: buildGameCover('GTA Style', 'Open World', '#10b981', '#065f46'),
    availability: 'Online',
    tags: ['Action', 'Open World', 'Crime'],
  },
  {
    id: '17',
    name: 'Pro Hoops 2K',
    url: 'https://poki.com/en/g/basket-bros',
    description: 'Step onto the court and dominate the paint in this high-energy basketball sim.',
    genre: 'Sports',
    rating: 4.5,
    playersOnline: 7800,
    image: buildGameCover('NBA 2K Style', 'Sports', '#f97316', '#7c2d12'),
    availability: 'Online',
    tags: ['Sports', 'Basketball', 'Competitive'],
  },
  {
    id: '18',
    name: 'Gridiron Clash',
    url: 'https://poki.com/en/g/touchdown-ers',
    description: 'Lead your team to glory in the ultimate American football showdown.',
    genre: 'Sports',
    rating: 4.4,
    playersOnline: 5600,
    image: buildGameCover('Madden Style', 'Sports', '#1e40af', '#1e3a8a'),
    availability: 'Online',
    tags: ['Sports', 'Football', 'Tactical'],
  },
  {
    id: '19',
    name: 'Grandmaster Chess',
    url: 'https://poki.com/en/g/master-chess',
    description: 'The ultimate game of strategy. Outmaneuver your opponent and checkmate the king.',
    genre: 'Strategy',
    rating: 4.9,
    playersOnline: 32400,
    image: buildGameCover('Chess', 'Strategy', '#f8fafc', '#1e293b'),
    availability: 'Online',
    tags: ['Strategy', 'Logic', 'Classic'],
  },
  {
    id: '20',
    name: 'Neon Blackjack',
    url: 'https://poki.com/en/g/blackjack',
    description: 'Test your luck and skill at the table. Aim for 21 and beat the dealer.',
    genre: 'Casino',
    rating: 4.7,
    playersOnline: 12500,
    image: buildGameCover('Blackjack', 'Strategy', '#10b981', '#065f46'),
    availability: 'Online',
    tags: ['Strategy', 'Cards', 'Casino'],
  },
  {
    id: '21',
    name: 'Master Dominoes',
    url: 'https://poki.com/en/g/dominoes',
    description: 'Chain your tiles together and clear your hand in this timeless classic.',
    genre: 'Strategy',
    rating: 4.6,
    playersOnline: 8900,
    image: buildGameCover('Dominoes', 'Classic', '#3b82f6', '#1e3a8a'),
    availability: 'Online',
    tags: ['Strategy', 'Logic', 'Classic'],
  },
  {
    id: '22',
    name: 'Executive Solitaire',
    url: 'https://poki.com/en/g/solitaire',
    description: 'The classic card game of patience and organization.',
    genre: 'Strategy',
    rating: 4.8,
    playersOnline: 45000,
    image: buildGameCover('Solitaire', 'Cards', '#ef4444', '#b91c1c'),
    availability: 'Online',
    tags: ['Cards', 'Logic', 'Classic'],
  },
  {
    id: '23',
    name: 'Sudoku Pro',
    url: 'https://poki.com/en/g/sudoku',
    description: 'Engage your mind with the ultimate number placement puzzle.',
    genre: 'Strategy',
    rating: 4.9,
    playersOnline: 18700,
    image: buildGameCover('Sudoku', 'Logic', '#8b5cf6', '#4c1d95'),
    availability: 'Online',
    tags: ['Strategy', 'Logic', 'Numbers'],
  },
  {
    id: '24',
    name: 'Grid Sweeper',
    url: 'https://poki.com/en/g/minesweeper',
    description: 'Carefully uncover the tiles and avoid the hidden explosive traps.',
    genre: 'Strategy',
    rating: 4.7,
    playersOnline: 6200,
    image: buildGameCover('Minesweeper', 'Logic', '#64748b', '#0f172a'),
    availability: 'Online',
    tags: ['Strategy', 'Logic', 'Classic'],
  },
  {
    id: '25',
    name: 'Ocean Armada',
    url: 'https://poki.com/en/g/battleship',
    description: 'Deploy your fleet and hunt down your opponent in this naval combat classic.',
    genre: 'Strategy',
    rating: 4.8,
    playersOnline: 15600,
    image: buildGameCover('Battleship', 'Strategy', '#3b82f6', '#1d4ed8'),
    availability: 'Online',
    tags: ['Strategy', 'Combat', 'Naval'],
  },
  {
    id: '26',
    name: 'Soccer Stars',
    url: 'https://poki.com/en/g/soccer-skills-world-cup',
    description: 'Compete in the ultimate global soccer tournament and lead your team to victory.',
    genre: 'Sports',
    rating: 4.8,
    playersOnline: 42000,
    image: buildGameCover('Soccer', 'Sports', '#10b981', '#064e3b'),
    availability: 'Online',
    tags: ['Sports', 'Soccer', 'Tournament'],
  },
  {
    id: '27',
    name: 'Tennis Open',
    url: 'https://poki.com/en/g/tennis-masters',
    description: 'Master the court in this high-energy tennis simulation with fluid gameplay.',
    genre: 'Sports',
    rating: 4.6,
    playersOnline: 8500,
    image: buildGameCover('Tennis', 'Sports', '#84cc16', '#3f6212'),
    availability: 'Online',
    tags: ['Sports', 'Tennis', 'Versus'],
  },
  {
    id: '28',
    name: 'Pro Golf Tour',
    url: 'https://poki.com/en/g/golf-champions',
    description: 'Aim for the green and navigate tricky courses in this precision golf challenge.',
    genre: 'Sports',
    rating: 4.7,
    playersOnline: 12300,
    image: buildGameCover('Golf', 'Sports', '#10b981', '#14532d'),
    availability: 'Online',
    tags: ['Sports', 'Golf', 'Precision'],
  },
  {
    id: '29',
    name: 'Street Wrestle',
    url: 'https://poki.com/en/g/wrestle-jump',
    description: 'Dynamic physics-based wrestling combat. Out-grapple your opponent in the ring.',
    genre: 'Fighting',
    rating: 4.5,
    playersOnline: 6400,
    image: buildGameCover('Wrestling', 'Combat', '#ef4444', '#7f1d1d'),
    availability: 'Online',
    tags: ['Combat', 'Fighting', 'Arcade'],
  },
  {
    id: '30',
    name: 'Executive Mahjong',
    url: 'https://poki.com/en/g/mahjong-link',
    description: 'A polished tile-matching puzzle experience for strategic relaxation.',
    genre: 'Strategy',
    rating: 4.9,
    playersOnline: 21500,
    image: buildGameCover('Mahjong', 'Strategy', '#f59e0b', '#78350f'),
    availability: 'Online',
    tags: ['Strategy', 'Puzzle', 'Logic'],
  },
  {
    id: '31',
    name: 'Galactic Invaders',
    url: 'https://poki.com/en/g/space-major-cartel',
    description: 'Defend the galaxy in this high-fidelity retro space shooter arcade experience.',
    genre: 'Classic',
    rating: 4.8,
    playersOnline: 9800,
    image: buildGameCover('Space Shooter', 'Arcade', '#3b82f6', '#1e1b4b'),
    availability: 'Online',
    tags: ['Classic', 'Arcade', 'Retro'],
  },
  {
    id: '32',
    name: 'Neon Tetra',
    url: 'https://poki.com/en/g/tetris',
    description: 'The definitive block-stacking puzzle classic, refined for the modern hub.',
    genre: 'Classic',
    rating: 4.9,
    playersOnline: 56000,
    image: buildGameCover('Tetris', 'Arcade', '#06b6d4', '#1e40af'),
    availability: 'Online',
    tags: ['Classic', 'Arcade', 'Puzzle'],
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
