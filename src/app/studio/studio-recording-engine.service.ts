import { Injectable, inject, signal, OnDestroy } from "@angular/core";
import { LoggingService } from "../services/logging.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { AudioEngineLatencyService } from "../services/audio-engine-latency.service";
import { LocalStorageService } from "../services/local-storage.service";
import { WavStreamEncoder } from "./wav-stream-encoder.util";
import { RecordingLimiterService } from "./recording-limiter.service";
import { RecordingCaptureBuffer } from "./recording-capture-buffer";
import { IdbRecordingSpillStore } from "./recording-spill.store";
import { Subject } from "rxjs";

export interface RecordingMetadata {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  format: "wav" | "webm";
  bitDepth: number;
  sampleRate: number;
}

@Injectable({
  providedIn: "root",
})
export class StudioRecordingEngineService implements OnDestroy {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);
  private latency = inject(AudioEngineLatencyService);
  private localStorage = inject(LocalStorageService);
  private limiter = inject(RecordingLimiterService);

  isInitialized = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  recordingTime = signal(0);
  inputLevel = signal(0);
  recordedBlob = signal<Blob | null>(null);
  takes = signal<any[]>([]);
  pendingMidi: any[] = [];

  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  /** Zero-gain sink keeps the capture graph pulled without monitoring input. */
  private silentSink: GainNode | null = null;
  private flushResolver: (() => void) | null = null;
  private recordingWorkletReady = false;
  private recordingWorkletContext: AudioContext | null = null;
  private isFlushing = false;

  /**
   * Bounded capture window. Resident PCM is capped (64 MB ≈ 2.8 minutes of
   * 48 kHz stereo) and the overflow spills to IndexedDB, so a take of any
   * length is neither truncated nor able to OOM the WebView. Public so
   * diagnostics and tests can read the resident/spilled split.
   */
  public capture = new RecordingCaptureBuffer({
    sampleRate: this.audioEngine.ctx?.sampleRate ?? 48000,
    spill: new IdbRecordingSpillStore(this.localStorage),
  });

  recordingFinished$ = new Subject<{
    id: string;
    blob: Blob;
    url: string;
    metadata: RecordingMetadata;
  }>();

  async initialize(deviceId?: string): Promise<boolean> {
    this.cleanup();
    try {
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = this.audioEngine.ctx;

      try {
        if (this.recordingWorkletContext !== ctx) {
          await ctx.audioWorklet.addModule(
            "assets/worklets/recording-processor.worklet.js",
          );
          this.recordingWorkletContext = ctx;
        }
        this.recordingWorkletReady = true;
      } catch (e) {
        this.recordingWorkletReady = false;
        this.logger.error(
          "StudioRecordingEngine: Recording worklet failed to load; capture was not started.",
          e,
        );
        this.cleanup();
        return false;
      }

      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.silentSink = ctx.createGain();
      this.silentSink.gain.value = 0;
      this.silentSink.connect(ctx.destination);

      this.sourceNode.connect(this.analyserNode);
      // Analyser/worklet nodes are otherwise not pulled by the Web Audio
      // graph. The zero-gain sink preserves sample capture without feedback.
      this.analyserNode.connect(this.silentSink);

      this.isInitialized.set(true);
      this.startLevelMonitoring();
      this.logger.info(
        "StudioRecordingEngine: Initialized high-performance capture via AudioWorklet.",
      );
      return true;
    } catch (error) {
      // NotFoundError = this machine has no microphone at all (headless CI,
      // desktops without a mic). That is an expected environment, not a
      // broken engine — warn so it does not read as a boot-time fault.
      const name = (error as DOMException)?.name;
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.logger.warn(
          'StudioRecordingEngine: no audio input device available; capture stays idle.',
          error,
        );
      } else {
        this.logger.error(
          'StudioRecordingEngine: Initialization failed',
          error,
        );
      }
      this.cleanup();
      return false;
    }
  }

  startRecording(stream?: MediaStream) {
    if (this.isRecording() || this.isFlushing) return;
    const ctx = this.audioEngine.ctx;
    if (!this.recordingWorkletReady || this.recordingWorkletContext !== ctx) {
      this.logger.error(
        "StudioRecordingEngine: Cannot start recording because the recording worklet is unavailable.",
      );
      return;
    }
    if (stream) {
      const workletWasReady =
        this.recordingWorkletReady && this.recordingWorkletContext === ctx;
      this.cleanup();
      if (!workletWasReady) {
        this.logger.error(
          "StudioRecordingEngine: Cannot start a stream-backed recording before initialization.",
        );
        return;
      }
      this.recordingWorkletReady = true;
      this.mediaStream = stream;
      // cleanup() tears down the previous graph but the processor module is
      // still loaded in this AudioContext, so preserve readiness for this
      // stream-backed start path.
      this.sourceNode = ctx.createMediaStreamSource(stream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.silentSink = ctx.createGain();
      this.silentSink.gain.value = 0;
      this.silentSink.connect(ctx.destination);
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.silentSink);
      this.isInitialized.set(true);
      this.startLevelMonitoring();
    } else if (!this.isInitialized()) {
      this.logger.error(
        "StudioRecordingEngine: Cannot start recording without initialization",
      );
      return;
    }

    this.capture.beginSession();
    this.recordingTime.set(0);
    this.pendingMidi = [];
    this.recordedBlob.set(null);

    this.workletNode = new AudioWorkletNode(ctx, "recording-processor");
    this.workletNode.port.onmessage = (event) =>
      this.handleWorkletMessage(event);

    if (this.sourceNode) {
      // Route capture through the headroom limiter when enabled. Falls back to
      // a direct connection if it can't engage, so capture never breaks.
      const workletInput = this.limiter.connectToRecordingChain(
        this.sourceNode,
      );
      workletInput.connect(this.workletNode);
    }
    // Keep the AudioWorklet active while preventing microphone feedback.
    this.workletNode.connect(this.silentSink ?? ctx.destination);
    this.workletNode.port.postMessage({ command: "START" });
    this.isRecording.set(true);
    this.isPaused.set(false);
  }

  pauseRecording() {
    if (this.isRecording()) {
      this.isPaused.set(true);
      this.workletNode?.port.postMessage({ command: "STOP" });
    }
  }

  resumeRecording() {
    if (this.isRecording() && this.isPaused()) {
      this.isPaused.set(false);
      this.workletNode?.port.postMessage({ command: "START" });
    }
  }

  async stopRecording() {
    if (!this.isRecording()) return;
    this.isRecording.set(false);
    this.isFlushing = true;
    this.workletNode?.port.postMessage({ command: "STOP" });
    await new Promise<void>((resolve) => {
      this.flushResolver = resolve;
      this.workletNode?.port.postMessage({ command: "FLUSH" });
      setTimeout(() => {
        this.flushResolver = null;
        resolve();
      }, 250);
    });
    this.isFlushing = false;
    this.workletNode?.disconnect();

    const sampleRate = this.audioEngine.ctx.sampleRate;
    // Reassemble resident + spilled chunks before the WAV is built. Every
    // chunk of the take is here: the spill store verified each write, and a
    // failed spill puts its chunks back in memory instead of dropping them.
    const recorded = await this.capture.collect();
    const spilledRecords = this.capture.spilledRecords;
    if (recorded.frames > 0 && spilledRecords > 0) {
      this.logger.info(
        `StudioRecordingEngine: reassembled ${spilledRecords} ` +
          `spilled capture group(s) for this take.`,
      );
    }
    // A user can stop before the first render quantum arrives. Keep that
    // zero-duration take exportable as a valid (silent) WAV instead of
    // throwing from the channel validator.
    const channelChunks: Float32Array[][] =
      recorded.left.length > 0
        ? [recorded.left, recorded.right]
        : [[new Float32Array(1)], [new Float32Array(1)]];
    const frameCount = channelChunks[0].reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );
    this.recordingTime.set(frameCount / sampleRate);
    // Encode straight from the chunks: the take is never joined into two
    // contiguous arrays, so stopping a long recording no longer allocates the
    // whole performance a second time. Byte-identical to the joined encoder.
    const wavBlob = WavStreamEncoder.encodeMultiChannel(
      channelChunks,
      "wav-16",
      sampleRate,
    );
    this.recordedBlob.set(wavBlob);

    const id = `studio_rec_${Date.now()}`;
    const metadata: RecordingMetadata = {
      id,
      name: `Studio Session ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      duration: frameCount / sampleRate,
      format: "wav",
      bitDepth: 16,
      sampleRate,
    };
    // Persistence is best-effort. A full local store (quota) or a blocked
    // IndexedDB open used to reject `stopRecording()`, which skipped the
    // finished-take event entirely: the artist's performance was thrown away
    // while every caller reported "recording stopped". The take now always
    // reaches the take lane in memory; only the offline copy is optional.
    try {
      await this.localStorage.saveItem("audio_blobs", {
        id,
        blob: wavBlob,
        ...metadata,
      });
    } catch (saveError) {
      this.logger.warn(
        "StudioRecordingEngine: could not persist the take; it stays in memory for this session.",
        saveError,
      );
    }
    const url = URL.createObjectURL(wavBlob);
    this.recordingFinished$.next({ id, blob: wavBlob, url, metadata });
  }

  /**
   * Worklet → main-thread capture messages. Extracted from the port handler so
   * the capture path (append + budget + flush handshake) is testable without a
   * real AudioWorkletNode, which no test host provides.
   */
  private handleWorkletMessage(event: { data: any }): void {
    if (event?.data?.command === "DATA") {
      // The buffer owns the memory ceiling; the timer follows the frames it
      // actually accepted so the two can never disagree.
      const frames = this.capture.append(event.data.left, event.data.right);
      if (frames > 0) {
        this.recordingTime.update(
          (t) => t + frames / this.audioEngine.ctx.sampleRate,
        );
      }
    } else if (event?.data?.command === "FLUSHED") {
      this.flushResolver?.();
      this.flushResolver = null;
    }
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** Return the active input stream so higher-level recording views can share it. */
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  /** Return the current left/right channel buffers for SmartRecordingService to pull real comp takes */
  getRecordedBuffers(applyCompensation: boolean = true): {
    left: Float32Array[];
    right: Float32Array[];
  } {
    const resident = this.capture.resident();
    const left = resident.left.map((chunk) => chunk.slice());
    const right = resident.right.map((chunk) => chunk.slice());
    if (!applyCompensation) {
      return { left, right };
    }
    const framesToTrim = Math.max(
      0,
      Math.round(
        (this.latency.getAppliedCompensationMs() / 1000) *
          this.audioEngine.ctx.sampleRate,
      ),
    );
    return {
      left: this.trimChunkList(left, framesToTrim),
      right: this.trimChunkList(right, framesToTrim),
    };
  }

  private trimChunkList(
    chunks: Float32Array[],
    framesToTrim: number,
  ): Float32Array[] {
    if (framesToTrim <= 0 || chunks.length === 0) {
      return chunks;
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (framesToTrim >= totalLength) {
      return [];
    }
    const trimmed: Float32Array[] = [];
    let remaining = framesToTrim;
    for (const chunk of chunks) {
      if (remaining >= chunk.length) {
        remaining -= chunk.length;
        continue;
      }
      if (remaining > 0) {
        trimmed.push(chunk.subarray(remaining).slice());
        remaining = 0;
        continue;
      }
      trimmed.push(chunk);
    }
    return trimmed;
  }

  private startLevelMonitoring() {
    if (!this.analyserNode) return;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    const monitor = () => {
      if (!this.isInitialized() || !this.analyserNode) return;
      this.analyserNode.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(100, Math.round((sum / data.length) * 2));
      this.inputLevel.set(level);
      requestAnimationFrame(monitor);
    };
    monitor();
  }

  private cleanup() {
    this.workletNode?.disconnect();
    this.flushResolver = null;
    this.sourceNode?.disconnect();
    this.analyserNode?.disconnect();
    this.silentSink?.disconnect();
    this.limiter.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.isInitialized.set(false);
    this.isRecording.set(false);
    this.isFlushing = false;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.silentSink = null;
  }

  ngOnDestroy() {
    this.cleanup();
    // Unlink any spilled chunks for a take that never finished encoding.
    void this.capture.release();
  }
}
