import {
  Component,
  signal,
  inject,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  computed,
  effect,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { UIService } from "../../services/ui.service";
import { MicrophoneService } from "../../services/microphone.service";
import { StudioRecordingEngineService } from "../studio-recording-engine.service";
import { PitchCorrectionService } from "../pitch-correction.service";
import { VocalMasteringService } from "../../services/vocal-mastering.service";
import { VocalAiService } from "../../services/vocal-ai.service";
import { AiService } from "../../services/ai.service";
import { UplinkService } from "../../services/uplink.service";
import { UserProfileService } from "../../services/user-profile.service";
import { HardwareService } from "../../services/hardware.service";
import { HapticService } from "../../services/haptic.service";
import { UplinkConsoleComponent } from "../../components/uplink-console/uplink-console.component";
import { FormsModule } from "@angular/forms";
import { MicrophoneInterfaceComponent } from "../microphone-interface/microphone-interface.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioEngineLatencyService } from "../../services/audio-engine-latency.service";
import { LoggingService } from "../../services/logging.service";
import { SnackbarService } from "../../services/snackbar.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { WavEncoder } from "../wav-encoder.util";
import { StudioVisualSchedulerService } from "../shared/studio-visual-scheduler.service";
import {
  padBufferStart,
  peakNormalizeInPlace,
  sliceAudioByRatio,
  trimSilenceEdgesWithRange,
} from "../take-edit.util";
import {
  countInBeats,
  countInBeatSeconds,
  countInDurationSeconds,
  scheduleCountInClicks,
} from "../count-in.util";
import { SmartRecordingService } from "../smart-recording.service";
import { AudioImportService } from "../audio-import.service";
import { VocalBackingTrackService } from "../backing-track.service";
import {
  clipStartBarForHeadTrim,
  secondsPerBarForTempo,
} from "./backing-track-alignment.util";
import { buildArrangementGuide } from "./arrangement-guide.util";
import { loadAuditionPrefs, saveAuditionPrefs } from "./audition-settings.util";

type ViewMode = "pipeline" | "console";
type PipelineStep = "setup" | "record" | "edit" | "master";

@Component({
  selector: "app-vocal-suite",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MicrophoneInterfaceComponent,
    UplinkConsoleComponent,
  ],
  templateUrl: "./vocal-suite.component.html",
  styleUrls: ["./vocal-suite.component.css", "../shared/platform-ux.css"],
})
export class VocalSuiteComponent implements AfterViewInit, OnDestroy {
  public readonly uiService = inject(UIService);
  public readonly micService = inject(MicrophoneService);
  public readonly recordingEngine = inject(StudioRecordingEngineService);
  public readonly pitchCorrection = inject(PitchCorrectionService);
  public readonly mastering = inject(VocalMasteringService);
  public readonly vocalAi = inject(VocalAiService);
  public readonly aiService = inject(AiService);
  private uplinkService = inject(UplinkService);
  private profileService = inject(UserProfileService);
  private musicManager = inject(MusicManagerService);
  private engineLatency = inject(AudioEngineLatencyService);
  private audioEngine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private snackbar = inject(SnackbarService);
  public readonly hardware = inject(HardwareService);
  /** Custom uploaded audio to sing against — monitored, never captured. */
  public readonly backing = inject(VocalBackingTrackService);
  private readonly audioImport = inject(AudioImportService, { optional: true });
  private readonly haptic = inject(HapticService);
  private readonly visualScheduler = inject(StudioVisualSchedulerService);
  private readonly smartRecording = inject(SmartRecordingService);
  showUplink = signal(false);

  // ── Take editing / routing ──────────────────────────────
  /** Number of takes already committed to the arrangement. */
  takeNumber = signal(0);
  /** Route every finished take into the arrangement automatically. */
  autoRouteTakes = signal(true);
  /** True while an offline take edit is running. */
  isProcessingTake = signal(false);
  /** Last take status message, shown in the Edit step. */
  takeStatus = signal<string | null>(null);
  /** Envelope of the loaded take, drawn by the Edit-step waveform. */
  takeEnvelope = signal<number[]>([]);
  /** Working (edited) take buffer; null until a take has been decoded. */
  private editedTake: AudioBuffer | null = null;
  /**
   * Leading seconds removed by Trim Silence. Routing adds the take this much
   * further into the arrangement so an edited vocal stays behind its backing.
   */
  readonly headTrimSeconds = signal(0);
  /** Kept region of the working take, as a percentage of its length. */
  readonly takeTrim = signal({ start: 0, end: 100 });
  /**
   * One bar of clicks before a pass. The transport owns its own count-in; the
   * Vocal Suite records outside it, so the same click is armed here.
   */
  countInEnabled = signal(true);
  /** Beats in a running count-in (null when none is running). */
  countInRemaining = signal<number | null>(null);
  /** True while the count-in is clicking (the record button cancels it). */
  readonly countingTake = signal(false);
  /** True while a pass is being armed, count-in included. */
  private armingTake = false;
  /** Bumped by a cancel, so a stale count-in cannot arm over the click. */
  private countInToken = 0;
  private trimDrag: { edge: "start" | "end"; rect: DOMRect } | null = null;
  private detachTrimListeners: (() => void) | null = null;
  private static readonly MIN_TRIM_PERCENT = 2;

  /** True while the working take is auditioning. */
  readonly isAuditioning = signal(false);
  /**
   * Play the take over the song's real transport mix instead of only the guide
   * track. That is the context the vocal will actually live in — drums, synths
   * and every other audio part included.
   */
  private readonly auditionPrefs = loadAuditionPrefs();
  auditionInMix = signal(this.auditionPrefs.inMix);
  /** Repeat the preview over the take instead of playing it once. */
  loopAudition = signal(this.auditionPrefs.loop);
  /** Bars of song-only lead-in before the take enters an in-mix preview. */
  auditionPreRollBars = signal(this.auditionPrefs.preRollBars);
  /** Beats left in the lead-in (null once the take enters or nothing counts). */
  readonly auditionPreRollRemaining = signal<number | null>(null);
  private preRollTicker: ReturnType<typeof setInterval> | null = null;
  /** True when this audition started the transport, so stopping it stops that. */
  private auditionStartedTransport = false;
  /** Transport loop as it was before the audition borrowed it. */
  private savedLoopRegion: {
    start: number | null;
    end: number | null;
    enabled: boolean;
  } | null = null;
  /** True when the preview switched the guide's own loop on. */
  private loopingAuditionGuide = false;
  private auditionSource: AudioBufferSourceNode | null = null;
  /** Guide-track position when the take was paused, so it resumes in sync. */
  private pausedBackingSeconds = 0;

