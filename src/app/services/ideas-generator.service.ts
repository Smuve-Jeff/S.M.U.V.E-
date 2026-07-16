import { Injectable } from '@angular/core';

export interface IdeaNote {
  midi: number;
  step: number;
  length: number;
  velocity: number;
}

export interface IdeaDrum {
  /** 64 boolean steps (kick+snare+hat). Step indices:
   *  0  = kick · 4 = snare · 2,6,10,14 = closed hat
   *  For now the recipe only drives selected kick+snare positions;
   *  the wider beam is added in HUDLane service. */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Optional % (0..0.75) of swing on off-beats */
  swing?: number;
}

export interface IdeaTrack {
  name: string;
  instrumentId: string;
  notes: IdeaNote[];
  drum?: IdeaDrum;
}

export interface IdeaRecipe {
  id: string;
  name: string;
  glyph: string;
  bpm: number;
  vibe: string;
  /** Roman-numeral progression (4 chords over 4 bars) */
  progression: string[];
  tracks: IdeaTrack[];
}

/**
 * Curated, hand-crafted 4-bar loop starters. Not random — every note
 * is intentional. Used by `MusicManagerService.applyGeneratedRecipe()`
 * to kill blank-canvas anxiety with one tap.
 */
@Injectable({ providedIn: 'root' })
export class IdeasGeneratorService {
  recipes: IdeaRecipe[] = [
    this.neoSoul(),
    this.trapRecipe(),
    this.loFi(),
    this.house(),
    this.drill(),
    this.pop(),
  ];

  recommend(seedBpm?: number): IdeaRecipe {
    if (!seedBpm) return this.recipes[0];
    let best = this.recipes[0];
    let bestDiff = Infinity;
    for (const r of this.recipes) {
      const d = Math.abs(r.bpm - seedBpm);
      if (d < bestDiff) {
        best = r;
        bestDiff = d;
      }
    }
    return best;
  }

  // ── Recipe builders ────────────────────────────────────────────────
  // Conventions: 64 steps = 4 bars.  Step 0 = beat 1 bar 1.
  // Chord changes land on bar boundaries (every 16 steps).

  private neoSoul(): IdeaRecipe {
    const baseE = 52; // E3
    const notesForChord = (rootMidi: number, intervals: number[], step: number) =>
      intervals.map((iv) => ({
        midi: rootMidi + iv,
        step,
        length: 16,
        velocity: 0.78,
      }));
    return {
      id: 'neo-soul',
      name: 'Sunset Loop · Neo Soul',
      glyph: '🌆',
      bpm: 92,
      vibe: 'Smooth Rhodes · Velvet · 7th chords',
      progression: ['ii7', 'V7', 'Imaj7', 'vi7'],
      tracks: [
        {
          name: 'Velvet Rhodes',
          instrumentId: 'grand-piano',
          notes: [
            ...notesForChord(baseE - 12, [0, 4, 7, 11], 0),   // ii7 (Em7)
            ...notesForChord(baseE - 12, [0, 4, 7, 11], 8),   // ghost octave
            ...notesForChord(baseE - 12 + 5, [0, 4, 7, 10], 16), // V7 (B7)
            ...notesForChord(baseE - 12 + 5, [11, 14], 24),
            ...notesForChord(baseE - 12 + 9, [0, 4, 7, 11], 32), // Imaj7 (Amaj7)
            ...notesForChord(baseE - 12 + 9, [12, 16], 40),
            ...notesForChord(baseE - 12 + 2, [0, 3, 7, 10], 48), // vi7 (F#m7)
            ...notesForChord(baseE - 12 + 2, [-1, 2], 56),
          ],
        },
        {
          name: 'Mo-Bass',
          instrumentId: 'p-bass-elite',
          notes: [
            { midi: baseE - 24, step: 0, length: 16, velocity: 0.88 },
            { midi: baseE - 24 + 3, step: 4, length: 4, velocity: 0.65 },
            { midi: baseE - 24 + 5, step: 8, length: 4, velocity: 0.7 },
            { midi: baseE - 24 + 5, step: 16, length: 16, velocity: 0.88 },
            { midi: baseE - 24 + 5, step: 22, length: 4, velocity: 0.65 },
            { midi: baseE - 24 + 7, step: 26, length: 4, velocity: 0.7 },
            { midi: baseE - 24 + 9, step: 32, length: 16, velocity: 0.88 },
            { midi: baseE - 24 + 9, step: 38, length: 4, velocity: 0.65 },
            { midi: baseE - 24 + 11, step: 42, length: 4, velocity: 0.7 },
            { midi: baseE - 24 + 2, step: 48, length: 16, velocity: 0.88 },
            { midi: baseE - 24 + 2, step: 54, length: 4, velocity: 0.65 },
            { midi: baseE - 24 + 5, step: 58, length: 4, velocity: 0.7 },
          ],
        },
        {
          name: 'Smooth Drums',
          instrumentId: 'trap-808-elite',
          notes: [],
          drum: {
            kick: [0, 24, 32, 48],
            snare: [12, 28, 44, 60],
            hat: [4, 6, 12, 14, 20, 22, 28, 30, 36, 38, 44, 46, 52, 54, 60, 62],
            swing: 0.32,
          },
        },
      ],
    };
  }

