import { Injectable } from '@angular/core';

export interface Stems {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  instrumental: AudioBuffer;
  other: AudioBuffer;
}

@Injectable({
  providedIn: 'root',
})
export class StemSeparationService {
  constructor() {}

  separate(buffer: AudioBuffer): Stems {
    return {
      vocals: this.cloneAudioBuffer(buffer),
      drums: this.cloneAudioBuffer(buffer),
      bass: this.cloneAudioBuffer(buffer),
      instrumental: this.cloneAudioBuffer(buffer),
      other: this.cloneAudioBuffer(buffer),
    };
  }

  private cloneAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const newBuffer = new AudioBuffer({
      length: buffer.length,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
    });

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      newBuffer.copyToChannel(buffer.getChannelData(i), i);
    }

    return newBuffer;
  }
}
