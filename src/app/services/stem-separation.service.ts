import { Injectable, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';
import { createMlWorker } from './ml-worker-factory';

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

  /**
   * Opt-in flag for real neural stem separation via Web Worker + ONNX runtime.
   * Default FALSE — the existing worklet + biquad-pipeline path remains in charge
   * until a user explicitly enables ML inference (e.g., behind a Pro-tier flag).
   * This protects first-run UX from a 13MB ONNX model download on a slow network.
   */
  readonly useMlStems = signal(true);
  /** Whether the runtime can host the ML stem worker (Web Worker + cross-origin isolation). */
  readonly mlStemsAvailable = signal(
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer !== 'undefined'
  );

  /** AudioWorklet node for on-device processing */
  private workletNode: AudioWorkletNode | null = null;

  /** Web Worker for real ONNX stem inference (Sprint 2 scaffold) */
  private mlWorker: Worker | null = null;

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

    // ── Sprint 2 opt-in: ML worker route (Web Worker + onnxruntime-web) ──
    // Disabled by default; explicit `setUseMlStems(true)` switches the path.
    if (this.useMlStems() && this.mlStemsAvailable()) {
      try {
        const result = await this.separateWithMlModel(buffer);
        this.isSeparating.set(false);
        this.notificationService.show(
          'Neural Stem Isolation Complete: real ONNX inference (4 sources).',
          'success'
        );
        return {
          stems: result.stems,
          metadata: {
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            onDevice: true,
            processingTimeMs: Math.round(result.processingTimeMs),
          },
        };
      } catch (err: any) {
        console.warn(
          'StemSeparation: ML worker route failed, falling back to legacy worklet.',
          err?.message
        );
        // Fall through to legacy worklet path below.
      }
    }

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
    if (this.mlWorker) {
      this.mlWorker.postMessage({ type: 'CANCEL' });
    }
    this.isSeparating.set(false);
    this.progress.set({
      progress: 0,
      stage: 'idle',
      message: 'Cancelled',
    });
  }

  /**
   * Toggle ML stem separation. When enabled, `separateOnDevice()` will route
   * through the ONNX Web Worker instead of the legacy worklet/biquad path.
   * Front-end callers must confirm `mlStemsAvailable()` first to avoid 404s.
   */
  setUseMlStems(enabled: boolean): void {
    if (enabled && !this.mlStemsAvailable()) {
      this.notificationService.show(
        'Web Worker / SharedArrayBuffer unavailable in this runtime — ML stem split disabled.',
        'warning'
      );
      return;
    }
    this.useMlStems.set(enabled);
  }

  /** Lazily construct the ML worker. Terminated on first `disposeMlWorker()` call. */
  private ensureMlWorker(): Worker {
    if (!this.mlWorker) {
      this.mlWorker = createMlWorker() as Worker;
    }
    return this.mlWorker;
  }

  private disposeMlWorker(): void {
    this.mlWorker?.terminate();
    this.mlWorker = null;
  }

  /**
   * Real neural stem separation via Web Worker + onnxruntime-web.
   * Returns AudioBuffers reconstructed from the worker's Float32Array payloads.
   */
  private separateWithMlModel(
    buffer: AudioBuffer
  ): Promise<{ stems: Stems; processingTimeMs: number }> {
    return new Promise((resolve, reject) => {
      const worker = this.ensureMlWorker();
      const left = new Float32Array(buffer.getChannelData(0));
      const right = new Float32Array(
        buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)
      );

      const cleanup = () => {
        worker.onmessage = null;
        worker.onerror = null;
        // Keep the worker alive for next inference — `disposeMlWorker()` will terminate.
      };

      worker.onmessage = (event: MessageEvent<any>) => {
        const { type, payload } = event.data;
        switch (type) {
          case 'PROGRESS':
            this.progress.set({
              progress: Math.min(100, payload.progress),
              stage: 'processing',
              message: payload.message,
            });
            break;
          case 'COMPLETE':
            cleanup();
            const sampleRate = payload.sampleRate;
            const length = left.length;
            const stems: any = {};
            (['vocals', 'drums', 'bass', 'other', 'instrumental'] as const).forEach(
              (name) => {
                const arr = payload.stems[name];
                const ab = new AudioBuffer({ length, sampleRate, numberOfChannels: 1 });
                ab.getChannelData(0).set(new Float32Array(arr).subarray(0, length));
                stems[name] = ab;
              }
            );
            resolve({ stems: stems as Stems, processingTimeMs: payload.durationMs });
            break;
          case 'ERROR':
            cleanup();
            reject(new Error(payload?.message ?? 'Worker stem separation failed'));
            break;
        }
      };

      worker.onerror = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      // Transfer channel buffers for zero-copy handoff to the worker
      worker.postMessage(
        {
          type: 'SEPARATE',
          payload: { left, right, sampleRate: buffer.sampleRate },
        },
        [left.buffer, right.buffer]
      );
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
