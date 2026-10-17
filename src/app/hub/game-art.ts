import { Game } from './game';

export const SHARED_CATALOG_BACKDROP = 'assets/hub/home-backdrop-command.png';
const fallbackCache = new Map<string, string>();

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]!);
}

/** Original title artwork, not a screenshot or a claim to official box art. */
export function gameArtFallback(game?: Pick<Game, 'id' | 'name' | 'genre'> | null): string {
  const title = game?.name?.trim() || 'Tha Spot';
  const genre = game?.genre?.trim() || 'Gaming';
  const key = `${game?.id || ''}|${title}|${genre}`;
  const cached = fallbackCache.get(key);
  if (cached) return cached;
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > 28) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, 3);
  if (lines.length > 3) visible[2] = `${visible[2].slice(0, 25)}…`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><title>${escapeXml(title)}</title><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#07151b"/><stop offset="1" stop-color="hsl(${hue},48%,22%)"/></linearGradient></defs><rect width="960" height="540" fill="url(#bg)"/><circle cx="830" cy="130" r="215" fill="none" stroke="hsl(${hue},70%,65%)" stroke-opacity=".25" stroke-width="2"/><circle cx="830" cy="130" r="170" fill="none" stroke="hsl(${hue},70%,65%)" stroke-opacity=".15" stroke-width="40"/><path d="M0 465H960M0 480H960" stroke="hsl(${hue},70%,65%)" stroke-opacity=".3"/><rect x="56" y="67" width="56" height="5" rx="2" fill="hsl(${hue},70%,65%)"/><text x="56" y="114" fill="#c4d5db" font-family="Arial,sans-serif" font-size="20" letter-spacing="5">THA SPOT / ${escapeXml(genre.toUpperCase())}</text>${visible.map((text, index) => `<text x="56" y="${230 + index * 64}" fill="#f3f7fa" font-family="Arial,sans-serif" font-size="48" font-weight="700">${escapeXml(text)}</text>`).join('')}<text x="56" y="438" fill="#b7c9cf" font-family="Arial,sans-serif" font-size="17" letter-spacing="3">CATALOGUE TITLE ART</text></svg>`;
  const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  fallbackCache.set(key, image);
  return image;
}

/** Accept actual image URLs; never guess a provider CDN slug or reject PNG/JPEG. */
export function resolveGameArt(game?: Pick<Game, 'id' | 'name' | 'genre' | 'image'> | null): string {
  const image = game?.image?.trim();
  if (!image || image.replace(/^\//, '') === SHARED_CATALOG_BACKDROP) return gameArtFallback(game);
  if (/^https:\/\//i.test(image) || /^\/?assets\//.test(image) || image.startsWith('data:image/')) return image;
  return gameArtFallback(game);
}
