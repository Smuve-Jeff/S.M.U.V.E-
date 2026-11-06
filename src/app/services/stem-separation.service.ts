import { Injectable, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';
import { AuxAudioContextService } from './aux-audio-context.service';
import { separateIntoStems } from './stem-separation.dsp';
import type {
  StemChannels,
  StemSeparationProgress,
} from './stem-separation.dsp';
import { createStemWorker } from './stem-worker-factory';

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

export interface StemProgressUpdate extends StemSeparationProgress {
  /** Human label for the stage, e.g. "Bass · L". */
  label: string;
}

@Injectable({
  providedIn: 'root',
})
export class StemSeparationService {
  private notificationService = inject(NotificationService);
  private aux = inject(AuxAudioContextService);

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
      message: 'Initializing stem processor…',
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
        'Stem separation complete: 4 stems extracted on-device (DSP).',
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
   * On-device separation with a spectral mask.
   *
   * The DSP runs in a Web Worker so a long track never blocks the studio;
   * when a Worker cannot be created the same function runs on the main thread,
   * yielding between frame batches. Either way the caller gets stage progress.
   */
  async separate(
    buffer: AudioBuffer,
    onProgress?: (update: StemProgressUpdate) => void
  ): Promise<Stems> {
    this.notificationService.show(
      'Stem Splitter: initializing spectral decomposition…',
      'info'
    );
    this.progress.set({
      progress: 0,
      stage: 'loading',
      message: 'Analyzing spectrum…',
    });

    const channels = this.extractChannels(buffer);
    const forward = (update: StemSeparationProgress) => {
      const suffix =
        channels.length > 1 ? ` · ${update.channel === 0 ? 'L' : 'R'}` : '';
      const label =
        update.stage === 'centre'
          ? 'Centre band'
          : update.stage === 'bass'
            ? `Bass${suffix}`
            : `Drums${suffix}`;
      this.progress.set({
        progress: Math.round(update.progress * 0.9),
        stage: 'processing',
        message: `${label} · ${Math.round(update.progress)}%`,
      });
      onProgress?.({ ...update, label });
    };

    let parts: StemChannels;
    try {
      parts = await this.separateInWorker(channels, buffer.sampleRate, forward);
    } catch (error) {
      console.warn(
        'StemSeparation: worker unavailable, separating on the main thread.',
        (error as Error)?.message
      );
      // The transfer list detaches `channels`, so rebuild from the AudioBuffer.
      parts = await separateIntoStems(
        this.extractChannels(buffer),
        buffer.sampleRate,
        forward
      );
    }

    this.progress.set({
      progress: 100,
      stage: 'complete',
      message: 'Separation complete',
    });

    const toBuffer = (data: Float32Array[]): AudioBuffer => {
      const stem = new AudioBuffer({
        length: buffer.length,
        sampleRate: buffer.sampleRate,
        numberOfChannels: Math.max(1, channels.length),
      });
      for (let c = 0; c < stem.numberOfChannels; c++) {
        stem.getChannelData(c).set(data[c] ?? data[0]);
      }
      return stem;
    };

    this.notificationService.show(
      'Stem separation complete: spectral components decoupled (DSP).',
      'success'
    );

    return {
      vocals: toBuffer(parts.vocals),
      drums: toBuffer(parts.drums),
      bass: toBuffer(parts.bass),
      instrumental: toBuffer(parts.instrumental),
      other: toBuffer(parts.other),
    };
  }

  private extractChannels(buffer: AudioBuffer): Float32Array[] {
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      channels.push(new Float32Array(buffer.getChannelData(c)));
    }
    return channels;
  }

  /** Factory seam: tests replace this to drive the worker message protocol. */
  private createWorker = createStemWorker;

  private separateInWorker(
    channels: Float32Array[],
    sampleRate: number,
    onProgress: (update: StemSeparationProgress) => void
  ): Promise<StemChannels> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.createWorker();
      } catch (error) {
        reject(error);
        return;
      }

      const finish = () => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };

      worker.onmessage = (event: MessageEvent<any>) => {
        const { type, payload } = event.data ?? {};
        if (type === 'PROGRESS') {
          onProgress(payload as StemSeparationProgress);
          return;
        }
        if (type === 'COMPLETE') {
          finish();
          resolve(payload as StemChannels);
          return;
        }
        if (type === 'ERROR') {
          finish();
          reject(new Error(payload?.message ?? 'Stem worker failed'));
        }
      };

      worker.onerror = (event) => {
        finish();
        reject(new Error(event?.message || 'Stem worker crashed'));
      };

      // Copies, so transferring them cannot detach the AudioBuffer's memory.
      worker.postMessage(
        { type: 'SEPARATE', payload: { channels, sampleRate } },
        channels.map((channel) => channel.buffer)
      );
    });
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
      // Temporary auxiliary graph: the separator is never monitored, so it
      // asks for a playback buffer rather than an interactive one.
      const ctx = this.aux.createAuxContext('playback');
      let node: AudioWorkletNode;

      ctx.audioWorklet
        .addModule('assets/worklets/stem-separator.worklet.js')
        .then(() => {
          node = new AudioWorkletNode(ctx, 'stem-separator-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
          });

          this.workletNode = node;
          // A processor with no path to the destination is never pulled. The
          // separator reports through its port, so a zero-gain sink is enough
          // (and the same trick the recording engine relies on).
          this.aux.attachSilentSink(ctx, node);

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

          node.port.onmessageerror = (_err) => {
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
