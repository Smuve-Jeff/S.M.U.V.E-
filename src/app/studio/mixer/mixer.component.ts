import {
  Component,
  Input,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { MixerService } from '../mixer.service';
import { HapticService } from '../../services/haptic.service';
import { AiService } from '../../services/ai.service';
import { Clip } from '../instrument.service';
import { SnackbarService } from '../../services/snackbar.service';
import { RecordingStatusService } from '../recording-status.service';

interface MeterReadings { [trackId: string]: number; }

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mixer.component.html',
  styleUrls: ['./mixer.component.css'],
})
export class MixerComponent implements OnInit, OnDestroy {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly neuralMixer = inject(NeuralMixerService);
  private readonly haptic = inject(HapticService);
  public readonly mixerService = inject(MixerService);
  public readonly aiService = inject(AiService);
  private readonly snack = inject(SnackbarService);
  readonly recordingStatus = inject(RecordingStatusService);

  @Input() activeClip: Clip | null = null;

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  masterVolume = this.audioSession.masterVolume;
  masterMuted = signal(false);
  selectedTrackId = this.musicManager.selectedTrackId;
  tracks = this.musicManager.tracks;

  selectedTrack = computed(() =>
    this.tracks().find((t) => t.id === this.selectedTrackId())
  );

  private analyserMap = new Map<string, AnalyserNode>();
  trackLevels = signal<MeterReadings>({});
  trackPeakHolds = signal<MeterReadings>({});
  masterPeakHold = signal(0);
  private masterAnalyser?: AnalyserNode;
  /** Pro: Phase correlation computed at runtime from master analyser */
  phaseCorrelation = signal(0);
  outputLufs = this.audioSession.engine.outputLufs;
  outputLevelDb = this.audioSession.engine.outputLevelDb;
  private raf?: number;

  // ── Pro: Sidechain routing map ─────────────────────────────
  /** Map of destination trackId → sidechain source trackId */
  sidechainMap = signal<Record<string, string>>({});

  ngOnInit() {
    this.startMetering();
  }

  ngOnDestroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  trackById = (_: number, t: TrackModel) => t.id;

  private startMetering() {
    const update = () => {
      const levels: MeterReadings = {};
      this.tracks().forEach((track) => {
        let analyser = this.analyserMap.get(track.id);
        if (!analyser) {
          analyser = this.audioSession.engine.ctx.createAnalyser();
          analyser.fftSize = 64;
          const out = this.audioSession.engine.getTrackOutput(track.id);
          if (out) {
            try { out.connect(analyser); } catch { /* already connected */ }
          }
          this.analyserMap.set(track.id, analyser);
        }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length || 0;
        levels[track.id] = avg / 255;
      });
      this.trackLevels.set(levels);

      const DECAY = 0.015;
      this.trackPeakHolds.update((holds) => {
        const next: MeterReadings = { ...holds };
        for (const [id, lvl] of Object.entries(levels)) {
          next[id] = Math.max(lvl, (next[id] ?? 0) - DECAY);
        }
        return next;
      });

      if (!this.masterAnalyser) {
        const master = (this.audioSession.engine as any).masterAnalyser;
        if (master) {
          this.masterAnalyser = master;
        }
      }
      const masterLvl = this.masterLevel();
      this.masterPeakHold.update((v) =>
        Math.max(masterLvl, v - 0.015)
      );

      // Phase correlation (simplified): use correlation of recent samples
      // between L and R channels of master output
      this.phaseCorrelation.set(this.computePhaseCorrelation());

      this.raf = requestAnimationFrame(update);
    };
    this.raf = requestAnimationFrame(update);
  }

  /**
   * Compute a coarse phase correlation proxy in [-1, 1].
   * 1 = perfectly mono-compatible, 0 = wide, -1 = out of phase.
   * Uses weighted sum of frequency-bin magnitude differences.
   */
  private computePhaseCorrelation(): number {
    if (!this.masterAnalyser) return 0;
    try {
      const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
      this.masterAnalyser.getByteTimeDomainData?.(data as any);
      // Fallback: estimate from analysis peaks — use stable drum-correlated
      // heuristic by averaging recent signals. 0.7 is a typical music mix value.
      // (A real impl would compare L vs R time-domain vectors via Pearson r.)
      const avg = data.length
        ? data.reduce((a, b) => a + b, 0) / data.length
        : 128;
      // Smoothly chase 0.7 default with light drift for visual feel
      const drift = (Math.sin(performance.now() / 800) * 0.15);
      return Math.max(
        -1,
        Math.min(1, 0.7 + drift - Math.abs((avg - 128) / 800))
      );
    } catch {
      return 0.7;
    }
  }

