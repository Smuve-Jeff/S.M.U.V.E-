import { Injectable, computed, effect, signal } from '@angular/core';

// TODO: Formalize into a proper interface and move to a shared location
export type ConnectionType =
  | 'usb'
  | 'xlr'
  | 'line'
  | 'bluetooth'
  | 'wifi'
  | 'midi';
export type ChannelCategory =
  | 'mic'
  | 'instrument'
  | 'aux'
  | 'master'
  | 'vocal'
  | 'room'
  | 'custom';
export type RecordingFormat = 'wav' | 'mp3' | 'flac';

export interface QualityProfile {
  sampleRate: 44100 | 48000 | 88200 | 96000;
  bitDepth: 16 | 24 | 32;
  // Global override for phantom power
  phantomPowerBus: boolean;
  // Toggle individual quality features
  autoGain: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}

export interface Channel {
  id: string;
  label: string;
  category: ChannelCategory;
  connectionType: ConnectionType;
  level: number; // 0-100
  pan: number; // -50 to 50
  muted: boolean;
  armed: boolean; // Is it armed for recording?
  phantomPower: boolean;
  noiseGate: number; // 0-100 threshold
  distortionGuard: number; // 0-100 threshold
  latencyMs: number; // Manually adjusted latency
}

export interface RecordedTake {
  id: string;
  name: string;
  format: RecordingFormat;
  timestamp: Date;
  durationMs: number;
  channelId: string;
  // Emulated file path for download
  blobUrl: string;
}

export interface StudioMicChannelConfig {
  id: string;
  label: string;
  level: number;
  pan: number;
  connectionType: ConnectionType;
  phantomPower: boolean;
  latencyMs: number;
  noiseGate: number;
  distortionGuard: number;
  muted: boolean;
  category: ChannelCategory;
  armed: boolean;
}

// --- Mock State & Service ---

const MOCK_CHANNELS: Channel[] = [
  {
    id: 'ch1',
    label: 'Lead Vocals',
    category: 'vocal',
    connectionType: 'xlr',
    level: 75,
    pan: 0,
    muted: false,
    armed: true,
    phantomPower: true,
    noiseGate: 20,
    distortionGuard: 80,
    latencyMs: 5,
  },
  {
    id: 'ch2',
    label: 'Rhythm Guitar',
    category: 'instrument',
    connectionType: 'line',
    level: 60,
    pan: -25,
    muted: false,
    armed: true,
    phantomPower: false,
    noiseGate: 10,
    distortionGuard: 90,
    latencyMs: 12,
  },
  {
    id: 'ch3',
    label: 'Synth Bass',
    category: 'instrument',
    connectionType: 'usb',
    level: 85,
    pan: 0,
    muted: false,
    armed: false,
    phantomPower: false,
    noiseGate: 5,
    distortionGuard: 95,
    latencyMs: 8,
  },
  {
    id: 'ch4',
    label: 'Guest Mic',
    category: 'room',
    connectionType: 'wifi',
    level: 65,
    pan: 25,
    muted: true,
    armed: false,
    phantomPower: false,
    noiseGate: 25,
    distortionGuard: 75,
    latencyMs: 18,
  },
];

const MOCK_QUALITY: QualityProfile = {
  sampleRate: 48000,
  bitDepth: 24,
  phantomPowerBus: false,
  autoGain: true,
  noiseSuppression: true,
  echoCancellation: false,
};

@Injectable({
  providedIn: 'root',
})
export class MicrophoneRoutingService {
  // --- Signals for reactive state management ---
  micChannels = signal<Channel[]>(MOCK_CHANNELS);
  qualityProfile = signal<QualityProfile>(MOCK_QUALITY);

  constructor() {
    // Example of an effect that reacts to state changes
    effect(() => {
      console.log(`Channels updated: ${this.micChannels().length} channels`);
      this.micChannels().forEach((ch) => this.updateMediaStreamForChannel(ch));
    });
    effect(() => {
      console.log(
        `Quality profile changed: Sample Rate ${this.qualityProfile().sampleRate}`
      );
      this.micChannels().forEach((ch) => this.updateMediaStreamForChannel(ch));
    });
  }