  @ViewChild("spectrograph") spectrographRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("waveformCanvas") waveformRef!: ElementRef<HTMLCanvasElement>;

  viewMode = signal<ViewMode>("pipeline");
  currentStep = signal<PipelineStep>("setup");
  /** Phone-only: the guidance HUD card (restored on demand). */
  phoneGuidanceOpen = signal(false);

  isBypassed = signal(false);
  activeMasteringTab = signal<"eq" | "comp" | "exciter" | "limiter">("eq");
  readonly masteringTabs = ["eq", "comp", "exciter", "limiter"] as const;
  readonly pipelineSteps = ["setup", "record", "edit", "master"] as const;

  // ── Monitor + De-Esser ──────────────────────────────────
  /**
   * Input monitoring state. The mastering chain is permanently wired to the
   * studio master bus, so this is a real mute of the monitoring path rather
   * than a cosmetic switch — the old "Monitor" button had no handler at all.
   */
  monitorEnabled = signal(true);
  captureError = signal<string | null>(null);
  /**
   * True while the studio capture engine writes this pass as 16-bit WAV.
   * False means the MediaRecorder fallback is capturing compressed audio.
   */
  readonly losslessCapture = signal(false);
  /** WAV finished by the engine for *this* pass (not another view's take). */
  private losslessTake = signal<Blob | null>(null);
  private losslessWarningShown = false;
  /** Either capture path counts: engine WAV or MediaRecorder fallback. */
  readonly captureActive = computed(
    () => this.micService.isRecording() || this.recordingEngine.isRecording(),
  );
  readonly capturePaused = computed(
    () => this.micService.isPaused() || this.recordingEngine.isPaused(),
  );
  /** Live take clock, whichever path is capturing. */
  readonly captureSeconds = computed(() =>
    this.recordingEngine.isRecording()
      ? this.recordingEngine.recordingTime()
      : this.micService.recordingTime(),
  );
  captureState = computed(() => {
    if (this.captureError()) return "error" as const;
    if (this.countingTake()) return "counting" as const;
    if (this.captureActive()) return "recording" as const;
    if (this.capturePaused()) return "paused" as const;
    if (this.micService.isInitialized()) return "ready" as const;
    return "idle" as const;
  });
  capturePathLabel = computed(() => {
    const label = (this.micService as any).capturePathLabel;
    if (typeof label === "function") return label();
    return (this.micService as any).usingProcessedCapture?.()
      ? "Processed vocal chain"
      : "Raw microphone input";
  });
  deviceSwitchLocked = computed(() => {
    const canSwitch = (this.micService as any).canSwitchDevice;
    return typeof canSwitch === "function"
      ? !canSwitch()
      : this.captureActive();
  });
  /** Where the next routed take starts, so it stays behind the backing track. */
  readonly takeStartBarLabel = computed(() => {
    const buffer = this.editedTake;
    const bars = clipStartBarForHeadTrim({
      headTrimSeconds:
        this.headTrimSeconds() +
        (buffer ? this.visualHeadTrimSeconds(buffer) : 0),
      tempo: this.audioEngine.tempo(),
    });
    return bars > 0
      ? `Take starts at bar ${(bars + 1).toFixed(2)} to stay on the backing track`
      : "Take starts at bar 1";
  });
  latencyWarning = computed(() => {
    const snapshot = (this.engineLatency as any).snapshot;
    if (typeof snapshot !== "function") return null;
    const total = snapshot()?.totalLatencyMs ?? 0;
    return total > 60 ? "Bluetooth or wireless latency may be audible" : null;
  });

  /** De-Esser state, read straight off the live mastering parameters. */
  deEsserEnabled = computed(() => !this.mastering.params().deesser.bypass);

  toggleMonitor(): void {
    this.haptic.light();
    const next = !this.monitorEnabled();
    try {
      if (next) {
        this.mastering.getOutputNode().connect(this.audioEngine.masterGain);
      } else {
        this.mastering.getOutputNode().disconnect(this.audioEngine.masterGain);
      }
      this.monitorEnabled.set(next);
      this.snackbar.info(
        next ? "Input monitoring ON" : "Input monitoring muted",
      );
    } catch (err) {
      // disconnect() throws when the node was not connected — keep the UI in
      // sync with the graph rather than leaving a lying toggle.
      this.monitorEnabled.set(!next);
      this.logger.warn("VocalSuite: monitor toggle failed", err);
    }
  }

  /** Bypass/enable the de-esser inside the live vocal mastering chain. */
  toggleDeEsser(): void {
    this.haptic.light();
    const current = this.mastering.params().deesser;
    this.mastering.updateParams({
      deesser: { ...current, bypass: !current.bypass },
    });
    this.snackbar.info(
      current.bypass ? "Neural De-Esser engaged" : "Neural De-Esser bypassed",
    );
  }

  private visualTaskCleanup: (() => void) | null = null;
  private ctx2d?: CanvasRenderingContext2D;
  private waveformCtx?: CanvasRenderingContext2D;

  private waveformData: number[] = [];

