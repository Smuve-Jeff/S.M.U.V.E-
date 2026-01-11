import { Component, ChangeDetectionStrategy, computed, effect, inject, signal } from '@angular/core';
import { MusicManagerService } from '../../services/music-manager.service';
import { InstrumentsService } from '../../services/instruments.service';

const BASE_MIDI = 60; // C4
const OCTAVES = 3;

@Component({
  selector: 'app-piano-roll',
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoRollComponent {
  private music = inject(MusicManagerService);
  private instrumentsSvc = inject(InstrumentsService);

  // UI state
  bpm = signal(this.music.engine.tempo());
  isPlaying = computed(() => this.music.engine.isPlaying());
  currentStep = computed(() => this.music.currentStep());
  zoomX = signal(1);
  steps = signal(16); // Dynamic steps
  stepsArray = computed(() => Array.from({ length: this.steps() }, (_, i) => i));

  // Notes grid
  midiRows = Array.from({ length: OCTAVES * 12 }, (_, i) => BASE_MIDI + (OCTAVES * 12 - 1 - i));

  // Instruments list
  instrumentOptions = computed(() => this.instrumentsSvc.getPresets().map(p => ({ id: p.id, name: p.name })));
  selectedTrackId = computed(() => this.music.selectedTrackId());
  selectedTrack = computed(() => this.music.tracks().find(t => t.id === this.selectedTrackId()) || this.music.tracks()[0]);
  selectedInstrumentId = computed(() => this.selectedTrack()?.instrumentId || this.instrumentOptions()[0]?.id);

  // Sequence view computed from track notes
  sequenceFor(midi: number) {
    const t = this.selectedTrack();
    const arr = Array(this.steps()).fill(false) as boolean[];
    if (!t) return arr;
    for (const n of t.notes) {
      if (n.midi === midi && n.step >= 0 && n.step < this.steps()) arr[n.step] = true;
    }
    return arr;
  }

  async togglePlay() {
    if (this.isPlaying()) this.music.stop(); else this.music.play();
  }

  resetSequence() {
    const id = this.selectedTrackId();
    if (id != null) this.music.clearTrack(id);
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
        // Here you might want to also update the loop points in the audio engine
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
    const exists = this.sequenceFor(midi)[step];
    if (exists) this.music.removeNote(id, midi, step); else this.music.addNote(id, midi, step, 1, 0.9);
  }

  trackName() { return this.selectedTrack()?.name || 'Track'; }

  midiName(midi: number) {
    const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const name = NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }
}
