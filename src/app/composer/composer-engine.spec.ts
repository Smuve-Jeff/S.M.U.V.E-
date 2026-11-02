import {
  ARRANGEMENT_BY_ID,
  BASS_STYLE_BY_ID,
  GENRE_ATLAS,
  GENRE_BY_ID,
  GROOVE_BY_ID,
  PROGRESSION_BY_ID,
  resolveGenre,
} from './atlas';
import {
  COMPONENT_OPTIONS,
  buildCatalogEntries,
  composeWithGenre,
  formatDuration,
} from './composer-engine';
import type { ComponentKind, GenreProfile } from './composer.types';

const seedFor = (genre: GenreProfile): number => 1234567 + genre.id.length * 97;

const request = (genre: GenreProfile, overrides: Record<string, unknown> = {}) => ({
  genreId: genre.id,
  component: 'full-song' as ComponentKind,
  seed: seedFor(genre),
  complexity: 0.6,
  energy: 0.7,
  darkness: 0.5,
  ...overrides,
});

describe('genre atlas integrity', () => {
  it('has a deep, unique catalogue', () => {
    expect(GENRE_ATLAS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GENRE_ATLAS.map((genre) => genre.id)).size).toBe(GENRE_ATLAS.length);
  });

  it.each(GENRE_ATLAS.map((genre) => [genre.id, genre] as const))(
    'resolves every reference for %s',
    (_id, genre) => {
      expect(genre.grooveIds.every((id) => GROOVE_BY_ID.has(id))).toBe(true);
      expect(genre.progressionIds.every((id) => PROGRESSION_BY_ID.has(id))).toBe(true);
      expect(genre.bassStyleIds.every((id) => BASS_STYLE_BY_ID.has(id))).toBe(true);
      expect(ARRANGEMENT_BY_ID.has(genre.arrangementId)).toBe(true);
      expect(genre.bpm[0]).toBeLessThan(genre.bpm[1]);
      expect(genre.modes.length).toBeGreaterThan(0);
      expect(genre.palette.drums.label).toBeTruthy();
      expect(genre.palette.bass.label).toBeTruthy();
      expect(genre.modes.every((mode) => Boolean(mode))).toBe(true);
    }
  );

  it('maps unknown user genre strings to a real rule set', () => {
    expect(resolveGenre('Melodic Rap')?.id).toBe('trap');
    expect(resolveGenre('Alternative R&B')?.id).toBe('rnb');
    expect(resolveGenre('UK Drill')?.id).toBe('drill');
    expect(resolveGenre('Trap Soul')?.id).toBeTruthy();
    expect(resolveGenre('not a genre at all')).toBeNull();
  });
});