  private trapRecipe(): IdeaRecipe {
    return {
      id: 'trap',
      name: 'Night Drive · Trap',
      glyph: '🌃',
      bpm: 140,
      vibe: 'Rolling hats · Sub-bass 808s',
      progression: ['i', 'VI', 'III', 'VII'],
      tracks: [
        {
          name: 'Dark Keys',
          instrumentId: 'grand-piano',
          notes: [
            // F minor root, 8th note triads across 4 bars
            { midi: 53, step: 0, length: 4, velocity: 0.85 },
            { midi: 56, step: 0, length: 4, velocity: 0.78 },
            { midi: 60, step: 0, length: 4, velocity: 0.78 },
            { midi: 53, step: 4, length: 4, velocity: 0.7 },
            { midi: 56, step: 8, length: 4, velocity: 0.85 },
            { midi: 60, step: 8, length: 4, velocity: 0.78 },
            { midi: 51, step: 12, length: 4, velocity: 0.7 },
            { midi: 48, step: 16, length: 4, velocity: 0.85 },
            { midi: 51, step: 16, length: 4, velocity: 0.78 },
            { midi: 55, step: 16, length: 4, velocity: 0.78 },
            { midi: 48, step: 20, length: 4, velocity: 0.7 },
            { midi: 55, step: 24, length: 4, velocity: 0.85 },
            { midi: 53, step: 24, length: 4, velocity: 0.78 },
            { midi: 50, step: 32, length: 4, velocity: 0.85 },
            { midi: 53, step: 32, length: 4, velocity: 0.78 },
            { midi: 57, step: 32, length: 4, velocity: 0.78 },
            { midi: 53, step: 36, length: 4, velocity: 0.7 },
            { midi: 57, step: 40, length: 4, velocity: 0.85 },
            { midi: 53, step: 40, length: 4, velocity: 0.78 },
            { midi: 55, step: 44, length: 4, velocity: 0.7 },
            { midi: 45, step: 48, length: 4, velocity: 0.85 },
            { midi: 48, step: 48, length: 4, velocity: 0.78 },
            { midi: 52, step: 48, length: 4, velocity: 0.78 },
            { midi: 48, step: 52, length: 4, velocity: 0.7 },
            { midi: 52, step: 56, length: 4, velocity: 0.85 },
            { midi: 50, step: 60, length: 4, velocity: 0.7 },
          ],
        },
        {
          name: 'Sub Commander',
          instrumentId: 'sub-commander',
          notes: [
            { midi: 29, step: 0, length: 16, velocity: 0.95 },  // F1
            { midi: 29, step: 8, length: 4, velocity: 0.75 },
            { midi: 36, step: 16, length: 16, velocity: 0.95 }, // Db2 (VI)
            { midi: 36, step: 24, length: 4, velocity: 0.75 },
            { midi: 38, step: 32, length: 16, velocity: 0.95 }, // Eb2 (III)
            { midi: 38, step: 40, length: 4, velocity: 0.75 },
            { midi: 41, step: 48, length: 16, velocity: 0.95 }, // F2 (VII = Eb)
            { midi: 41, step: 56, length: 4, velocity: 0.75 },
          ],
        },
        {
          name: 'Cyber Drums',
          instrumentId: 'trap-808-elite',
          notes: [],
          drum: {
            kick: [0, 6, 24, 30, 32, 38, 48, 56],
            snare: [12, 28, 44, 60],
            hat: [2, 4, 6, 8, 10, 12, 14, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 54, 56, 58, 60, 62],
            swing: 0.18,
          },
        },
      ],
    };
  }

