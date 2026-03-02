import sys

file_path = 'src/app/components/dj-deck/dj-deck.component.ts'

content = """import {
  Component,
  ChangeDetectionStrategy,
  signal,
  input,
  computed,
  inject,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit
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
export class DjDeckComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('waveformA') waveformA!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveformB') waveformB!: ElementRef<HTMLCanvasElement>;
  @ViewChild('meterA') meterA!: ElementRef<HTMLCanvasElement>;
  @ViewChild('meterB') meterB!: ElementRef<HTMLCanvasElement>;

  theme = input<AppTheme>(inject(UIService).activeTheme());

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);

  private recorder: MediaRecorder | null = null;
  recording = signal(false);

  stemsA = signal<Stems | null>(null);
  stemsB = signal<Stems | null>(null);

  private animFrame: number | null = null;
  private syncInterval: any = null;

  constructor(
    private fileLoader: FileLoaderService,
    private exportService: ExportService,
    public library: LibraryService,
    public deckService: DeckService,
    private engine: AudioEngineService,
    private stemSeparationService: StemSeparationService
  ) {}

  ngOnInit() {
    this.syncInterval = setInterval(() => {
      this.deckService.syncProgress();
    }, 50);
  }

  ngAfterViewInit() {
    this.startAnimationLoop();
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.syncInterval) clearInterval(this.syncInterval);
  }

  private startAnimationLoop() {
    const loop = () => {
      this.drawWaveforms();
      this.drawMeters();
      this.animFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  private drawWaveforms() {
    this.drawDeckWaveform('A', this.waveformA?.nativeElement);
    this.drawDeckWaveform('B', this.waveformB?.nativeElement);
  }

  private drawDeckWaveform(id: 'A' | 'B', canvas: HTMLCanvasElement) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const deck = id === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    const data = this.engine.getDeckWaveformData(id);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.length === 0) {
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      return;
    }

    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    // Playhead
    const progress = deck.progress / (deck.duration || 1);
    const x = progress * canvas.width;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  private drawMeters() {
    this.drawMeter('A', this.meterA?.nativeElement);
    this.drawMeter('B', this.meterB?.nativeElement);
  }

  private drawMeter(id: 'A' | 'B', canvas: HTMLCanvasElement) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const level = this.engine.getDeckLevel(id);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, '#10b981');
    gradient.addColorStop(0.7, '#fbbf24');
    gradient.addColorStop(1, '#ef4444');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = gradient;
    const h = level * canvas.height;
    ctx.fillRect(0, canvas.height - h, canvas.width, h);
  }

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

  setPlaybackRate(deck: 'A' | 'B', rate: any) {
    const r = parseFloat(rate);
    if (deck === 'A') this.deckService.deckA.update(d => ({ ...d, playbackRate: r }));
    else this.deckService.deckB.update(d => ({ ...d, playbackRate: r }));
  }

  setEq(deck: 'A' | 'B', band: 'high' | 'mid' | 'low', val: any) {
    const v = parseFloat(val);
    const d = deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    let { eqHigh, eqMid, eqLow } = d;
    if (band === 'high') eqHigh = v;
    if (band === 'mid') eqMid = v;
    if (band === 'low') eqLow = v;
    this.deckService.setDeckEq(deck, eqHigh, eqMid, eqLow);
  }

  setFilter(deck: 'A' | 'B', val: any) {
    this.deckService.setDeckFilter(deck, parseFloat(val));
  }

  setGain(deck: 'A' | 'B', val: any) {
    this.deckService.setDeckGain(deck, parseFloat(val));
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
    result.then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mix-${Date.now()}.webm`;
      a.click();
    });
  }
}
"""

with open(file_path, 'w') as f:
    f.write(content)
