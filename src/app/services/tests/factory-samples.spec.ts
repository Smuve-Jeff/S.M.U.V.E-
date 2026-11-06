import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The factory presets used to stream from third-party GitHub Pages hosts, so
 * the "offline" PWA went silent whenever the network did. These checks fail if
 * a remote sample URL comes back, or if a preset points at a bundled file that
 * is missing or empty.
 */
const ROOT = process.cwd();
const SERVICE = join(ROOT, 'src/app/services/instruments.service.ts');
const FACTORY_DIR = join(ROOT, 'src/assets/samples/factory');
const SAMPLE_URL = /https:\/\/[^'"\s]+\.(?:mp3|m4a|wav|ogg)/g;
const LOCAL_REF = /assets\/samples\/factory\/[^'"\s]+/g;

describe('bundled factory sample bank', () => {
  const source = readFileSync(SERVICE, 'utf8');

  it('keeps every factory preset sample local', () => {
    expect(source.match(SAMPLE_URL) ?? []).toEqual([]);
  });

  it('points at files that exist and contain audio', () => {
    const refs = [...new Set(source.match(LOCAL_REF) ?? [])];
    expect(refs.length).toBeGreaterThan(30);

    for (const ref of refs) {
      const file = join(ROOT, 'src', ref);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1024);
    }
  });

  it('ships a manifest and attribution covering every bundled file', () => {
    const manifest = JSON.parse(
      readFileSync(join(FACTORY_DIR, 'manifest.json'), 'utf8'),
    ) as { files: unknown[] };
    const audioFiles = readdirSync(FACTORY_DIR).filter((name) =>
      /\.(mp3|m4a|wav|ogg)$/i.test(name),
    );

    expect(audioFiles.length).toBeGreaterThan(30);
    expect(manifest.files.length).toBe(audioFiles.length);
    expect(existsSync(join(FACTORY_DIR, 'SOURCES.md'))).toBe(true);
  });
});
