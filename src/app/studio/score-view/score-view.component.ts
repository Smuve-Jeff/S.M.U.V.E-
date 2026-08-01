import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';

export interface ScoreNote {
  id: string;
  midi: number;
  name: string;
  accidental: string;
  octave: number;
  duration: string;
  step: number;
  bar: number;
  beat: number;
  left: number;
  staffTop: number;
  velocity: number;
  /** 0.45 (quiet) → 1 (loud) — drives note-head shading. */
  velocityOpacity: number;
}

/** Sprint A5 — a rest drawn on the beat grid where no note sounds. */
export interface ScoreRest {
  id: string;
  /** 1-based bar the rest falls in. */
  bar: number;
  /** Horizontal offset from the staff origin (steps). */
  left: number;
  /** Staff-relative vertical center (middle of the staff). */
  staffTop: number;
}

export interface ScoreStaff {
  id: string;
  name: string;
  color: string;
  notes: ScoreNote[];
  rests: ScoreRest[];
  noteCount: number;
  range: string;
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const ACCIDENTALS = new Set([1, 3, 6, 8, 10]);
const STEP_WIDTH = 5.5;
const STAFF_TOP_BY_SEMITONE = 4.5;

@Component({
  selector: 'app-score-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './score-view.component.html',
  styleUrls: ['./score-view.component.css'],
})
export class ScoreViewComponent {
  readonly musicManager = inject(MusicManagerService);
  readonly Math = Math;
  readonly beatsPerBar = 4;
  readonly stepsPerBeat = 4;
  readonly bars = computed(() => {
    const furthestStep = this.musicManager
      .tracks()
      .reduce(
        (furthest, track) =>
          Math.max(
            furthest,
            (track.notes ?? []).reduce(
              (maxStep, note) => Math.max(maxStep, note.step + note.length),
              0
            )
          ),
        0
      );
    return Math.max(4, Math.ceil(furthestStep / 16));
  });

  readonly staves = computed<ScoreStaff[]>(() =>
    this.musicManager
      .tracks()
      .filter((track) => track.type !== 'audio' && track.type !== 'bus')
      .map((track) => {
        const notes = [...(track.notes ?? [])]
          .sort((a, b) => a.step - b.step || b.midi - a.midi)
          .map((note) => this.toScoreNote(note));
        const lowest = notes.at(-1);
        const highest = notes[0];
        return {
          id: track.id,
          name: track.name || 'Untitled track',
          color: track.color || '#2ba09c',
          notes,
          rests: this.computeRests(notes),
          noteCount: notes.length,
          range:
            notes.length > 0
              ? `${highest?.name}${highest?.octave} – ${lowest?.name}${lowest?.octave}`
              : 'Empty staff',
        };
      })
  );

  /**
   * Sprint A5 — rests on the quarter-note grid: any beat in a bar that has at
   * least one note but no note *onset* gets a rest glyph. Bars with no notes at
   * all are skipped (they read as empty measures, not rest spam).
   */
  private computeRests(notes: ScoreNote[]): ScoreRest[] {
    const rests: ScoreRest[] = [];
    const byBar = new Map<number, ScoreNote[]>();
    for (const note of notes) {
      const list = byBar.get(note.bar) ?? [];
      list.push(note);
      byBar.set(note.bar, list);
    }
    const BEATS = [0, 4, 8, 12];
    for (const [bar, barNotes] of byBar) {
      if (barNotes.length === 0) continue;
      const occupied = new Set(barNotes.map((n) => Math.floor(n.step) % 16));
      for (const beat of BEATS) {
        if (!occupied.has(beat)) {
          rests.push({
            id: `rest_${bar}_${beat}`,
            bar,
            left: ((bar - 1) * 16 + beat) * STEP_WIDTH,
            staffTop: 50,
          });
        }
      }
    }
    return rests;
  }

  readonly totalNotes = computed(() =>
    this.staves().reduce((total, staff) => total + staff.noteCount, 0)
  );

  readonly barColumns = computed(() =>
    Array.from({ length: this.bars() }, (_, index) => index + 1)
  );

  noteName(midi: number): string {
    return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12];
  }

  octave(midi: number): number {
    return Math.floor(Math.round(midi) / 12) - 1;
  }

  isAccidental(midi: number): boolean {
    return ACCIDENTALS.has(((Math.round(midi) % 12) + 12) % 12);
  }

  durationLabel(length: number): string {
    if (length >= 16) return 'whole';
    if (length >= 8) return 'half';
    if (length >= 4) return 'quarter';
    if (length >= 2) return 'eighth';
    return 'sixteenth';
  }

  private toScoreNote(note: TrackNote): ScoreNote {
    const midi = Math.max(0, Math.min(127, Math.round(note.midi)));
    const pitchClass = midi % 12;
    return {
      id: note.id,
      midi,
      name: NOTE_NAMES[pitchClass],
      accidental: ACCIDENTALS.has(pitchClass) ? '♯' : '',
      octave: this.octave(midi),
      duration: this.durationLabel(note.length),
      step: note.step,
      bar: Math.floor(note.step / 16) + 1,
      beat: (Math.floor(note.step) % 16) / 4 + 1,
      left: Math.max(0, note.step) * STEP_WIDTH,
      // The staff is a visual pitch guide; middle C sits in the center.
      staffTop: 50 - (midi - 60) * STAFF_TOP_BY_SEMITONE,
      velocity: Math.round((note.velocity ?? 0.8) * 127),
      velocityOpacity: 0.45 + Math.min(1, Math.max(0, note.velocity ?? 0.8)) * 0.55,
    };
  }
}
