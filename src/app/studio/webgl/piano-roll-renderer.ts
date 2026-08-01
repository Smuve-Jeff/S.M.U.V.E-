import { WebGLRenderer, Camera2D, GLColor } from './webgl-renderer';

export interface PianoRollNote {
  id: string;
  midi: number; // 0–127
  step: number; // horizontal position in steps
  length: number; // duration in steps
  velocity: number; // 0–1
  selected: boolean;
  isGhost: boolean;
  isHighlighted: boolean;
  articulation?: string;
  /** FL-style slide note: pitch glides over the note duration. */
  isSlide?: boolean;
  /** Glide target pitch in MIDI (defaults to +2 semitones). */
  slideTarget?: number;
}

const GRID_BAR: GLColor = { r: 0.18, g: 0.22, b: 0.35, a: 0.5 };
const GRID_BEAT: GLColor = { r: 0.12, g: 0.15, b: 0.25, a: 0.3 };
const GRID_STEP: GLColor = { r: 0.08, g: 0.10, b: 0.18, a: 0.15 };
const BLACK_KEY_BG: GLColor = { r: 0.04, g: 0.05, b: 0.10, a: 1.0 };
const WHITE_KEY_BG: GLColor = { r: 0.06, g: 0.08, b: 0.14, a: 1.0 };
const OCTAVE_LINE: GLColor = { r: 0.14, g: 0.17, b: 0.28, a: 0.4 };
const PLAYHEAD_COLOR: GLColor = { r: 1.0, g: 0.85, b: 0.1, a: 0.9 };
const SELECTION_OVERLAY: GLColor = { r: 0.68, g: 0.15, b: 0.95, a: 0.6 };
const HIGHLIGHT_OVERLAY: GLColor = { r: 0.15, g: 0.85, b: 0.95, a: 0.4 };
const GHOST_NOTE_COLOR: GLColor = { r: 0.3, g: 0.32, b: 0.45, a: 0.35 };
const VELOCITY_GRID_BG: GLColor = { r: 0.04, g: 0.06, b: 0.11, a: 1.0 };
const VELOCITY_BAR_COLOR: GLColor = { r: 0.4, g: 0.75, b: 0.5, a: 0.8 };

/** C note MIDI numbers per octave (for octave line positioning) */
const C_NOTES = new Set([
  0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120,
]);

/** Black key MIDI numbers within each octave */
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/** Return true if the MIDI number corresponds to a black piano key */
export function isBlackKeyMidi(midi: number): boolean {
  return BLACK_KEYS.has(midi % 12);
}

export class PianoRollRenderer {
  private readonly renderer: WebGLRenderer;

