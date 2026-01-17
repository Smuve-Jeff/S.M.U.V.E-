import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
  ElementRef,
} from '@angular/core';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { InstrumentsService } from '../../services/instruments.service';
import { AiService } from '../../services/ai.service';
import { FormsModule } from '@angular/forms';

const BASE_MIDI = 60; // C4
const OCTAVES = 3;

@Component({
  selector: 'app-piano-roll',
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  standalone: true,
})
export class PianoRollComponent {
  private music = inject(MusicManagerService);
  private instrumentsSvc = inject(InstrumentsService);
  private elementRef = inject(ElementRef);
  private aiService = inject(AiService);

  // UI state
  bpm = signal(this.music.engine.tempo());
  isPlaying = computed(() => this.music.engine.isPlaying());
  currentStep = computed(() => this.music.currentStep());
  zoomX = signal(1);
  steps = signal(16); // Dynamic steps
  stepsArray = computed(() =>
    Array.from({ length: this.steps() }, (_, i) => i)
  );
  melodyPrompt = signal('');

  // Notes grid
  midiRows = Array.from(
    { length: OCTAVES * 12 },
    (_, i) => BASE_MIDI + (OCTAVES * 12 - 1 - i)
  );

  // Instruments list
  instrumentOptions = computed(() =>
    this.instrumentsSvc.getPresets().map((p) => ({ id: p.id, name: p.name }))
  );
  selectedTrackId = computed(() => this.music.selectedTrackId());
  selectedTrack = computed(
    () =>
      this.music.tracks().find((t) => t.id === this.selectedTrackId()) ||
      this.music.tracks()[0]
  );
  selectedInstrumentId = computed(
    () => this.selectedTrack()?.instrumentId || this.instrumentOptions()[0]?.id
  );

  // Sequence view computed from track notes
  sequenceFor(midi: number): boolean[] {
    const t = this.selectedTrack();
    const arr = Array(this.steps()).fill(false) as boolean[];
    if (!t) return arr;
    for (const n of t.notes) {
      if (n.midi === midi && n.step >= 0 && n.step < this.steps())
        arr[n.step] = true;
    }
    return arr;
  }

  velocityForStep(step: number): number {
    const note = this.noteAt(step);
    return note ? note.velocity : 0;
  }

  async togglePlay() {
    if (this.isPlaying()) this.music.stop();
    else this.music.play();
  }

  resetSequence() {
    const id = this.selectedTrackId();
    if (id != null) this.music.clearTrack(id);
  }

  async generateMelody() {
    const prompt = this.melodyPrompt();
    if (!prompt) return;

    const notes = await this.aiService.generateMusic(prompt);
    const trackId = this.selectedTrackId();
    if (notes && trackId != null) {
      this.music.clearTrack(trackId);
      for (const note of notes) {
        this.music.addNote(
          trackId,
          note.midi,
          note.step,
          note.length,
          note.velocity
        );
      }
    }
  }

  onBpmChange(event: Event) {
    const v = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(v)) {
      this.bpm.set(v);
      this.music.setTempo(v);
    }
  }

  onStepsChange(event: Event) {
    const v = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(v) && v > 0) {
      this.steps.set(v);
      this.music.setLoop(0, v);
    }
  }

  onInstrumentChange(event: Event) {
    const newInstId = (event.target as HTMLSelectElement).value;
    const trackId = this.selectedTrackId();
    if (newInstId && trackId) {
      this.music.setInstrument(trackId, newInstId);
    }
  }

  toggleNote(midi: number, step: number) {
    const id = this.selectedTrackId();
    if (id == null) return;

    const noteAtStep = this.noteAt(step);

    // If there's a note at the same pitch, remove it.
    if (noteAtStep?.midi === midi) {
      this.music.removeNote(id, midi, step);
      return;
    }

    // If there's a note at a different pitch, remove it before adding the new one.
    if (noteAtStep) {
      this.music.removeNote(id, noteAtStep.midi, step);
    }

    // Add the new note.
    this.music.addNote(id, midi, step, 1, 0.9);
  }

  onVelocityMouseDown(event: MouseEvent) {
    const handler = (e: MouseEvent) => this.handleVelocityDrag(e);
    const endDrag = () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('mouseup', endDrag);
    };

    window.addEventListener('mousemove', handler);
    window.addEventListener('mouseup', endDrag);

    this.handleVelocityDrag(event); // Handle initial click
  }

  private handleVelocityDrag(event: MouseEvent) {
    const trackId = this.selectedTrackId();
    if (!trackId) return;

    const lane = (event.currentTarget as HTMLElement).querySelector('.lane');
    if (!lane) return;

    const rect = lane.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const step = Math.floor(x / (rect.width / this.steps()));
    const velocity = Math.max(0, Math.min(1, 1 - y / rect.height));

    const note = this.noteAt(step);
    if (note) {
      this.music.updateNoteVelocity(trackId, note.midi, step, velocity);
    }
  }

  private noteAt(step: number): TrackNote | undefined {
    const t = this.selectedTrack();
    if (!t) return undefined;
    return t.notes.find((n) => n.step === step);
  }

  trackName() {
    return this.selectedTrack()?.name || 'Track';
  }

  midiName(midi: number) {
    const NAMES = [
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
    const name = NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }
}
