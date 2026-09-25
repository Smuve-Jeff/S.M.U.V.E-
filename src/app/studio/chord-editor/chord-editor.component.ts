import {
  Component,
  inject,
  signal,
  computed,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service'; // Re-use for tempo
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';
import { MusicManagerService } from '../../services/music-manager.service';

export interface ChordProgressionItem {
  /** Chord root as scale degree, e.g. 'I', 'ii', 'IV', 'V7' */
  label: string;
  /** MIDI root note (C4 = 60) */
  rootMidi: number;
  /** Intervals from root (semitone offsets) */
  intervals: number[];
  /** Chord quality description */
  quality: string;
}

@Component({
  selector: 'app-chord-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chord-editor studio-workspace-surface chord-editor-surface">
      <!-- Header -->
      <div class="ce-header studio-context-toolbar">
        <div class="ce-title-row">
          <span class="material-symbols-outlined">music_note</span>
          <span>CHORD EDITOR</span>
        </div>
        <span class="ce-badge" [style.background]="'var(--teal-500, #0E7C7B)'"
          >{{ progression().length }} chords</span
        >
      </div>

      <!-- Key & Scale Selector -->
      <div class="ce-section">
        <div class="ce-inline-group">
          <label class="ce-label">Key</label>
          <select
            [(ngModel)]="selectedRoot"
            (change)="recalculateProgression()"
            class="ce-select"
          >
            <option *ngFor="let k of roots" [value]="k">{{ k }}</option>
          </select>
          <label class="ce-label">Mode</label>
          <select
            [(ngModel)]="selectedMode"
            (change)="recalculateProgression()"
            class="ce-select"
          >
            <option *ngFor="let m of modes" [value]="m">
              {{ m | titlecase }}
            </option>
          </select>
        </div>
      </div>

      <!-- Chord Type Palette -->
      <div class="ce-section">
        <div class="ce-label">Chord Types</div>
        <div class="ce-chips">
          <button
            *ngFor="let ct of chordTypes"
            class="ce-chip"
            [class.ce-chip-active]="selectedType() === ct.value"
            (click)="selectedType.set(ct.value)"
            [title]="ct.intervals.map((i) => '+' + i + ' semitones').join(', ')"
          >
            {{ ct.label }}
          </button>
        </div>
      </div>

      <!-- Voicing -->
      <div class="ce-section">
        <div class="ce-label">Voicing</div>
        <div class="ce-chips">
          <button
            *ngFor="let v of voicings"
            class="ce-chip"
            [class.ce-chip-active]="voicing() === v.value"
            (click)="voicing.set(v.value)"
          >
            {{ v.label }}
          </button>
        </div>
      </div>

      <!-- Progression Grid (drag-to-arrange) -->
      <div class="ce-section">
        <div class="ce-label-row">
          <span class="ce-label">Progression</span>
          <div class="ce-actions">
            <button
              class="ce-action-btn"
              (click)="addChord()"
              title="Add chord"
            >
              + Add
            </button>
            <button
              class="ce-action-btn"
              (click)="clearAll()"
              title="Clear all"
            >
              Clear
            </button>
          </div>
        </div>
        <div
          class="ce-progression studio-module-scroll"
          cdkDropList
          (cdkDropListDropped)="dropChord($event)"
        >
          <div
            *ngFor="let chord of progression(); let i = index"
            class="ce-chord-card"
            cdkDrag
            [style.border-left]="'3px solid ' + chordColor(i)"
          >
            <div class="ce-chord-main">
              <span class="ce-chord-label">{{ chord.label }}</span>
              <span class="ce-chord-quality">{{ chord.quality }}</span>
            </div>
            <div class="ce-chord-keys">
              <span
                *ngFor="let n of getChordNoteNames(chord)"
                class="ce-key-dot"
                [title]="n"
                >{{ n }}</span
              >
            </div>
            <div class="ce-chord-actions">
              <button
                class="ce-icon-btn-sm"
                (click)="removeChord(i)"
                title="Remove chord"
              >
                ✕
              </button>
              <button
                class="ce-icon-btn-sm"
                (click)="applyChordToPianoRoll(chord, i)"
                title="Stamp notes in Piano Roll"
              >
                🎹
              </button>
            </div>
          </div>
        </div>
        <div
          class="ce-empty-state studio-empty-state"
          *ngIf="progression().length === 0"
        >
          <span>No chords yet — tap "+ Add" to build a progression</span>
        </div>
      </div>

      <!-- Quick Presets -->
      <div class="ce-section">
        <div class="ce-label">Quick Progressions</div>
        <div class="ce-chips">
          <button
            *ngFor="let preset of presets"
            class="ce-chip ce-chip-preset"
            (click)="loadPreset(preset.chords)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- Piano Preview -->
      <div class="ce-section ce-piano-section">
        <div class="ce-label">Preview</div>
        <div class="ce-piano" *ngIf="previewNotes().length > 0">
          <canvas
            #pianoCanvas
            class="ce-piano-canvas"
            width="320"
            height="60"
          ></canvas>
          <div class="ce-piano-notes">
            <span
              *ngFor="let n of previewNotes()"
              class="ce-preview-note"
              [style.color]="noteColor(n)"
              >{{ midiToNoteName(n) }}</span
            >
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
      }
      .chord-editor {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ce-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        background: var(--ivory-panel, #14192e);
        border-radius: 8px;
      }
      .ce-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 800;
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .ce-badge {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 20px;
        color: #fff;
      }
      .ce-section {
        background: var(--ivory-panel, #14192e);
        border-radius: 8px;
        padding: 8px;
      }
      .ce-inline-group {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .ce-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--espresso-muted, #94a3c8);
      }
      .ce-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .ce-select {
        background: var(--ivory-bg, #0d1120);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        color: var(--espresso-text, #e2e8f0);
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 600;
        min-width: 48px;
      }
      .ce-chips {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .ce-chip {
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: transparent;
        color: var(--espresso-muted, #94a3c8);
        font-size: 9px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
        letter-spacing: 0.04em;
      }
      .ce-chip:hover {
        background: rgba(14, 124, 123, 0.15);
        color: #fff;
      }
      .ce-chip-active {
        background: var(--teal-500, #0e7c7b);
        color: #fff;
        border-color: var(--teal-500, #0e7c7b);
      }
      .ce-chip-preset {
        background: rgba(217, 119, 6, 0.12);
        border-color: rgba(217, 119, 6, 0.3);
        color: #f59e0b;
      }
      .ce-chip-preset:hover {
        background: rgba(217, 119, 6, 0.25);
      }
      .ce-actions {
        display: flex;
        gap: 4px;
      }
      .ce-action-btn {
        padding: 3px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: transparent;
        color: var(--teal-400, #2ba09c);
        font-size: 9px;
        font-weight: 700;
        cursor: pointer;
      }
      .ce-action-btn:hover {
        background: rgba(14, 124, 123, 0.15);
      }
      .ce-progression {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 200px;
        overflow-y: auto;
      }
      .ce-chord-card {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
        cursor: grab;
        transition: background 0.15s;
      }
      .ce-chord-card:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .ce-chord-main {
        display: flex;
        flex-direction: column;
        min-width: 48px;
      }
      .ce-chord-label {
        font-size: 12px;
        font-weight: 800;
      }
      .ce-chord-quality {
        font-size: 8px;
        color: var(--espresso-muted, #94a3c8);
      }
      .ce-chord-keys {
        display: flex;
        gap: 2px;
        flex: 1;
        flex-wrap: wrap;
      }
      .ce-key-dot {
        font-size: 8px;
        font-weight: 600;
        padding: 1px 3px;
        border-radius: 3px;
        background: rgba(14, 124, 123, 0.12);
        color: var(--teal-300, #5dc4c2);
      }
      .ce-chord-actions {
        display: flex;
        gap: 2px;
      }
      .ce-icon-btn-sm {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: var(--espresso-muted, #94a3c8);
        font-size: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ce-icon-btn-sm:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
      .ce-empty-state {
        text-align: center;
        padding: 16px;
        font-size: 10px;
        color: var(--espresso-muted, #94a3c8);
        font-style: italic;
      }
      .ce-piano-section {
      }
      .ce-piano {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ce-piano-canvas {
        width: 100%;
        height: 60px;
        border-radius: 6px;
        background: #0d1120;
      }
      .ce-piano-notes {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .ce-preview-note {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 5px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.04);
      }

      /* COMPONENT CONTRACT — Chord Editor */
      :host {
        --ce-canvas: var(--ivory-bg, #f5efe0);
        --ce-surface: var(--ivory-paper, #fbf7ec);
        --ce-panel: var(--ivory-panel, #fffaf0);
        --ce-ink: var(--espresso-text, #1f1a12);
        --ce-muted: var(--espresso-muted, #7e7259);
        --ce-line: var(--espresso-line, rgba(61, 53, 42, 0.14));
        --ce-teal: var(--teal-500, #0e7c7b);
        --ce-amber: var(--neon-amber, #d97706);
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        background: transparent;
        color: var(--ce-ink);
      }
      .chord-editor {
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: auto;
        overscroll-behavior: contain;
        padding: clamp(10px, 1.6vw, 16px);
        gap: 12px;
        border: 1px solid var(--ce-line);
        border-radius: 16px;
        box-shadow: 0 14px 32px rgba(61, 53, 42, 0.1);
        background:
          radial-gradient(80% 30% at 96% 0%, color-mix(in srgb, var(--ce-teal) 8%, transparent), transparent 72%),
          var(--ce-canvas);
      }
      .ce-header {
        min-height: 56px;
        padding: 10px 12px;
        border: 1px solid var(--ce-line);
        border-radius: 12px;
        background: color-mix(in srgb, var(--ce-surface) 94%, transparent);
        box-shadow: 0 4px 14px rgba(61, 53, 42, 0.05);
      }
      .ce-title-row {
        color: var(--ce-teal);
        letter-spacing: 0.14em;
      }
      .ce-badge {
        min-height: 28px;
        display: inline-flex;
        align-items: center;
        border: 1px solid color-mix(in srgb, var(--ce-teal) 28%, var(--ce-line));
        background: color-mix(in srgb, var(--ce-teal) 10%, var(--ce-panel)) !important;
        color: var(--ce-teal) !important;
      }
      .ce-section {
        padding: 12px;
        border: 1px solid var(--ce-line);
        border-radius: 12px;
        background: color-mix(in srgb, var(--ce-panel) 88%, transparent);
        box-shadow: 0 3px 12px rgba(61, 53, 42, 0.04);
      }
      .ce-inline-group {
        gap: 8px;
      }
      .ce-label {
        color: var(--ce-muted);
      }
      .ce-select {
        min-height: 44px;
        padding: 0 10px;
        border-color: var(--ce-line);
        background: color-mix(in srgb, var(--ce-surface) 84%, transparent);
        color: var(--ce-ink);
      }
      .ce-chips {
        gap: 7px;
      }
      .ce-chip,
      .ce-action-btn {
        min-height: 44px;
        padding: 0 11px;
        border-color: var(--ce-line);
        border-radius: 8px;
        background: color-mix(in srgb, var(--ce-surface) 74%, transparent);
        color: var(--ce-muted);
        touch-action: manipulation;
      }
      .ce-chip:hover,
      .ce-chip:focus-visible,
      .ce-action-btn:hover,
      .ce-action-btn:focus-visible {
        border-color: var(--ce-teal);
        background: color-mix(in srgb, var(--ce-teal) 9%, var(--ce-surface));
        color: var(--ce-ink);
      }
      .ce-chip-active {
        border-color: var(--ce-teal);
        background: var(--ce-teal);
        color: var(--ivory-deep, #06091a);
      }
      .ce-chip-preset {
        border-color: color-mix(in srgb, var(--ce-amber) 32%, var(--ce-line));
        background: color-mix(in srgb, var(--ce-amber) 9%, var(--ce-surface));
        color: var(--ce-amber);
      }
      .ce-progression {
        min-height: 0;
        max-height: min(220px, 34vh);
        padding-right: 3px;
        gap: 7px;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--ce-teal) transparent;
      }
      .ce-chord-card {
        min-height: 54px;
        padding: 7px 8px;
        border: 1px solid var(--ce-line);
        background: color-mix(in srgb, var(--ce-surface) 76%, transparent);
        touch-action: none;
      }
      .ce-chord-card:hover {
        border-color: color-mix(in srgb, var(--ce-teal) 48%, var(--ce-line));
        background: color-mix(in srgb, var(--ce-teal) 7%, var(--ce-surface));
      }
      .ce-chord-quality,
      .ce-empty-state {
        color: var(--ce-muted);
      }
      .ce-key-dot {
        color: var(--ce-teal);
        background: color-mix(in srgb, var(--ce-teal) 12%, var(--ce-panel));
      }
      .ce-icon-btn-sm {
        width: 44px;
        height: 44px;
        min-width: 44px;
        min-height: 44px;
        color: var(--ce-muted);
        touch-action: manipulation;
      }
      .ce-icon-btn-sm:hover,
      .ce-icon-btn-sm:focus-visible {
        background: color-mix(in srgb, var(--ce-teal) 12%, var(--ce-panel));
        color: var(--ce-teal);
      }
      .ce-empty-state {
        min-height: 80px;
        display: grid;
        place-items: center;
      }
      .ce-piano {
        padding: 8px;
        border: 1px solid var(--ce-line);
        border-radius: 9px;
        background: color-mix(in srgb, var(--ce-surface) 72%, transparent);
      }
      .ce-piano-canvas {
        border: 1px solid color-mix(in srgb, var(--ce-teal) 20%, var(--ce-line));
        background: #0d1120;
      }
      @media (max-width: 700px) {
        .chord-editor {
          padding: 10px;
          gap: 9px;
        }
        .ce-header {
          min-height: 48px;
          padding: 8px 10px;
        }
        .ce-section {
          padding: 10px;
        }
      }
      @media (max-width: 932px) and (orientation: landscape) {
        .chord-editor {
          padding: 8px 10px;
          gap: 7px;
        }
        .ce-header {
          min-height: 44px;
          padding-block: 6px;
        }
        .ce-section {
          padding: 8px;
        }
        .ce-progression {
          max-height: 150px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ce-chip,
        .ce-action-btn,
        .ce-chord-card {
          transition: none;
        }
      }

      /* Desktop portrait/narrow workspaces keep the editor in one bounded
         scroll surface with compact controls and a deliberate chord list. */
      @media (min-width: 1025px) and (orientation: portrait),
        (min-width: 1025px) and (max-width: 1280px) {
        .chord-editor {
          padding: 9px;
          gap: 8px;
        }
        .ce-header {
          min-height: 48px;
          padding: 7px 9px;
        }
        .ce-section {
          padding: 9px;
        }
        .ce-progression {
          max-height: min(180px, 28vh);
        }
        .ce-chord-card {
          min-height: 48px;
        }
      }

      @media (min-width: 1025px) and (orientation: landscape) and (max-height: 880px) {
        .chord-editor {
          padding: 7px 9px;
          gap: 6px;
        }
        .ce-header {
          min-height: 44px;
          padding-block: 5px;
        }
        .ce-section {
          padding: 7px 8px;
        }
        .ce-progression {
          max-height: 130px;
        }
        .ce-chord-card {
          min-height: 44px;
          padding-block: 5px;
        }
        .ce-icon-btn-sm {
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
        }
      }
    `,
  ],
})
export class ChordEditorComponent {
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);
  private musicManager = inject(MusicManagerService);

  @Output() navigateToPianoRoll = new EventEmitter<void>();

  // ── State ──────────────────────────────────────────────
  selectedRoot = 'C';
  selectedMode = 'major';
  selectedType = signal<
    'maj' | 'min' | 'dom7' | 'maj7' | 'min7' | 'sus4' | 'dim' | 'aug'
  >('maj');
  voicing = signal<'close' | 'open' | 'wide'>('close');

  progression = signal<ChordProgressionItem[]>([]);

  roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  modes = ['major', 'minor', 'dorian', 'mixolydian', 'blues'];

  chordTypes = [
    { label: 'Maj', value: 'maj' as const, intervals: [0, 4, 7] },
    { label: 'Min', value: 'min' as const, intervals: [0, 3, 7] },
    { label: '7', value: 'dom7' as const, intervals: [0, 4, 7, 10] },
    { label: 'M7', value: 'maj7' as const, intervals: [0, 4, 7, 11] },
    { label: 'm7', value: 'min7' as const, intervals: [0, 3, 7, 10] },
    { label: 'sus4', value: 'sus4' as const, intervals: [0, 5, 7] },
    { label: 'dim', value: 'dim' as const, intervals: [0, 3, 6] },
    { label: 'aug', value: 'aug' as const, intervals: [0, 4, 8] },
  ];

  voicings = [
    { label: 'Close', value: 'close' as const },
    { label: 'Open', value: 'open' as const },
    { label: 'Wide', value: 'wide' as const },
  ];

  presets = [
    { label: 'Pop I–V–vi–IV', chords: ['C', 'G', 'Am', 'F'] },
    { label: '50s I–vi–IV–V', chords: ['C', 'Am', 'F', 'G'] },
    { label: 'Rock I–IV–V', chords: ['C', 'F', 'G'] },
    { label: 'Neo-Soul i–VII–VI–V', chords: ['Am', 'G', 'F', 'E'] },
    { label: 'Minor i–iv–VII–III', chords: ['Am', 'Dm', 'G', 'C'] },
    { label: 'Lofi i–III–VII–VI', chords: ['Am', 'C', 'G', 'F'] },
    { label: 'Jazz ii–V–I', chords: ['Dm', 'G', 'C'] },
    { label: 'Trap i–VII–VI', chords: ['Am', 'G', 'F'] },
    { label: 'Deep House I–IV–V–IV', chords: ['C', 'F', 'G', 'F'] },
  ];

  // ── Computed preview notes from progression ────────────
  previewNotes = computed(() => {
    const prog = this.progression();
    if (prog.length === 0) return [];
    const first = prog[0];
    return this.applyVoicing(first.intervals, first.rootMidi);
  });

  // ── MIDI helpers ───────────────────────────────────────
  private MIDI_NAMES = [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B',
  ];

  midiToNoteName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    return this.MIDI_NAMES[midi % 12] + octave;
  }

  noteColor(midi: number): string {
    const note = midi % 12;
    const colors = [
      '#E11D48',
      '#F97316',
      '#EAB308',
      '#84CC16',
      '#10B981',
      '#14B8A6',
      '#0E7C7B',
      '#2BA09C',
      '#5DC4C2',
      '#8B5CF6',
      '#A855F7',
      '#EC4899',
    ];
    return colors[note];
  }

  chordColor(index: number): string {
    const colors = [
      '#0E7C7B',
      '#5DC4C2',
      '#EAB308',
      '#F97316',
      '#A855F7',
      '#EC4899',
      '#10B981',
      '#8B5CF6',
    ];
    return colors[index % colors.length];
  }

  rootToMidi(root: string): number {
    const idx = this.MIDI_NAMES.indexOf(root);
    if (idx < 0) return 60; // default C4
    return 60 + idx; // C4 base
  }

  // ── Voicing logic ──────────────────────────────────────
  private applyVoicing(intervals: number[], rootMidi: number): number[] {
    const base = intervals.map((i) => rootMidi + i);
    switch (this.voicing()) {
      case 'close':
        return base;
      case 'open':
        if (base.length < 3) return base;
        return [
          base[0],
          ...base.slice(1, -1).map((n) => n + 12),
          base[base.length - 1],
        ];
      case 'wide':
        if (base.length < 3) return base;
        return [
          base[0],
          base[2] - 12,
          ...base
            .slice(1)
            .filter((_, i) => i !== 1)
            .map((n) => n + 12),
        ];
      default:
        return base;
    }
  }

  // ── Actions ────────────────────────────────────────────
  addChord() {
    const rootMidi = this.rootToMidi(this.selectedRoot);
    const type = this.chordTypes.find((t) => t.value === this.selectedType());
    if (!type) return;

    const qualityLabel = type.label;
    const intervals = type.intervals;
    const label = `${this.selectedRoot}${qualityLabel}`;

    this.progression.update((p) => [
      ...p,
      {
        label,
        rootMidi,
        intervals,
        quality: qualityLabel,
      },
    ]);
    this.haptic.light();
  }

  removeChord(index: number) {
    this.progression.update((p) => p.filter((_, i) => i !== index));
    this.haptic.light();
  }

  clearAll() {
    this.progression.set([]);
    this.haptic.light();
  }

  recalculateProgression() {
    // Re-root existing progression items to the new key
    // (Simplified — just updates the root MIDI for new chords)
    this.snackbar.info(`Key: ${this.selectedRoot} ${this.selectedMode}`);
  }

  loadPreset(chords: string[]) {
    const newProg: ChordProgressionItem[] = chords
      .map((ch) => {
        // Parse chord root and quality
        const match = ch.match(/^([A-G][b#]?)(.*)$/);
        if (!match) return null;
        const rootName = match[1];
        const qual = match[2] || '';
        const rootMidi = this.rootToMidi(rootName);
        const type = this.chordTypes.find((t) => {
          if (!qual) return t.value === 'maj';
          const q = qual.replace('m', 'min').replace('dim', 'dim');
          return t.label.toLowerCase() === q.toLowerCase() || t.value === q;
        });
        const intervals = type?.intervals || [0, 4, 7];
        return {
          label: ch,
          rootMidi,
          intervals,
          quality: qual || 'maj',
        };
      })
      .filter((x): x is ChordProgressionItem => x !== null);

    this.progression.set(newProg);
    this.haptic.medium();
    this.snackbar.success(`Loaded ${newProg.length}-chord progression`);
  }

  getChordNoteNames(chord: ChordProgressionItem): string[] {
    return this.applyVoicing(chord.intervals, chord.rootMidi).map((n) =>
      this.midiToNoteName(n)
    );
  }

  applyChordToPianoRoll(chord: ChordProgressionItem, index: number) {
    this.haptic.light();
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) {
      this.snackbar.info('Select a track in Piano Roll first');
      this.navigateToPianoRoll.emit();
      return;
    }
    const notes = this.applyVoicing(chord.intervals, chord.rootMidi);
    notes.forEach((midi, i) => {
      this.musicManager.addNoteToTrack(trackId, {
        id: `chord-editor-${Date.now()}-${i}`,
        midi,
        step: index * 4 + i, // Spread across the bar
        length: 4,
        velocity: i === 0 ? 0.9 : 0.75,
      });
    });
    this.snackbar.success(`Stamped ${chord.label} (${notes.length} notes)`);
    this.navigateToPianoRoll.emit();
  }

  // Drag-and-drop (placeholder — real CDK would use DragDropModule)
  dropChord(event: any) {
    // Simplified reorder — in production use @angular/cdk/drag-drop
    if (
      event?.previousIndex !== undefined &&
      event?.currentIndex !== undefined
    ) {
      const items = [...this.progression()];
      const [moved] = items.splice(event.previousIndex, 1);
      items.splice(event.currentIndex, 0, moved);
      this.progression.set(items);
    }
  }
}
