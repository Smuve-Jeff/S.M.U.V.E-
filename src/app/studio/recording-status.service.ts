import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

/**
 * Who/what initiated recording — displayed prominently so the user
 * always knows precisely what is being captured.
 */
export type RecordingSource =
  | { type: 'transport'; trackId?: string; trackName?: string }
  | { type: 'mixer-strip'; trackId: string; trackName: string }
  | { type: 'performer'; takeNumber: number }
  | { type: 'mic'; channelId: string; channelLabel: string }
  | { type: 'dj-deck'; deckId: string }
  | { type: 'none' };

/**
 * RecordingStatusService — the single source of truth for:
 *   1. Real master output meter (L/R dBFS, not simulated)
 *   2. What component/tool is currently recording
 *   3. Per-track record-arm state (drives mixer strip R buttons)
 *
 * Injected at root so TransportBar, Mixer, Performer, and
 * StudioComponent all read the same live state.
 */
@Injectable({ providedIn: 'root' })
export class RecordingStatusService implements OnDestroy {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);

  // ── Real master meters (dBFS, L/R) ──────────────────────────
  /** Left channel peak in dBFS (-60 to 0) */
  masterDbL = signal(-60);
  /** Right channel peak in dBFS (-60 to 0) */
  masterDbR = signal(-60);

  /** Smoothed mono peak for simpler UI – max of L/R */
  masterPeakDb = computed(() => Math.max(this.masterDbL(), this.masterDbR()));

  /** 0–1 linear amplitude for CSS-driven meter bars */
  masterLevelLinear = computed(() => {
    const db = this.masterPeakDb();
    if (db <= -60) return 0;
    return Math.max(0, Math.min(1, (db + 60) / 60));
  });

  // ── Peak-hold (lingering red line, ~2s decay) ──────────────
  masterPeakHoldL = signal(0);
  masterPeakHoldR = signal(0);
  /** 0–1 peak-hold position for the higher channel */
  masterPeakHoldLinear = computed(() =>
    Math.max(this.masterPeakHoldL(), this.masterPeakHoldR())
  );

  // ── Recording source ────────────────────────────────────────
  /** What precisely is being recorded right now */
  recordingSource = signal<RecordingSource>({ type: 'none' });

  /** Human-readable label for TransportBar / snackbar */
  recordingLabel = computed(() => {
    const src = this.recordingSource();
    switch (src.type) {
      case 'transport':
        return src.trackName
          ? `Rec: ${src.trackName}`
          : 'Recording to selected track';
      case 'mixer-strip':
        return `Rec: Strip "${src.trackName}"`;
      case 'performer':
        return `Rec: Performance Take ${src.takeNumber}`;
      case 'mic':
        return `Rec: ${src.channelLabel}`;
      case 'dj-deck':
        return `Rec: Deck ${src.deckId.toUpperCase()}`;
      default:
        return '';
    }
  });

  /** Whether anything is being recorded */
  isRecording = computed(() => this.recordingSource().type !== 'none');

  // ── Per-track record arm (drives mixer strip R buttons) ─────
  /** Set of track IDs that are armed for recording */
  armedTrackIds = signal<Set<string>>(new Set());

  armTrack(trackId: string) {
    this.armedTrackIds.update((set) => {
      const next = new Set(set);
      next.add(trackId);
      return next;
    });
  }

  disarmTrack(trackId: string) {
    this.armedTrackIds.update((set) => {
      const next = new Set(set);
      next.delete(trackId);
      return next;
    });
  }

  toggleArmTrack(trackId: string) {
    if (this.armedTrackIds().has(trackId)) {
      this.disarmTrack(trackId);
    } else {
      this.armTrack(trackId);
    }
  }

  isTrackArmed(trackId: string): boolean {
    return this.armedTrackIds().has(trackId);
  }

  // ── Actions ─────────────────────────────────────────────────
  /**
   * Called when recording starts from any component.
   * Sets the source so the UI can display what's recording.
   */
  setRecordingSource(source: RecordingSource) {
    this.recordingSource.set(source);
  }

  /**
   * Called when recording stops from any component.
   */
  clearRecordingSource() {
    this.recordingSource.set({ type: 'none' });
  }

  // ── Internal meter loop ─────────────────────────────────────
  private meterRaf: number | null = null;
  private analyserBufL = new Uint8Array(2048);
  private analyserBufR = new Uint8Array(2048);
  /**
   * Per-channel analysers derived from the master node via a
   * ChannelSplitterNode.  Created lazily when the audio context is ready.
   */
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  /** Splitter node used to feed analyserL/analyserR. Stored so it can be
   *  disconnected when the master analyser changes. */
  private _splitter: ChannelSplitterNode | null = null;
  /** The master AnalyserNode we last wired the splitter from. */
  private lastWiredMasterAnalyser: AnalyserNode | null = null;

  constructor() {
    this.startRealMeterLoop();
  }

  /**
   * Builds (or rebuilds) a stereo split from the master analyser into two
   * dedicated per-channel analysers.  Safe to call repeatedly; it is a no-op
   * when the master analyser has not changed.  Disconnects the previous
   * splitter and per-channel analysers before replacing them to avoid leaking
   * Web Audio nodes when the master analyser context changes.
   */
  private ensureStereoAnalysers(masterAnalyser: AnalyserNode): void {
    if (masterAnalyser === this.lastWiredMasterAnalyser) return;

    // Disconnect and release previous nodes before creating new ones.
    if (this.lastWiredMasterAnalyser && this._splitter) {
      this.lastWiredMasterAnalyser.disconnect(this._splitter);
    }
    this._splitter?.disconnect();
    this.analyserL?.disconnect();
    this.analyserR?.disconnect();

    const ctx = masterAnalyser.context;
    const splitter = ctx.createChannelSplitter(2);

    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = 2048;
    this.analyserR.fftSize = 2048;

    masterAnalyser.connect(splitter);
    splitter.connect(this.analyserL, 0 /* left channel output */);
    splitter.connect(this.analyserR, 1 /* right channel output */);

    this._splitter = splitter;
    this.lastWiredMasterAnalyser = masterAnalyser;
    // Resize buffers to match fftSize / 2
    const binCount = this.analyserL.frequencyBinCount;
    this.analyserBufL = new Uint8Array(binCount);
    this.analyserBufR = new Uint8Array(binCount);
  }

  /**
   * Pulls real audio data from the AudioEngine master analyser.
   * Uses a ChannelSplitterNode to obtain genuine L/R peak readings.
   */
  private startRealMeterLoop() {
    if (this.meterRaf) return;
    const DECAY_PER_FRAME = 0.012; // ~2.2s from full to zero at 60fps
    const tick = () => {
      try {
        const masterAnalyser = this.audioEngine.masterAnalyser as AnalyserNode | null;
        if (masterAnalyser) {
          this.ensureStereoAnalysers(masterAnalyser);
          const aL = this.analyserL!;
          const aR = this.analyserR!;

          aL.getByteTimeDomainData(this.analyserBufL);
          aR.getByteTimeDomainData(this.analyserBufR);

          let peakL = 0;
          let peakR = 0;
          for (let i = 0; i < this.analyserBufL.length; i++) {
            const vl = Math.abs((this.analyserBufL[i] - 128) / 128);
            if (vl > peakL) peakL = vl;
          }
          for (let i = 0; i < this.analyserBufR.length; i++) {
            const vr = Math.abs((this.analyserBufR[i] - 128) / 128);
            if (vr > peakR) peakR = vr;
          }

          this.masterDbL.set(this.linearToDb(peakL));
          this.masterDbR.set(this.linearToDb(peakR));

          // Peak-hold: latch up instantly, decay slowly
          this.masterPeakHoldL.update((v) =>
            Math.max(peakL, v - DECAY_PER_FRAME)
          );
          this.masterPeakHoldR.update((v) =>
            Math.max(peakR, v - DECAY_PER_FRAME)
          );
        } else {
          // No master analyser available — decay to silence
          this.masterDbL.update((v) => Math.max(-60, v - 1.2));
          this.masterDbR.update((v) => Math.max(-60, v - 1.2));

          this.masterPeakHoldL.update((v) => Math.max(0, v - 0.012));
          this.masterPeakHoldR.update((v) => Math.max(0, v - 0.012));
        }
      } catch {
        // Analyser not available / context not ready
        this.masterDbL.update((v) => Math.max(-60, v - 1.2));
        this.masterDbR.update((v) => Math.max(-60, v - 1.2));

        this.masterPeakHoldL.update((v) => Math.max(0, v - 0.012));
        this.masterPeakHoldR.update((v) => Math.max(0, v - 0.012));
      }
      this.meterRaf = requestAnimationFrame(tick);
    };
    this.meterRaf = requestAnimationFrame(tick);
  }

  private linearToDb(v: number): number {
    if (v <= 0) return -60;
    const db = 20 * Math.log10(v);
    return Math.max(-60, Math.min(0, Math.round(db)));
  }

  ngOnDestroy() {
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf);
    this._splitter?.disconnect();
    this.analyserL?.disconnect();
    this.analyserR?.disconnect();
  }
}
