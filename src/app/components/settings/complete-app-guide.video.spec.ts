import { readFileSync } from 'node:fs';
import {
  COMPLETE_GUIDE_LESSONS,
  COMPLETE_GUIDE_NARRATION,
} from './complete-app-guide.lessons';
import * as SHARED_NARRATION from './complete-app-guide.narration.json';

/**
 * The guide and the video are two halves of one product.
 *
 * `complete-app-guide.lessons.ts` is what the Settings surface renders;
 * `scripts/build-complete-app-guide.mjs` is what renders the MP4 chapters that
 * the same surface seeks into. Nothing imports the other (the build script is
 * plain Node and cannot import TypeScript), so a chapter renamed in one place
 * quietly stopped matching the card in the other — which is exactly what
 * happened to chapters 07 and 12 before this check existed.
 */

interface ScreenChapter {
  number: string;
  screen: string;
  kicker: string;
  title: string;
  subtitle: string;
  features: string[];
  lines: string[];
}

/**
 * Run the build script's chapter wiring without importing the script.
 *
 * The slice covers the CHAPTERS literal and the loop that fills each
 * chapter's spoken lines from the shared narration file, so the test executes
 * the same derivation the MP4 build does rather than re-deriving it here.
 */
function readScreenChapters(): ScreenChapter[] {
  const scriptPath = `${process.cwd()}/scripts/build-complete-app-guide.mjs`;
  const source = readFileSync(scriptPath, 'utf8');
  const start = source.indexOf('const CHAPTERS = [');
  expect(start).toBeGreaterThan(-1);

  const derivation = source.indexOf('chapter.lines = [narration.intro');
  expect(derivation).toBeGreaterThan(start);
  const end = source.indexOf('\n}', derivation) + 2;

  const wiring = source.slice(start, end);
  // The slice is repo source made of plain strings, arrays and one fs read, so
  // building the value is safe and keeps the test independent of the script's
  // ffmpeg/TTS imports.
  const chapters = new Function(
    'readFileSync',
    'path',
    'ROOT',
    `${wiring}\nreturn CHAPTERS;`
  )(readFileSync, { join: (...parts: string[]) => parts.join('/') }, process.cwd()) as ScreenChapter[];
  expect(Array.isArray(chapters)).toBe(true);
  return chapters;
}

describe('Complete Guide video chapters', () => {
  const chapters = readScreenChapters();

  it('renders exactly the chapters the guide ships', () => {
    expect(chapters.map((chapter) => chapter.number)).toEqual(
      COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.number)
    );
  });

  it('uses the guide’s title and kicker for every chapter', () => {
    for (const lesson of COMPLETE_GUIDE_LESSONS) {
      const chapter = chapters.find((entry) => entry.number === lesson.number);
      expect(chapter).toBeDefined();
      // A renamed chapter must be renamed in the video script too, or the
      // render card and the Settings card disagree on screen.
      expect({
        number: lesson.number,
        title: chapter?.title,
        kicker: chapter?.kicker,
      }).toEqual({
        number: lesson.number,
        title: lesson.title,
        kicker: lesson.kicker,
      });
    }
  });

  it('keeps every chapter renderable and narrated', () => {
    const screens = chapters.map((chapter) => chapter.screen);
    expect(new Set(screens).size).toBe(chapters.length);

    for (const chapter of chapters) {
      expect(chapter.screen).toMatch(/^\d{2}-[a-z0-9-]+\.png$/);
      expect(chapter.subtitle.trim().length).toBeGreaterThan(5);
      expect(chapter.features.length).toBeGreaterThanOrEqual(3);
      // The MP4 is useless without the voice track.
      expect(chapter.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of chapter.lines) {
        expect(line.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it('reads its chapter scripts from the one shared narration module', () => {
    // The guide's typed export and the video build both come from this JSON,
    // so neither can hold a second copy of the spoken lines.
    expect(COMPLETE_GUIDE_NARRATION).toEqual({ ...SHARED_NARRATION });

    const scriptSource = readFileSync(
      `${process.cwd()}/scripts/build-complete-app-guide.mjs`,
      'utf8'
    );
    expect(scriptSource).toContain('complete-app-guide.narration.json');
    // A hand-written `lines: [...]` array would be a second, drifting copy.
    expect(scriptSource).not.toMatch(/\blines:\s*\[/);
  });

  it('speaks the same script the guide narrates, line for line', () => {
    for (const lesson of COMPLETE_GUIDE_LESSONS) {
      const chapter = chapters.find((entry) => entry.number === lesson.number);
      const narration = COMPLETE_GUIDE_NARRATION[lesson.id];
      expect(narration).toBeDefined();
      expect(chapter).toBeDefined();

      // The MP4 and the in-app narrator teach the same chapter, so they must
      // not carry two drifting scripts: intro, one beat per feature, closing.
      expect({
        number: lesson.number,
        lines: chapter?.lines,
      }).toEqual({
        number: lesson.number,
        lines: [narration.intro, ...narration.features, narration.closing],
      });
    }
  });

  it('narrates every feature the guide highlights, and no orphan chapter', () => {
    const narratedIds = Object.keys(COMPLETE_GUIDE_NARRATION).sort();
    expect(narratedIds).toEqual(
      COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.id).sort()
    );

    for (const lesson of COMPLETE_GUIDE_LESSONS) {
      const chapter = chapters.find((entry) => entry.number === lesson.number);
      const narration = COMPLETE_GUIDE_NARRATION[lesson.id];
      // A feature added to the guide needs its spoken beat, and the reverse.
      // (The on-screen card chips are a shorter summary than the voice track,
      // so only the spoken structure is required to match.)
      expect(chapter?.lines.length).toBe(narration.features.length + 2);
    }
  });

  it('does not keep a chapter the guide has retired', () => {
    const lessonNumbers = new Set(
      COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.number)
    );
    const orphans = chapters
      .filter((chapter) => !lessonNumbers.has(chapter.number))
      .map((chapter) => `${chapter.number} ${chapter.title}`);

    expect(orphans).toEqual([]);
  });
});