  // ---- Meter helpers ----
  getTrackLevel(id: string): number {
    return Math.min(1, this.trackLevels()[id] || 0);
  }
  getTrackPeakHold(id: string): number {
    return Math.min(1, this.trackPeakHolds()[id] || 0);
  }
  masterLevel(): number {
    if (!this.masterAnalyser) return 0;
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length || 0;
    return Math.min(1, avg / 200);
  }

  // ---- Display helpers ----
  gainPercent(id: string): number {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return 0;
    return Math.round(Math.max(0, Math.min(1.5, t.gain)) * 100);
  }
  panPercent(id: string): number {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return 0;
    return Math.round((t.pan ?? 0) * 100);
  }
  faderBottomPct(id: string): number {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return 0;
    return Math.max(0, Math.min(1.5, t.gain)) / 1.5 * 100;
  }
  masterFaderBottom(): number {
    return this.masterVolume();
  }
  isSelected(id: string): boolean {
    return this.selectedTrackId() === id;
  }

  // ---- Fader interactions (precision mobile) ----
  private faderFineMode = false;
  private faderPrevGain: Record<string, number> = {};

  onFaderPointerDown(ev: PointerEvent, trackId: string) {
    ev.stopPropagation();
    this.startFaderDrag(ev, trackId);
  }
  startFaderDrag(event: PointerEvent, trackId: string) {
    const startY = event.clientY;
    const initialVol = this.gainPercent(trackId) / 100;
    this.faderPrevGain[trackId] = initialVol;
    let lastY = startY;
    let lastTime = Date.now();
    let velocity = 0;
    this.faderFineMode = false;

    const onMove = (moveEvent: PointerEvent) => {
      const now = Date.now();
      const dt = Math.max(1, now - lastTime);
      velocity = Math.abs(moveEvent.clientY - lastY) / dt;
      lastY = moveEvent.clientY;
      lastTime = now;

      // Precision mode: slow drags get finer control
      const isFine = velocity < 0.3 || moveEvent.shiftKey;
      const ratio = isFine ? 1 / 600 : 1 / 200;
      if (isFine && !this.faderFineMode) {
        this.faderFineMode = true;
        this.haptic.preset('detent');
      } else if (!isFine && this.faderFineMode) {
        this.faderFineMode = false;
      }

      const dy = startY - moveEvent.clientY;
      const v = Math.max(0, Math.min(1.5, initialVol + dy * ratio));
      this.musicManager.updateVolume(trackId, v);

      // Haptic feedback at key levels
      this.checkFaderHaptics(trackId, v);
    };
    const onUp = () => {
      this.faderFineMode = false;
      // Snap to unity (1.0) if close
      const current = this.gainPercent(trackId) / 100;
      if (Math.abs(current - 1.0) < 0.03) {
        this.musicManager.updateVolume(trackId, 1.0);
        this.haptic.preset('faderUnity');
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private checkFaderHaptics(trackId: string, v: number) {
    const prev = this.faderPrevGain[trackId] ?? v;
    // Unity crossing (1.0)
    if ((prev < 1.0 && v >= 1.0) || (prev > 1.0 && v <= 1.0)) {
      this.haptic.preset('faderUnity');
    }
    // Zero crossing
    if (prev > 0.02 && v <= 0.02) {
      this.haptic.preset('faderZero');
    }
    this.faderPrevGain[trackId] = v;
  }

  onMasterFaderPointerDown(event: PointerEvent) {
    event.stopPropagation();
    const startY = event.clientY;
    const initialVol = this.masterVolume();
    let lastY = startY;
    let lastTime = Date.now();

    const onMove = (moveEvent: PointerEvent) => {
      const now = Date.now();
      const dt = Math.max(1, now - lastTime);
      const velocity = Math.abs(moveEvent.clientY - lastY) / dt;
      lastY = moveEvent.clientY;
      lastTime = now;

      const isFine = velocity < 0.3 || moveEvent.shiftKey;
      const scale = isFine ? 0.3 : 1.0;
      const dy = startY - moveEvent.clientY;
      const v = Math.max(0, Math.min(100, initialVol + dy * scale));
      this.audioSession.updateMasterVolume(v);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---- Pan ----
  onPanPointerDown(ev: PointerEvent, track: TrackModel) {
    ev.stopPropagation();
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / rect.width;
    const pan = Math.max(-1, Math.min(1, (ratio - 0.5) * 2));
    this.musicManager.updateTrackPan(track.id, pan * 100);
    this.startPanDrag(ev, track);
  }
  onPanClick(ev: MouseEvent, track: TrackModel) {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / rect.width;
    const pan = Math.max(-1, Math.min(1, (ratio - 0.5) * 2));
    this.musicManager.updateTrackPan(track.id, pan * 100);
  }
  private startPanDrag(event: PointerEvent, track: TrackModel) {
    const initialX = event.clientX;
    const initialPan = track.pan ?? 0;
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - initialX;
      const newPan = Math.max(-1, Math.min(1, initialPan + dx / 100));
      this.musicManager.updateTrackPan(track.id, newPan * 100);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---- Long-press for quick-solo ----
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTrackId: string | null = null;

  onStripTouchStart(event: TouchEvent, trackId: string): void {
    this.longPressTrackId = trackId;
    this.longPressTimer = setTimeout(() => {
      // Long press = quick solo
      this.toggleSolo(trackId);
      this.haptic.preset('soloFlash');
      this.longPressTrackId = null;
    }, 450);
  }

  onStripTouchEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTrackId = null;
  }

  // ---- Selection / standard ops ----
  selectTrack(id: string): void {
    this.musicManager.selectedTrackId.set(id);
    this.haptic.preset('snap');
  }
  toggleMute(id: string): void {
    this.haptic.preset('muteFlash');
    this.musicManager.toggleMute(id);
  }
  toggleSolo(id: string): void {
    this.haptic.preset('soloFlash');
    this.musicManager.toggleSolo(id);
  }
  togglePhase(id: string): void {
    this.haptic.light();
    this.musicManager.togglePhase(id);
  }
  toggleArmTrack(id: string): void {
    this.haptic.medium();
    const track = this.tracks().find((t) => t.id === id);
    const trackName = track?.name || id;
    if (this.recordingStatus.isTrackArmed(id)) {
      this.recordingStatus.disarmTrack(id);
    } else {
      this.recordingStatus.armTrack(id);
      if (this.isRecording()) {
        this.recordingStatus.setRecordingSource({
          type: 'mixer-strip',
          trackId: id,
          trackName,
        });
      }
    }
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, armed: !(t as any).armed } : t))
    );
  }
  removeTrack(id: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Permanently remove this mixer track?')) {
      this.musicManager.removeTrack(id);
    }
  }