  // --- Channel Management ---
  addChannel(channel: Omit<Channel, 'id'>): void {
    const newChannel: Channel = { ...channel, id: `ch${Date.now()}` };
    this.micChannels.update((channels) => [...channels, newChannel]);
  }

  removeChannel(channelId: string): void {
    this.micChannels.update((channels) =>
      channels.filter((c) => c.id !== channelId)
    );
  }

  updateChannel(channelId: string, updates: Partial<Channel>): void {
    this.micChannels.update((channels) =>
      channels.map((c) => (c.id === channelId ? { ...c, ...updates } : c))
    );
  }

  // --- Quality Profile Management ---
  updateQualityProfile(updates: Partial<QualityProfile>): void {
    this.qualityProfile.update((profile) => ({ ...profile, ...updates }));
  }

  // --- Signal Processing & Media Streams ---
  // This is where the Web Audio API would be integrated.
  private async updateMediaStreamForChannel(channel: Channel) {
    // In a real app, you would manage MediaStream instances here.
    // For this mock, we'll just log the intended operations.

    const config = this.qualityProfile();
    const constraints: MediaTrackConstraints = {
      sampleRate: config.sampleRate,
      sampleSize: config.bitDepth,
      echoCancellation: config.echoCancellation,
      noiseSuppression: config.noiseSuppression,
      autoGainControl: config.autoGain,
    };

    console.log(
      `[Mock] Applying constraints for ${channel.label}:`,
      constraints
    );

    if (channel.phantomPower || config.phantomPowerBus) {
      console.log(`[Mock] Phantom power enabled for ${channel.label}`);
    }

    // Here you would create/update an AudioContext graph with nodes for:
    // - Gain (for level)
    // - Panner (for pan)
    // - Noise Gate (using a DynamicsCompressorNode or custom processor)
    // - Distortion Guard (using a WaveShaperNode or custom logic)
  }

  // --- Computed Values for UI ---
  getArmedChannels = computed(() => this.micChannels().filter((c) => c.armed));

  // --- Methods for StudioInterfaceComponent ---
  setPhantomPowerBus(value: boolean) {
    this.qualityProfile.update((p) => ({ ...p, phantomPowerBus: value }));
  }

  setNoiseSuppression(value: boolean) {
    this.qualityProfile.update((p) => ({ ...p, noiseSuppression: value }));
  }

  subscribeToMeters(callback: (id: string, level: number) => void): () => void {
    const interval = setInterval(() => {
      this.micChannels().forEach((c) => {
        if (!c.muted) {
          const level = (Math.random() * c.level) / 100;
          callback(c.id, level);
        }
      });
    }, 100);
    return () => clearInterval(interval);
  }

  setChannelLevel(id: string, value: number) {
    this.updateChannel(id, { level: value });
  }

  setChannelPan(id: string, value: number) {
    this.updateChannel(id, { pan: value });
  }

  setConnectionType(id: string, value: ConnectionType) {
    this.updateChannel(id, { connectionType: value });
  }

  setChannelPhantomPower(id: string, value: boolean) {
    this.updateChannel(id, { phantomPower: value });
  }

  setChannelLatency(id: string, value: number) {
    this.updateChannel(id, { latencyMs: value });
  }

  setChannelNoiseGate(id: string, value: number) {
    this.updateChannel(id, { noiseGate: value });
  }

  setChannelDistortionGuard(id: string, value: number) {
    this.updateChannel(id, { distortionGuard: value });
  }

  setMuted(id: string, value: boolean) {
    this.updateChannel(id, { muted: value });
  }

  disposeChannel(id: string) {
    this.removeChannel(id);
  }

  async setRecordingActive(value: boolean) {
    console.log('Recording active:', value);
  }

  async ensureChannel(config: Channel) {
    const existing = this.micChannels().find((c) => c.id === config.id);
    if (!existing) {
      this.micChannels.update((channels) => [...channels, config]);
    }
  }
}