  private loFi(): IdeaRecipe {
    return {
      id: 'lofi',
      name: 'Café · Lo-Fi',
      glyph: '☕',
      bpm: 78,
      vibe: 'Mellow chords · Dusty swing · Vinyl',
      progression: ['Imaj7', 'V7', 'IVmaj7', 'vi7'],
      tracks: [
        {
          name: 'Dusty Rhodes',
          instrumentId: 'grand-piano',
          notes: [
            // C maj7, G7, F maj7, Am7
            { midi: 60, step: 0, length: 16, velocity: 0.75 },
            { midi: 64, step: 0, length: 16, velocity: 0.7 },
            { midi: 67, step: 0, length: 16, velocity: 0.7 },
            { midi: 71, step: 0, length: 16, velocity: 0.75 },
            { midi: 60, step: 8, length: 4, velocity: 0.55 },
            { midi: 55, step: 16, length: 16, velocity: 0.75 },
            { midi: 59, step: 16, length: 16, velocity: 0.7 },
            { midi: 62, step: 16, length: 16, velocity: 0.7 },
            { midi: 65, step: 16, length: 16, velocity: 0.75 },
            { midi: 53, step: 32, length: 16, velocity: 0.75 },
            { midi: 57, step: 32, length: 16, velocity: 0.7 },
            { midi: 60, step: 32, length: 16, velocity: 0.7 },
            { midi: 64, step: 32, length: 16, velocity: 0.75 },
            { midi: 57, step: 40, length: 4, velocity: 0.55 },
            { midi: 45, step: 48, length: 16, velocity: 0.75 },
            { midi: 48, step: 48, length: 16, velocity: 0.7 },
            { midi: 52, step: 48, length: 16, velocity: 0.7 },
            { midi: 55, step: 48, length: 16, velocity: 0.75 },
          ],
        },
        {
          name: 'Soft Sub',
          instrumentId: 'p-bass-elite',
          notes: [
            { midi: 36, step: 0, length: 16, velocity: 0.7 },
            { midi: 31, step: 16, length: 16, velocity: 0.7 },
            { midi: 29, step: 32, length: 16, velocity: 0.7 },
            { midi: 33, step: 48, length: 16, velocity: 0.7 },
          ],
        },
        {
          name: 'Vinyl Drums',
          instrumentId: 'trap-808-elite',
          notes: [],
          drum: {
            kick: [0, 32],
            snare: [12, 28, 44, 60],
            hat: [6, 14, 22, 30, 38, 46, 54, 62],
            swing: 0.45,
          },
        },
      ],
    };
  }

