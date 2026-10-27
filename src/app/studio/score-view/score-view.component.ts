import {
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  MusicManagerService,
  TrackNote,
} from "../../services/music-manager.service";

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

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const ACCIDENTALS = new Set([1, 3, 6, 8, 10]);
const STEP_WIDTH = 5.5;
const STAFF_TOP_BY_SEMITONE = 4.5;

/** A note the score editor has selected: its note id plus the owning track. */
export interface ScoreSelection {
  trackId: string;
  noteId: string;
}

/** Editable bounds — a score edit can never write outside MIDI/step range. */
export const SCORE_LIMITS = {
  midiMin: 0,
  midiMax: 127,
  stepMin: 0,
  lengthMin: 1,
  lengthMax: 32,
  velocityMin: 0.05,
  velocityMax: 1,
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

@Component({
  selector: "app-score-view",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./score-view.component.html",
  styleUrls: ["./score-view.component.css", "../shared/platform-ux.css"],
})
export class ScoreViewComponent {
  readonly musicManager = inject(MusicManagerService);
  readonly Math = Math;
  readonly beatsPerBar = 4;
  readonly stepsPerBeat = 4;
  readonly bars = computed(() => {
    const furthestStep = this.musicManager.tracks().reduce(
      (furthest, track) =>
        Math.max(
          furthest,
          (track.notes ?? []).reduce(
            (maxStep, note) => Math.max(maxStep, note.step + note.length),
            0,
          ),
        ),
      0,
    );
    return Math.max(4, Math.ceil(furthestStep / 16));
  });

  readonly staves = computed<ScoreStaff[]>(() =>
    this.musicManager
      .tracks()
      .filter((track) => track.type !== "audio" && track.type !== "bus")
      .map((track) => {
        const notes = [...(track.notes ?? [])]
          .sort((a, b) => a.step - b.step || b.midi - a.midi)
          .map((note) => this.toScoreNote(note));
        const lowest = notes.at(-1);
        const highest = notes[0];
        return {
          id: track.id,
          name: track.name || "Untitled track",
          color: track.color || "#2ba09c",
          notes,
          rests: this.computeRests(notes),
          noteCount: notes.length,
          range:
            notes.length > 0
              ? `${highest?.name}${highest?.octave} – ${lowest?.name}${lowest?.octave}`
              : "Empty staff",
        };
      }),
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
    this.staves().reduce((total, staff) => total + staff.noteCount, 0),
  );

  readonly barColumns = computed(() =>
    Array.from({ length: this.bars() }, (_, index) => index + 1),
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
    if (length >= 16) return "whole";
    if (length >= 8) return "half";
    if (length >= 4) return "quarter";
    if (length >= 2) return "eighth";
    return "sixteenth";
  }

  private toScoreNote(note: TrackNote): ScoreNote {
    const midi = Math.max(0, Math.min(127, Math.round(note.midi)));
    const pitchClass = midi % 12;
    return {
      id: note.id,
      midi,
      name: NOTE_NAMES[pitchClass],
      accidental: ACCIDENTALS.has(pitchClass) ? "♯" : "",
      octave: this.octave(midi),
      duration: this.durationLabel(note.length),
      step: note.step,
      bar: Math.floor(note.step / 16) + 1,
      beat: (Math.floor(note.step) % 16) / 4 + 1,
      left: Math.max(0, note.step) * STEP_WIDTH,
      // The staff is a visual pitch guide; middle C sits in the center.
      staffTop: 50 - (midi - 60) * STAFF_TOP_BY_SEMITONE,
      velocity: Math.round((note.velocity ?? 0.8) * 127),
      velocityOpacity:
        0.45 + Math.min(1, Math.max(0, note.velocity ?? 0.8)) * 0.55,
    };
  }

  // ── Notation editing ──────────────────────────────────────────────────
  // The score used to be read-only ("edit in the Piano Roll"), which made a
  // notation view that could never correct the one wrong note you can see.
  // Every edit writes through MusicManagerService, so it lands in the undo
  // stack and the Piano Roll simultaneously.

  readonly selection = signal<ScoreSelection | null>(null);

  readonly selectedNote = computed<{
    trackId: string;
    trackName: string;
    note: TrackNote;
  } | null>(() => {
    const selection = this.selection();
    if (!selection) return null;
    const track = this.musicManager
      .tracks()
      .find((t) => t.id === selection.trackId);
    const note = track?.notes?.find((n) => n.id === selection.noteId);
    if (!track || !note) return null;
    return { trackId: track.id, trackName: track.name, note };
  });

  readonly selectedPitch = computed(() => {
    const note = this.selectedNote()?.note;
    if (!note) return "";
    return `${this.noteName(note.midi)}${this.octave(note.midi)}`;
  });

  readonly selectedDuration = computed(() => {
    const note = this.selectedNote()?.note;
    return note ? this.durationLabel(note.length) : "";
  });

  readonly selectedVelocity = computed(() =>
    Math.round((this.selectedNote()?.note.velocity ?? 0) * 127),
  );

  readonly selectedPosition = computed(() => {
    const note = this.selectedNote()?.note;
    if (!note) return "";
    const bar = Math.floor(note.step / 16) + 1;
    const beat = (Math.floor(note.step) % 16) / 4 + 1;
    return `${bar}.${beat}`;
  });

  /** Staff colour for the editor strip's identity dot. */
  staffColorFor(trackId: string): string {
    return this.staves().find((staff) => staff.id === trackId)?.color ?? "#2ba09c";
  }

  isSelected(trackId: string, noteId: string): boolean {
    const selection = this.selection();
    return selection?.trackId === trackId && selection.noteId === noteId;
  }

  selectNote(trackId: string, noteId: string, event?: Event) {
    // The staff child components are inside a scroll surface; selecting a
    // note must not also start a drag-scroll on the parent.
    event?.stopPropagation();
    const current = this.selection();
    if (current?.trackId === trackId && current.noteId === noteId) return;
    this.selection.set({ trackId, noteId });
  }

  clearSelection() {
    this.selection.set(null);
  }

  private patchSelected(patch: Partial<TrackNote>): boolean {
    const target = this.selectedNote();
    if (!target) return false;
    this.musicManager.updateNote(target.trackId, target.note.id, patch);
    return true;
  }

  /** Transpose by semitones, clamped to the MIDI range. */
  transpose(semitones: number): boolean {
    const note = this.selectedNote()?.note;
    if (!note) return false;
    const midi = clamp(
      Math.round(note.midi + semitones),
      SCORE_LIMITS.midiMin,
      SCORE_LIMITS.midiMax,
    );
    if (midi === note.midi) return false;
    return this.patchSelected({ midi });
  }

  /** Move the onset on the step grid; never before the first step. */
  nudge(deltaSteps: number): boolean {
    const note = this.selectedNote()?.note;
    if (!note) return false;
    const step = clamp(
      Math.round(note.step + deltaSteps),
      SCORE_LIMITS.stepMin,
      Number.MAX_SAFE_INTEGER,
    );
    if (step === note.step) return false;
    return this.patchSelected({ step });
  }

  /** Change the written length in steps. */
  resize(deltaSteps: number): boolean {
    const note = this.selectedNote()?.note;
    if (!note) return false;
    const length = clamp(
      Math.round(note.length + deltaSteps),
      SCORE_LIMITS.lengthMin,
      SCORE_LIMITS.lengthMax,
    );
    if (length === note.length) return false;
    return this.patchSelected({ length });
  }

  /** Change velocity in 0–127 units; stored as the 0–1 the engine plays. */
  setVelocity(delta: number): boolean {
    const note = this.selectedNote()?.note;
    if (!note) return false;
    const next = clamp(
      Math.round((note.velocity ?? 0.8) * 127 + delta) / 127,
      SCORE_LIMITS.velocityMin,
      SCORE_LIMITS.velocityMax,
    );
    if (Math.abs(next - (note.velocity ?? 0.8)) < 1e-6) return false;
    return this.patchSelected({ velocity: next });
  }

  deleteSelected(): boolean {
    const target = this.selectedNote();
    if (!target) return false;
    this.musicManager.removeNotes(target.trackId, [target.note.id]);
    this.selection.set(null);
    return true;
  }

  /** Halve/double the written length — 2 doubles, 0.5 halves. */
  scaleLength(factor: number): boolean {
    const note = this.selectedNote()?.note;
    if (!note) return false;
    const length = clamp(
      Math.max(1, Math.round(note.length * factor)),
      SCORE_LIMITS.lengthMin,
      SCORE_LIMITS.lengthMax,
    );
    if (length === note.length) return false;
    return this.patchSelected({ length });
  }

  /**
   * Keyboard editing for the selected note. Ignored while a field has focus so
   * typing in the BPM/key fields does not transpose a note, and it never
   * swallows keys the shell owns (Ctrl/Cmd combos) when nothing is selected.
   */
  @HostListener("document:keydown", ["$event"])
  onScoreKeydown(event: KeyboardEvent) {
    if (!this.selectedNote()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        /^(input|textarea|select)$/i.test(target.tagName ?? ""))
    ) {
      return;
    }
    const octave = event.shiftKey ? 12 : 1;
    switch (event.key) {
      case "ArrowUp":
        if (this.transpose(octave)) event.preventDefault();
        return;
      case "ArrowDown":
        if (this.transpose(-octave)) event.preventDefault();
        return;
      case "ArrowRight":
        if (this.nudge(event.shiftKey ? 16 : 1)) event.preventDefault();
        return;
      case "ArrowLeft":
        if (this.nudge(event.shiftKey ? -16 : -1)) event.preventDefault();
        return;
      case "[":
        if (this.resize(-1)) event.preventDefault();
        return;
      case "]":
        if (this.resize(1)) event.preventDefault();
        return;
      case "Delete":
      case "Backspace":
        if (this.deleteSelected()) event.preventDefault();
        return;
      case "Escape":
        this.clearSelection();
        return;
      default:
        return;
    }
  }
}
