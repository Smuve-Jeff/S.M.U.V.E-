import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Tha Spot — Pluto TV Live TV handoff', () => {
  const template = readFileSync(
    join(__dirname, 'tha-spot.component.html'),
    'utf8'
  );
  const styles = readFileSync(join(__dirname, 'tha-spot.pluto.css'), 'utf8');
  const plutoBlock = (() => {
    const start = template.indexOf('pluto-standalone-experience');
    expect(start).toBeGreaterThan(-1);
    const end = template.indexOf('</main>', start);
    return template.slice(start, end === -1 ? undefined : end);
  })();

  it('does not render the unsupported cross-origin iframe player', () => {
    expect(plutoBlock).not.toContain('<iframe');
    expect(plutoBlock).not.toContain('Optimizing your video playback experience');
    expect(plutoBlock).not.toContain('pluto-standalone-frame');
  });

  it('opens the official Live TV surface as the primary action', () => {
    const liveTvUrl = 'https://pluto.tv/us/watch/live-tv/';
    const launch =
      /<a[\s\S]*?pluto-live-launch-primary[\s\S]*?<\/a>/.exec(plutoBlock)?.[0] ?? '';

    expect(launch).toContain(`href="${liveTvUrl}"`);
    expect(launch).toContain('target="_blank"');
    expect(launch).toContain('rel="noopener noreferrer"');
    expect(launch).toContain('OPEN LIVE TV ON PLUTO.TV');
    expect(launch).toContain('logPlutoLaunch()');
  });

  it('explains why playback opens outside the app instead of showing a false player', () => {
    expect(plutoBlock).toContain('does not provide a reliable embeddable player');
    expect(plutoBlock).toContain('stuck “Optimizing your');
    expect(plutoBlock).toContain('official Live TV experience');
    expect(plutoBlock).toContain('Opens in a new tab');
  });

  it('keeps the launch surface reachable on mobile and desktop', () => {
    expect(styles).toContain('.pluto-live-launch');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('min-height: 48px');
    expect(styles).toContain('touch-action: manipulation');
    expect(styles).toContain('@media (max-width: 768px)');
  });

  it('keeps the immersive surface escape controls available', () => {
    expect(plutoBlock).toContain('exit-pluto-btn');
    expect(plutoBlock).toContain('(click)="setMode(\'gaming\')"');
  });
});
