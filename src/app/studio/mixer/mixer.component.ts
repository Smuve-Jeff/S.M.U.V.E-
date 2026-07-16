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
  private masterAnalyser?: AnalyserNode;
  private raf?: number;

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
      // per-track levels
      this.tracks().forEach((track) => {
        let analyser = this.analyserMap.get(track.id);
        if (!analyser) {
          analyser = this.audioSession.engine.ctx.createAnalyser();
          analyser.fftSize = 32;
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

      // master level
      if (!this.masterAnalyser) {
        const master = (this.audioSession.engine as any).masterAnalyser;
        if (master) {
          this.masterAnalyser = master;
        }
      }
      this.raf = requestAnimationFrame(update);
    };
    this.raf = requestAnimationFrame(update);
  }

  // ---- Meter helpers ----
  getTrackLevel(id: string): number {
    return Math.min(1, this.trackLevels()[id] || 0);
  }
  isPeaking(id: string): boolean {
    return (this.trackLevels()[id] || 0) > 0.95;
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

  // ---- Fader interactions ----
  onFaderPointerDown(ev: PointerEvent, trackId: string) {
    ev.stopPropagation();
    this.startFaderDrag(ev, trackId);
  }
  startFaderDrag(event: PointerEvent, trackId: string) {
    const startY = event.clientY;
    const initialVol = this.gainPercent(trackId) / 100;
    const track = this.tracks().find((t) => t.id === trackId);
    const baseHeight = this.faderBottomPct(trackId);
    const onMove = (moveEvent: PointerEvent) => {
      const dy = startY - moveEvent.clientY;
      const ratio = 1 / 200;
      const v = Math.max(0, Math.min(1.5, initialVol + dy * ratio));
      this.musicManager.updateVolume(trackId, v);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    void track;
    void baseHeight;
  }
  onMasterFaderPointerDown(event: PointerEvent) {
    event.stopPropagation();
    const startY = event.clientY;
    const initialVol = this.masterVolume();
    const onMove = (moveEvent: PointerEvent) => {
      const dy = startY - moveEvent.clientY;
      const v = Math.max(0, Math.min(100, initialVol + dy));
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

  // ---- Selection / standard ops ----
  selectTrack(id: string): void {
    this.musicManager.selectedTrackId.set(id);
  }
  toggleMute(id: string): void {
    this.haptic.light();
    this.musicManager.toggleMute(id);
  }
  toggleSolo(id: string): void {
    this.haptic.light();
    this.musicManager.toggleSolo(id);
  }
  toggleArmTrack(id: string): void {
    this.haptic.medium();
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

  applyNeuralMix(): void {
    this.neuralMixer.applyNeuralMix();
    this.haptic.medium();
    this.snack.success('Neural mix applied — try other sounds on a clean list.');
  }

  // ---- Master strip ----
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
}
