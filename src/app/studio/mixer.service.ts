import { Injectable, inject, signal } from '@angular/core';
import { InstrumentService } from './instrument.service';
import { MixerStrip } from './mixer-strip';

export interface Channel {
  id: string;
  name: string;
  strip: MixerStrip;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MixerService {
  private readonly instrumentService = inject(InstrumentService);
  private audioContext: AudioContext;

  channels = signal<Channel[]>([]);
  masterStrip: MixerStrip;

  constructor() {
    this.audioContext = this.instrumentService.getAudioContext();
    this.masterStrip = new MixerStrip(this.audioContext);
    this.masterStrip.getOutput().connect(this.audioContext.destination);

    for (let i = 1; i <= 8; i++) {
      this.addChannel(`Insert ${i}`);
    }
  }

  addChannel(name: string) {
    const strip = new MixerStrip(this.audioContext);
    strip.getOutput().connect(this.masterStrip.getInput());

    const channel: Channel = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      strip,
      volume: 80,
      pan: 0,
      muted: false,
      soloed: false,
    };

    this.channels.update((channels) => [...channels, channel]);
    return channel;
  }

  getChannel(id: string) {
    return this.channels().find((c) => c.id === id);
  }

  setVolume(channelId: string, volume: number) {
    const channel = this.getChannel(channelId);
    if (channel) {
      channel.volume = volume;
      channel.strip.setVolume(volume);
    }
  }

  setPan(channelId: string, pan: number) {
    const channel = this.getChannel(channelId);
    if (channel) {
      channel.pan = pan;
      channel.strip.setPan(pan);
    }
  }
}