  recordingTimeFormatted = computed(() => {
    const seconds = this.captureSeconds();
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const secs = s % 60;
    const ms = Math.floor((seconds % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
  });

  constructor() {
    effect(() => {
      this.mastering.updateNodes();
    });
  }

  ngAfterViewInit() {
    this.initCanvases();
    this.startVisualization();
  }

  ngOnDestroy() {
    this.visualTaskCleanup?.();
    this.visualTaskCleanup = null;
    this.endTakeTrimDrag();
    this.stopAudition();
    // Only a pass this view started: the engine is shared with the transport,
    // and another view's take must not be finalised here.
    if (this.losslessCapture() && this.recordingEngine.isRecording()) {
      void this.recordingEngine.stopRecording();
    }
    (this.micService as any).detachProcessedCapture?.();
  }

  private initCanvases() {
    if (this.spectrographRef) {
      this.ctx2d = this.spectrographRef.nativeElement.getContext("2d")!;
    }
    if (this.waveformRef) {
      this.waveformCtx = this.waveformRef.nativeElement.getContext("2d")!;
    }
  }

  setStep(step: PipelineStep) {
    this.currentStep.set(step);
    // Leaving the edit step must not leave a take auditioning under the next
    // screen, and a guide track has no meaning outside the record step.
    if (step !== "edit") this.stopAudition();
    if (step !== "record") this.backing.stop();
    if (step === "record" && !this.micService.isInitialized()) {
      this.initializeMic();
    }
  }

  async initializeMic() {
    this.captureError.set(null);
    const deviceId = this.micService.selectedDeviceId();
    const ready = await this.micService.initialize(deviceId || undefined);
    if (!ready) {
      const lastError = (this.micService as any).lastError;
      this.captureError.set(
        (typeof lastError === "function" ? lastError() : null) ||
          "Microphone unavailable",
      );
      return;
    }
    const node = this.micService.getAnalyserNode();
    if (node) {
      // Route the mic through the real-time pitch-correction stage first; the
      // service falls back to a clean bypass when the worklet is unavailable.
      const corrected = await this.pitchCorrection.insertIntoChain(node);
      this.mastering.applyToSource(corrected ?? node);
      // Takes must capture the chain the artist hears (pitch correction +
      // mastering), not the dry microphone feed.
      this.micService.attachProcessedCapture(this.mastering.getOutputNode());
    }
  }

  async toggleRecording() {
    this.captureError.set(null);
    if (this.captureActive()) {
      // The guide track stops with the take: leaving it running under the
      // finalize step reads as a take that never ended.
      this.stopAudition();
      this.backing.stop();
      const blob = await this.stopCapture();
      const durationMs = Math.round(this.takeDurationSeconds * 1000);
      if (blob) {
        // Every finished pass joins the active comp group, so the Vocal Comp
        // view has real takes to comp without a second recording step.
        void this.smartRecording.addTakeFromRecording({
          blob,
          durationMs,
          trackName: "Vocal Track",
          sectionLabel: "Vocal Takes",
        });
      }
      // A fresh take replaces any decoded/edited buffer from the previous one.
      // This must happen whether or not auto-route commits the take straight
      // away: keeping the old cache made the next Normalize/Trim edit the
      // previous take and route that stale audio to the arrangement.
      this.editedTake = null;
      this.headTrimSeconds.set(0);
      this.takeTrim.set({ start: 0, end: 100 });
      this.takeEnvelope.set([]);
      this.takeStatus.set(null);
      if (blob && this.autoRouteTakes()) {
        await this.routeTakeToArrangement();
      }
      return;
    }
    // A second press while the count-in clicks cancels it instead of arming
    // over the click; the arming call then sees the bumped token and stops.
    if (this.armingTake || this.countingTake()) {
      this.cancelCountIn();
      return;
    }
    if (!this.micService.isInitialized()) {
      // Prime the input + vocal chain on first record so a take is never
      // silently captured from a dead graph.
      await this.initializeMic();
      if (!this.micService.isInitialized()) return;
    }
    this.armingTake = true;
    try {
      await this.startCapture();
    } finally {
      this.armingTake = false;
    }
  }

  /**
   * Arm the take. The processed vocal chain is captured as WAV by the studio
   * engine when its worklet is available; hosts where that cannot run fall back
   * to the compressed MediaRecorder path instead of losing the take.
   */
  private async startCapture(): Promise<void> {
    this.waveformData = [];
    this.losslessTake.set(null);
    this.stopAudition();
    // Click a bar, then arm the take and the guide on the same downbeat. A
    // cancel leaves nothing recording and nothing playing.
    if (!(await this.runCountIn())) {
      this.backing.stop();
      return;
    }
    // Arm the guide track from the top so the take and the backing share one
    // downbeat; resuming mid-track would place the vocal wrong.
    if (this.backing.hasTrack()) this.backing.restart();

    const lossless = await this.startLosslessCapture();
    if (!lossless) {
      this.losslessCapture.set(false);
      this.micService.startRecording();
      if (!this.losslessWarningShown) {
        this.losslessWarningShown = true;
        this.snackbar.info(
          "Lossless WAV capture is unavailable here — recording compressed audio",
        );
      }
    }

    if (!this.captureActive()) {
      // Capture never started, so the guide must not keep playing on its own.
      this.backing.stop();
      const lastError = (this.micService as any).lastError;
      this.captureError.set(
        (typeof lastError === "function" ? lastError() : null) ||
          "Could not start capture",
      );
    }
  }

  /**
   * Record the stream the artist actually hears (pitch correction + mastering)
   * through the worklet engine, which encodes a 16-bit WAV rather than a lossy
   * Opus blob. Returns false when the worklet path cannot start.
   */
  private async startLosslessCapture(): Promise<boolean> {
    const stream = this.micService.getCaptureStream?.() ?? null;
    if (!stream) return false;
    try {
      const workletReady = await this.recordingEngine.prepareCaptureWorklet();
      if (!workletReady) return false;
      this.recordingEngine.startRecording(stream);
      if (!this.recordingEngine.isRecording()) return false;
      this.losslessCapture.set(true);
      return true;
    } catch (error) {
      this.logger.warn(
        "VocalSuite: lossless capture unavailable; using compressed fallback",
        error,
      );
      return false;
    }
  }

  /**
   * Length of the take that just finished. Read from the path that captured it:
   * the engine only settles its clock once the WAV is encoded, and the shared
   * microphone service no longer knows about a WAV pass at all.
   */
  private takeDurationSeconds = 0;

  /** Finish the pass on whichever path started it. */
  private async stopCapture(): Promise<Blob | null> {
    if (this.recordingEngine.isRecording()) {
      await this.recordingEngine.stopRecording();
      this.takeDurationSeconds = this.recordingEngine.recordingTime();
      const blob = this.recordingEngine.recordedBlob();
      this.losslessTake.set(blob);
      this.losslessCapture.set(false);
      return blob;
    }
    const blob = await this.micService.stopRecording();
    this.takeDurationSeconds = this.micService.recordingTime();
    this.losslessCapture.set(false);
    return blob;
  }

  /**
   * The finished take. This pass's WAV wins; the recorder fallback covers hosts
   * where the worklet could not start.
   */
  takeBlob(): Blob | null {
    return this.losslessTake() ?? this.micService.recordedBlob();
  }

  /**
   * Pause the take and the guide track together. Pausing only the recorder left
   * the backing running, so the rest of the vocal was sung against a moved
   * track; the guide resumes from where it was paused.
   */
  togglePauseRecording(): void {
    if (this.capturePaused()) {
      if (this.recordingEngine.isRecording()) this.recordingEngine.resumeRecording();
      else this.micService.resumeRecording();
      if (this.backing.hasTrack()) this.backing.play(this.pausedBackingSeconds);
      return;
    }
    if (!this.captureActive()) return;
    this.pausedBackingSeconds = this.backing.positionSeconds();
    this.backing.stop();
    if (this.recordingEngine.isRecording()) this.recordingEngine.pauseRecording();
    else this.micService.pauseRecording();
  }

  toggleAutoRoute(): void {
    this.autoRouteTakes.update((v) => !v);
  }

  // ── Take editing ─────────────────────────────────────────

  /** Decode the current take once; edits then work on the same buffer. */
  private async resolveTakeBuffer(): Promise<AudioBuffer | null> {
    if (this.editedTake) return this.editedTake;
    const blob = this.takeBlob();
    if (!blob) return null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
      this.editedTake = buffer;
      return buffer;
    } catch (error) {
      this.logger.error("VocalSuite: could not decode the take", error);
      this.snackbar.error("Could not read the take — try recording again");
      return null;
    }
  }

  /** Load the take, run one edit and report the outcome. */
  private async editTake(
    label: string,
    edit: (buffer: AudioBuffer) => string,
  ): Promise<string | null> {
    if (this.isProcessingTake()) return null;
    this.isProcessingTake.set(true);
    this.takeStatus.set(label);
    try {
      const buffer = await this.resolveTakeBuffer();
      if (!buffer) {
        this.takeStatus.set("Record a take first");
        this.snackbar.error("Record a take first");
        return null;
      }
      const status = edit(buffer);
      this.takeStatus.set(status);
      this.takeEnvelope.set(this.computeEnvelope(buffer));
      this.snackbar.success(status);
      return status;
    } catch (error) {
      this.logger.error("VocalSuite: take edit failed", error);
      this.takeStatus.set("Take edit failed");
      this.snackbar.error("Could not process the take");
      return null;
    } finally {
      this.isProcessingTake.set(false);
    }
  }

  /** Peak-normalize the take to -1 dBFS. */
  async normalizeTake(): Promise<string | null> {
    return this.editTake("Normalizing take…", (buffer) => {
      const gain = peakNormalizeInPlace(buffer, -1);
      return gain === 1
        ? "Take is silent — nothing to normalize"
        : `Normalized to -1 dBFS (×${gain.toFixed(2)})`;
    });
  }

  /** Trim silent head/tail from the take, keeping 20 ms of room tone. */
  async trimTakeSilence(): Promise<string | null> {
    return this.editTake("Trimming silence…", (buffer) => {
      const before = buffer.duration;
      const result = trimSilenceEdgesWithRange(
        buffer,
        this.audioEngine.ctx,
        -50,
        20,
      );
      if (result.buffer === buffer) return "No silent edges to trim";
      this.editedTake = result.buffer;
      // Remember how much head was cut: the take is routed that much later so
      // the first kept word still lands on the beat it was sung on.
      if (result.headTrimSeconds > 0) {
        this.headTrimSeconds.update((seconds) => seconds + result.headTrimSeconds);
      }
      const removed = before - result.buffer.duration;
      return `Trimmed ${removed.toFixed(2)}s of silence · the take keeps its place`;
    });
  }

  /**
   * Voice-changer presets: shift the working take while keeping its timing.
   * These are offline, non-destructive edits on the loaded take; route it to
   * the arrangement when the character is right.
   */
  async shiftVoice(semitones: number): Promise<string | null> {
    if (!this.audioImport) {
      this.snackbar.error("Voice shifting is unavailable on this host");
      return null;
    }
    return this.editTake(
      `Shifting voice ${semitones > 0 ? "+" : ""}${semitones} st…`,
      (buffer) => {
        const shifted = this.audioImport!.pitchShiftBuffer(buffer, semitones);
        this.editedTake = shifted;
        return `Voice shifted ${semitones > 0 ? "+" : ""}${semitones} semitones`;
      },
    );
  }

  // ── Count-in ─────────────────────────────────────────────

  toggleCountIn(): void {
    this.haptic.light();
    this.countInEnabled.update((enabled) => !enabled);
    if (!this.countInEnabled() && this.countingTake()) this.cancelCountIn();
  }

  /** Stop a running count-in without arming anything. */
  cancelCountIn(): void {
    this.countInToken += 1;
    this.countInRemaining.set(null);
    this.countingTake.set(false);
    this.backing.stop();
    this.snackbar.info("Count-in cancelled");
  }

  /**
   * Click one bar before capture. Returns false when the artist cancels, so the
   * caller leaves the take unarmed instead of recording over the count.
   */
  private async runCountIn(): Promise<boolean> {
    if (!this.countInEnabled()) return true;
    const ctx = this.audioEngine.ctx;
    const tempo = this.audioEngine.tempo();
    const beats = countInBeats(1);
    const beatSeconds = countInBeatSeconds(tempo);
    const totalSeconds = countInDurationSeconds(1, tempo);
    if (!(totalSeconds > 0)) return true;

    const token = ++this.countInToken;
    const startAt = ctx.currentTime + 0.08;
    scheduleCountInClicks(ctx, {
      beats,
      beatSeconds,
      startAt,
      onError: (error) =>
        this.logger.warn("VocalSuite: count-in click failed", error),
    });
    this.countingTake.set(true);
    this.countInRemaining.set(beats);
    await new Promise<void>((resolve) =>
      setTimeout(resolve, totalSeconds * 1000 + 30),
    );
    this.countInRemaining.set(null);
    this.countingTake.set(false);
    return token === this.countInToken;
  }

  // ── Visual take trimming ─────────────────────────────────

  readonly takeTrimLabel = computed(() => {
    const trim = this.takeTrim();
    if (trim.start === 0 && trim.end === 100) return "Full take";
    return `Keeping ${trim.start.toFixed(0)}%–${trim.end.toFixed(0)}%`;
  });

  /** Start dragging one edge of the kept region; the overlay is the ruler. */
  startTakeTrimDrag(event: PointerEvent, edge: "start" | "end"): void {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement | null;
    const host = handle?.parentElement ?? null;
    if (!host) return;
    this.endTakeTrimDrag();
    this.trimDrag = { edge, rect: host.getBoundingClientRect() };
    const move = (moveEvent: PointerEvent) => this.onTakeTrimPointerMove(moveEvent);
    const up = () => this.endTakeTrimDrag();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.detachTrimListeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    this.haptic.light();
  }

  onTakeTrimPointerMove(event: PointerEvent): void {
    const drag = this.trimDrag;
    if (!drag) return;
    const ratio =
      (event.clientX - drag.rect.left) / Math.max(1, drag.rect.width);
    this.setTakeTrimEdge(drag.edge, ratio * 100);
  }

  endTakeTrimDrag(): void {
    this.trimDrag = null;
    this.detachTrimListeners?.();
    this.detachTrimListeners = null;
  }

  /** Move one handle, keeping the kept region at least a hair wide. */
  setTakeTrimEdge(edge: "start" | "end", percent: number): void {
    if (!Number.isFinite(percent)) return;
    const value = Math.max(0, Math.min(100, percent));
    const current = this.takeTrim();
    const gap = VocalSuiteComponent.MIN_TRIM_PERCENT;
    if (edge === "start") {
      const start = Math.max(0, Math.min(value, current.end - gap));
      if (start !== current.start) this.takeTrim.set({ start, end: current.end });
      return;
    }
    const end = Math.min(100, Math.max(value, current.start + gap));
    if (end !== current.end) this.takeTrim.set({ start: current.start, end });
  }

  resetTakeTrim(): void {
    this.haptic.light();
    this.takeTrim.set({ start: 0, end: 100 });
  }

  /** Seconds the left handle removed; routing adds them back as placement. */
  private visualHeadTrimSeconds(buffer: AudioBuffer): number {
    return (this.takeTrim().start / 100) * buffer.duration;
  }

  /** The working take cut to the kept region — the same buffer when whole. */
  private takeRegion(buffer: AudioBuffer): AudioBuffer {
    const trim = this.takeTrim();
    return sliceAudioByRatio(
      buffer,
      this.audioEngine.ctx,
      trim.start / 100,
      trim.end / 100,
    );
  }

  // ── Take routing ─────────────────────────────────────────

  /** Commit the current take to the arrangement as its own audio track. */
  async routeTakeToArrangement(): Promise<void> {
    const buffer = await this.resolveTakeBuffer();
    if (!buffer) {
      this.snackbar.error("Record a take first");
      return;
    }

    const take = this.takeNumber() + 1;
    // Commit only the kept region. The recording itself is untouched, so
    // widening the handles again still recovers the whole take.
    const region = this.takeRegion(buffer);
    // Recorded audio is late by the output latency; trim it before it lands on
    // the timeline so the vocal lines up with the imported instrumental.
    const compensated = this.engineLatency.trimAudioBuffer(region);
    // A trimmed take starts at the bar its first kept sample was sung on, not
    // at bar 1 — otherwise the vocal slides earlier than the backing.
    const startBar = clipStartBarForHeadTrim({
      headTrimSeconds:
        this.headTrimSeconds() + this.visualHeadTrimSeconds(buffer),
      tempo: this.audioEngine.tempo(),
    });
    this.musicManager.addAudioTrack({
      id: `vocal_take_${Date.now()}`,
      name: `Vocal Take ${take}`,
      color: "#a855f7",
      buffer: compensated,
      offset: startBar,
    });
    this.takeNumber.set(take);
    this.takeStatus.set(`Vocal Take ${take} added to the arrangement`);
    this.snackbar.success(`Vocal Take ${take} added to the arrangement`);
  }

  // ── Backing track (custom uploaded audio) ────────────────

  /**
   * Load a custom audio file as the guide track. It is monitored with the mic
   * but never captured, so the take holds only the voice.
   */
  async onBackingFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    // Clear the picker so choosing the same file again still fires `change`.
    if (input) input.value = "";
    if (!file) return;
    const loaded = await this.backing.loadFile(file);
    if (loaded) {
      this.snackbar.success(`Backing track loaded — ${file.name}`);
    } else {
      this.snackbar.error(
        this.backing.lastError() ?? "Could not read that audio file",
      );
    }
  }