  private house(): IdeaRecipe {
    return {
      id: 'house',
      name: 'Rooftop · House',
      glyph: '🪩',
      bpm: 124,
      vibe: '4-on-floor · Plucky stabs',
      progression: ['i', 'VI', 'III', 'VII'],
      tracks: [
        {
          name: 'Neon Stab',
          instrumentId: 'cyber-stab',
          notes: [
            // Am, F, C, G
            { midi: 57, step: 0, length: 4, velocity: 0.85 },
            { midi: 60, step: 0, length: 4, velocity: 0.85 },
            { midi: 64, step: 0, length: 4, velocity: 0.85 },
            { midi: 57, step: 4, length: 4, velocity: 0.7 },
            { midi: 53, step: 16, length: 4, velocity: 0.85 },
            { midi: 57, step: 16, length: 4, velocity: 0.85 },
            { midi: 60, step: 16, length: 4, velocity: 0.85 },
            { midi: 53, step: 20, length: 4, velocity: 0.7 },
            { midi: 48, step: 32, length: 4, velocity: 0.85 },
            { midi: 52, step: 32, length: 4, velocity: 0.85 },
            { midi: 55, step: 32, length: 4, velocity: 0.85 },
            { midi: 48, step: 36, length: 4, velocity: 0.7 },
            { midi: 55, step: 48, length: 4, velocity: 0.85 },
            { midi: 59, step: 48, length: 4, velocity: 0.85 },
            { midi: 62, step: 48, length: 4, velocity: 0.85 },
            { midi: 55, step: 52, length: 4, velocity: 0.7 },
          ],
        },
        {
          name: 'House Sub',
          instrumentId: 'sub-commander',
          notes: [
            { midi: 33, step: 0, length: 16, velocity: 0.85 },
            { midi: 33, step: 4, length: 4, velocity: 0.5 },
            { midi: 33, step: 8, length: 4, velocity: 0.5 },
            { midi: 29, step: 16, length: 16, velocity: 0.85 },
            { midi: 29, step: 20, length: 4, velocity: 0.5 },
            { midi: 24, step: 32, length: 16, velocity: 0.85 },
            { midi: 24, step: 36, length: 4, velocity: 0.5 },
            { midi: 31, step: 48, length: 16, velocity: 0.85 },
            { midi: 31, step: 52, length: 4, velocity: 0.5 },
          ],
        },
        {
          name: 'Club Kit',
          instrumentId: 'trap-808-elite',
          notes: [],
          drum: {
            kick: [0, 8, 16, 24, 32, 40, 48, 56],
            snare: [12, 28, 44, 60],
            hat: [4, 6, 12, 14, 20, 22, 28, 30, 36, 38, 44, 46, 52, 54, 60, 62],
          },
        },
      ],
    };
  }

  private drill(): IdeaRecipe {
    return {
      id: 'drill',
      name: 'Block · Drill',
      glyph: '🧊',
      bpm: 142,
      vibe: 'Sliding 808 · Syncopated hats',
      progression: ['i', 'iv', 'VII', 'III'],
      tracks: [
        {
          name: 'Ice Keys',
          instrumentId: 'grand-piano',
          notes: [
            { midi: 53, step: 0, length: 16, velocity: 0.85 },
            { midi: 56, step: 0, length: 16, velocity: 0.78 },
            { midi: 60, step: 0, length: 16, velocity: 0.78 },
            { midi: 51, step: 16, length: 16, velocity: 0.85 },
            { midi: 55, step: 16, length: 16, velocity: 0.78 },
            { midi: 58, step: 16, length: 16, velocity: 0.78 },
            { midi: 50, step: 32, length: 16, velocity: 0.85 },
            { midi: 53, step: 32, length: 16, velocity: 0.78 },
            { midi: 57, step: 32, length: 16, velocity: 0.78 },
            { midi: 55, step: 48, length: 16, velocity: 0.85 },
            { midi: 58, step: 48, length: 16, velocity: 0.78 },
            { midi: 62, step: 48, length: 16, velocity: 0.78 },
          ],
        },
        {
          name: 'Sliding 808',
          instrumentId: 'sub-commander',
          notes: [
            { midi: 29, step: 0, length: 4, velocity: 0.95 },
            { midi: 31, step: 4, length: 4, velocity: 0.85 },
            { midi: 29, step: 8, length: 4, velocity: 0.85 },
            { midi: 26, step: 12, length: 4, velocity: 0.95 },
            { midi: 24, step: 16, length: 16, velocity: 0.95 },
            { midi: 36, step: 24, length: 4, velocity: 0.7 },
            { midi: 31, step: 32, length: 4, velocity: 0.95 },
            { midi: 33, step: 36, length: 4, velocity: 0.85 },
            { midi: 31, step: 40, length: 4, velocity: 0.85 },
            { midi: 27, step: 44, length: 4, velocity: 0.95 },
            { midi: 24, step: 48, length: 16, velocity: 0.95 },
            { midi: 36, step: 56, length: 4, velocity: 0.7 },
          ],
        },
        {
          name: 'Drill Kit',
          instrumentId: 'trap-808-elite',
          notes: [],
          drum: {
            kick: [0, 6, 16, 24, 32, 40, 48, 56],
            snare: [12, 28, 44, 60],
            hat: [2, 4, 6, 8, 10, 12, 14, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 54, 56, 58, 60, 62],
            swing: 0.22,
          },
        },
      ],
    };
  }

