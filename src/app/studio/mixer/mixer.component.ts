import { Component, Input, inject, signal, computed } from '@angular/core';
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
import { Clip } from '../instrument.service';

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './mixer.component.html',
  styleUrl: './mixer.component.css',
})
export class MixerComponent {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly neuralMixer = inject(NeuralMixerService);
  private readonly haptic = inject(HapticService);
  public readonly mixerService = inject(MixerService);

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

  gainPercent(track: TrackModel): number {
    return Math.round(track.gain * 100);
  }
  panPercent(track: TrackModel): number {
    return Math.round(track.pan * 100);
  }
  isSelected(track: TrackModel): boolean {
    return this.selectedTrackId() === track.id;
  }
}
