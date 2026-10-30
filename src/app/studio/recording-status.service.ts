import { Injectable, inject, signal, computed, OnDestroy } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { LoggingService } from "../services/logging.service";

/**
 * What a recorder is actually sampling. The Studio has two real capture
 * paths: the microphone/line input, and the post-master output bus. Naming
 * the path (not just the component) keeps the REC readout honest.
 */
export type RecordingCaptureMode = "input" | "master";

/**
 * A track that a live pass is writing its take onto. Kept separate from the
 * recorder label so a pass that captures several armed tracks can name every
 * destination instead of only the first one.
 */
export interface RecordDestination {
  trackId: string;
  trackName: string;
}

/**
 * Who/what initiated recording — displayed prominently so the user
 * always knows precisely what is being captured.
 */
export type RecordingSource =
  | {
      type: "transport";
      trackId?: string;
      trackName?: string;
      inputLabel?: string;
      captureMode?: RecordingCaptureMode;
      /** Every armed/selected track the transport pass stamps a take onto. */
      destinations?: readonly RecordDestination[];
    }
  | {
      type: "mixer-strip";
      trackId: string;
      trackName: string;
      inputLabel?: string;
    }
  | { type: "performer"; takeNumber: number; trackName?: string }
  | {
      type: "mic";
      channelId: string;
      channelLabel: string;
      inputLabel?: string;
      capturePath?: string;
      paused?: boolean;
    }
  | { type: "component"; componentId: string; componentLabel: string; targetLabel?: string; inputLabel?: string; captureMode?: RecordingCaptureMode }
  | { type: "audio-recorder"; inputLabel?: string; capturePath?: string; takeNumber?: number }
  | { type: "dj-deck"; deckId: string }
  | { type: "none" };

/** One active recorder, keyed by the component that owns it. */
export interface ActiveRecording {
  ownerId: string;
  source: RecordingSource;
}

/**
 * RecordingStatusService — the single source of truth for:
 *   1. Real master output meter (L/R dBFS, not simulated)
 *   2. What component/tool is currently recording
 *   3. Per-track record-arm state (drives mixer strip R buttons)
 *
 * Injected at root so TransportBar, Mixer, Performer, and
 * StudioComponent all read the same live state.
 */
