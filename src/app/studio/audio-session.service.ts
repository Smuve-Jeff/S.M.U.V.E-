import { Injectable, signal } from '@angular/core';

export interface MicChannel {
  id: string;
  label: string;
  level: number; // Volume level (0-100)
  muted: boolean;
  pan: number; // Panning (-100 to 100)
  armed: boolean; // Armed for recording
}

@Injectable({
  providedIn: 'root'
})
export class AudioSessionService {
  masterVolume = signal(80);
  isRecording = signal(false);
  micChannels = signal<MicChannel[]>([
    { id: 'mic-1', label: 'Vocal Mic', level: 70, muted: false, pan: 0, armed: true },
    { id: 'guitar-1', label: 'Guitar Amp', level: 60, muted: false, pan: 20, armed: false },
    { id: 'drums-1', label: 'Overheads', level: 50, muted: false, pan: -10, armed: false },
  ]);

  constructor() { }

  updateMasterVolume(newVolume: number): void {
    this.masterVolume.set(newVolume);
  }

  updateChannelLevel(id: string, newLevel: number): void {
    this.micChannels.update(channels =>
      channels.map(ch => (ch.id === id ? { ...ch, level: newLevel } : ch))
    );
  }

  toggleChannelMute(id: string): void {
    this.micChannels.update(channels =>
        channels.map(ch => (ch.id === id ? { ...ch, muted: !ch.muted } : ch))
      );
  }

  updateChannelPan(id: string, newPan: number): void {
      this.micChannels.update(channels =>
          channels.map(ch => (ch.id === id ? { ...ch, pan: newPan } : ch))
        );
  }

  toggleChannelArm(id: string): void {
    this.micChannels.update(channels =>
        channels.map(ch => (ch.id === id ? { ...ch, armed: !ch.armed } : ch))
      );
  }
}