  private pop(): IdeaRecipe {
    return {
      id: 'pop',
      name: 'Stadium · Pop',
      glyph: '🏟',
      bpm: 120,
      vibe: 'Four-chord · Anthemic energy',
      progression: ['I', 'V', 'vi', 'IV'],
      tracks: [
        {
          name: 'Acoustic Strum',
          instrumentId: 'strat-elite-clean',
          notes: [
            { midi: 62, step: 0, length: 4, velocity: 0.85 },
            { midi: 66, step: 0, length: 4, velocity: 0.85 },
            { midi: 69, step: 0, length: 4, velocity: 0.85 },
            { midi: 74, step: 0, length: 4, velocity: 0.85 },
            { midi: 62, step: 4, length: 4, velocity: 0.7 },
            { midi: 66, step: 8, length: 4, velocity: 0.7 },
            { midi: 69, step: 8, length: 4, velocity: 0.7 },
            { midi: 62, step: 12, length: 4, velocity: 0.7 },
            { midi: 67, step: 16, length: 4, velocity: 0.85 },
            { midi: 71, step: 16, length: 4, velocity: 0.85 },
            { midi: 74, step: 16, length: 4, velocity: 0.85 },
            { midi: 79, step: 16, length: 4, velocity: 0.85 },
            { midi: 67, step: 20, length: 4, velocity: 0.7 },
            { midi: 71, step: 24, length: 4, velocity: 0.7 },
            { midi: 74, step: 24, length: 4, velocity: 0.7 },
            { midi: 67, step: 28, length: 4, velocity: 0.7 },
            { midi: 64, step: 32, length: 4, velocity: 0.85 },
            { midi: 69, step: 32, length: 4, velocity: 0.85 },
            { midi: 72, step: 32, length: 4, velocity: 0.85 },
            { midi: 76, step: 32, length: 4, velocity: 0.85 },
            { midi: 64, step: 36, length: 4, velocity: 0.7 },
            { midi: 69, step: 40, length: 4, velocity: 0.7 },
            { midi: 72, step: 40, length: 4, velocity: 0.7 },
            { midi: 64, step: 44, length: 4, velocity: 0.7 },
            { midi: 60, step: 48, length: 4, velocity: 0.85 },
            { midi: 64, step: 48, length: 4, velocity: 0.85 },
            { midi: 67, step: 48, length: 4, velocity: 0.85 },
            { midi: 72, step: 48, length: 4, velocity: 0.85 },
            { midi: 60, step: 52, length: 4, velocity: 0.7 },
            { midi: 64, step: 56, length: 4, velocity: 0.7 },
            { midi: 67, step: 56, length: 4, velocity: 0.7 },
            { midi: 60, step: 60, length: 4, velocity: 0.7 },
          ],
        },
        {
          name: 'P-Bass',
          instrumentId: 'p-bass-elite',
          notes: [
            { midi: 38, step: 0, length: 16, velocity: 0.9 },
            { midi: 38, step: 4, length: 4, velocity: 0.6 },
            { midi: 38, step: 8, length: 4, velocity: 0.6 },
            { midi: 38, step: 12, length: 4, velocity: 0.6 },
            { midi: 43, step: 16, length: 16, velocity: 0.9 },
            { midi: 43, step: 20, length: 4, velocity: 0.6 },
            { midi: 40, step: 32, length: 16, velocity: 0.9 },
            { midi: 40, step: 36, length: 4, velocity: 0.6 },
            { midi: 36, step: 48, length: 16, velocity: 0.9 },
            { midi: 36, step: 52, length: 4, velocity: 0.6 },
          ],
        },
        {
          name: 'Pop Kit',
          instrumentId: 'trap-808-elite',
          notes: [],
          drum: {
            kick: [0, 16, 32, 48],
            snare: [8, 24, 40, 56],
            hat: [4, 12, 20, 28, 36, 44, 52, 60],
          },
        },
      ],
    };
  }
}
