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
import { DatabaseService } from '../../services/database.service';
import { UIService } from '../../services/ui.service';
import { UserProfileService } from '../../services/user-profile.service';
import { PlayerService } from '../../services/player.service';

const RECORDING_TIMER_UPDATE_INTERVAL_MILLIS = 250;
const MIN_ROLL_INTERVAL_MILLIS = 50;
const MIN_SAMPLER_RETURN_MILLIS = 80;

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
  rotationA = signal(0);
  rotationB = signal(0);
  masterVolume = signal(0.85);
  currentBeat = this.engine.currentBeat;

  private recorder: MediaRecorder | null = null;
  recording = signal(false);
  recordingElapsedMs = signal(0);
  recordingDurationLabel = computed(() =>
    this.formatDuration(this.recordingElapsedMs())
  );
  sessionNotice = signal('Ready to scratch, save, and export.');

  private animFrame: number | null = null;
  private syncInterval: any = null;
  private recordingInterval: any = null;
  private recordingStartedAt: number | null = null;
  private lastRenderTimestamp = 0;
  performanceMode = signal<'cue' | 'roll' | 'sampler'>('cue');
  private tapTimes: { [key: string]: number[] } = { A: [], B: [] };
  readonly rollPadLabels = ['1/8', '1/4', '1/2', '1', '2', '4', '8', '16'];
  readonly rollPadBeats = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
  readonly samplerPadBeats = [0.25, 0.5, 1, 1, 2, 2, 4, 4];

  isScratchingA = signal(false);
  isScratchingB = signal(false);
  activeRollPadA = signal<number | null>(null);
  activeRollPadB = signal<number | null>(null);
  activeSamplerPadA = signal<number | null>(null);
  activeSamplerPadB = signal<number | null>(null);
  isFlatView = signal(false);
  private lastAngleA = 0;
  private lastAngleB = 0;
  private platterCenters: Record<'A' | 'B', { x: number; y: number } | null> = {
    A: null,
    B: null,
  };
  private wasPlaying: Record<'A' | 'B', boolean> = { A: false, B: false };
  private rollState: Record<
    'A' | 'B',
    {
      padIndex: number;
      origin: number;
      duration: number;
      loopDuration: number;
      startedAt: number;
      playbackRate: number;
      wasPlaying: boolean;
    } | null
  > = { A: null, B: null };
  private rollIntervals: Record<'A' | 'B', any> = { A: null, B: null };
  private samplerReturnTimers: Record<'A' | 'B', any> = { A: null, B: null };

  public uiService = inject(UIService);
  private profileService = inject(UserProfileService);
  private databaseService = inject(DatabaseService);
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
    this.checkMobile();
    this.configureSyncInterval();
  }

  ngAfterViewInit() {
    this.startAnimationLoop();
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    this.clearRollInterval('A');
    this.clearRollInterval('B');
    this.clearSamplerReturnTimer('A');
    this.clearSamplerReturnTimer('B');
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
    this.configureSyncInterval();
  }

  private checkMobile() {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 1024);
    }
  }

  private configureSyncInterval() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    const interval = this.isMobile() || this.uiService.isLowPower() ? 90 : 50;
    this.syncInterval = setInterval(() => {
      this.deckService.syncProgress();
    }, interval);
  }

  private startAnimationLoop() {
    const loop = (timestamp: number) => {
      const frameBudget =
        this.isMobile() || this.uiService.isLowPower() ? 1000 / 30 : 1000 / 60;

      if (
        !this.lastRenderTimestamp ||
        timestamp - this.lastRenderTimestamp >= frameBudget
      ) {
        this.drawWaveforms();
        this.drawMeters();
        this.lastRenderTimestamp = timestamp;
      }

      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
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

    const prog = this.engine.getDeckProgress(id);
    const slipX =
      ((prog.slipPosition - (deck.progress - windowSize / 2)) / windowSize) *
      canvas.width;

    if (prog.slipPosition !== prog.position) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(slipX, 0);
      ctx.lineTo(slipX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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

  deckProgressPercent(deck: 'A' | 'B') {
    const d =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    if (!d.duration) return 0;
    return Math.max(0, Math.min(1, d.progress / d.duration));
  }

  progressRingStyle(deck: 'A' | 'B') {
    const pct = this.deckProgressPercent(deck);
    const accent =
      deck === 'A'
        ? 'var(--color-primary, #10b981)'
        : 'var(--color-accent, #f59e0b)';
    const deg = pct * 360;
    return `conic-gradient(${accent} ${deg}deg, rgba(148,163,184,0.2) ${deg}deg 360deg)`;
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

  handlePadDown(
    deck: 'A' | 'B',
    index: number,
    event?: MouseEvent | TouchEvent
  ) {
    if (this.performanceMode() !== 'roll') return;
    event?.preventDefault();
    this.startRoll(deck, index);
  }

  handlePadRelease(deck: 'A' | 'B', index: number) {
    if (this.performanceMode() !== 'roll') return;
    const activePad =
      deck === 'A' ? this.activeRollPadA() : this.activeRollPadB();
    if (activePad !== index) return;
    this.stopRoll(deck);
  }

  handlePadPress(deck: 'A' | 'B', index: number) {
    const mode = this.performanceMode();
    const d =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();

    if (mode === 'cue') {
      if (d.hotCues[index] === null) this.deckService.setHotCue(deck, index);
      else this.deckService.jumpToHotCue(deck, index);
      this.sessionNotice.set(
        d.hotCues[index] === null
          ? `Deck ${deck} hot cue ${index + 1} captured.`
          : `Deck ${deck} jumped to hot cue ${index + 1}.`
      );
      return;
    }

    if (mode === 'roll') return;

    if (d.samplerPads[index] === null) {
      this.deckService.setSamplerPad(deck, index);
      this.sessionNotice.set(`Deck ${deck} sample pad ${index + 1} armed.`);
      return;
    }

    this.triggerSamplerPad(deck, index);
  }

  clearHotCue(deck: 'A' | 'B', index: number, event: MouseEvent) {
    event.preventDefault();
    this.deckService.clearHotCue(deck, index);
    this.sessionNotice.set(`Deck ${deck} hot cue ${index + 1} cleared.`);
  }

  clearPad(deck: 'A' | 'B', index: number, event: MouseEvent) {
    event.preventDefault();
    if (this.performanceMode() === 'roll') {
      this.sessionNotice.set(
        'Roll pads cannot be cleared - they are live performance triggers without stored state.'
      );
      return;
    }

    if (this.performanceMode() === 'sampler') {
      this.deckService.clearSamplerPad(deck, index);
      this.clearSamplerActivePad(deck);
      this.sessionNotice.set(`Deck ${deck} sample pad ${index + 1} cleared.`);
      return;
    }

    this.clearHotCue(deck, index, event);
  }

  getPadLabel(index: number) {
    const mode = this.performanceMode();
    if (mode === 'cue') return `Cue ${index + 1}`;
    if (mode === 'roll') return `${this.rollPadLabels[index] || '1'} Roll`;
    return `Shot ${index + 1}`;
  }

  isCuePadSet(deck: 'A' | 'B', index: number) {
    return this.getDeckState(deck).hotCues[index] !== null;
  }

  isSamplerPadSet(deck: 'A' | 'B', index: number) {
    return this.getDeckState(deck).samplerPads[index] !== null;
  }

  isRollPadActive(deck: 'A' | 'B', index: number) {
    return (
      (deck === 'A' ? this.activeRollPadA() : this.activeRollPadB()) === index
    );
  }

  isSamplerPadActive(deck: 'A' | 'B', index: number) {
    return (
      (deck === 'A' ? this.activeSamplerPadA() : this.activeSamplerPadB()) ===
      index
    );
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
      this.sessionNotice.set('Finalizing live mix capture...');
      this.recorder?.stop();
      return;
    }

    const { recorder, result } = this.exportService.startLiveRecording();
    this.recorder = recorder;
    this.recording.set(true);
    this.startRecordingTimer();
    this.sessionNotice.set('Recording live mix...');

    recorder.onerror = () => {
      this.sessionNotice.set('Recording failed to complete.');
      this.cleanupRecordingState();
    };

    result
      .then((blob) => {
        const extension = blob.type.includes('ogg')
          ? 'ogg'
          : blob.type.includes('wav')
            ? 'wav'
            : 'webm';
        return this.exportService.downloadBlob(
          blob,
          `mix-${Date.now()}.${extension}`
        );
      })
      .then(() => {
        this.sessionNotice.set('Live mix exported successfully.');
      })
      .catch(() => {
        this.sessionNotice.set('Live mix export failed.');
      })
      .finally(() => {
        this.cleanupRecordingState();
      });
  }

  toggleLoop(deck: 'A' | 'B') {
    this.deckService.toggleLoop(deck);
  }

  sync(deck: 'A' | 'B') {
    this.deckService.sync(deck);
  }

  setCrossfade(val: any) {
    this.deckService.crossfade.set(parseFloat(val));
  }

  onPlatterDown(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const isA = deck === 'A';
    if (isA) this.isScratchingA.set(true);
    else this.isScratchingB.set(true);

    const angle = this.getAngle(event, deck);
    if (isA) this.lastAngleA = angle;
    else this.lastAngleB = angle;

    this.platterCenters[deck] = this.getEventTargetCenter(event);
    const deckState = isA ? this.deckService.deckA() : this.deckService.deckB();
    this.wasPlaying[deck] = deckState.isPlaying;
    if (deckState.isPlaying) this.engine.pauseDeck(deck);
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
      const deckState = this.deckService.deckA();
      const progress = this.engine.getDeckProgress('A');

      // If slip mode is enabled, we restore to the background playhead
      if (deckState.slip && this.wasPlaying.A) {
        this.engine.seekDeck('A', progress.slipPosition);
      }

      this.engine.setDeckRate('A', deckState.playbackRate);
      if (this.wasPlaying.A) this.engine.playDeck('A');
      this.wasPlaying.A = false;
    }
    if (this.isScratchingB()) {
      this.isScratchingB.set(false);
      const deckState = this.deckService.deckB();
      const progress = this.engine.getDeckProgress('B');

      if (deckState.slip && this.wasPlaying.B) {
        this.engine.seekDeck('B', progress.slipPosition);
      }

      this.engine.setDeckRate('B', deckState.playbackRate);
      if (this.wasPlaying.B) this.engine.playDeck('B');
      this.wasPlaying.B = false;
    }
  }

  private processScratch(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const angle = this.getAngle(event, deck);
    const lastAngle = deck === 'A' ? this.lastAngleA : this.lastAngleB;
    let delta = angle - lastAngle;

    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    // Physical Wind-back: delta rotation maps to audio scrub
    // One full rotation (2PI) should move approx 1.8 seconds (typical 33 RPM feel)
    const scrubSecondsPerRadian = 1.8 / (2 * Math.PI);
    const scrub = delta * scrubSecondsPerRadian;

    const progress = this.engine.getDeckProgress(deck).position;
    const duration = this.engine.getDeckProgress(deck).duration;
    let newPos = progress + scrub;
    if (newPos < 0) newPos = 0;
    if (duration) newPos = Math.min(duration, newPos);

    this.engine.seekDeck(deck, newPos);

    // Velocity-based playback rate for authentic scratch sound
    // velocity = radians per update. Let's scale it.
    const velocity = (delta / 0.016) * scrubSecondsPerRadian; // approx rate
    this.engine.setDeckRate(deck, velocity, false);

    if (deck === 'A') {
      this.rotationA.update((r) => r + delta * (180 / Math.PI));
      this.lastAngleA = angle;
    } else {
      this.rotationB.update((r) => r + delta * (180 / Math.PI));
      this.lastAngleB = angle;
    }
  }

  private getAngle(event: MouseEvent | TouchEvent, deck?: 'A' | 'B'): number {
    const { x, y } = this.getPointerPosition(event);
    const fallbackCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const storedCenter = deck ? this.platterCenters[deck] : null;
    const center =
      storedCenter || this.getEventTargetCenter(event) || fallbackCenter;
    return Math.atan2(y - center.y, x - center.x);
  }

  private getPointerPosition(event: MouseEvent | TouchEvent) {
    if ('touches' in event && event.touches.length) {
      const touch = event.touches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return {
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    };
  }

  private getEventTargetCenter(event: MouseEvent | TouchEvent) {
    const target = event.currentTarget as HTMLElement | null;
    if (target && target.getBoundingClientRect) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }

  setSaturation(val: any) {
    this.engine.setSaturation(parseFloat(val));
  }

  applyScratchFx(deck: 'A' | 'B', type: 'brake' | 'spinback' | 'transform') {
    if (type === 'brake') this.engine.brakeDeck(deck);
    else if (type === 'spinback') this.engine.spinbackDeck(deck);
    else if (type === 'transform') this.engine.transformDeck(deck);
  }

  async saveSessionSnapshot() {
    const now = new Date();
    const title = `DJ Session ${now.toLocaleString()}`;
    const projectId = `dj-session-${now.getTime()}`;
    const userId = this.profileService.profile().id || 'anonymous';

    try {
      await this.databaseService.saveProject(
        projectId,
        title,
        this.buildSessionSnapshot(),
        userId
      );
      this.sessionNotice.set(`${title} saved.`);
    } catch {
      this.sessionNotice.set('Session save failed.');
    }
  }

  async exportSessionSnapshot() {
    const snapshot = this.buildSessionSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });

    try {
      await this.exportService.downloadBlob(
        blob,
        `dj-session-${Date.now()}.json`
      );
      this.sessionNotice.set('Session snapshot exported.');
    } catch {
      this.sessionNotice.set('Session export failed.');
    }
  }

  private buildSessionSnapshot() {
    const deckSnapshot = (deck: ReturnType<typeof this.deckService.deckA>) => ({
      trackName: deck.track?.name || 'No Track Loaded',
      bpm: deck.bpm,
      playbackRate: deck.playbackRate,
      progress: deck.progress,
      duration: deck.duration,
      gain: deck.gain,
      filterFreq: deck.filterFreq,
      eqHigh: deck.eqHigh,
      eqMid: deck.eqMid,
      eqLow: deck.eqLow,
      slip: deck.slip,
      hotCues: [...deck.hotCues],
      samplerPads: [...deck.samplerPads],
    });

    return {
      type: 'dj-session-snapshot',
      exportedAt: new Date().toISOString(),
      performanceMode: this.performanceMode(),
      crossfade: this.deckService.crossfade(),
      masterVolume: this.masterVolume(),
      deckA: deckSnapshot(this.deckService.deckA()),
      deckB: deckSnapshot(this.deckService.deckB()),
    };
  }

  private startRecordingTimer() {
    this.recordingStartedAt = Date.now();
    this.recordingElapsedMs.set(0);
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    this.recordingInterval = setInterval(() => {
      if (this.recordingStartedAt) {
        this.recordingElapsedMs.set(Date.now() - this.recordingStartedAt);
      }
    }, RECORDING_TIMER_UPDATE_INTERVAL_MILLIS);
  }

  private cleanupRecordingState() {
    this.recording.set(false);
    this.recorder = null;
    this.recordingStartedAt = null;
    this.recordingElapsedMs.set(0);
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
  }

  private formatDuration(durationMs: number) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private formatPadWindow(durationSeconds: number) {
    return durationSeconds < 1
      ? `${durationSeconds.toFixed(2)}s`
      : `${durationSeconds.toFixed(1)}s`;
  }

  private startRoll(deck: 'A' | 'B', index: number) {
    const progress = this.engine.getDeckProgress(deck);
    const deckState = this.getDeckState(deck);
    const duration = progress.duration || deckState.duration;
    if (!duration) {
      this.sessionNotice.set(`Load a track on deck ${deck} before rolling.`);
      return;
    }

    this.stopRoll(deck, false);
    const playbackRate = Math.max(0.25, Math.abs(deckState.playbackRate || 1));
    const loopDuration = this.getBeatWindowSeconds(
      deck,
      this.rollPadBeats[index] || 1
    );
    const origin = progress.position;
    const loopStart = this.getLoopStart(origin, loopDuration);
    const wasPlaying = progress.isPlaying || deckState.isPlaying;

    this.rollState[deck] = {
      padIndex: index,
      origin,
      duration,
      loopDuration,
      startedAt: Date.now(),
      playbackRate,
      wasPlaying,
    };
    this.setActiveRollPad(deck, index);
    this.engine.seekDeck(deck, loopStart);
    this.engine.playDeck(deck);
    this.clearRollInterval(deck);
    this.rollIntervals[deck] = setInterval(
      () => {
        const state = this.rollState[deck];
        if (!state) return;
        this.engine.seekDeck(
          deck,
          this.getLoopStart(state.origin, state.loopDuration)
        );
        this.engine.playDeck(deck);
      },
      Math.max(MIN_ROLL_INTERVAL_MILLIS, loopDuration * 1000)
    );
    this.deckService.syncProgress();
    this.sessionNotice.set(
      `Deck ${deck} ${this.rollPadLabels[index]} beat slip roll engaged.`
    );
  }

  private stopRoll(deck: 'A' | 'B', announce = true) {
    const state = this.rollState[deck];
    this.clearRollInterval(deck);
    this.setActiveRollPad(deck, null);
    this.rollState[deck] = null;
    if (!state) return;

    if (state.wasPlaying) {
      const elapsed =
        ((Date.now() - state.startedAt) / 1000) * state.playbackRate;
      const resumePosition = Math.max(
        0,
        Math.min(state.duration, state.origin + elapsed)
      );
      this.engine.seekDeck(deck, resumePosition);
      this.engine.playDeck(deck);
    } else {
      this.engine.pauseDeck(deck);
      this.engine.seekDeck(deck, state.origin);
    }

    this.deckService.syncProgress();
    if (announce) {
      this.sessionNotice.set(`Deck ${deck} roll released back to groove.`);
    }
  }

  private triggerSamplerPad(deck: 'A' | 'B', index: number) {
    const deckState = this.getDeckState(deck);
    const cuePosition = deckState.samplerPads[index];
    if (cuePosition === null) return;

    const progress = this.engine.getDeckProgress(deck);
    const duration = progress.duration || deckState.duration;
    const playbackRate = Math.max(0.25, Math.abs(deckState.playbackRate || 1));
    const wasPlaying = progress.isPlaying || deckState.isPlaying;
    const shotDuration = Math.min(
      this.getBeatWindowSeconds(deck, this.samplerPadBeats[index] || 1),
      Math.max(0.05, duration - cuePosition)
    );
    const origin = progress.position;

    this.clearSamplerReturnTimer(deck);
    this.setActiveSamplerPad(deck, index);
    this.engine.seekDeck(deck, cuePosition);
    this.engine.playDeck(deck);
    this.samplerReturnTimers[deck] = setTimeout(
      () => {
        if (wasPlaying) {
          const resumePosition = Math.max(
            0,
            Math.min(duration, origin + shotDuration * playbackRate)
          );
          this.engine.seekDeck(deck, resumePosition);
          this.engine.playDeck(deck);
        } else {
          this.engine.pauseDeck(deck);
          this.engine.seekDeck(deck, cuePosition);
        }
        this.clearSamplerActivePad(deck);
        this.deckService.syncProgress();
      },
      Math.max(MIN_SAMPLER_RETURN_MILLIS, shotDuration * 1000)
    );
    this.deckService.syncProgress();
    this.sessionNotice.set(
      `Deck ${deck} sampler pad ${index + 1} fired for ${this.formatPadWindow(shotDuration)}.`
    );
  }

  private getDeckState(deck: 'A' | 'B') {
    return deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
  }

  private getBeatWindowSeconds(deck: 'A' | 'B', beats: number) {
    const deckState = this.getDeckState(deck);
    const bpm = Math.max(1, deckState.bpm || 128);
    const playbackRate = Math.max(0.25, Math.abs(deckState.playbackRate || 1));
    return (60 / bpm / playbackRate) * beats;
  }

  private getLoopStart(origin: number, loopDuration: number) {
    return Math.max(0, origin - loopDuration);
  }

  private setActiveRollPad(deck: 'A' | 'B', index: number | null) {
    if (deck === 'A') this.activeRollPadA.set(index);
    else this.activeRollPadB.set(index);
  }

  private setActiveSamplerPad(deck: 'A' | 'B', index: number | null) {
    if (deck === 'A') this.activeSamplerPadA.set(index);
    else this.activeSamplerPadB.set(index);
  }

  private clearRollInterval(deck: 'A' | 'B') {
    if (this.rollIntervals[deck]) {
      clearInterval(this.rollIntervals[deck]);
      this.rollIntervals[deck] = null;
    }
  }

  private clearSamplerReturnTimer(deck: 'A' | 'B') {
    if (this.samplerReturnTimers[deck]) {
      clearTimeout(this.samplerReturnTimers[deck]);
      this.samplerReturnTimers[deck] = null;
    }
  }

  private clearSamplerActivePad(deck: 'A' | 'B') {
    this.clearSamplerReturnTimer(deck);
    this.setActiveSamplerPad(deck, null);
  }
}
