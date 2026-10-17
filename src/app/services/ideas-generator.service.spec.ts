import { TestBed } from '@angular/core/testing';
import { IdeasGeneratorService, type IdeaRecipe } from './ideas-generator.service';

describe('IdeasGeneratorService', () => {
  let service: IdeasGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IdeasGeneratorService);
  });

  const recipeById = (id: string): IdeaRecipe => {
    const recipe = service.recipes.find((r) => r.id === id);
    if (!recipe) throw new Error(`Template pack missing from recipes: ${id}`);
    return recipe;
  };

  // ── Template pack catalogue ────────────────────────────────────────

  it('ships every template pack with unique ids and playable track data', () => {
    const ids = service.recipes.map((r) => r.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(10);

    for (const recipe of service.recipes) {
      expect(recipe.name).toBeTruthy();
      expect(recipe.progression).toHaveLength(4);
      expect(recipe.bpm).toBeGreaterThanOrEqual(60);
      expect(recipe.bpm).toBeLessThanOrEqual(200);
      expect(recipe.tracks.length).toBeGreaterThanOrEqual(3);

      for (const track of recipe.tracks) {
        expect(track.name).toBeTruthy();
        expect(track.instrumentId).toBeTruthy();

        if (track.drum) {
          for (const lane of [track.drum.kick, track.drum.snare, track.drum.hat]) {
            expect(lane.length).toBeGreaterThan(0);
            for (const step of lane) {
              expect(step).toBeGreaterThanOrEqual(0);
              expect(step).toBeLessThan(64);
            }
          }
          if (track.drum.swing !== undefined) {
            expect(track.drum.swing).toBeGreaterThanOrEqual(0);
            expect(track.drum.swing).toBeLessThanOrEqual(0.75);
          }
        } else {
          expect(track.notes.length).toBeGreaterThan(0);
        }

        for (const note of track.notes) {
          expect(note.midi).toBeGreaterThanOrEqual(0);
          expect(note.midi).toBeLessThanOrEqual(127);
          expect(note.step).toBeGreaterThanOrEqual(0);
          expect(note.step).toBeLessThan(64);
          expect(note.length).toBeGreaterThan(0);
          expect(note.velocity).toBeGreaterThan(0);
          expect(note.velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('includes the Afrobeats, Synthwave, Boom Bap and Reggaeton packs', () => {
    expect(recipeById('afrobeats')).toMatchObject({
      bpm: 104,
      progression: ['I', 'V', 'vi', 'IV'],
    });
    expect(recipeById('synthwave')).toMatchObject({
      bpm: 112,
      progression: ['i', 'VI', 'III', 'VII'],
    });
    expect(recipeById('boombap')).toMatchObject({
      bpm: 90,
      progression: ['ii7', 'V7', 'Imaj7', 'vi7'],
    });
    expect(recipeById('reggaeton')).toMatchObject({
      bpm: 94,
      progression: ['i', 'VI', 'VII', 'i'],
    });
  });

  it('recommends the pack closest to the requested tempo', () => {
    expect(service.recommend()).toBe(service.recipes[0]);
    expect(service.recommend(78).id).toBe('lofi');
    expect(service.recommend(89).id).toBe('boombap');
    expect(service.recommend(143).id).toBe('drill');
    expect(service.recommend(200).id).toBe('drill');
  });

  // ── Predictive note generation ─────────────────────────────────────

  it('uses each genre progression when generating predictive notes', () => {
    const cases: Array<[string, string, string[]]> = [
      ['afrobeats', 'major', ['I', 'V', 'vi', 'IV']],
      ['gospel', 'major', ['I', 'vi', 'ii7', 'V7']],
      ['boombap', 'major', ['ii7', 'V7', 'Imaj7', 'vi7']],
      ['synthwave', 'minor', ['i', 'VI', 'III', 'VII']],
      ['reggaeton', 'minor', ['i', 'VI', 'VII', 'i']],
      ['cinematic', 'minor', ['i', 'VI', 'iv', 'V']],
      ['cyberpunk', 'minor', ['i', 'VI', 'III', 'iv']],
      ['drill', 'minor', ['i', 'iv', 'VII', 'III']],
    ];

    for (const [genre, scale, progression] of cases) {
      const { notes, progression: emitted } = service.generatePredictiveNotes({
        key: 'C',
        scale,
        genre,
      });

      expect(emitted).toEqual(progression);
      expect(notes.length).toBeGreaterThan(0);

      for (const note of notes) {
        expect(note.midi).toBeGreaterThanOrEqual(0);
        expect(note.midi).toBeLessThanOrEqual(127);
        expect(note.step).toBeGreaterThanOrEqual(0);
        expect(note.step).toBeLessThan(64);
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }

      // One chord change per bar: the voicings must cover all four bars.
      const lastStep = Math.max(...notes.map((n) => n.step));
      expect(lastStep).toBeGreaterThanOrEqual(48);
    }
  });

  it('transposes predictive notes with the requested key', () => {
    const inC = service.generatePredictiveNotes({ key: 'C', scale: 'major', genre: 'afrobeats' });
    const inD = service.generatePredictiveNotes({ key: 'D', scale: 'major', genre: 'afrobeats' });

    expect(inD.progression).toEqual(inC.progression);
    expect(inD.notes.map((n) => n.midi)).toEqual(inC.notes.map((n) => n.midi + 2));
  });

  it('falls back to the pop progression for unknown genres and keys', () => {
    const unknownGenre = service.generatePredictiveNotes({
      key: 'G',
      scale: 'major',
      genre: 'polka-from-mars',
    });
    expect(unknownGenre.progression).toEqual(['I', 'V', 'vi', 'IV']);

    const defaults = service.generatePredictiveNotes({});
    expect(defaults.progression).toEqual(['i', 'VI', 'III', 'VII']);
    expect(defaults.notes.length).toBeGreaterThan(0);
  });

  // ── Chord prediction ───────────────────────────────────────────────

  it('predicts the next chord from a genre progression prefix', () => {
    expect(service.suggestNextChord([], 'afrobeats')).toBe('I');
    expect(service.suggestNextChord(['I'], 'afrobeats')).toBe('V');
    expect(service.suggestNextChord(['I', 'V'], 'afrobeats')).toBe('vi');
    expect(service.suggestNextChord(['I', 'V', 'vi'], 'afrobeats')).toBe('IV');

    expect(service.suggestNextChord(['i'], 'reggaeton')).toBe('VI');
    expect(service.suggestNextChord(['i', 'VI'], 'cyberpunk')).toBe('III');
    expect(service.suggestNextChord(['i', 'VI', 'III'], 'synthwave')).toBe('VII');
    expect(service.suggestNextChord(['Imaj7'], 'lofi')).toBe('V7');
  });

  it('matches the secondary gospel/boombap patterns and falls back sensibly', () => {
    // Gospel's second pattern (Imaj7 · Vm7 · iii7 · vi7) must win over pattern one.
    expect(service.suggestNextChord(['Imaj7', 'Vm7'], 'gospel')).toBe('iii7');
    expect(service.suggestNextChord(['Imaj7', 'vi7'], 'boombap')).toBe('ii7');

    // Unknown genre falls back to the pop conventions.
    expect(service.suggestNextChord(['I', 'V'], 'not-a-genre')).toBe('vi');

    // A full-length prefix returns the closing chord rather than undefined.
    expect(service.suggestNextChord(['I', 'V', 'vi', 'IV'], 'pop')).toBe('IV');
  });

  // ── Drum fills ─────────────────────────────────────────────────────

  it('generates 1-bar drum fills that stay on the grid', () => {
    for (const style of ['trap', 'house', 'lofi', 'pop'] as const) {
      const fill = service.generateDrumFill(style);

      for (const lane of [fill.kick, fill.snare, fill.hat]) {
        expect(lane.length).toBeGreaterThan(0);
        for (const step of lane) {
          expect(step).toBeGreaterThanOrEqual(0);
          expect(step).toBeLessThan(16);
        }
      }
    }
  });
});