  /** Pixels per step (derived from zoom) */
  private pixelsPerStep = 32;
  /** Pixels per row (MIDI note) */
  private rowHeight = 22;
  /** Lowest visible MIDI note */
  private midiStart = 0;
  /** Highest visible MIDI note */
  private midiEnd = 127;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
  }

  // ---- Setters ----

  setPixelsPerStep(pps: number): void {
    this.pixelsPerStep = pps;
  }

  setRowHeight(rh: number): void {
    this.rowHeight = rh;
  }

  setMidiRange(start: number, end: number): void {
    this.midiStart = start;
    this.midiEnd = end;
  }

  // ---- Frame ----

  /** Convert MIDI note number to Y position (0 = top of highest note) */
  midiToY(midi: number): number {
    return (this.midiEnd - midi) * this.rowHeight;
  }

  /** Convert step index to X position */
  stepToX(step: number): number {
    return step * this.pixelsPerStep;
  }

  /** Convert Y position to MIDI note */
  yToMidi(y: number): number {
    return this.midiEnd - Math.floor(y / this.rowHeight);
  }

  /** Convert X position to step */
  xToStep(x: number): number {
    return Math.floor(x / this.pixelsPerStep);
  }

  render(
    notes: PianoRollNote[],
    playheadStep: number,
    totalSteps: number,
    camera: Camera2D,
    totalMidiRange: number = 96
  ): void {
    const renderer = this.renderer;
    const bounds = renderer.visibleBounds;
    const gridHeight = totalMidiRange * this.rowHeight;

    // Frustum cull notes
    const visibleNotes = notes.filter((n) => {
      const nx = this.stepToX(n.step);
      const ny = this.midiToY(n.midi);
      return (
        nx + n.length * this.pixelsPerStep >= bounds.left &&
        nx <= bounds.right &&
        ny + this.rowHeight >= bounds.top &&
        ny <= bounds.bottom
      );
    });

    renderer.beginFrame(camera);

    // -- Piano key backgrounds --
    for (let midi = this.midiStart; midi <= this.midiEnd; midi++) {
      const y = this.midiToY(midi);
      if (y + this.rowHeight < bounds.top || y > bounds.bottom) continue;

      if (isBlackKeyMidi(midi)) {
        renderer.drawQuad(0, y, totalSteps * this.pixelsPerStep, this.rowHeight, BLACK_KEY_BG, 0);
      } else {
        renderer.drawQuad(0, y, totalSteps * this.pixelsPerStep, this.rowHeight, WHITE_KEY_BG, 0);
      }

      // Octave separator lines (C notes)
      if (C_NOTES.has(midi)) {
        renderer.drawHLine(y, 0, totalSteps * this.pixelsPerStep, OCTAVE_LINE);
      }
    }

    // -- Grid lines --
    const firstStep = Math.max(0, Math.floor(bounds.left / this.pixelsPerStep));
    const lastStep = Math.min(
      totalSteps,
      Math.ceil(bounds.right / this.pixelsPerStep)
    );

    for (let s = firstStep; s <= lastStep; s++) {
      const x = this.stepToX(s);
      if (s % 16 === 0) {
        // Bar line
        renderer.drawVLine(x, bounds.top, bounds.bottom, GRID_BAR);
      } else if (s % 4 === 0) {
        // Beat line
        renderer.drawVLine(x, bounds.top, bounds.bottom, GRID_BEAT);
      } else {
        // Step line (very subtle)
        renderer.drawVLine(x, bounds.top, bounds.bottom, GRID_STEP);
      }
    }

    // -- Ghost notes (drawn first, behind regular notes) --
    for (const note of visibleNotes) {
      if (!note.isGhost) continue;
      this.drawNoteQuad(renderer, note, GHOST_NOTE_COLOR);
    }

    // -- Regular notes --
    for (const note of visibleNotes) {
      if (note.isGhost) continue;
      const velocity = Math.max(0.1, note.velocity);
      const color = this.velocityColor(velocity);
      this.drawNoteQuad(renderer, note, color);

      // Slide notes: draw a pitch-glide arrow across the note body
      if (note.isSlide) {
        this.drawSlideArrow(renderer, note);
      }

      // Selection / highlight overlays
      if (note.selected) {
        this.drawNoteQuad(renderer, note, SELECTION_OVERLAY);
      } else if (note.isHighlighted) {
        this.drawNoteQuad(renderer, note, HIGHLIGHT_OVERLAY);
      }
    }

    // -- Playhead --
    const px = this.stepToX(playheadStep);
    // Glow
    renderer.drawVLine(px, bounds.top, bounds.bottom, {
      ...PLAYHEAD_COLOR,
      a: 0.2,
    });
    // Core line
    renderer.drawVLine(px, bounds.top, bounds.bottom, PLAYHEAD_COLOR);

    renderer.flush();
  }

  /** Render the velocity lane below the piano roll */
  renderVelocityLane(
    notes: PianoRollNote[],
    selectedNoteVelocities: Map<string, number>,
    playheadStep: number,
    totalSteps: number,
    camera: Camera2D,
    laneHeight: number,
    laneTop: number
  ): void {
    const renderer = this.renderer;
    renderer.beginFrame(camera);

    // Background
    renderer.drawQuad(
      0,
      laneTop,
      totalSteps * this.pixelsPerStep,
      laneHeight,
      VELOCITY_GRID_BG,
      0
    );

    // Grid lines
    const firstStep = Math.max(
      0,
      Math.floor(camera.scrollX / this.pixelsPerStep)
    );
    const lastStep = Math.min(
      totalSteps,
      Math.ceil((camera.scrollX + renderer.visibleBounds.right - renderer.visibleBounds.left) / this.pixelsPerStep)
    );

    for (let s = firstStep; s <= lastStep; s++) {
      const x = this.stepToX(s);
      if (s % 4 === 0) {
        renderer.drawVLine(x, laneTop, laneTop + laneHeight, GRID_BEAT);
      }
    }

    // Velocity bars for each note at its step position
    for (const note of notes) {
      const nx = this.stepToX(note.step);
      if (nx < camera.scrollX - 100 || nx > camera.scrollX + (renderer.visibleBounds.right - renderer.visibleBounds.left) + 100) continue;

      const x = nx;
      const w = Math.max(3, note.length * this.pixelsPerStep - 1);
      const barH = note.velocity * laneHeight * 0.9;
      const barY = laneTop + laneHeight - barH - 2;

      const isSelected = selectedNoteVelocities.has(note.id);
      const color = isSelected
        ? { ...VELOCITY_BAR_COLOR, a: 1.0 }
        : { ...VELOCITY_BAR_COLOR, a: 0.55 + note.velocity * 0.4 };

      renderer.drawQuad(x, barY, w, barH, color, 1);
    }

    // Playhead
    const px = this.stepToX(playheadStep);
    renderer.drawVLine(px, laneTop, laneTop + laneHeight, {
      ...PLAYHEAD_COLOR,
      a: 0.6,
    });

    renderer.flush();
  }

  // ---- Private helpers ----

  private drawNoteQuad(
    renderer: WebGLRenderer,
    note: PianoRollNote,
    color: GLColor
  ): void {
    const x = this.stepToX(note.step);
    const y = this.midiToY(note.midi);
    const w = Math.max(3, note.length * this.pixelsPerStep - 1);
    const h = this.rowHeight - 2;
    const borderRadius = 3;
    renderer.drawQuad(x, y + 1, w, h, color, borderRadius);
  }

  private velocityColor(velocity: number): GLColor {
    // Map velocity to a blue → teal → green gradient
    const t = Math.max(0, Math.min(1, velocity));
    return {
      r: 0.15 + t * 0.1,
      g: 0.25 + t * 0.45,
      b: 0.55 + t * 0.1,
      a: 0.7 + t * 0.3,
    };
  }

  /** Draw an FL-style slide arrow across the note body. */
  private drawSlideArrow(
    renderer: WebGLRenderer,
    note: PianoRollNote
  ): void {
    const x = this.stepToX(note.step);
    const y = this.midiToY(note.midi);
    const w = Math.max(6, note.length * this.pixelsPerStep - 2);
    const h = this.rowHeight - 2;
    const color: GLColor = { r: 1.0, g: 0.45, b: 0.2, a: 0.95 };

    // Diagonal glide line from bottom-left to top-right (pitch rises)
    const x2 = x + w;
    const y1 = y + h - 4;
    const y2 = y + 4;
    renderer.drawLine(x, y1, x2, y2, color);
    // Arrow head
    renderer.drawLine(x2, y2, x2 - 6, y2 + 5, color);
    renderer.drawLine(x2, y2, x2 - 2, y2 + 7, color);
  }
}
