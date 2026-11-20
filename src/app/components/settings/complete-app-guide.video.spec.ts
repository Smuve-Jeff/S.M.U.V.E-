import { readFileSync } from 'node:fs';
import {
  COMPLETE_GUIDE_LESSONS,
  COMPLETE_GUIDE_NARRATION,
} from './complete-app-guide.lessons';

/**
 * The guide and the video are two halves of one product.
 *
 * `complete-app-guide.lessons.ts` is what the Settings surface renders;
 * `scripts/build-complete-app-guide.mjs` is what renders the MP4 chapters that
 * the same surface seeks into. Nothing imports the other (the build script is
 * plain Node and cannot import TypeScript), so a chapter renamed in one place
 * quietly stopped matching the card in the other — which is exactly what
 * happened to chapters 07 and 12 before this check existed.
 *
 * The spoken lines are not compared here: both surfaces read
 * `complete-app-guide.narration.json`, so there is only one script to check.
 */

interface ScreenChapter {
  id: string;
  number: string;
  screen: string;
  kicker: string;
  title: string;
  subtitle: string;
  features: string[];
}

const SCRIPT_SOURCE = readFileSync(
  `${process.cwd()}/scripts/build-complete-app-guide.mjs`,
  'utf8'
);

/**
 * Read the build script's chapter list without running its ffmpeg build.
 *
 * The list is a repo literal made of plain strings and arrays, ending where the
 * narration is attached, so evaluating it is safe and needs no stubs.
 */
function readScreenChapters(): ScreenChapter[] {
  const start = SCRIPT_SOURCE.indexOf('const CHAPTERS = [');
  expect(start).toBeGreaterThan(-1);

  const end = SCRIPT_SOURCE.indexOf('\n].map(', start);
  expect(end).toBeGreaterThan(start);

  // The slice stops just before the closing `].map(...)`, so put the bracket back.
  const literal = SCRIPT_SOURCE.slice(start + 'const CHAPTERS = '.length, end);
  const chapters = new Function(`return ${literal}];`)() as ScreenChapter[];
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

  it('uses the guide’s id, title and kicker for every chapter', () => {
    for (const lesson of COMPLETE_GUIDE_LESSONS) {
      const chapter = chapters.find((entry) => entry.number === lesson.number);
      expect({
        number: lesson.number,
        id: chapter?.id,
        title: chapter?.title,
        kicker: chapter?.kicker,
      }).toEqual({
        number: lesson.number,
        id: lesson.id,
        title: lesson.title,
        kicker: lesson.kicker,
      });
    }
  });

  it('keeps every chapter renderable', () => {
    const screens = chapters.map((chapter) => chapter.screen);
    expect(new Set(screens).size).toBe(chapters.length);

    for (const chapter of chapters) {
      expect(chapter.screen).toMatch(/^\d{2}-[a-z0-9-]+\.png$/);
      expect(chapter.subtitle.trim().length).toBeGreaterThan(5);
      expect(chapter.features.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('speaks the shared narration instead of holding its own copy', () => {
    expect(SCRIPT_SOURCE).toContain('complete-app-guide.narration.json');

    // The only spoken-script array may be the one built from the narration: a
    // second, hand-written `lines: [...]` would be a drifting copy.
    const lineArrays = [...SCRIPT_SOURCE.matchAll(/\blines:\s*\[([^\]]*)\]/g)].map(
      (match) => match[1].replace(/\s+/g, ' ').trim()
    );
    expect(lineArrays).toEqual([
      'narration.intro, ...narration.features, narration.closing',
    ]);
  });

  it('narrates every chapter, and no orphan chapter', () => {
    expect(Object.keys(COMPLETE_GUIDE_NARRATION).sort()).toEqual(
      COMPLETE_GUIDE_LESSONS.map((lesson) => lesson.id).sort()
    );

    for (const lesson of COMPLETE_GUIDE_LESSONS) {
      const narration = COMPLETE_GUIDE_NARRATION[lesson.id];
      // The MP4 is useless without a voice track for each beat.
      expect(narration.intro.trim().length).toBeGreaterThan(20);
      expect(narration.closing.trim().length).toBeGreaterThan(20);
      expect(narration.features.length).toBeGreaterThanOrEqual(3);
      for (const line of narration.features) {
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
