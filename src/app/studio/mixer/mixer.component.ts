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
import { KnobComponent } from '../shared/knob/knob.component';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { MixerService } from '../mixer.service';
import { HapticService } from '../../services/haptic.service';
import { AiService } from '../../services/ai.service';
import { Clip } from '../instrument.service';

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './mixer.component.html',
  styleUrl: './mixer.component.css',
})
export class MixerComponent implements OnInit, OnDestroy {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly neuralMixer = inject(NeuralMixerService);
  private readonly haptic = inject(HapticService);
  public readonly mixerService = inject(MixerService);
  public readonly aiService = inject(AiService);

  @Input() activeClip: Clip | null = null;

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  masterVolume = this.audioSession.masterVolume;
  selectedTrackId = this.musicManager.selectedTrackId;
  tracks = this.musicManager.tracks;

  selectedTrack = computed(() =>
    this.tracks().find((t) => t.id === this.selectedTrackId())
  );
  viewMode = signal<'compact' | 'expanded'>('expanded');

  private analysers = new Map<string, AnalyserNode>();
  private trackLevels = signal<Record<string, number>>({});
  private animationFrame?: number;

  ngOnInit() {
    this.startMetering();
  }

  ngOnDestroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private startMetering() {
    const update = () => {
      const levels: Record<string, number> = {};
      this.tracks().forEach((track) => {
        let analyser = this.analysers.get(track.id);
        if (!analyser) {
          analyser = this.audioSession.engine.ctx.createAnalyser();
          analyser.fftSize = 32;
          const output = this.audioSession.engine.getTrackOutput(track.id);
          output.connect(analyser);
          this.analysers.set(track.id, analyser);
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        levels[track.id] = avg / 255;
      });
      this.trackLevels.set(levels);
      this.animationFrame = requestAnimationFrame(update);
    };
    this.animationFrame = requestAnimationFrame(update);
  }

  toggleMixerWidth() { this.toggleViewMode(); }
  isPeaking(id: string) { return (this.trackLevels()[id] || 0) > 0.95; }
  startFaderDrag(event: PointerEvent, track: TrackModel) {
    const initialY = event.clientY;
    const initialVol = track.volume;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = (initialY - moveEvent.clientY) / 100;
      this.musicManager.updateVolume(track.id, Math.max(0, Math.min(1.5, initialVol + delta)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  toggleViewMode() {
    this.viewMode.update((v) => (v === 'compact' ? 'expanded' : 'compact'));
  }
  updateMasterVolume(newVolume: number): void {
    this.audioSession.updateMasterVolume(newVolume);
  }
  applyNeuralMix(): void {
    this.neuralMixer.applyNeuralMix();
  }
  selectTrack(id: string): void {
    this.musicManager.selectedTrackId.set(id);
  }
  toggleMute(id: string) {
    this.musicManager.toggleMute(id);
  }
  toggleSolo(id: string) {
    this.musicManager.toggleSolo(id);
  }

  removeTrack(id: string, event: Event) {
    event.stopPropagation();
    if (confirm("Permanently remove this mixer track?")) {
      this.musicManager.removeTrack(id);
    }
  }

  updateTrackVolume(id: string, value: number) {
    const gain = Math.max(0, Math.min(1.5, value / 100));
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, gain } : t))
    );
    this.musicManager.engine.updateTrack(id, { gain });
  }

  updateTrackPan(id: string, value: number) {
    const pan = Math.max(-1, Math.min(1, value / 100));
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, pan } : t))
    );
    this.musicManager.engine.updateTrack(id, { pan });
  }

  updateTrackParam(id: string, param: string, value: number) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, [param]: value } : t))
    );
    this.musicManager.engine.applyProductionParameter(id.toString(), param, value);
  }

  gainPercent(track: TrackModel): number {
    return Math.round(track.gain * 100);
  }
  panPercent(track: TrackModel): number {
    return Math.round(track.pan * 100);
  }
  isSelected(track: TrackModel): boolean {
    return this.selectedTrackId() === track.id;
  }
  getTrackLevel(id: any): number {
    return this.trackLevels()[id] || 0;
  }
}
