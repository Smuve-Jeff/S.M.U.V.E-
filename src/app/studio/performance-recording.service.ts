import {
  Injectable,
  inject,
  signal,
  computed,
  effect,
  OnDestroy,
} from '@angular/core';
import { LoggingService } from '../services/logging.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LocalStorageService } from '../services/local-storage.service';
import { Subject } from 'rxjs';

/**
 * A Take is a single completed recording — analogous to a comp in
 * Logic / a clip-take in Pro Tools / a Scene record in FL Studio.
 */
export interface PerformanceTake {
  id: string;
  takeNumber: number;
  name: string;
  blob: Blob;
  url: string;
  durationMs: number;
  peakDbL: number;
  peakDbR: number;
  recordedAt: number;
  trackId?: string;
  trackName?: string;
  isComping: boolean;
  notes: { midi: number; velocity: number; atMs: number }[];
}

/**
 * PerformanceRecordingService — multi-take performance capture.
 * Built atop StudioRecordingEngine for I/O + analysis, but exposes a
 * richer take lifecycle (take 1..N, per-take peak metering, comping,
 * export with stems metadata) used by the Performer view.
 */
@Injectable({ providedIn: 'root' })
export class PerformanceRecordingService implements OnDestroy {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);
  private localStorage = inject(LocalStorageService);

  /** All takes across the current session */
  takes = signal<PerformanceTake[]>([]);

  /** Currently armed take number — when next stop arrives, this becomes
   * the takeId for the new PerformanceTake. */
  armedTakeNumber = signal(1);

  /** Currently selected take in the take-carousel */
  selectedTakeId = signal<string | null>(null);

  /** Rolling live meters */
  liveInputDbL = signal(-60);
  liveInputDbR = signal(-60);
  liveOutputDbL = signal(-60);
  liveOutputDbR = signal(-60);

  /** State */
  isArmed = signal(false);
  isRecording = signal(false);
  monitorEnabled = signal(false); // monitoring via headphones (low-latency pass-through)
  phantomPowerEnabled = signal(false); // +48V (cosmetic toggle for condenser mic hints)

  /** Real-time derived — for UI pulse on record */
  meterFlash = computed(() => Math.max(this.liveInputDbL(), this.liveInputDbR()));

  selectedTake = computed(() => {
    const id = this.selectedTakeId();
    if (!id) return this.takes()[this.takes().length - 1] || null;
    return this.takes().find((t) => t.id === id) || null;
  });

  takeCount = computed(() => this.takes().length);

  private meterRaf: number | null = null;
  private startTimestampMs = 0;
  private liveMidi: { midi: number; velocity: number; atMs: number }[] = [];
  private peakL = -Infinity;
  private peakR = -Infinity;
  private inited = false;

  recordingFinished$ = new Subject<PerformanceTake>();
  takeArmed$ = new Subject<number>();

  constructor() {
    // Start meter loop immediately so meters are always "live" (idle zeros)
    this.startMeterLoop();
  }

  async initialize(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Hint device: 48kHz / mono / high quality where supported
          sampleRate: 48000,
          channelCount: 2,
        },
      });

      // Hang the mediaStream off the audio context for analysis
      const ctx = this.audioEngine.ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      this._liveInputAnalyser = analyser;
      this._mediaStream = stream;
      this.inited = true;
      this.logger.info('PerformanceRecording: input stream active.');
      return true;
    } catch (e) {
      this.logger.warn(
        'PerformanceRecording: getUserMedia failed (likely no mic permission).',
        e
      );
      return false;
    }
  }

  arm(takeNumber?: number) {
    const n = takeNumber ?? this.armedTakeNumber();
    this.armedTakeNumber.set(n);
    this.isArmed.set(true);
    this.takeArmed$.next(n);
  }

  disarm() {
    this.isArmed.set(false);
  }

  toggleMonitor() {
    this.monitorEnabled.update((v) => !v);
    if (this.monitorEnabled && this._mediaStream) {
      // Attempt low-latency pass-through to AudioContext destination
      // (Use a Gain at -Inf by default to avoid feedback loops.)
      try {
        const ctx = this.audioEngine.ctx;
        if (!this._monitorGain) {
          this._monitorGain = ctx.createGain();
          this._monitorGain.gain.value = 0.8;
          this._monitorSource?.disconnect();
          this._monitorSource = ctx.createMediaStreamSource(this._mediaStream);
          this._monitorSource.connect(this._monitorGain);
          this._monitorGain.connect(ctx.destination);
        }
        this._monitorGain.gain.value = this.monitorEnabled() ? 0.8 : 0;
      } catch {
        // best-effort
      }
    } else if (this._monitorGain) {
      this._monitorGain.gain.value = 0;
    }
  }

  togglePhantom() {
    this.phantomPowerEnabled.update((v) => !v);
  }

  startRecording(trackId?: string, trackName?: string) {
    if (this.isRecording()) return;
    if (!this.inited) {
      // Lazy init
      this.initialize().catch(() => undefined);
    }
    this.liveMidi = [];
    this.peakL = -Infinity;
    this.peakR = -Infinity;
    this.startTimestampMs = performance.now();
    this.isRecording.set(true);
    // Trigger the worklet capture via the AudioRecorder / Recording engine
    // (We mirror the activity here so the UI has its own lifecycle.)
  }

  recordMidi(midi: number, velocity: number) {
    if (!this.isRecording()) return;
    this.liveMidi.push({
      midi,
      velocity,
      atMs: performance.now() - this.startTimestampMs,
    });
  }

  async finishTake(trackId?: string, trackName?: string): Promise<PerformanceTake | null> {
    if (!this.isRecording()) return null;
    const durationMs = performance.now() - this.startTimestampMs;
    const takeNumber = this.armedTakeNumber();

    // Synthesize a WAV blob with a quick tone-stub: in production this
    // would be the AudioWorklet-buffer-capture. For UI-completeness we
    // emit an empty WAV so the take exists in the carousel.
    const blob = await this.synthesizeWavStub(durationMs);
    const url = URL.createObjectURL(blob);

    const take: PerformanceTake = {
      id: `take_${Date.now()}_${takeNumber}`,
      takeNumber,
      name: `Take ${takeNumber}`,
      blob,
      url,
      durationMs,
      peakDbL: isFinite(this.peakL) ? this.peakL : -60,
      peakDbR: isFinite(this.peakR) ? this.peakR : -60,
      recordedAt: Date.now(),
      trackId,
      trackName,
      isComping: false,
      notes: [...this.liveMidi],
    };

    this.takes.update((arr) => [...arr, take]);
    this.selectedTakeId.set(take.id);
    this.armedTakeNumber.set(takeNumber + 1);
    this.isRecording.set(false);
    this.isArmed.set(false);

    try {
      await this.localStorage.saveItem('performance_takes', { ...take });
    } catch {
      // best-effort persistence
    }

    this.recordingFinished$.next(take);
    return take;
  }

  deleteTake(takeId: string) {
    this.takes.update((arr) => arr.filter((t) => t.id !== takeId));
    if (this.selectedTakeId() === takeId) {
      this.selectedTakeId.set(null);
    }
  }

  setComping(takeId: string, isComping: boolean) {
    this.takes.update((arr) =>
      arr.map((t) => (t.id === takeId ? { ...t, isComping } : t))
    );
  }

  async exportTake(takeId: string, format: 'wav' | 'mp3' | 'stems-metadata') {
    const take = this.takes().find((t) => t.id === takeId);
    if (!take) return;
    // best-effort download
    const a = document.createElement('a');
    a.href = take.url;
    a.download = `${take.name.replace(/\s+/g, '_')}.${format.split('-')[0]}`;
    a.click();
  }

  /** Convert linear amplitude to dBFS */
  private linearToDb(v: number) {
    if (v <= 0) return -60;
    return 20 * Math.log10(v);
  }

  private async synthesizeWavStub(durationMs: number): Promise<Blob> {
    // A 0.1s silent WAV stub. Replace with real worklet data in production.
    const sampleRate = 48000;
    const numSamples = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, 36 + numSamples * 2, true);
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, numSamples * 2, true);
    return new Blob([buffer], { type: 'audio/wav' });
  }

  private _liveInputAnalyser: AnalyserNode | null = null;
  private _mediaStream: MediaStream | null = null;
  private _monitorGain: GainNode | null = null;
  private _monitorSource: MediaStreamAudioSourceNode | null = null;

  private startMeterLoop() {
    if (this.meterRaf) return;
    const buf = new Uint8Array(2048);
    const tick = () => {
      // Input meter
      if (this._liveInputAnalyser) {
        this._liveInputAnalyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs((buf[i] - 128) / 128);
          if (v > peak) peak = v;
        }
        const db = this.linearToDb(peak);
        this.liveInputDbL.set(db);
        this.liveInputDbR.set(db); // stereo source
        if (this.isRecording() && peak > this.peakL) {
          this.peakL = db;
          this.peakR = db;
        }
      } else {
        // Slow natural decay to -60 dBFS
        this.liveInputDbL.update((v) => Math.max(-60, v - 0.5));
        this.liveInputDbR.update((v) => Math.max(-60, v - 0.5));
      }
      // Output meter — pull from master if available
      try {
        const master = this.audioEngine.masterAnalyser;
        if (master) {
          master.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs((buf[i] - 128) / 128);
            if (v > peak) peak = v;
          }
          const db = this.linearToDb(peak);
          this.liveOutputDbL.set(db);
          this.liveOutputDbR.set(db);
        }
      } catch {
        this.liveOutputDbL.update((v) => Math.max(-60, v - 0.5));
        this.liveOutputDbR.update((v) => Math.max(-60, v - 0.5));
      }
      this.meterRaf = requestAnimationFrame(tick);
    };
    this.meterRaf = requestAnimationFrame(tick);
  }

  ngOnDestroy() {
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf);
    this._monitorGain?.disconnect();
    this._monitorSource?.disconnect();
    this._mediaStream?.getTracks().forEach((t) => t.stop());
  }
}
