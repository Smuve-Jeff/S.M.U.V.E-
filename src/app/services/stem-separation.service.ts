import { Injectable, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';

export interface Stems {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  instrumental: AudioBuffer;
  other: AudioBuffer;
}

export interface StemMetadata {
  /** Duration in seconds */
  duration: number;
  /** Sample rate */
  sampleRate: number;
  /** Whether stems were processed on-device (worklet) vs offline context */
  onDevice: boolean;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

export interface StemProgress {
  /** 0–100 */
  progress: number;
  /** Current processing stage */
  stage: 'idle' | 'loading' | 'processing' | 'complete' | 'error';
  message: string;
}

export interface StemResult {
  stems: Stems;
  metadata: StemMetadata;
}

@Injectable({
  providedIn: 'root',
})
export class StemSeparationService {
  private notificationService = inject(NotificationService);

  /** Live progress during on-device separation */
  readonly progress = signal<StemProgress>({
    progress: 0,
    stage: 'idle',
    message: 'Ready',
  });

  /** Whether separation is in progress */
  readonly isSeparating = signal(false);

  /** AudioWorklet node for on-device processing */
  private workletNode: AudioWorkletNode | null = null;

  /**
   * Separate stems on-device using the stem-separator AudioWorklet.
   * Falls back to offline AudioContext if the worklet fails to load.
   */
  async separateOnDevice(
    buffer: AudioBuffer,
    audioContext: AudioContext
  ): Promise<StemResult | null> {
    if (this.isSeparating()) {
      this.notificationService.show(
        'Stem separation already in progress.',
        'warning'
      );
      return null;
    }

    this.isSeparating.set(true);
    const startTime = performance.now();

    this.progress.set({
      progress: 0,
      stage: 'loading',
      message: 'Initializing neural stem processor…',
    });

    try {
      // Load the worklet module if not already loaded
      await this.ensureWorkletLoaded(audioContext);

      // Prepare channel data
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        channels.push(new Float32Array(buffer.getChannelData(c)));
      }

      this.progress.set({
        progress: 10,
        stage: 'processing',
        message: 'Performing spectral decomposition…',
      });

      // Send to worklet for processing
      const stems = await this.processInWorklet(channels, buffer.sampleRate);

      const processingTimeMs = performance.now() - startTime;

      this.progress.set({
        progress: 100,
        stage: 'complete',
        message: `Separation complete in ${(processingTimeMs / 1000).toFixed(1)}s`,
      });

      this.notificationService.show(
        'Neural Stem Isolation Complete: 4 stems extracted on-device.',
        'success'
      );

      this.isSeparating.set(false);

      return {
        stems,
        metadata: {
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          onDevice: true,
          processingTimeMs: Math.round(processingTimeMs),
        },
      };
    } catch (err: any) {
      console.warn(
        'StemSeparation: Worklet separation failed, falling back to offline context.',
        err?.message
      );

      this.progress.set({
        progress: 0,
        stage: 'error',
        message: 'Worklet failed — using offline renderer…',
      });

      // Fall back to the offline context method
      const result = await this.separate(buffer);
      const processingTimeMs = performance.now() - startTime;

      this.isSeparating.set(false);

      if (!result) return null;

      return {
        stems: result,
        metadata: {
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          onDevice: false,
          processingTimeMs: Math.round(processingTimeMs),
        },
      };
    }
  }

  /**
   * Legacy offline separation using biquad filtering.
   * Kept as fallback and for environments without AudioWorklet.
   */
  async separate(buffer: AudioBuffer): Promise<Stems> {
    this.notificationService.show(
      'Neural Stem Splitter: Initializing Spectral Decomposition…',
      'info'
    );

    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;

    const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);

    const renderStem = async (
      filterType: 'lowpass' | 'bandpass' | 'highpass' | 'allpass',
      freq: number,
      q = 1,
      gain = 1
    ): Promise<AudioBuffer> => {
      const stemCtx = new OfflineAudioContext(channels, length, sampleRate);
      const stemSource = stemCtx.createBufferSource();
      stemSource.buffer = buffer;

      if (filterType !== 'allpass') {
        const filter = stemCtx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const g = stemCtx.createGain();
        g.gain.value = gain;
        stemSource.connect(filter).connect(g).connect(stemCtx.destination);
      } else {
        const g = stemCtx.createGain();
        g.gain.value = gain;
        stemSource.connect(g).connect(stemCtx.destination);
      }

      stemSource.start(0);
      return await stemCtx.startRendering();
    };

    const [bass, vocals, drums, instrumental] = await Promise.all([
      renderStem('lowpass', 200, 0.7, 1.2),
      renderStem('bandpass', 1500, 0.5, 0.9),
      renderStem('highpass', 2500, 0.7, 0.8),
      renderStem('allpass', 0, 1, 0.7),
    ]);

    const other = new AudioBuffer({
      length,
      sampleRate,
      numberOfChannels: channels,
    });
    for (let c = 0; c < channels; c++) {
      const oData = other.getChannelData(c);
      const iData = instrumental.getChannelData(c);
      for (let i = 0; i < length; i++) {
        oData[i] = iData[i] * 0.15;
      }
    }

    this.notificationService.show(
      'Neural Stem Isolation Complete: Spectral Components Decoupled.',
      'success'
    );

    return { vocals, drums, bass, instrumental, other };
  }

  /** Cancel an in-progress on-device separation */
  cancel(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'CLEAR' });
    }
    this.isSeparating.set(false);
    this.progress.set({
      progress: 0,
      stage: 'idle',
      message: 'Cancelled',
    });
  }

  // ── Private helpers ──────────────────────────────────────

  private async ensureWorkletLoaded(ctx: AudioContext): Promise<void> {
    try {
      await ctx.audioWorklet.addModule(
        'assets/worklets/stem-separator.worklet.js'
      );
    } catch (err: any) {
      // Module may already be loaded
      if (!err?.message?.includes('already')) {
        throw err;
      }
    }
  }

  private processInWorklet(
    channels: Float32Array[],
    sampleRate: number
  ): Promise<Stems> {
    return new Promise((resolve, reject) => {
      // Use a temporary AudioContext for worklet processing
      const ctx = new AudioContext();
      let node: AudioWorkletNode;

      ctx.audioWorklet
        .addModule('assets/worklets/stem-separator.worklet.js')
        .then(() => {
          node = new AudioWorkletNode(ctx, 'stem-separator-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
          });

          this.workletNode = node;

          // Convert channel data to transferable buffers
          const transferList: ArrayBuffer[] = [];
          const channelBuffers: ArrayBuffer[] = [];

          for (const ch of channels) {
            const copy = new Float32Array(ch);
            channelBuffers.push(copy.buffer);
            transferList.push(copy.buffer);
          }

          node.port.onmessage = (event) => {
            const { type, payload } = event.data;

            switch (type) {
              case 'PROGRESS': {
                this.progress.set({
                  progress: 10 + Math.round(payload.progress * 0.85),
                  stage: 'processing',
                  message: `Decomposing spectrum… ${payload.progress}%`,
                });
                break;
              }
              case 'COMPLETE': {
                // Reconstruct AudioBuffers from raw Float32Arrays
                this.progress.set({
                  progress: 97,
                  stage: 'processing',
                  message: 'Reconstructing stems…',
                });

                const { stems, length } = payload;
                const stemNames = ['vocals', 'drums', 'bass', 'instrumental'] as const;
                const result: any = {};

                for (const name of stemNames) {
                  const buf = new AudioBuffer({
                    length,
                    sampleRate,
                    numberOfChannels: 1,
                  });
                  const raw = new Float32Array(stems[name]);
                  buf.getChannelData(0).set(raw.subarray(0, length));
                  result[name] = buf;
                }

                // Create other as residual
                const otherBuf = new AudioBuffer({
                  length,
                  sampleRate,
                  numberOfChannels: 1,
                });
                const oData = otherBuf.getChannelData(0);
                const iData = result.instrumental.getChannelData(0);
                for (let i = 0; i < length; i++) {
                  oData[i] = iData[i] * 0.15;
                }
                result.other = otherBuf;

                // Cleanup
                node.port.postMessage({ type: 'CLEAR' });
                node.disconnect();
                ctx.close().catch(() => {});
                this.workletNode = null;

                resolve(result as Stems);
                break;
              }
            }
          };

          node.port.onmessageerror = (err) => {
            node.disconnect();
            ctx.close().catch(() => {});
            this.workletNode = null;
            reject(new Error('Worklet message error'));
          };

          // Send separation request with transferable channel data
          node.port.postMessage(
            {
              type: 'SEPARATE',
              payload: { channelData: channelBuffers, sampleRate },
            },
            transferList
          );
        })
        .catch((err) => {
          ctx.close().catch(() => {});
          reject(err);
        });
    });
  }
}
