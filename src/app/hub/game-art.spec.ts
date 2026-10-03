import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameArtFallback, resolveGameArt } from './game-art';

const game = { id: 'test-art', name: 'Rock & Roll <Adventure>', genre: 'Action' };

describe('Catalogue artwork', () => {
  it('generates valid, cached, title-specific XML with escaped feed text', () => {
    const url = gameArtFallback(game);
    expect(gameArtFallback(game)).toBe(url);
    const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelector('title')?.textContent).toBe(game.name);
    expect(svg).toContain('CATALOGUE TITLE ART');
    expect(gameArtFallback({ ...game, name: 'Another Title' })).not.toBe(url);
  });

  it('preserves local raster and remote cover art but replaces unsafe or shared images', () => {
    for (const image of ['assets/games/cover.png', '/assets/games/cover.jpeg', 'https://cdn.example.test/cover.webp']) {
      expect(resolveGameArt({ ...game, image })).toBe(image);
    }
    for (const image of ['', 'assets/hub/home-backdrop-command.png', '/assets/hub/home-backdrop-command.png', 'javascript:alert(1)', '//unknown.test/cover.png']) {
      expect(resolveGameArt({ ...game, image })).toBe(gameArtFallback(game));
    }
  });

  it.each(['minecraft', 'gta-online', 'destiny-2'])('keeps the repaired %s SVG parseable', (id) => {
    const svg = readFileSync(join(process.cwd(), 'src/assets/games', `${id}.svg`), 'utf8');
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });
});