describe('composition engine', () => {
  it('writes the same score for the same brief', () => {
    const genre = GENRE_BY_ID.get('trap')!;
    const a = composeWithGenre(genre, request(genre));
    const b = composeWithGenre(genre, request(genre));
    expect(a.parts.map((part) => part.notes.length)).toEqual(
      b.parts.map((part) => part.notes.length)
    );
    expect(a.title).toBe(b.title);
    expect(a.sections.map((section) => section.bars)).toEqual(
      b.sections.map((section) => section.bars)
    );
  });

  it('produces different music for different seeds', () => {
    const genre = GENRE_BY_ID.get('house')!;
    const a = composeWithGenre(genre, request(genre, { seed: 11 }));
    const b = composeWithGenre(genre, request(genre, { seed: 12 }));
    const notesA = a.parts.find((part) => part.role === 'bass')?.notes ?? [];
    const notesB = b.parts.find((part) => part.role === 'bass')?.notes ?? [];
    expect(notesA.length).toBeGreaterThan(0);
    expect(notesA.map((note) => `${note.bar}:${note.step}:${note.midi}`)).not.toEqual(
      notesB.map((note) => `${note.bar}:${note.step}:${note.midi}`)
    );
  });

  it.each(GENRE_ATLAS.map((genre) => [genre.id, genre] as const))(
    'composes a complete, valid song for %s',
    (_id, genre) => {
      const composition = composeWithGenre(genre, request(genre));
      expect(composition.parts.length).toBeGreaterThan(2);
      expect(composition.sections.length).toBeGreaterThan(0);
      expect(composition.totalBars).toBe(
        composition.sections.reduce((sum, section) => sum + section.bars, 0)
      );
      expect(composition.durationSeconds).toBeGreaterThan(0);
      expect(formatDuration(composition.durationSeconds)).toMatch(/^\d+:\d{2}$/);

      for (const part of composition.parts) {
        for (const note of part.notes) {
          expect(note.midi).toBeGreaterThanOrEqual(24);
          expect(note.midi).toBeLessThanOrEqual(100);
          expect(note.length).toBeGreaterThanOrEqual(1);
          expect(note.velocity).toBeGreaterThan(0);
          expect(note.velocity).toBeLessThanOrEqual(1);
          expect(note.bar).toBeGreaterThanOrEqual(0);
          expect(note.bar).toBeLessThan(composition.totalBars);
          expect(note.step).toBeGreaterThanOrEqual(0);
          expect(note.step).toBeLessThan(16);
        }
        for (const hit of part.hits) {
          expect(hit.velocity).toBeGreaterThan(0);
          expect(hit.velocity).toBeLessThanOrEqual(1);
          expect(hit.step).toBeGreaterThanOrEqual(0);
          expect(hit.step).toBeLessThan(16);
        }
      }

      const drumPart = composition.parts.find((part) => part.role === 'drums');
      if (drumPart) {
        const keys = drumPart.hits.map((hit) => `${hit.bar}-${hit.step}-${hit.lane}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  );

  it.each(COMPONENT_OPTIONS.map((option) => [option.id] as const))(
    'writes the %s step as its own deliverable',
    (component) => {
      const genre = GENRE_BY_ID.get('rnb')!;
      const composition = composeWithGenre(
        genre,
        request(genre, { component, bars: 8 })
      );
      expect(composition.component).toBe(component);
      expect(composition.parts.length).toBeGreaterThan(0);
      if (component === 'kick') {
        expect(composition.parts[0].hits.every((hit) => hit.lane === 'kick')).toBe(true);
      }
      if (component === 'snare') {
        expect(
          composition.parts[0].hits.every((hit) =>
            ['snare', 'clap', 'rim'].includes(hit.lane)
          )
        ).toBe(true);
      }
      if (component === 'hats') {
        expect(
          composition.parts[0].hits.every((hit) => ['hat', 'openhat'].includes(hit.lane))
        ).toBe(true);
      }
      if (component === 'bassline' || component === 'melody') {
        const reference = composition.parts.filter((part) => part.reference);
        expect(reference.length).toBe(1);
        expect(reference[0].role).toBe('chords');
      }
    }
  );

  it('builds a reproducible on-demand catalogue card', () => {
    const genre = GENRE_BY_ID.get('drill')!;
    const catalog = buildCatalogEntries(genre, 8, 42);
    expect(catalog).toHaveLength(8);
    expect(new Set(catalog.map((entry) => entry.title)).size).toBeGreaterThan(3);

    const entry = catalog[3];
    const composition = composeWithGenre(genre, {
      genreId: genre.id,
      component: 'full-song',
      seed: entry.seed,
      bpm: entry.bpm,
      keyLabel: entry.keyLabel,
      complexity: 0.6,
      energy: 0.7,
      darkness: 0.5,
      title: entry.title,
    });
    expect(composition.title).toBe(entry.title);
    expect(composition.bpm).toBe(entry.bpm);
    expect(composition.keyLabel).toBe(entry.keyLabel);
  });

  it('honours the requested key and tempo', () => {
    const genre = GENRE_BY_ID.get('pop')!;
    const composition = composeWithGenre(
      genre,
      request(genre, { keyLabel: 'F# minor', bpm: 101 })
    );
    expect(composition.keyLabel.startsWith('F#')).toBe(true);
    expect(composition.keyLabel).toContain('minor');
    expect(composition.bpm).toBe(101);
  });

  it('keeps the motif when varying but changes the surface', () => {
    const genre = GENRE_BY_ID.get('neo-soul')!;
    const first = composeWithGenre(genre, request(genre, { seed: 77 }));
    const varied = composeWithGenre(
      genre,
      request(genre, { seed: 78, motifSeed: first.motifSeed, variation: 'variation' })
    );
    expect(varied.motifSeed).toBe(first.motifSeed);
    expect(varied.seed).not.toBe(first.seed);
    expect(varied.title).toBeTruthy();
  });
});