  toggleBackingPlayback(): void {
    this.haptic.light();
    if (this.backing.isPlaying()) {
      this.backing.stop();
      return;
    }
    this.backing.play(this.backing.positionSeconds());
  }

  setBackingLevel(percent: number): void {
    this.backing.setLevel(percent);
  }

  toggleBackingLoop(): void {
    this.haptic.light();
    this.backing.toggleLoop();
  }

  clearBacking(): void {
    this.backing.clear();
    this.snackbar.info("Backing track removed");
  }

  /**
   * Audio tracks already in the song, offered as the guide. A vocalist who
   * imported the beat into the arrangement should not have to find the same
   * file twice; the buffer is read from the shared stem cache.
   */
  readonly arrangementTracks = computed(() => {
    const secondsPerBar = secondsPerBarForTempo(this.audioEngine.tempo());
    const options: Array<{
      id: string;
      name: string;
      buffer: AudioBuffer;
      clipCount: number;
    }> = [];
    for (const track of this.musicManager.tracks() as any[]) {
      if (track?.type !== "audio") continue;
      // Every audio clip of the track, with the slice and bar it actually
      // plays, so a track split across the song becomes one aligned guide.
      const clips = (track.clips ?? [])
        .filter(
          (clip: any) =>
            clip?.audioRefId &&
            this.musicManager.stemAudioCache.has(clip.audioRefId),
        )
        .map((clip: any) => ({
          startBar: Number(clip.start) || 0,
          originSeconds: Number(clip.clipOriginSeconds) || 0,
          lengthSeconds:
            typeof clip.clipLengthSeconds === "number"
              ? clip.clipLengthSeconds
              : null,
          buffer: this.musicManager.stemAudioCache.get(clip.audioRefId)!,
        }));
      if (clips.length === 0) continue;
      const buffer = buildArrangementGuide(clips, {
        secondsPerBar,
        createBuffer: (channels, length, sampleRate) =>
          this.audioEngine.ctx.createBuffer(channels, length, sampleRate),
      });
      if (buffer) {
        options.push({
          id: track.id,
          name: track.name,
          buffer,
          clipCount: clips.length,
        });
      }
    }
    return options;
  });

