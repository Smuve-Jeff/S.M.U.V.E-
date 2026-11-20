import { readFileSync } from 'node:fs';
import { COMPLETE_GUIDE_LESSONS } from './complete-app-guide.lessons';

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

/** Read the build script's CHAPTERS literal without importing the script. */
function readScreenChapters(): ScreenChapter[] {
  const scriptPath = `${process.cwd()}/scripts/build-complete-app-guide.mjs`;
  const source = readFileSync(scriptPath, 'utf8');
  const marker = 'const CHAPTERS = [';
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);

  const end = source.indexOf('\n];', start);
  expect(end).toBeGreaterThan(start);

  const literal = source.slice(start + 'const CHAPTERS = '.length, end + 2);
  // The literal is repo source made of plain strings and arrays, so building
  // the value is safe and keeps the test independent of the script's imports.
  const chapters = new Function(`return ${literal};`)() as ScreenChapter[];
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
