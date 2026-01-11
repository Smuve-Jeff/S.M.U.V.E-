import { Component, ChangeDetectionStrategy, signal, input, computed, effect } from '@angular/core';
import { AppTheme, DeckState, initialDeckState } from '../../services/user-context.service';
import { SampleLibraryComponent } from '../sample-library/sample-library.component';
import { AudioEngineService, Stems } from '../../services/audio-engine.service';
import { FileLoaderService } from '../../services/file-loader.service';
import { ExportService } from '../../services/export.service';
import { LibraryService } from '../../services/library.service';
import { FormsModule } from '@angular/forms';
import { StemControlsComponent } from '../stem-controls/stem-controls.component';

@Component({
  selector: 'app-dj-deck',
  templateUrl: './dj-deck.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [SampleLibraryComponent, FormsModule, StemControlsComponent]
})
export class DjDeckComponent {
  theme = input.required<AppTheme>();

  deckA = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  deckB = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  crossfade = signal(0);

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);

  private recorder: MediaRecorder | null = null;
  recording = signal(false);
  xfCurve = signal<'linear'|'power'|'exp'|'cut'>('linear');
  hamster = signal(false);
  keylock = signal(true);

  pitchAPercentage = computed(() => `${(this.deckA().playbackRate * 100).toFixed(1)}%`);
  pitchBPercentage = computed(() => `${(this.deckB().playbackRate * 100).toFixed(1)}%`);

  constructor(
    private engine: AudioEngineService,
    private fileLoader: FileLoaderService,
    private exportService: ExportService,
    public library: LibraryService,
  ) {
    effect(() => {
      this.engine.setCrossfader(this.crossfade(), this.xfCurve(), this.hamster());
    });
    effect(() => {
      this.engine.setDeckRate('A', this.deckA().playbackRate);
    });
    effect(() => {
      this.engine.setDeckRate('B', this.deckB().playbackRate);
    });
  }

  async loadTrackFor(deck: 'A'|'B') {
    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
    if (!files?.length) return;
    const file = files[0];
    const buffer = await this.fileLoader.decodeToAudioBuffer(this.engine.getContext(), file);
    this.engine.loadDeckBuffer(deck, buffer);
    if (deck === 'A') {
      this.deckA.update(d => ({ ...d, track: { ...d.track, name: file.name, url: URL.createObjectURL(file) }, duration: buffer.duration }));
    } else {
      this.deckB.update(d => ({ ...d, track: { ...d.track, name: file.name, url: URL.createObjectURL(file) }, duration: buffer.duration }));
    }
  }

  togglePlay(deck: 'A'|'B') {
    const state = deck === 'A' ? this.deckA() : this.deckB();
    if (state.isPlaying) {
      this.engine.pauseDeck(deck);
    } else {
      this.engine.playDeck(deck);
    }
    if (deck === 'A') this.deckA.update(d => ({ ...d, isPlaying: !state.isPlaying }));
    else this.deckB.update(d => ({ ...d, isPlaying: !state.isPlaying }));
  }

  onStemGainChange(deck: 'A' | 'B', event: { stem: string, gain: number }) {
    this.engine.setStemGain(deck, event.stem as keyof Stems, event.gain);
  }

  startStopRecording() {
    if (this.recording()) {
      this.recorder?.stop();
      this.recording.set(false);
      this.recorder = null;
      return;
    }
    const { recorder, result } = this.exportService.startLiveRecording();
    this.recorder = recorder;
    this.recording.set(true);
    result.then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `mix-${Date.now()}.webm`; a.click();
    });
  }
}
