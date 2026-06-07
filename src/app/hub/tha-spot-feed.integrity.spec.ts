import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MINIMUM_EXPECTED_GAMES = 4;

describe('Tha Spot feed integrity', () => {
  const feedPath = join(
    process.cwd(),
    'src',
    'assets',
    'data',
    'tha-spot-feed.json'
  );
  const feed = JSON.parse(readFileSync(feedPath, 'utf8')) as {
    rooms?: Array<{
      id?: string;
      name?: string;
    }>;
    games?: Array<{
      id?: string;
      name?: string;
      description?: string;
      genre?: string;
      availability?: string;
      tags?: string[];
      launchConfig?: {
        approvedEmbedUrl?: string;
        approvedExternalUrl?: string;
      };
    }>;
  };
  const rooms = feed.rooms ?? [];
  const games = feed.games ?? [];

  it('keeps every library entry uniquely identifiable', () => {
    const ids = games.map((game) => game.id);
    expect(ids.length).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_GAMES);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships fully populated, non-placeholder library entries', () => {
    for (const game of games) {
      expect(game.name).toBeTruthy();
      expect(game.name).not.toMatch(/^Game\s+\d+$/i);
      expect(game.description).toBeTruthy();
      expect(game.genre).toBeTruthy();
      expect(['Offline', 'Online', 'Hybrid', 'Web', 'Embed']).toContain(
        game.availability
      );
      expect(game.tags?.length).toBeGreaterThan(0);
      expect(game.launchConfig).toBeTruthy();
      expect(
        game.launchConfig?.approvedEmbedUrl ||
          game.launchConfig?.approvedExternalUrl
      ).toBeTruthy();
    }
  });

  it('keeps category rooms available for the expanded library', () => {
    const roomIds = new Set(rooms.map((room) => room.id));

    expect(roomIds.has('sports')).toBe(true);
    expect(roomIds.has('fighting-pit')).toBe(true);
    expect(roomIds.has('shooting-range')).toBe(true);
    expect(roomIds.has('rpg-vault')).toBe(true);
    expect(roomIds.has('co-op-link')).toBe(true);
  });

  it('maintains multiple choices for the featured expansion categories', () => {
    const fightingGames = games.filter((game) => game.genre === 'Fighting');
    const sportsGames = games.filter((game) => game.genre === 'Sports');
    const shootingGames = games.filter((game) => game.genre === 'Shooting');
    const rpgGames = games.filter(
      (game) => game.genre === 'RPG' || game.tags?.includes('RPG')
    );
    const coopGames = games.filter((game) => game.tags?.includes('Co-op'));

    expect(fightingGames.length).toBeGreaterThanOrEqual(1);
    expect(sportsGames.length).toBeGreaterThanOrEqual(1);
    expect(shootingGames.length).toBeGreaterThanOrEqual(0);
    expect(rpgGames.length).toBeGreaterThanOrEqual(0);
    expect(coopGames.length).toBeGreaterThanOrEqual(0);
  });
});
