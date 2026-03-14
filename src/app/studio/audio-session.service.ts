import { LoggingService } from '../services/logging.service';
import { Injectable, signal, computed, inject } from '@angular/core';
import { InstrumentService } from './instrument.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { PlaybackState } from './playback-state';
import { MicrophoneService, AudioInputDevice } from '../services/microphone.service';

export interface MicChannel {
  id: string;
  label: string;
  level: number; // Volume level (0-100)
  muted: boolean;
  pan: number; // Panning (-100 to 100)
  armed: boolean; // Armed for recording
  deviceId?: string; // Specific input device ID
}

@Injectable({
  providedIn: 'root',
})
export class AudioSessionService {
  private logger = inject(LoggingService);
  private readonly instrumentService = inject(InstrumentService);
  private readonly engine = inject(AudioEngineService);
  private readonly micService = inject(MicrophoneService);

  readonly playbackState = signal<PlaybackState>('stopped');
  readonly isPlaying = computed(() => this.playbackState() === 'playing');
  readonly isRecording = computed(() => this.playbackState() === 'recording');
  readonly isStopped = computed(() => this.playbackState() === 'stopped');

  masterVolume = signal(80);
  micChannels = signal<MicChannel[]>([
    {
      id: 'mic-1',
      label: 'Lead Vocals',
      level: 70,
      muted: false,
      pan: 0,
      armed: true,
    },
    {
      id: 'guitar-1',
      label: 'Secondary In',
      level: 60,
      muted: false,
      pan: 20,
      armed: false,
    },
  ]);

  availableDevices = this.micService.availableDevices;

  constructor() {
    this.instrumentService.connect(this.engine.getContext().destination);
    // Initialize first armed channel with default device if possible
    const armed = this.micChannels().find(ch => ch.armed);
    if (armed) {
        this.initializeMic(armed.id);
    }
  }

  async initializeMic(channelId: string, deviceId?: string): Promise<void> {
    const channel = this.micChannels().find(ch => ch.id === channelId);
    if (channel) {
        await this.micService.initialize(deviceId || channel.deviceId);
        if (deviceId) {
            this.updateChannelDevice(channelId, deviceId);
        }
    }
  }

  togglePlay(): void {
    if (this.engine.isPlaying()) {
        this.engine.stop();
        this.playbackState.set('stopped');
    } else {
        this.engine.start();
        this.playbackState.set('playing');
    }
  }

  toggleRecord(): void {
    if (this.isRecording()) {
        this.engine.stop();
        this.playbackState.set('stopped');
    } else {
        this.engine.start();
        this.playbackState.set('recording');
    }
  }

  stop(): void {
    this.engine.stop();
    this.playbackState.set('stopped');
  }

  updateMasterVolume(newVolume: number): void {
    this.masterVolume.set(newVolume);
    this.engine.setMasterOutputLevel(newVolume / 100);
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
    const channel = this.micChannels().find(ch => ch.id === id);
    if (channel?.armed && !this.micService.isInitialized()) {
        this.initializeMic(id);
    }
  }

  updateChannelDevice(id: string, deviceId: string): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, deviceId } : ch))
    );
  }

  onNoteClicked(note: { midi: number; velocity: number }): void {
    this.logger.info('AudioSession: Note clicked:', note);
    this.instrumentService.play(0, note.midi || 60, note.velocity || 0.8);
  }
}