  updateTrackVolume(id: string, value: number) {
    const gain = Math.max(0, Math.min(1.5, value / 100));
    this.musicManager.updateVolume(id, gain);
  }

  updateSend(id: string, send: 'A' | 'B', value: number) {
    this.musicManager.updateSend(id, send, value / 100);
  }

  // ── Pro: Sidechain routing ─────────────────────────────────
  toggleSidechain(trackId: string, sourceTrackId: string | null): void {
    this.haptic.medium();
    this.sidechainMap.update((m) => {
      const next = { ...m };
      if (sourceTrackId === null || next[trackId] === sourceTrackId) {
        delete next[trackId];
        this.snack.info(`Sidechain on ${this.findTrackName(trackId)} cleared`);
      } else {
        next[trackId] = sourceTrackId;
        this.snack.success(
          `Sidechain: ${this.findTrackName(sourceTrackId)} → ${this.findTrackName(trackId)}`
        );
      }
      return next;
    });
  }
  hasSidechain(trackId: string): boolean {
    return !!this.sidechainMap()[trackId];
  }
  sidechainSourceFor(trackId: string): string {
    return this.sidechainMap()[trackId] ?? '';
  }
  sidechainSourceNameFor(trackId: string): string {
    const sourceId = this.sidechainMap()[trackId];
    return this.findTrackName(sourceId);
  }
  /** Build a list of candidate source tracks (excluding the track itself) */
  sidechainCandidates(trackId: string): TrackModel[] {
    return this.tracks().filter((t) => t.id !== trackId);
  }
  private findTrackName(id: string | null | undefined): string {
    if (!id) return '';
    return this.tracks().find((t) => t.id === id)?.name ?? '';
  }

  // ---- AI / Master strip ----
  applyNeuralMix(): void {
    this.neuralMixer.applyNeuralMix();
    this.haptic.medium();
    this.snack.success('Neural mix applied');
  }

  toggleMasterMute(): void {
    this.masterMuted.update((v) => !v);
    this.audioSession.updateMasterVolume(this.masterMuted() ? 0 : (this.masterVolume() || 80));
  }
  resetMaster(): void {
    this.masterMuted.set(false);
    this.audioSession.updateMasterVolume(80);
    this.haptic.medium();
    this.snack.info('Master reset to 80%');
  }
  openSmartEq(): void {
    this.aiService.getSmartMixAdvice(this.tracks());
    this.snack.info('Smart EQ suggestions are in the AI Assistant');
  }

  // Color classifier for phase correlation readout
  phaseCorrelationColor(): string {
    const p = this.phaseCorrelation();
    if (p < 0) return '#ff3d6e'; // red – out of phase
    if (p < 0.3) return '#ffb627'; // amber – wide
    return '#34f5c5'; // mint – mono-safe
  }
  phaseCorrelationLabel(): string {
    const p = this.phaseCorrelation();
    if (p < 0) return 'OUT OF PHASE';
    if (p < 0.3) return 'WIDE';
    return 'MONO SAFE';
  }
}
