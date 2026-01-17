import { Injectable, signal, computed, inject } from '@angular/core';
import { InstrumentService } from './instrument.service';
import { PlaybackState } from './playback-state';

export interface MicChannel {
  id: string;
  label: string;
  level: number; // Volume level (0-100)
  muted: boolean;
  pan: number; // Panning (-100 to 100)
  armed: boolean; // Armed for recording
}

@Injectable({
  providedIn: 'root',
})
export class AudioSessionService {
  private readonly instrumentService = inject(InstrumentService);

  readonly playbackState = signal<PlaybackState>('stopped');
  readonly isPlaying = computed(() => this.playbackState() === 'playing');
  readonly isRecording = computed(() => this.playbackState() === 'recording');
  readonly isStopped = computed(() => this.playbackState() === 'stopped');

  masterVolume = signal(80);
  micChannels = signal<MicChannel[]>([
    {
      id: 'mic-1',
      label: 'Vocal Mic',
      level: 70,
      muted: false,
      pan: 0,
      armed: true,
    },
    {
      id: 'guitar-1',
      label: 'Guitar Amp',
      level: 60,
      muted: false,
      pan: 20,
      armed: false,
    },
    {
      id: 'drums-1',
      label: 'Overheads',
      level: 50,
      muted: false,
      pan: -10,
      armed: false,
    },
  ]);

  constructor() {
    const audioContext = this.instrumentService.getAudioContext();
    this.instrumentService.connect(audioContext.destination);
  }

  togglePlay(): void {
    this.playbackState.update((state) =>
      state === 'playing' ? 'stopped' : 'playing'
    );
  }

  toggleRecord(): void {
    this.playbackState.update((state) =>
      state === 'recording' ? 'stopped' : 'recording'
    );
  }

  stop(): void {
    this.playbackState.set('stopped');
  }

  updateMasterVolume(newVolume: number): void {
    this.masterVolume.set(newVolume);
  }

  updateChannelLevel(id: string, newLevel: number): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, level: newLevel } : ch))
    );
  }

  toggleChannelMute(id: string): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, muted: !ch.muted } : ch))
    );
  }

  updateChannelPan(id: string, newPan: number): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, pan: newPan } : ch))
    );
  }

  toggleChannelArm(id: string): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, armed: !ch.armed } : ch))
    );
  }
}
