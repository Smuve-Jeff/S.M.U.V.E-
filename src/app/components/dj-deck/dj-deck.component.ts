import {
  Component,
  ChangeDetectionStrategy,
  signal,
  input,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppTheme } from '../../services/user-context.service';
import { SampleLibraryComponent } from '../sample-library/sample-library.component';
import { FileLoaderService } from '../../services/file-loader.service';
import { ExportService } from '../../services/export.service';
import { LibraryService } from '../../services/library.service';
import { FormsModule } from '@angular/forms';
import { StemControlsComponent } from '../stem-controls/stem-controls.component';
import { DeckService } from '../../services/deck.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { UIService } from '../../services/ui.service';
import {
  StemSeparationService,
  Stems,
} from '../../services/stem-separation.service';

@Component({
  selector: 'app-dj-deck',
  templateUrl: './dj-deck.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, SampleLibraryComponent, FormsModule, StemControlsComponent],
})
export class DjDeckComponent {
  theme = input<AppTheme>(inject(UIService).activeTheme());

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);

  private recorder: MediaRecorder | null = null;
  recording = signal(false);
  keylock = signal(true);

  stemsA = signal<Stems | null>(null);
  stemsB = signal<Stems | null>(null);

  pitchAPercentage = computed(
    () => `${(this.deckService.deckA().playbackRate * 100).toFixed(1)}%`
  );
  pitchBPercentage = computed(
    () => `${(this.deckService.deckB().playbackRate * 100).toFixed(1)}%`
  );

  constructor(
    private fileLoader: FileLoaderService,
    private exportService: ExportService,
    public library: LibraryService,
    public deckService: DeckService,
    private engine: AudioEngineService,
    private stemSeparationService: StemSeparationService
  ) {}

  async loadTrackFor(deck: 'A' | 'B') {
    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
    if (!files?.length) return;
    const file = files[0];
    const buffer = await this.fileLoader.decodeToAudioBuffer(
      this.engine.getContext(),
      file
    );
    this.deckService.loadDeckBuffer(deck, buffer, file.name);
  }

  async separateStems(deck: 'A' | 'B') {
    const currentDeck =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    if (currentDeck.buffer) {
      this.stemSeparationService
        .separate(currentDeck.buffer)
        .subscribe((stems) => {
          if (deck === 'A') {
            this.stemsA.set(stems);
          } else {
            this.stemsB.set(stems);
          }
        });
    }
  }

  setPlaybackRate(deck: "A" | "B", rate: any) { const r = parseFloat(rate); if (deck === "A") this.deckService.deckA.update(d => ({ ...d, playbackRate: r })); else this.deckService.deckB.update(d => ({ ...d, playbackRate: r })); }

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
    result.then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mix-${Date.now()}.webm`;
      a.click();
    });
  }
}