  /** True when the guide is a track that already lives in the song. */
  readonly backingFromSong = computed(
    () => !!this.backing.track()?.sourceTrackId,
  );

  /** Why the picker is empty, when the song has audio that cannot be used. */
  readonly guideHint = computed(() => {
    if (this.arrangementTracks().length > 0) return null;
    const hasAudio = (this.musicManager.tracks() as any[]).some(
      (track) => track?.type === "audio",
    );
    return hasAudio
      ? "This song's audio tracks have no cached audio to sing against yet."
      : null;
  });

  toggleAuditionInMix(): void {
    this.haptic.light();
    this.auditionInMix.update((enabled) => !enabled);
    this.persistAuditionPrefs();
  }

  /** Remember the audition choices for the next session. */
  private persistAuditionPrefs(): void {
    saveAuditionPrefs({
      inMix: this.auditionInMix(),
      loop: this.loopAudition(),
      preRollBars: this.auditionPreRollBars(),
    });
  }

  /**
   * One tap between hearing the take alone (with its guide) and hearing it over
   * the song. Restarts a running preview so the switch is immediate.
   */
  toggleAuditionAB(): void {
    this.haptic.light();
    this.auditionInMix.update((inMix) => !inMix);
    this.persistAuditionPrefs();
    if (this.isAuditioning()) {
      this.stopAudition();
      void this.auditionTake();
    }
  }

