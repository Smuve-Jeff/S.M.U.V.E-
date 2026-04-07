import { Component, Input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { ChannelStripComponent } from '../channel-strip/channel-strip.component';
import { VocalSuiteComponent } from '../vocal-suite/vocal-suite.component';
import {
  MusicManagerService,
  TrackModel,
  FxSlot,
} from '../../services/music-manager.service';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { MixerService } from '../mixer.service';
import { Clip } from '../instrument.service';

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, ChannelStripComponent, VocalSuiteComponent],
  templateUrl: './mixer.component.html',
  styleUrls: ['./mixer.component.css'],
})
export class MixerComponent {
  private readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly neuralMixer = inject(NeuralMixerService);
  public readonly mixerService = inject(MixerService);

  @Input() activeClip: Clip | null = null;

  playbackState = this.audioSession.playbackState;
  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  micChannels = this.audioSession.micChannels;
  masterVolume = this.audioSession.masterVolume;
  selectedTrackId = this.musicManager.selectedTrackId;
  tracks = this.musicManager.tracks;

  viewMode = signal<'compact' | 'expanded'>('expanded');
  showVocalSuite = signal(false);

  toggleViewMode() {
    this.viewMode.update((v) => (v === 'compact' ? 'expanded' : 'compact'));
  }

  toggleVocalSuite() {
    this.showVocalSuite.update((v) => !v);
  }

  updateMasterVolume(newVolume: number): void {
    this.audioSession.updateMasterVolume(newVolume);
  }

  applyNeuralMix(): void {
    this.neuralMixer.applyNeuralMix();
  }

  suggestTrack(id: number) {
    this.neuralMixer.suggestForTrack(id);
  }

  stopTrackSelection(event: Event): void {
    event.stopPropagation();
  }

  togglePlayback(): void {
    this.audioSession.togglePlay();
  }

  toggleRecording(): void {
    this.audioSession.toggleRecord();
  }

  stopPlayback(): void {
    this.audioSession.stop();
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

  updateTrackGain(id: number, value: number) {
    const gain = Math.max(0, Math.min(1, value / 100));
    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) => (track.id === id ? { ...track, gain } : track))
    );
    this.musicManager.engine.updateTrack(id, { gain });
  }

  updateTrackPan(id: number, value: number) {
    const pan = Math.max(-1, Math.min(1, value / 100));
    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) => (track.id === id ? { ...track, pan } : track))
    );
    this.musicManager.engine.updateTrack(id, { pan });
  }

  gainPercent(track: TrackModel): number {
    return Math.round(Math.max(0, Math.min(1, track.gain)) * 100);
  }

  panPercent(track: TrackModel): number {
    return Math.round(Math.max(-1, Math.min(1, track.pan)) * 100);
  }

  isSelected(track: TrackModel): boolean {
    return this.selectedTrackId() === track.id;
  }

  toggleFxSlot(trackId: number, slotId: string) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          fxSlots: t.fxSlots.map((s) =>
            s.id === slotId ? { ...s, enabled: !s.enabled } : s
          ),
        };
      })
    );
    const track = this.musicManager.tracks().find((t) => t.id === trackId);
    if (track)
      this.musicManager.engine.updateTrack(trackId, { fxSlots: track.fxSlots });
  }

  resetTrack(id: number) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, gain: 0.9, pan: 0 } : t))
    );
    this.musicManager.engine.updateTrack(id, { gain: 0.9, pan: 0 });
  }

  onLongPress(event: Event, trackId: number) {
    event.preventDefault();
    console.log('Long press on track', trackId);
  }
}
