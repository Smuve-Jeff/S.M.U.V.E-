import {
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
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AppTheme } from '../../services/user-context.service';
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

  theme = input<AppTheme>(inject(UIService).activeTheme());

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);
  isMobile = signal(false);
  masterVolume = signal(0.85);
  currentBeat = this.engine.currentBeat;

  private recorder: MediaRecorder | null = null;
  recording = signal(false);

  private animFrame: number | null = null;
  private syncInterval: any = null;
  performanceMode = signal<'cue' | 'roll' | 'sampler'>('cue');
  private tapTimes: { [key: string]: number[] } = { A: [], B: [] };

  isScratchingA = signal(false);
  isScratchingB = signal(false);
  private lastAngleA = 0;
  private lastAngleB = 0;

  public uiService = inject(UIService);
  private profileService = inject(UserProfileService);
  public playerService = inject(PlayerService);

  hasNeuralStems = computed(() => {
    const profile = this.profileService.profile();
    return (
      profile.daw.includes('Neural Audio Interface V1 (Prototype)') ||
      profile.equipment.includes('Neural Audio Interface V1 (Prototype)') ||
      profile.daw.includes('Sub-Atomic Kick Dominance Pack')
    );
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
    public engine: AudioEngineService
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

    const deck =
      id === 'A' ? this.deckService.deckA() : this.deckService.deckB();
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
    const startSample = Math.floor(currentSample - samplesInWindow / 2);
    const amp = canvas.height / 2;

    ctx.strokeStyle = id === 'A' ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 2;
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

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
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
    gradient.addColorStop(0, '#10b981');
    gradient.addColorStop(0.7, '#fbbf24');
    gradient.addColorStop(1, '#ef4444');

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = gradient;
    const h = Math.min(canvas.height, level * canvas.height * 1.5);
    ctx.fillRect(0, canvas.height - h, canvas.width, h);
  }

  getDeckLevel(id: 'A' | 'B') {
    return this.engine.getDeckLevel(id);
  }

  async loadTrackFor(deckId: 'A' | 'B') {
    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
    if (!files?.length) return;
    const file = files[0];
    const buffer = await this.fileLoader.decodeToAudioBuffer(
      this.engine.getContext(),
      file
    );
    this.deckService.loadDeckBuffer(deckId, buffer, file.name);
  }

  tapBpm(deck: 'A' | 'B') {
    const now = Date.now();
    if (!this.tapTimes[deck]) this.tapTimes[deck] = [];
    this.tapTimes[deck].push(now);
    if (this.tapTimes[deck].length > 4) this.tapTimes[deck].shift();
    if (this.tapTimes[deck].length > 1) {
      const diffs = [];
      for (let i = 1; i < this.tapTimes[deck].length; i++) {
        diffs.push(this.tapTimes[deck][i] - this.tapTimes[deck][i - 1]);
      }
      const avg = diffs.reduce((a, b) => a + b) / diffs.length;
      const bpm = Math.round(60000 / avg);
      this.deckService.setBpm(deck, bpm);
    }
  }

  handlePadPress(deck: 'A' | 'B', index: number) {
    const mode = this.performanceMode();
    if (mode === 'cue') {
      const d =
        deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
      if (d.hotCues[index] === null) this.deckService.setHotCue(deck, index);
      else this.deckService.jumpToHotCue(deck, index);
    }
  }

  setPlaybackRate(deck: 'A' | 'B', rate: any) {
    const r = parseFloat(rate);
    if (deck === 'A')
      this.deckService.deckA.update((d) => ({ ...d, playbackRate: r }));
    else this.deckService.deckB.update((d) => ({ ...d, playbackRate: r }));
  }

  setEq(deck: 'A' | 'B', band: 'high' | 'mid' | 'low', val: any) {
    const v = parseFloat(val);
    const d =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
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

  setSend(deck: 'A' | 'B', send: 'A' | 'B', val: any) {
    this.deckService.setDeckSend(deck, send, parseFloat(val));
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
      a.download = `mix-${Date.now()}.webm`;
      a.click();
    });
  }

  sync(deck: 'A' | 'B') {
    this.deckService.sync(deck);
  }

  setCrossfade(val: any) {
    this.deckService.crossfade.set(parseFloat(val));
  }

  onPlatterDown(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    const isA = deck === 'A';
    if (isA) this.isScratchingA.set(true);
    else this.isScratchingB.set(true);

    const angle = this.getAngle(event);
    if (isA) this.lastAngleA = angle;
    else this.lastAngleB = angle;

    this.engine.pauseDeck(deck);
  }

  @HostListener('window:mousemove', [''])
  onPlatterMove(event: MouseEvent) {
    this.handlePlatterMove(event);
  }

  @HostListener('window:touchmove', [''])
  onPlatterTouchMove(event: TouchEvent) {
    this.handlePlatterMove(event);
  }

  private handlePlatterMove(event: MouseEvent | TouchEvent) {
    if (this.isScratchingA()) this.processScratch('A', event);
    if (this.isScratchingB()) this.processScratch('B', event);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onPlatterUp() {
    if (this.isScratchingA()) {
      this.isScratchingA.set(false);
      if (this.deckService.deckA().isPlaying) this.engine.playDeck('A');
    }
    if (this.isScratchingB()) {
      this.isScratchingB.set(false);
      if (this.deckService.deckB().isPlaying) this.engine.playDeck('B');
    }
  }

  private processScratch(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    const angle = this.getAngle(event);
    const lastAngle = deck === 'A' ? this.lastAngleA : this.lastAngleB;
    let delta = angle - lastAngle;

    // Handle wrap around
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    if (Math.abs(delta) > 0.01) {
      const progress = this.engine.getDeckProgress(deck).position;
      const duration = this.deckService.deckA().duration; // Assuming A/B have same logic for now
      // 2*PI radians = 1 rotation = ~1.8 seconds at 33 1/3 RPM?
      // Let's just say delta * scale
      const scrub = delta * 0.5;
      let newPos = progress + scrub;
      if (newPos < 0) newPos = 0;
      this.engine.seekDeck(deck, newPos);

      if (deck === 'A') this.lastAngleA = angle;
      else this.lastAngleB = angle;
    }
  }

  private getAngle(event: MouseEvent | TouchEvent): number {
    const clientX =
      'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY =
      'touches' in event ? event.touches[0].clientY : event.clientY;

    const target = event.currentTarget as HTMLElement;
    if (target) {
      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.atan2(clientY - centerY, clientX - centerX);
    }

    return Math.atan2(
      clientY - window.innerHeight / 2,
      clientX - window.innerWidth / 2
    );
  }

  applyScratchFx(deck: 'A' | 'B', type: 'brake' | 'spinback' | 'transform') {
    if (type === 'brake') {
      let rate = this.deckService.deckA().playbackRate;
      const interval = setInterval(() => {
        rate -= 0.1;
        if (rate <= 0) {
          rate = 0;
          clearInterval(interval);
          this.engine.pauseDeck(deck);
        }
        this.engine.setDeckRate(deck, rate);
      }, 50);
    } else if (type === 'spinback') {
      this.engine.setDeckRate(deck, -3.0);
      setTimeout(() => {
        this.engine.setDeckRate(deck, this.deckService.deckA().playbackRate);
      }, 500);
    } else if (type === 'transform') {
      const originalGain = this.deckService.deckA().gain;
      let count = 0;
      const interval = setInterval(() => {
        this.engine.setDeckGain(deck, count % 2 === 0 ? 0 : originalGain);
        count++;
        if (count > 8) {
          clearInterval(interval);
          this.engine.setDeckGain(deck, originalGain);
        }
      }, 100);
    }
  }
}