  /** Choose the audition lead-in: none, one bar or two. */
  setAuditionPreRoll(value: number | string): void {
    const bars = Math.max(0, Math.min(2, Math.round(Number(value) || 0)));
    if (bars === this.auditionPreRollBars()) return;
    this.auditionPreRollBars.set(bars);
    this.persistAuditionPrefs();
    // Restart in place so the choice applies to the preview already running.
    if (this.isAuditioning()) {
      this.stopAudition();
      void this.auditionTake();
    }
  }

  toggleLoopAudition(): void {
    this.haptic.light();
    this.loopAudition.update((enabled) => !enabled);
    this.persistAuditionPrefs();
    // Restart in place so the new mode applies to the preview already running.
    if (this.isAuditioning()) {
      this.stopAudition();
      void this.auditionTake();
    }
  }

  /** Use one of the song's audio tracks as the backing to sing against. */
  useArrangementTrack(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const id = select?.value;
    if (!id) return;
    const option = this.arrangementTracks().find((item) => item.id === id);
    if (!option) return;
    if (
      this.backing.useBuffer(
        option.buffer,
        option.name,
        option.id,
        option.clipCount,
      )
    ) {
      this.snackbar.success(
        option.clipCount > 1
          ? `Backing track set from "${option.name}" (${option.clipCount} clips)`
          : `Backing track set from "${option.name}"`,
      );
    } else {
      this.snackbar.error("Could not use that track as the backing");
    }
    if (select) select.value = "";
  }

  /** Put the uploaded guide track in the arrangement at bar 1. */
  addBackingToArrangement(): void {
    // The guide came from the song: adding it again would double the beat.
    if (this.backingFromSong()) {
      this.snackbar.info("This guide is already in the song");
      return;
    }
    const name = this.backing.addToArrangement();
    if (!name) return;
    this.snackbar.success(`"${name}" added to the arrangement`);
  }

