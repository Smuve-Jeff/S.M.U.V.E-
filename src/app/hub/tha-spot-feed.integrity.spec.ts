import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MINIMUM_EXPECTED_GAMES = 37;

describe('Tha Spot feed integrity', () => {
  const feedPath = join(
    process.cwd(),
    'src',
    'assets',
    'data',
    'tha-spot-feed.json'
  );
  const feed = JSON.parse(readFileSync(feedPath, 'utf8')) as {
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
      expect(['Offline', 'Online', 'Hybrid']).toContain(game.availability);
      expect(game.tags?.length).toBeGreaterThan(0);
      expect(game.launchConfig).toBeTruthy();
      expect(
        game.launchConfig?.approvedEmbedUrl ||
          game.launchConfig?.approvedExternalUrl
      ).toBeTruthy();
    }
  });
});
