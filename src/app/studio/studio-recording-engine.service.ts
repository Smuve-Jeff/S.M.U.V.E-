import { Injectable, inject, signal, OnDestroy } from "@angular/core";
import { LoggingService } from "../services/logging.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { AudioEngineLatencyService } from "../services/audio-engine-latency.service";
import { LocalStorageService } from "../services/local-storage.service";
import { WavStreamWriter, peakDbFs } from "./wav-stream-encoder.util";
import { RecordingLimiterService } from "./recording-limiter.service";
import { RecordingCaptureBuffer } from "./recording-capture-buffer";
import { IdbRecordingSpillStore } from "./recording-spill.store";
import { preferredConnectedInputDeviceId } from "./input-device-prefs";
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
  /**
   * Per-channel peak of the take in dBFS, measured during the streaming encode
   * (so the comp lane does not have to decode or re-scan the audio for it).
   * Null until a take has finished.
   */
  recordedPeaks = signal<{ left: number; right: number } | null>(null);
  /**
   * AudioContext time of the first captured render quantum, reported by the
   * worklet. Null until a take has actually captured its first block, which is
   * what keeps clip placement honest when no audio ever arrived.
   */
  captureStartedAt = signal<number | null>(null);
  takes = signal<any[]>([]);
  pendingMidi: any[] = [];

  private mediaStream: MediaStream | null = null;
  /**
   * True only for a stream this engine opened. A borrowed master-output
   * stream belongs to the AudioEngine and must never be stopped here — doing
   * so would end the post-master tap for every later take in the session.
   */
  private ownsMediaStream = false;
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
    // An explicit id (a channel's own input) wins. Otherwise open the studio's
    // remembered interface rather than the system default: a take armed from
    // Smart Recording or a comp lane must record the mic the artist picked in
    // the recorder, not whichever input the OS lists first.
    const inputId =
      deviceId ?? (await preferredConnectedInputDeviceId()) ?? undefined;
    try {
      const constraints = {
        audio: {
          deviceId: inputId ? { exact: inputId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.ownsMediaStream = true;
      const ctx = this.audioEngine.ctx;

      if (!(await this.prepareCaptureWorklet())) {
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
        inputId ?? "system default",
      );
      return true;
    } catch (error) {
      // NotFoundError = this machine has no microphone at all (headless CI,
      // desktops without a mic). That is an expected environment, not a
      // broken engine — warn so it does not read as a boot-time fault.
      const name = (error as DOMException)?.name;
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        this.logger.warn(
          "StudioRecordingEngine: no audio input device available; capture stays idle.",
          error,
        );
      } else {
        this.logger.error(
          "StudioRecordingEngine: Initialization failed",
          error,
        );
      }
      this.cleanup();
      return false;
    }
  }

  /**
   * Load the capture worklet without opening the microphone. Internal
   * components are captured from the post-master output stream, so an
   * interface (or any input permission at all) is not required for them.
   */
  async prepareCaptureWorklet(): Promise<boolean> {
    const ctx = this.audioEngine.ctx;
    try {
      if (this.recordingWorkletContext !== ctx) {
        await ctx.audioWorklet.addModule(
          "assets/worklets/recording-processor.worklet.js",
        );
        this.recordingWorkletContext = ctx;
      }
      this.recordingWorkletReady = true;
      return true;
    } catch (error) {
      this.recordingWorkletReady = false;
      this.logger.error(
        "StudioRecordingEngine: Recording worklet failed to load; capture was not started.",
        error,
      );
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
      this.ownsMediaStream = false;
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
    } else if (!this.hasInputCapture()) {
      // A master-output pass leaves the engine initialized but with a borrowed
      // bus. A no-stream request means "record the input", so it must not
      // silently reuse that master tap.
      this.logger.error(
        "StudioRecordingEngine: Cannot start an input pass without an input capture graph",
      );
      return;
    }

    this.capture.beginSession();
    this.recordingTime.set(0);
    this.pendingMidi = [];
    this.recordedBlob.set(null);
    this.recordedPeaks.set(null);
    this.captureStartedAt.set(null);

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

  /**
   * Finish the pass and encode it. `persist: false` keeps the take out of the
   * session store — used by latency calibration, whose click is not material.
   */
  async stopRecording(options: { persist?: boolean } = {}) {
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
    const capturedFrames = this.capture.frames;
    const spilledRecords = this.capture.spilledRecords;
    if (spilledRecords > 0) {
      this.logger.info(
        `StudioRecordingEngine: streaming ${spilledRecords} ` +
          `spilled capture group(s) into the take.`,
      );
    }
    // Encode straight out of the capture buffer, one group at a time. The take
    // is never reassembled into memory: each spilled group is read, encoded and
    // unlinked before the next one is touched, so the end-of-take footprint is
    // the resident window plus the encoded output. Previously it was the whole
    // performance in PCM *plus* the encoded copy built from it — and the reason
    // the joined copy existed at all was a synchronous reader that no longer
    // has to run at stop time.
    const writer = new WavStreamWriter({ channelCount: 2, sampleRate });
    for await (const group of this.capture.drainGroups()) {
      writer.push([group.left, group.right]);
    }
    if (capturedFrames === 0) {
      // A user can stop before the first render quantum arrives. Keep that
      // zero-duration take exportable as a valid (silent) WAV.
      writer.push([[new Float32Array(1)], [new Float32Array(1)]]);
    }
    const { blob: wavBlob, stats } = writer.end();
    const frameCount = stats.frames;
    if (capturedFrames > 0 && frameCount !== capturedFrames) {
      // The header is written from the frames that actually arrived, so a
      // mismatch here means the take lost audio on the way out.
      this.logger.warn(
        `StudioRecordingEngine: encoded ${frameCount} of ` +
          `${capturedFrames} captured frames.`,
      );
    }
    this.recordingTime.set(frameCount / sampleRate);
    this.recordedPeaks.set({
      left: peakDbFs(stats.peakLeft),
      right: peakDbFs(stats.peakRight),
    });
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
    const persist = options.persist !== false;
    // Persistence is best-effort. A full local store (quota) or a blocked
    // IndexedDB open used to reject `stopRecording()`, which skipped the
    // finished-take event entirely: the artist's performance was thrown away
    // while every caller reported "recording stopped". The take now always
    // reaches the take lane in memory; only the offline copy is optional.
    if (persist) {
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
  }

  /**
   * Worklet → main-thread capture messages. Extracted from the port handler so
   * the capture path (append + budget + flush handshake) is testable without a
   * real AudioWorkletNode, which no test host provides.
   */
  private handleWorkletMessage(event: { data: any }): void {
    if (event?.data?.command === "STARTED") {
      // Use the audio-clock timestamp from the worklet, never the arrival time
      // of the message: the main thread can be busy for tens of milliseconds
      // and that delay would be baked into the take's alignment.
      const time = Number(event.data.time);
      if (Number.isFinite(time)) this.captureStartedAt.set(time);
    } else if (event?.data?.command === "DATA") {
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

  /** True only when the live capture graph is fed by an input this engine opened. */
  hasInputCapture(): boolean {
    return this.isInitialized() && this.ownsMediaStream;
  }

  /** Return the active input stream so higher-level recording views can share it. */
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  /**
   * The resident capture window (bounded by the buffer's memory budget), with
   * the applied input-latency compensation trimmed. This is the live preview
   * used during capture and the fallback for a caller that has no finished take
   * (a stopped take is served by `recordedBlob()` + `recordedPeaks()` instead,
   * so a long performance is never pulled back into memory).
   */
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

  /**
   * Frames the capture buffer accepted for this take, before the writer's
   * zero-frame substitution. 0 means the pass captured nothing, which is what a
   * caller must check before treating the finished take as audio — a take made
   * of the substitute silent frame is exportable but is not a performance.
   */
  getRecordedFrameCount(): number {
    return this.capture.frames;
  }

  /**
   * AudioContext time of the take's first captured block, or null when the
   * worklet has not captured one (no session, or no audio arrived yet).
   */
  getCaptureStartedAt(): number | null {
    return this.captureStartedAt();
  }

  /**
   * Applied input round-trip latency in seconds — the same compensation the
   * live preview trims. The captured WAV already contains this delay, so take
   * placement subtracts it from the performance anchor.
   */
  getInputLatencySeconds(): number {
    return Math.max(0, this.latency.getAppliedCompensationMs()) / 1000;
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
    if (this.ownsMediaStream) {
      this.mediaStream?.getTracks().forEach((t) => t.stop());
    }
    this.ownsMediaStream = false;
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