  /**
   * Audition the working take. With a backing loaded, both start at the same
   * AudioContext time — the take at its trimmed position, the backing at that
   * position in the song — so the preview proves the vocal sits behind the
   * track before it is committed.
   */
  async auditionTake(): Promise<void> {
    if (this.isAuditioning()) {
      this.stopAudition();
      return;
    }
    const buffer = await this.resolveTakeBuffer();
    if (!buffer) {
      this.snackbar.error("Record a take first");
      return;
    }
    const ctx = this.audioEngine.ctx;
    if (ctx.state === "suspended") {
      // Resume first: a transport start that has to wait for the context would
      // schedule the song after the take instead of with it.
      try {
        await ctx.resume();
      } catch {
        /* the take still previews on its own */
      }
    }
    this.stopAudition();
    const headTrim =
      this.headTrimSeconds() + this.visualHeadTrimSeconds(buffer);
    const region = this.takeRegion(buffer);
    const loop = this.loopAudition();
    let startAt = ctx.currentTime + 0.06;
    const guiding = this.backing.hasTrack();
    let plan: { preRollSeconds: number } | null = null;

    if (this.auditionInMix()) {
      // A running song would be mid-bar under a take that starts at its own
      // first kept sample, so the preview restarts it from that bar.
      if (this.audioEngine.isPlaying()) this.audioEngine.stop();
      plan = this.startTransportForAudition(headTrim, region.duration, loop);
      if (plan) {
        // The song now carries the guide if that is where it came from; only an
        // uploaded guide has to be played alongside it.
        startAt = Math.max(startAt, this.audioEngine.transportStartTime());
      }
    }
    // The take enters after the pre-roll bar; a looped take carries that bar as
    // silence so both wrap points still agree.
    if (plan && plan.preRollSeconds > 0) {
      this.startAuditionPreRollCount(plan.preRollSeconds);
    }
    const takeDelay = plan && !loop ? plan.preRollSeconds : 0;
    let auditionBuffer = region;
    if (plan && loop && plan.preRollSeconds > 0) {
      auditionBuffer = padBufferStart(region, ctx, plan.preRollSeconds);
    }
    if (plan) {
      if (guiding && !this.backingFromSong()) {
        // A looping preview starts the uploaded guide one bar early, so its own
        // loop wraps over the same pre-roll plus take region as the transport.
        const guideLoops = loop && plan.preRollSeconds > 0;
        if (guideLoops) this.loopAuditionGuide();
        this.backing.play(
          guideLoops ? Math.max(0, headTrim - plan.preRollSeconds) : headTrim,
          startAt + takeDelay,
        );
      }
    } else if (guiding) {
      this.backing.play(headTrim, startAt);
    }
    try {
      const source = ctx.createBufferSource();
      source.buffer = auditionBuffer;
      // Looping the take alone would drift from a song that kept playing, so
      // the transport is looped over the same region in startTransportForAudition.
      source.loop = loop;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        if (this.auditionSource !== source) return;
        this.auditionSource = null;
        this.isAuditioning.set(false);
        // The take finished; leaving the song running under it reads as a
        // preview that never ended.
        this.stopAuditionTransport();
        try {
          gain.disconnect();
        } catch {
          /* already disconnected */
        }
      };
      source.start(startAt + takeDelay);
      this.auditionSource = source;
      this.isAuditioning.set(true);
    } catch (error) {
      this.logger.warn("VocalSuite: could not audition the take", error);
      this.snackbar.error("Could not play the take");
      this.backing.stop();
    }
  }

  /**
   * Start the song under the take, positioned so the take's first kept sample
   * lands on the bar it was sung on. Returns false when the transport refuses.
   */
  private startTransportForAudition(
    headTrimSeconds: number,
    regionSeconds = 0,
    loop = false,
  ): { preRollSeconds: number } | null {
    try {
      const engine = this.audioEngine as any;
      const saved = {
        start: engine.playbackLoopStart?.() ?? null,
        end: engine.playbackLoopEnd?.() ?? null,
        enabled: engine.playbackLoopEnabled?.() ?? false,
      };
      const bars = clipStartBarForHeadTrim({
        headTrimSeconds,
        tempo: this.audioEngine.tempo(),
      });
      const stepsPerBar = Math.max(1, this.audioEngine.stepsPerBar?.() ?? 16);
      const secondsPerBar = secondsPerBarForTempo(this.audioEngine.tempo());
      const takeStep = Math.max(0, Math.round(bars * stepsPerBar));
      // Song-only lead-in before the vocal enters, capped by how much song is
      // actually in front of the take.
      const preRollBars = Math.min(
        Math.max(0, this.auditionPreRollBars()),
        Math.floor(takeStep / stepsPerBar),
      );
      const preRollSteps = preRollBars * stepsPerBar;
      const preRollSeconds = (preRollSteps / stepsPerBar) * secondsPerBar;
      const seekStep = takeStep - preRollSteps;
      // seekToStep clamps into an active A/B loop, so the artist's loop is
      // lifted for the seek and put back when the preview ends.
      if (saved.enabled && typeof engine.togglePlaybackLoop === "function") {
        engine.togglePlaybackLoop(false);
      }
      if (this.audioEngine.seekToStep(seekStep) === null) {
        if (saved.enabled) engine.togglePlaybackLoop?.(true);
        return null;
      }
      this.savedLoopRegion = saved;
      if (loop && regionSeconds > 0) {
        this.loopTransportForAudition(
          seekStep,
          regionSeconds + preRollSeconds,
          stepsPerBar,
        );
      }
      // start() is synchronous once the context is running; the anchor it just
      // set is what the take is scheduled against.
      void this.audioEngine.start();
      this.auditionStartedTransport = true;
      return { preRollSeconds };
    } catch (error) {
      this.logger.warn("VocalSuite: could not start the mix for the audition", error);
      return null;
    }
  }

  /**
   * Borrow the transport loop for the take's region. The artist's own loop is
   * remembered and put back when the preview ends — a preview must not rewrite
   * the session's transport settings.
   */
  private loopTransportForAudition(
    startStep: number,
    regionSeconds: number,
    stepsPerBar: number,
  ): void {
    const engine = this.audioEngine as any;
    if (
      typeof engine.setPlaybackLoop !== "function" ||
      typeof engine.togglePlaybackLoop !== "function"
    ) {
      return;
    }
    const secondsPerStep =
      secondsPerBarForTempo(this.audioEngine.tempo()) / Math.max(1, stepsPerBar);
    const endStep =
      startStep + Math.max(1, Math.round(regionSeconds / secondsPerStep));
    if (!engine.setPlaybackLoop(startStep, endStep)) return;
    engine.togglePlaybackLoop(true);
  }

  /** Count the lead-in beats down in the header, one tick per beat. */
  private startAuditionPreRollCount(seconds: number): void {
    this.clearAuditionPreRollCount();
    const beatSeconds = countInBeatSeconds(this.audioEngine.tempo());
    let remaining = Math.max(1, Math.round(seconds / beatSeconds));
    this.auditionPreRollRemaining.set(remaining);
    this.preRollTicker = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this.clearAuditionPreRollCount();
        return;
      }
      this.auditionPreRollRemaining.set(remaining);
    }, beatSeconds * 1000);
  }

  private clearAuditionPreRollCount(): void {
    if (this.preRollTicker) {
      clearInterval(this.preRollTicker);
      this.preRollTicker = null;
    }
    this.auditionPreRollRemaining.set(null);
  }

  /** Loop the uploaded guide for the preview without changing its setting. */
  private loopAuditionGuide(): void {
    if (this.backing.loop()) return;
    this.loopingAuditionGuide = true;
    this.backing.toggleLoop();
  }

  /** Stop a transport this audition started and give the loop back. */
  private stopAuditionTransport(): void {
    if (this.loopingAuditionGuide) {
      this.loopingAuditionGuide = false;
      if (this.backing.loop()) this.backing.toggleLoop();
    }
    if (this.auditionStartedTransport) {
      this.auditionStartedTransport = false;
      try {
        this.audioEngine.stop();
      } catch {
        /* transport already stopped */
      }
    }
    const saved = this.savedLoopRegion;
    if (!saved) return;
    this.savedLoopRegion = null;
    const engine = this.audioEngine as any;
    try {
      engine.setPlaybackLoop?.(saved.start, saved.end);
      engine.togglePlaybackLoop?.(saved.enabled);
    } catch {
      /* transport already gone */
    }
  }

  stopAudition(): void {
    const source = this.auditionSource;
    this.auditionSource = null;
    this.isAuditioning.set(false);
    this.clearAuditionPreRollCount();
    this.stopAuditionTransport();
    if (source) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* never started */
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.backing.stop();
  }

  /** Throw away Normalize / Trim / Voice-shift edits and re-read the take. */
  async resetTakeEdits(): Promise<void> {
    if (this.isProcessingTake()) return;
    this.isProcessingTake.set(true);
    try {
      const blob = this.takeBlob();
      if (!blob) {
        this.snackbar.error("Record a take first");
        return;
      }
      const buffer = await this.audioEngine.ctx.decodeAudioData(
        await blob.arrayBuffer(),
      );
      this.editedTake = buffer;
      this.headTrimSeconds.set(0);
      this.takeTrim.set({ start: 0, end: 100 });
      this.takeEnvelope.set(this.computeEnvelope(buffer));
      this.takeStatus.set("Edits reset to the recorded take");
      this.snackbar.success("Edits reset to the recorded take");
    } catch (error) {
      this.logger.warn("VocalSuite: could not reset the take edits", error);
      this.snackbar.error("Could not restore the recorded take");
    } finally {
      this.isProcessingTake.set(false);
    }
  }

  /** Absolute peak per bucket — the Edit-step waveform for the loaded take. */
  private computeEnvelope(buffer: AudioBuffer, buckets = 160): number[] {
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / buckets));
    const envelope: number[] = [];
    for (let b = 0; b < buckets; b++) {
      let peak = 0;
      const start = b * step;
      const end = Math.min(start + step, data.length);
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
      envelope.push(peak);
    }
    return envelope;
  }

  /** Encode the working take as a real 16-bit WAV. */
  private encodeTake(buffer: AudioBuffer): Blob {
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    return WavEncoder.encodeMultiChannel(channels, "wav-16", buffer.sampleRate);
  }

  private startVisualization() {
    this.visualTaskCleanup?.();
    this.visualTaskCleanup = this.visualScheduler.register(
      () => {
        // Static take envelopes do not need a second redraw every frame. Live
        // spectrograph/waveform sampling is shared and throttled with the rest of
        // Studio instead of owning an unrestricted requestAnimationFrame loop.
        if (
          this.captureActive() ||
          this.micService.isInitialized() ||
          this.takeEnvelope().length > 0
        ) {
          this.drawSpectrograph();
          this.drawWaveform();
        }
      },
      { fps: 24, immediate: true },
    );
  }

  private drawSpectrograph() {
    const canvas = this.spectrographRef?.nativeElement;
    if (!canvas || !this.ctx2d || !this.micService.isInitialized()) return;

    const analyser = this.micService.getAnalyserNode();
    if (!analyser) return;

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    this.ctx2d.clearRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height;
      const gradient = this.ctx2d.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "#07060d");
      gradient.addColorStop(0.25, "#ff007f");
      gradient.addColorStop(0.55, "#8b5cf6");
      gradient.addColorStop(1, "#00e5ff");

      this.ctx2d.fillStyle = gradient;
      this.ctx2d.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  private drawWaveform() {
    const canvas = this.waveformRef?.nativeElement;
    if (!canvas || !this.waveformCtx) return;

    // Once a take is loaded (and the mic is idle) the Edit-step waveform shows
    // the actual take, refreshed after every normalize/trim.
    const envelope = this.takeEnvelope();
    if (!this.captureActive() && envelope.length > 0) {
      this.drawTakeEnvelope(canvas, envelope);
      return;
    }

    const analyser = this.micService.getAnalyserNode();
    if (this.captureActive() && analyser) {
      const dataArray = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0 - 1;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.waveformData.push(rms);
      if (this.waveformData.length > 500) this.waveformData.shift();
    }

    const width = canvas.width;
    const height = canvas.height;
    this.waveformCtx.clearRect(0, 0, width, height);

    this.waveformCtx.beginPath();
    this.waveformCtx.strokeStyle = "#a855f7";
    this.waveformCtx.lineWidth = 2;

    const step = width / 500;
    for (let i = 0; i < this.waveformData.length; i++) {
      const x = i * step;
      const barH = this.waveformData[i] * height * 2;
      this.waveformCtx.fillStyle = "#a855f7";
      this.waveformCtx.fillRect(
        x,
        (height - barH) / 2,
        step - 1,
        Math.max(2, barH),
      );
    }
    this.waveformCtx.stroke();
  }

  /** Envelope view of the loaded take for the Edit step. */
  private drawTakeEnvelope(
    canvas: HTMLCanvasElement,
    envelope: number[],
  ): void {
    const ctx = this.waveformCtx;
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const mid = height / 2;
    const step = width / Math.max(1, envelope.length);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#a855f7";
    for (let i = 0; i < envelope.length; i++) {
      const barH = Math.max(2, envelope[i] * mid * 1.8);
      ctx.fillRect(i * step, mid - barH / 2, Math.max(1, step - 1), barH);
    }

    ctx.strokeStyle = "rgba(168, 85, 247, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
  }

  async downloadRecording() {
    // Export what the artist edited, encoded as real WAV — not the raw webm
    // capture with a .wav filename.
    const buffer = await this.resolveTakeBuffer();
    const blob = buffer
      ? this.encodeTake(this.takeRegion(buffer))
      : this.takeBlob();
    if (!blob) return;

    this.showUplink.set(true);
    const success = await this.uplinkService.initiateUplink(
      this.profileService.profile(),
    );
    if (!success) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SMUVE_Vocal_${Date.now()}${buffer ? ".wav" : ".webm"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
