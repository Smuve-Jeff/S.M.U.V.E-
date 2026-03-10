import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FileLoaderService } from '../../services/file-loader.service';
import { ExportService } from '../../services/export.service';
import { LibraryService } from '../../services/library.service';
import { FormsModule } from '@angular/forms';
import { DeckService } from '../../services/deck.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { UIService } from '../../services/ui.service';
import { UserProfileService } from '../../services/user-profile.service';
import { PlayerService } from '../../services/player.service';

@Component({
  selector: 'app-dj-deck',
  templateUrl: './dj-deck.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
})
export class DjDeckComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('waveformA') waveformA!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveformB') waveformB!: ElementRef<HTMLCanvasElement>;
  @ViewChild('meterA') meterA!: ElementRef<HTMLCanvasElement>;
  @ViewChild('meterB') meterB!: ElementRef<HTMLCanvasElement>;

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);
  isMobile = signal(false);
  masterVolume = signal(0.85);

  private recorder: MediaRecorder | null = null;
  recording = signal(false);

  private animFrame: number | null = null;
  private syncInterval: any = null;
  performanceMode = signal<"cue" | "roll" | "sampler">("cue");
  private tapTimes: { [key: string]: number[] } = { A: [], B: [] };

  public uiService = inject(UIService);
  private profileService = inject(UserProfileService);
  public playerService = inject(PlayerService);

  hasNeuralStems = computed(() => {
    const profile = this.profileService.profile();
    return profile.daw.includes('Neural Audio Interface V1 (Prototype)') ||
           profile.equipment.includes('Neural Audio Interface V1 (Prototype)') ||
           profile.daw.includes('Sub-Atomic Kick Dominance Pack');
  });

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
    private engine: AudioEngineService
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

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 1024);
    }
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

    const sampleRate = this.engine.getContext().sampleRate || 44100;
    const windowSize = 4;
    const samplesInWindow = windowSize * sampleRate;
    const step = samplesInWindow / canvas.width;
    const currentSample = deck.progress * sampleRate;
    const startSample = Math.floor(currentSample - (samplesInWindow / 2));
    const amp = canvas.height / 2;

    ctx.strokeStyle = id === 'A' ? '#25f46a' : '#f48525';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < canvas.width; i++) {
        const idx = Math.floor(startSample + i * step);
        if (idx >= 0 && idx < data.length) {
            const val = data[idx];
            ctx.moveTo(i, amp - val * amp);
            ctx.lineTo(i, amp + val * amp);
        }
    }
    ctx.stroke();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
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
    gradient.addColorStop(0, '#25f46a');
    gradient.addColorStop(0.7, '#f2b90d');
    gradient.addColorStop(1, '#ef4444');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = gradient;
    const h = Math.min(canvas.height, level * canvas.height * 2.0);
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

  setMasterVolume(val: any) {
    const v = parseFloat(val);
    this.masterVolume.set(v);
    this.engine.setMasterOutputLevel(v);
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
      a.download = `elite-mix-${Date.now()}.webm`;
      a.click();
    });
  }

  sync(deck: 'A' | 'B') {
    this.deckService.sync(deck);
  }
}
