import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { ChannelStripComponent } from '../channel-strip/channel-strip.component';
import { MicrophoneInterfaceComponent } from '../microphone-interface/microphone-interface.component';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { Clip } from '../instrument.service';

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, ChannelStripComponent, MicrophoneInterfaceComponent],
  templateUrl: './mixer.component.html',
  styleUrls: ['./mixer.component.css'],
})
export class MixerComponent {
  private readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);

  @Input() activeClip: Clip | null = null;

  playbackState = this.audioSession.playbackState;
  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  micChannels = this.audioSession.micChannels;
  masterVolume = this.audioSession.masterVolume;
  selectedTrackId = this.musicManager.selectedTrackId;
  tracks = this.musicManager.tracks;

  updateMasterVolume(newVolume: number): void {
    this.audioSession.updateMasterVolume(newVolume);
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

  updateTrackSend(id: number, send: 'sendA' | 'sendB', value: number) {
    const normalized = Math.max(0, Math.min(1, value / 100));
    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === id ? { ...track, [send]: normalized } : track
      )
    );
    this.musicManager.engine.updateTrack(id, { [send]: normalized });
  }

  gainPercent(track: TrackModel): number {
    return Math.round(Math.max(0, Math.min(1, track.gain)) * 100);
  }

  panPercent(track: TrackModel): number {
    return Math.round(Math.max(-1, Math.min(1, track.pan)) * 100);
  }

  sendPercent(track: TrackModel, send: 'sendA' | 'sendB'): number {
    return Math.round(Math.max(0, Math.min(1, track[send])) * 100);
  }

  isSelected(track: TrackModel): boolean {
    return this.selectedTrackId() === track.id;
  }

  selectedTrack(): TrackModel | null {
    return this.tracks().find((track) => this.isSelected(track)) ?? null;
  }

  activeNotes(track: TrackModel): number {
    return track.notes.length;
  }

  selectedTrackNoteCount(): number {
    const track = this.selectedTrack();
    return track ? this.activeNotes(track) : 0;
  }

  armedMicCount(): number {
    return this.micChannels().filter((channel) => channel.armed).length;
  }

  mutedTrackCount(): number {
    return this.tracks().filter((track) => track.mute).length;
  }

  soloTrackCount(): number {
    return this.tracks().filter((track) => track.solo).length;
  }
}
