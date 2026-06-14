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
  activeRackId = signal<number | null>(null);

  private analysers = new Map<number, AnalyserNode>();
  private trackLevels = signal<Record<number, number>>({});
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
      const levels: Record<number, number> = {};
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

  toggleRack(id: number, event: Event) {
    event.stopPropagation();
    this.activeRackId.update(current => current === id ? null : id);
  }

  updateTrackFX(id: number, type: string, value: number) {
    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id !== id) return t;
      const fxSlots = [...(t.fxSlots ?? [])];
      const slotIndex = fxSlots.findIndex(s => s.type === type);
      if (slotIndex >= 0) {
        const existing = fxSlots[slotIndex];
        fxSlots[slotIndex] = {
          ...existing,
          params: { ...(existing.params ?? {}), amount: value },
        };
      } else {
        fxSlots.push({ id: `fx-${Date.now()}`, type, params: { amount: value }, enabled: true });
      }
      return { ...t, fxSlots };
    }));
      }
      return { ...t, fxSlots };
    }));
    this.audioSession.engine.updateTrackInsert(id, type, value);
  }

  getFXAmount(track: any, type: string): number {
    const slot = track.fxSlots?.find((s: any) => s.type === type);
    return slot?.params?.amount || 0;
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
  selectTrack(id: number): void {
    this.musicManager.selectedTrackId.set(id);
  }
  toggleMute(id: number) {
    this.musicManager.toggleMute(id);
  }
  toggleSolo(id: number) {
    this.musicManager.toggleSolo(id);
  }

  removeTrack(id: number, event: Event) {
    event.stopPropagation();
    if (confirm("Permanently remove this mixer track?")) {
      this.musicManager.removeTrack(id);
    }
  }

  updateTrackVolume(id: number, value: number) {
    const gain = Math.max(0, Math.min(1.5, value / 100));
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, gain } : t))
    );
    this.musicManager.engine.updateTrack(id, { gain });
  }

  updateTrackPan(id: number, value: number) {
    const pan = Math.max(-1, Math.min(1, value / 100));
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, pan } : t))
    );
    this.musicManager.engine.updateTrack(id, { pan });
  }

  updateTrackParam(id: number, param: string, value: number) {
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
  getTrackLevel(id: number): number {
    return this.trackLevels()[id] || 0;
  }
}
