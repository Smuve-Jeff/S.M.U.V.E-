import { LoggingService } from './logging.service';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface Stems {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  melody: AudioBuffer;
}

@Injectable({
  providedIn: 'root',
})
export class StemSeparationService {
  private logger = inject(LoggingService);

  constructor() {}

  separate(audioBuffer: AudioBuffer): Observable<Stems | null> {
    this.logger.info(
      'StemSeparationService: Initializing Neural Frequency Splitter (Simulation)...'
    );

    // We simulate stem separation by applying different frequency filters to the original buffer.
    // This provides a "functional feel" where the user actually hears different components.
    return from(this.simulateSeparation(audioBuffer));
  }

  private async simulateSeparation(buffer: AudioBuffer): Promise<Stems> {
    // Create 4 distinct "stems" using filters
    const vocals = await this.applyFilter(buffer, 'peaking', 2500, 1.5, 6); // Boost vocal range
    const drums = await this.applyFilter(buffer, 'highpass', 5000); // Emphasize transients
    const bass = await this.applyFilter(buffer, 'lowpass', 250); // Low-end only
    const melody = await this.applyFilter(buffer, 'bandpass', 1000, 1.0); // Mid-range focus

    this.logger.info(
      'StemSeparationService: Neural frequency reconstruction complete.'
    );

    return { vocals, drums, bass, melody };
  }

  private async applyFilter(
    buffer: AudioBuffer,
    type: BiquadFilterType,
    freq: number,
    q: number = 1.0,
    gain: number = 0
  ): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const filter = offlineCtx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    filter.gain.value = gain;

    source.connect(filter);
    filter.connect(offlineCtx.destination);
    source.start(0);

    return await offlineCtx.startRendering();
  }
}