@Injectable({ providedIn: "root" })
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
    Math.max(this.masterPeakHoldL(), this.masterPeakHoldR()),
  );

  // ── Recording source(s) ─────────────────────────────────────
  /**
   * Every live recorder, not just the last button that was pressed. Several
   * tools can legitimately capture at once (a DJ mix and a vocal take), and a
   * single overwritten slot used to let one component's stop erase another's
   * REC label. Each recorder now registers under its own owner id.
   */
  private readonly activeRecordingsState = signal<readonly ActiveRecording[]>(
    [],
  );
  readonly activeRecordings = this.activeRecordingsState.asReadonly();

  /** The most recently started capture; drives the compact transport chip. */
  recordingSource = computed<RecordingSource>(
    () =>
      this.activeRecordingsState().at(-1)?.source ?? { type: "none" },
  );

  /** Number of live recorders. >1 means the transport must say so. */
  recordingCount = computed(() => this.activeRecordingsState().length);

  // ── Track-level capture destinations ────────────────────────
  /**
   * Tracks the live transport pass is writing to. The mixer strip and the
   * arrangement read this instead of guessing from "is the transport red", so
   * a strip only lights up when its take is actually being captured.
   */
  private readonly recordDestinationsState = signal<
    readonly RecordDestination[]
  >([]);
  readonly recordDestinations = this.recordDestinationsState.asReadonly();

  setRecordDestinations(destinations: readonly RecordDestination[]): void {
    this.recordDestinationsState.set(destinations.map((d) => ({ ...d })));
  }

  clearRecordDestinations(): void {
    this.recordDestinationsState.set([]);
  }

  /** True when this track's take is being written right now. */
  isTrackReceivingTake(trackId: string): boolean {
    return this.recordDestinationsState().some(
      (destination) => destination.trackId === trackId,
    );
  }

  /** Human-readable label for TransportBar / snackbar */
  recordingLabel = computed(() => {
    const active = this.activeRecordingsState();
    if (active.length === 0) return "";
    const newest = active[active.length - 1].source;
    const base = this.shortLabel(newest);
    return active.length > 1
      ? `Rec: ${base} +${active.length - 1}`
      : `Rec: ${base}`;
  });

  /**
   * Second line for the transport chip: the exact destination and source bus.
   * When several recorders are live it names every one instead of pretending
   * the newest capture is the only one.
   */
  recordingDetail = computed(() => {
    const active = this.activeRecordingsState();
    if (active.length === 0) return "";
    if (active.length > 1) {
      return active.map(({ source }) => this.shortLabel(source)).join(" · ");
    }
    return this.detailFor(active[0].source);
  });

  /** Whether anything is being recorded */
  isRecording = computed(() => this.activeRecordingsState().length > 0);

  /** True when this specific tool owns a live capture. */
  isCaptureActive(ownerId: string): boolean {
    return this.activeRecordingsState().some(
      (recording) => recording.ownerId === ownerId,
    );
  }

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
   * Register (or refresh) a capture owned by `ownerId`. Re-registering the
   * same owner updates its label in place, so a take number or paused state
   * can change without creating a duplicate entry.
   */
  beginRecording(ownerId: string, source: RecordingSource): void {
    if (source.type === "none") {
      this.endRecording(ownerId);
      return;
    }
    const active = this.activeRecordingsState();
    const index = active.findIndex((recording) => recording.ownerId === ownerId);
    if (index >= 0) {
      const next = [...active];
      next[index] = { ownerId, source };
      this.activeRecordingsState.set(next);
      return;
    }
    this.activeRecordingsState.set([...active, { ownerId, source }]);
  }

  /** Update an existing capture's readout (e.g. pause, take number). */
  updateRecordingSource(ownerId: string, source: RecordingSource): void {
    this.beginRecording(ownerId, source);
  }

  /** Remove exactly one recorder's entry; other live captures stay intact. */
  endRecording(ownerId: string): void {
    this.activeRecordingsState.update((active) =>
      active.filter((recording) => recording.ownerId !== ownerId),
    );
    // The transport owns the track destinations; once its pass ends no strip
    // may keep claiming it is receiving a take.
    if (ownerId === "transport") this.recordDestinationsState.set([]);
  }

  /**
   * Backwards-compatible single-source entry point. Production components use
   * `beginRecording()` with an owner id; this keeps older callers working.
   */
  setRecordingSource(source: RecordingSource) {
    if (source.type === "none") {
      this.clearRecordingSource();
      return;
    }
    this.beginRecording(this.ownerIdFor(source), source);
  }

  /**
   * Clear one owner when supplied, or every capture when omitted.
   */
  clearRecordingSource(ownerId?: string) {
    if (ownerId) {
      this.endRecording(ownerId);
      return;
    }
    this.activeRecordingsState.set([]);
    this.recordDestinationsState.set([]);
  }

  private ownerIdFor(source: RecordingSource): string {
    switch (source.type) {
      case "transport":
        return "transport";
      case "mixer-strip":
        return `mixer:${source.trackId}`;
      case "performer":
        return "performer";
      case "mic":
        return `mic:${source.channelId}`;
      case "component":
        return `component:${source.componentId}`;
      case "audio-recorder":
        return "audio-recorder";
      case "dj-deck":
        return `dj:${source.deckId}`;
      default:
        return "unknown";
    }
  }

  private shortLabel(source: RecordingSource): string {
    switch (source.type) {
      case "transport": {
        const destinations = source.destinations ?? [];
        if (destinations.length > 1) {
          return `${destinations[0].trackName} +${destinations.length - 1}`;
        }
        return (
          destinations[0]?.trackName || source.trackName || "Selected track"
        );
      }
      case "mixer-strip":
        return `Strip “${source.trackName}”`;
      case "performer":
        return `Performance Take ${source.takeNumber}`;
      case "mic":
        return source.channelLabel;
      case "component":
        return source.componentLabel;
      case "audio-recorder":
        return source.takeNumber
          ? `Audio Recorder Take ${source.takeNumber}`
          : "Audio Recorder";
      case "dj-deck":
        return `Deck ${source.deckId.toUpperCase()}`;
      default:
        return "";
    }
  }

  private detailFor(source: RecordingSource): string {
    const mode = (captureMode?: RecordingCaptureMode) =>
      captureMode === "master" ? "Master out" : "Input";
    switch (source.type) {
      case "transport": {
        const destinations = source.destinations ?? [];
        const tracks = destinations.length
          ? `${destinations.length === 1 ? "Track" : "Tracks"}: ${destinations
              .map((destination) => destination.trackName)
              .join(", ")}`
          : `Track: ${source.trackName || "selected track"}`;
        return [tracks, source.inputLabel || mode(source.captureMode)].join(
          " · ",
        );
      }
      case "mixer-strip":
        return `Track: ${source.trackName}${source.inputLabel ? ` · ${source.inputLabel}` : ""}`;
      case "performer":
        return [
          `Take ${source.takeNumber}`,
          source.trackName ? `Track: ${source.trackName}` : "Performance",
        ].join(" · ");
      case "mic":
        return [
          `Channel: ${source.channelLabel}`,
          source.inputLabel || "Microphone input",
          source.capturePath,
          source.paused ? "Paused" : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
      case "component":
        return [
          `Target: ${source.targetLabel || "new arrangement track"}`,
          source.inputLabel || mode(source.captureMode),
        ].join(" · ");
      case "audio-recorder":
        return [
          source.takeNumber ? `Take ${source.takeNumber}` : "Live capture",
          source.inputLabel || "Microphone input",
          source.capturePath,
        ]
          .filter(Boolean)
          .join(" · ");
      case "dj-deck":
        return "Master mix";
      default:
        return "";
    }
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
        const masterAnalyser = this.audioEngine
          .masterAnalyser as AnalyserNode | null;
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
            Math.max(peakL, v - DECAY_PER_FRAME),
          );
          this.masterPeakHoldR.update((v) =>
            Math.max(peakR, v - DECAY_PER_FRAME),
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
