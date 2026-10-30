import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AudioRecorderService, RecordingItem } from "../audio-recorder.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";
import { LoggingService } from "../../services/logging.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";
import { AudioEngineLatencyService } from "../../services/audio-engine-latency.service";
import { StudioVisualSchedulerService } from "../shared/studio-visual-scheduler.service";
import { SmartRecordingService } from "../smart-recording.service";
import { RecordingStatusService } from "../recording-status.service";
import { PermissionService } from "../../services/permission.service";
import { MicPermissionState, micPermissionNotice } from "./mic-permission";
import {
  readPreferredInputDeviceId,
  rememberPreferredInputDevice,
  resolveInputDeviceId,
} from "../input-device-prefs";
import { Subscription } from "rxjs";
import {
  TakeLevel,
  classifyTakeLevel,
  measureTakeSignal,
  normalizeTakeLevel,
  takeLevelNotice,
  takesMissingLevel,
} from "./take-level";
import {
  INPUT_TRIM_MAX_DB,
  INPUT_TRIM_MIN_DB,
  clampInputTrimDb,
  inputTrimGain,
  readInputTrimDbForDevice,
  rememberInputTrimDbForDevice,
} from "./input-trim";
import {
  MonitorOutputRisk,
  classifyMonitorOutputRisk,
} from "./monitor-safety";

interface RecordingListEntry {
  id: string;
  name: string;
  timestamp: number;
  durationSec: number;
  url: string;
  savedOffline?: boolean;
}

@Component({
  selector: "app-audio-recorder-view",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./audio-recorder-view.component.html",
  styleUrls: [
    "./audio-recorder-view.component.css",
    "../shared/platform-ux.css",
  ],
})
export class AudioRecorderViewComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  public recorder = inject(AudioRecorderService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);
  private dialog = inject(InteractionDialogService);
  private engineLatency = inject(AudioEngineLatencyService);
  private readonly visualScheduler = inject(StudioVisualSchedulerService);
  /** The app-wide permission store is the single source of truth for mic state. */
  private readonly permissions = inject(PermissionService);
  /** Registers this view's capture with the Studio-wide REC readout. */
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly captureStatusOwner = "audio-recorder";

  @ViewChild("waveformCanvas")
  waveformCanvasRef!: ElementRef<HTMLCanvasElement>;

  recordings = signal<RecordingListEntry[]>([]);
  permissionsDenied = signal(false);
  recheckingPermission = signal(false);
  /**
   * What the browser actually reports, not what the last failure implied. A
   * dismissed prompt and a hard block both raise `NotAllowedError`, and they
   * need opposite advice.
   */
  readonly micPermission = computed<MicPermissionState>(() => {
    const status = this.permissions
      .permissions()
      .find((entry) => entry.name === "microphone")?.status;
    switch (status) {
      case "granted":
      case "denied":
      case "prompt":
        return status;
      default:
        return "unknown";
    }
  });
  readonly micNotice = computed(() => micPermissionNotice(this.micPermission()));
  isRequestingMic = signal(false);
  /**
   * A signal, not a field: `inputChannelLabel()` is a `computed` over this
   * stream, and a computed that reads a plain property is evaluated once and
   * cached forever — which is why the channel readout said "N/A" while recording.
   */
  readonly currentStream = signal<MediaStream | null>(null);
  elapsedSec = signal(0);
  inputLevel = signal(-60);
  private elapsedTaskCleanup: (() => void) | null = null;
  private startedAt = 0;
  private levelTaskCleanup: (() => void) | null = null;
  private analyserNode: AnalyserNode | null = null;
  private meterSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioContext: AudioContext | null = null;
  private waveformTaskCleanup: (() => void) | null = null;
  private recordingFinishedSubscription: Subscription | null = null;
  private stopFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private loadRecordingsRequest = 0;
  private startingRecording = false;
  private recordingElapsedTimer: ReturnType<typeof setInterval> | null = null;
  private deletingRecordings = new Set<string>();
  private pendingRecordingSaves = new Map<string, RecordingItem>();
  private readonly deletedRecordingIds = new Set<string>();
  private savingRecordings = new Set<string>();
  private measuringTakes = new Set<string>();
  private disposed = false;

  isRecording = this.recorder.isRecording;
  recordingCount = computed(() => this.recordings().length);
  captureState = signal<
    "idle" | "requesting" | "recording" | "stopping" | "error"
  >("idle");
  captureError = signal<string | null>(null);
  inputDevices = signal<Array<{ deviceId: string; label: string }>>([]);
  /**
   * False until the first enumeration resolves. Without it "no microphone" is
   * the state for the first frame of every session — including the ones that
   * have a microphone.
   */
  inputDevicesKnown = signal(false);
  selectedInputId = signal<string | null>(null);
  /** Enumerated and genuinely none: not "not asked yet". */
  readonly noInputDevice = computed(
    () => this.inputDevicesKnown() && this.inputDevices().length === 0,
  );
  /**
   * A blocked microphone hides the devices too, so "no microphone detected" is
   * the wrong diagnosis while permission is refused — the permission banner owns
   * that case.
   */
  readonly showNoInputNotice = computed(
    () => this.noInputDevice() && !this.permissionsDenied(),
  );
  inputDeviceName = computed(
    () =>
      this.inputDevices().find(
        (device) => device.deviceId === this.selectedInputId(),
      )?.label || "Default microphone",
  );
  inputChannelLabel = computed(() => {
    const count = this.currentStream()?.getAudioTracks()[0]?.getSettings?.().channelCount;
    if (!count) return "CHANNELS N/A";
    return `${count} CH · ${count === 1 ? "MONO" : "STEREO"}`;
  });
  deviceSwitchLocked = computed(
    () =>
      ["requesting", "recording", "stopping"].includes(this.captureState()) ||
      this.isRecording(),
  );
  capturePathLabel = signal("Raw microphone input");
  latestRecording = computed(() => this.recordings()[0] ?? null);
  captureStatusLabel = computed(() => {
    // "Ready to record" is a promise the machine cannot keep with no input.
    if (this.showNoInputNotice() && this.captureState() === "idle") {
      return "No input device";
    }
    switch (this.captureState()) {
      case "requesting":
        return "Requesting microphone";
      case "recording":
        return "Recording raw input";
      case "stopping":
        return "Finalizing take";
      case "error":
        return "Capture error";
      default:
        return "Ready to record";
    }
  });

  monitoringEnabled = signal(false);
  noiseGateThreshold = signal(-50);
  noiseGateEnabled = signal(false);
  readonly trimMinDb = INPUT_TRIM_MIN_DB;
  readonly trimMaxDb = INPUT_TRIM_MAX_DB;
  /** Pre-capture gain; applied before the noise gate and capture destination. */
  readonly inputTrimDb = signal(0);
  readonly inputTrimLabel = computed(() => {
    const db = this.inputTrimDb();
    return `${db > 0 ? "+" : ""}${db} dB`;
  });
  /** Latches for 1.5 s after a raw or post-trim peak reaches full scale. */
  readonly inputClipping = signal(false);
  /** What the browser's output labels say about feedback risk. */
  readonly monitorRisk = signal<MonitorOutputRisk>("unknown");
  readonly monitorWarning = computed(() => {
    switch (this.monitorRisk()) {
      case "headphones":
        return "Headphones detected — monitoring is safe.";
      case "speakers":
        return "Speakers detected — use headphones; monitoring can feed back.";
      default:
        return "Use headphones — monitoring through speakers can feed back.";
    }
  });
  private clipHoldUntil = 0;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private trimGainNode: GainNode | null = null;
  private monitorGainNode: GainNode | null = null;
  private gateNode: GainNode | null = null;
  private captureDestination: MediaStreamAudioDestinationNode | null = null;

  toggleMonitoring(): void {
    this.haptic.light();
    this.monitoringEnabled.update((value) => !value);
    if (this.monitoringEnabled()) {
      if (!this.currentStream()) {
        this.snackbar.info("Live monitoring will start when you arm the microphone");
      }
      void this.refreshMonitorOutputs();
      this.ensureMonitorNodes();
    } else {
      this.disconnectMonitorNodes();
    }
    this.snackbar.info(
      this.monitoringEnabled()
        ? "Monitoring ON — hear yourself live"
        : "Monitoring OFF",
    );
  }

  /** One tap from the guard: mute immediately and keep the take running. */
  muteMonitoring(): void {
    if (!this.monitoringEnabled()) return;
    this.haptic.heavy();
    this.monitoringEnabled.set(false);
    this.disconnectMonitorNodes();
    this.snackbar.warning("Monitoring muted — feedback guard");
  }

  /** Read output labels when the browser exposes them; unknown is acceptable. */
  async refreshMonitorOutputs(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      this.monitorRisk.set("unknown");
      return;
    }
    try {
      const labels = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "audiooutput")
        .map((device) => device.label);
      this.monitorRisk.set(classifyMonitorOutputRisk(labels));
    } catch {
      this.monitorRisk.set("unknown");
    }
  }

  private disconnectMonitorNodes(): void {
    if (this.trimGainNode && this.monitorGainNode) {
      try {
        this.trimGainNode.disconnect(this.monitorGainNode);
        this.monitorGainNode.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.monitorGainNode = null;
  }

  private ensureMonitorNodes(): void {
    if (!this.trimGainNode || !this.audioContext) return;
    if (this.monitorGainNode) return;
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume().catch((error) =>
        this.logger.warn("Could not resume audio for monitoring", error),
      );
    }
    try {
      // Monitor the trimmed signal, so the artist hears the gain that will be
      // captured rather than a second, untrimmed copy of the microphone.
      this.monitorGainNode = this.audioContext.createGain();
      this.monitorGainNode.gain.value = 1;
      this.trimGainNode.connect(this.monitorGainNode);
      this.monitorGainNode.connect(this.audioContext.destination);
    } catch (error) {
      this.logger.warn("Could not enable monitoring", error);
      this.monitoringEnabled.set(false);
    }
  }

  toggleNoiseGate(): void {
    this.haptic.light();
    this.noiseGateEnabled.update((value) => !value);
    if (this.noiseGateEnabled() && !this.currentStream()) {
      this.snackbar.warning("Arm the microphone first to use the noise gate");
    }
    if (this.gateNode && this.audioContext) {
      try {
        this.gateNode.gain.setTargetAtTime(
          this.noiseGateEnabled() ? 0 : 1,
          this.audioContext.currentTime,
          0.01,
        );
      } catch {
        /* context closed */
      }
    }
    this.snackbar.info(
      this.noiseGateEnabled()
        ? `Noise gate ON (threshold: ${this.noiseGateThreshold()} dB)`
        : "Noise gate OFF",
    );
  }

  setNoiseGateThreshold(value: number): void {
    this.noiseGateThreshold.set(Math.max(-80, Math.min(-20, value)));
  }

  setInputTrim(value: number): void {
    const next = clampInputTrimDb(value);
    if (next === this.inputTrimDb()) return;
    this.inputTrimDb.set(next);
    rememberInputTrimDbForDevice(this.selectedInputId(), next);
    this.applyInputTrimGain();
  }

  resetInputTrim(): void {
    this.setInputTrim(0);
  }

  clearClip(): void {
    this.clipHoldUntil = 0;
    this.inputClipping.set(false);
  }

  /** Load the trim remembered for this input; 0 dB remains the fallback. */
  private restoreInputTrimForDevice(deviceId: string | null): void {
    const stored = readInputTrimDbForDevice(deviceId);
    if (stored === this.inputTrimDb()) return;
    this.inputTrimDb.set(stored);
    this.applyInputTrimGain();
  }

  private applyInputTrimGain(): void {
    if (!this.trimGainNode || !this.audioContext) return;
    try {
      this.trimGainNode.gain.setTargetAtTime(
        inputTrimGain(this.inputTrimDb()),
        this.audioContext.currentTime,
        0.015,
      );
    } catch {
      /* context closed mid-take */
    }
  }

  async exportToArrangement(rec: RecordingListEntry): Promise<void> {
    this.haptic.medium();
    try {
      if (!rec.url) {
        this.snackbar.error("Recording has no audio data to export");
        return;
      }
      const response = await fetch(rec.url);
      if (!response.ok) throw new Error(`Recording fetch failed: ${response.status}`);
      const audioBuffer = await this.audioEngine.ctx.decodeAudioData(
        await response.arrayBuffer(),
      );
      const compensatedBuffer = this.engineLatency.trimAudioBuffer(audioBuffer);
      const trackName = rec.name || `Take ${rec.id.slice(-4)}`;
      this.musicManager.addAudioTrack({
        id: "audio_" + Date.now(),
        name: trackName,
        color: "#E11D48",
        buffer: compensatedBuffer,
        offset: 0,
      });
      this.snackbar.success(`"${trackName}" added to arrangement`);
    } catch (error) {
      this.logger.error("Failed to export recording to arrangement", error);
      this.snackbar.error("Could not export — try re-recording");
    }
  }

  /**
   * Measured level per take. Absent means "not measured" (an older take, or a
   * decode that failed) — never an implied verdict.
   */
  readonly takeLevels = signal<Record<string, TakeLevel>>({});

  renamingId = signal<string | null>(null);
  renameValue = signal("");

  startRename(rec: RecordingListEntry): void {
    this.renamingId.set(rec.id);
    this.renameValue.set(rec.name);
  }

  confirmRename(): Promise<void> {
    return this.persistRename();
  }

  private async persistRename(): Promise<void> {
    const id = this.renamingId();
    const name = this.renameValue().trim();
    if (!id) return;
    if (!name) {
      this.snackbar.warning("Enter a name for this take");
      return;
    }
    const existing = this.recordings().find((recording) => recording.id === id);
    const previousName = existing?.name;
    this.recordings.update((list) =>
      list.map((recording) =>
        recording.id === id ? { ...recording, name } : recording,
      ),
    );
    try {
      if (existing?.savedOffline !== false) {
        await this.recorder.renameOfflineRecording(id, name);
      } else {
        const pending = this.pendingRecordingSaves.get(id);
        if (pending) this.pendingRecordingSaves.set(id, { ...pending, name });
      }
      this.renamingId.set(null);
      this.haptic.light();
    } catch (error) {
      this.recordings.update((list) =>
        list.map((recording) =>
          recording.id === id && previousName
            ? { ...recording, name: previousName }
            : recording,
        ),
      );
      this.logger.error("Could not rename saved recording", error);
      this.snackbar.error("Could not save take name — try again");
    }
  }

  cancelRename(): void {
    this.renamingId.set(null);
  }

  private audioEngine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  private smartRecording = inject(SmartRecordingService);

  ngOnInit(): void {
    void this.loadOfflineRecordings();
    this.recordingFinishedSubscription = (this.recorder as any).recordingFinished$?.subscribe(
      (event: any) => this.handleRecordingFinished(event),
    ) ?? null;
    void this.refreshInputDevices();
  }

  ngAfterViewInit(): void {
    // Canvas is ready — waveform starts with the next capture.
  }

  /**
   * Re-read offline takes when the tab/window regains focus. Camera/mic use,
   * a backgrounded PWA, or a second tab can all add takes while this view is
   * hidden; refreshing on focus surfaces them without a full reload. Skipped
   * mid-capture so a live take is never interrupted.
   */
  @HostListener("window:focus")
  @HostListener("document:visibilitychange")
  onAppFocus(): void {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    if (this.deviceSwitchLocked()) return;
    void this.loadOfflineRecordings();
  }

  ngOnDestroy(): void {
    // Stop any in-flight backfill from touching signals after teardown.
    this.disposed = true;
    this.clearElapsedTimer();
    this.clearRecordingElapsedTimer();
    this.stopLevelMeter();
    this.stopWaveform();
    this.recordingFinishedSubscription?.unsubscribe();
    this.recordingFinishedSubscription = null;
    for (const recording of this.recordings()) {
      if (recording.url) this.recorder.revokeRecordingUrl(recording.url);
    }
    if (this.stopFallbackTimer) clearTimeout(this.stopFallbackTimer);
    this.stopFallbackTimer = null;
    this.recorder.stopRecording();
    this.recordingStatus.endRecording(this.captureStatusOwner);
    this.closeAudioGraph();
    this.releaseInputStream();
  }

  levelToPct(db: number): number {
    if (!isFinite(db) || db <= -60) return 0;
    if (db >= 0) return 100;
    return Math.round(((db + 60) / 60) * 100);
  }

  takes = signal<
    { id: string; name: string; createdAt: number; isActive: boolean; durationSec: number }[]
  >([]);
  takeMuted = signal<Record<string, boolean>>({});

  promoteToTake(): void {
    this.haptic.heavy();
    const lastRecording = this.latestRecording();
    if (!lastRecording) {
      this.snackbar.error("Record something first to promote a take");
      return;
    }
    const takeNumber = this.takes().length + 1;
    this.takes.update((list) => [
      ...list.map((take) => ({ ...take, isActive: false })),
      {
        id: `take-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Take ${takeNumber}`,
        createdAt: Date.now(),
        isActive: true,
        durationSec: lastRecording.durationSec,
      },
    ]);
    this.snackbar.success(`Take ${takeNumber} promoted`);
  }

  latestTake(): (typeof this.takes extends () => infer T ? T : never)[number] | null {
    return this.takes()[0] ?? null;
  }

  selectTake(id: string): void {
    this.takes.update((list) =>
      list.map((take) => ({ ...take, isActive: take.id === id })),
    );
  }

  toggleTakeMute(id: string): void {
    this.takeMuted.update((muted) => ({ ...muted, [id]: !muted[id] }));
  }

  removeTake(id: string): void {
    this.takes.update((list) => list.filter((take) => take.id !== id));
    this.takeMuted.update((muted) => {
      const next = { ...muted };
      delete next[id];
      return next;
    });
  }

  async clearAllTakes(): Promise<void> {
    if (!this.takes().length) return;
    const confirmed = await this.dialog.confirm({
      title: "Clear all takes?",
      message: "This removes the take list from the current recording session.",
      confirmLabel: "Clear takes",
      cancelLabel: "Keep takes",
      tone: "danger",
    });
    if (!confirmed) return;
    this.takes.set([]);
    this.takeMuted.set({});
    this.snackbar.info("All takes cleared");
  }

  formatTakeAge(created: number): string {
    const ageMs = Date.now() - created;
    const seconds = Math.floor(ageMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  private handleRecordingFinished(event: {
    id: string;
    blob: Blob;
    url: string;
    name?: string;
    durationSec?: number;
    persisted?: boolean;
  }): void {
    if (this.deletedRecordingIds.has(event.id)) {
      this.recorder.revokeRecordingUrl(event.url);
      return;
    }
    if (this.recordings().some((recording) => recording.id === event.id)) return;
    const entry: RecordingListEntry = {
      id: event.id,
      name: event.name || `Take ${String(this.recordings().length + 1).padStart(2, "0")}`,
      timestamp: Date.now(),
      durationSec: Math.max(0, Math.round(event.durationSec ?? this.elapsedSec())),
      url: event.url,
      savedOffline: event.persisted !== false,
    };
    this.loadRecordingsRequest++;
    this.recordings.update((list) => [entry, ...list]);
    if (event.persisted === false) {
      this.pendingRecordingSaves.set(event.id, {
        id: event.id,
        blob: event.blob,
        name: entry.name,
        timestamp: entry.timestamp,
        settings: { durationSec: entry.durationSec },
      });
    }
    // The finished take joins the active comp group too, so it can be comped
    // in the Vocal Comp view instead of only existing in this take list.
    void this.smartRecording.addTakeFromRecording({
      blob: event.blob,
      label: entry.name,
      durationMs: entry.durationSec * 1000,
      trackName: "Audio Recorder",
      sectionLabel: "Recorder Takes",
    });

    this.captureState.set("idle");
    this.captureError.set(null);
    this.recordingStatus.endRecording(this.captureStatusOwner);
    if (this.stopFallbackTimer) clearTimeout(this.stopFallbackTimer);
    this.stopFallbackTimer = null;
    this.clearElapsedTimer();
    this.clearRecordingElapsedTimer();
    this.stopLevelMeter();
    this.stopWaveform();
    this.closeAudioGraph();
    this.releaseInputStream();
    // A take can finish cleanly and still hold nothing but noise floor.
    void this.auditTakeLevel(entry.id, event.blob);

    if (event.persisted === false) {
      this.snackbar.warning(`${entry.name} is in this session but could not be saved offline`);
    } else {
      this.snackbar.success(`${entry.name} captured — ready to keep or add`);
    }
  }

  /**
   * Decode the finished take and measure it. A muted interface, the wrong input
   * or a zero hardware gain all produce a perfect-looking take containing only
   * noise floor — the artist should hear that now, not after leaving the studio.
   * A failed measurement stays silent: no measurement is not a verdict.
   */
  private async auditTakeLevel(id: string, blob: Blob): Promise<void> {
    try {
      const measured = await this.measureBlob(blob);
      if (!measured) return;
      this.takeLevels.update((levels) => ({ ...levels, [id]: measured.level }));

      // Persist the verdict with the take. Without this the badge disappears on
      // reload, which is exactly when the artist is deciding what to keep.
      const entry = this.recordings().find((recording) => recording.id === id);
      if (entry && entry.savedOffline !== false) {
        void this.recorder.setRecordingLevel(id, measured.level, measured.peak);
      }

      const notice = takeLevelNotice(measured.level);
      if (notice.message) this.snackbar.warning(notice.message);
    } catch (error) {
      this.logger.warn("Could not measure the captured take level", error);
    }
  }

  /** Decode one blob and classify it; `null` when there is nothing to judge. */
  private async measureBlob(
    blob: Blob,
  ): Promise<{ level: TakeLevel; peak?: number } | null> {
    const decoded = await this.audioEngine.ctx.decodeAudioData(
      await blob.arrayBuffer(),
    );
    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (_, index) => decoded.getChannelData(index),
    );
    const signal = measureTakeSignal(channels);
    const level = classifyTakeLevel(signal);
    if (level === "unknown") return null;
    return { level, peak: signal?.peak };
  }

  /**
   * Measure takes that were stored before the level was persisted (or by a
   * version that only kept the blob), one at a time and without announcements —
   * a badge appearing on an old take is not news. Yields between takes and
   * stands down entirely while a capture is live; anything left over is picked
   * up on the next visit, since each measured level is persisted as it is found.
   */
  private async backfillTakeLevels(items: RecordingItem[]): Promise<void> {
    for (const item of takesMissingLevel(items)) {
      if (this.disposed || this.captureState() !== "idle") return;
      if (this.measuringTakes.has(item.id)) continue;
      if (!this.recordings().some((recording) => recording.id === item.id)) {
        continue;
      }
      this.measuringTakes.add(item.id);
      try {
        const measured = await this.measureBlob(item.blob);
        if (!measured) continue;
        // The take may have been deleted while this was decoding.
        if (!this.recordings().some((recording) => recording.id === item.id)) {
          continue;
        }
        this.takeLevels.update((levels) => ({
          ...levels,
          [item.id]: measured.level,
        }));
        await this.recorder.setRecordingLevel(
          item.id,
          measured.level,
          measured.peak,
        );
      } catch (error) {
        this.logger.warn("Could not measure a stored take", error);
      } finally {
        this.measuringTakes.delete(item.id);
      }
      // Never hold the transport up for a whole bank of old takes.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** Row badge for a measured take; empty for healthy or unmeasured takes. */
  takeLevelBadge(id: string): string {
    const level = this.takeLevels()[id];
    return level ? takeLevelNotice(level).badge : "";
  }

  /** Drop the measurement when the take itself is gone. */
  private forgetTakeLevel(id: string): void {
    this.takeLevels.update((levels) => {
      if (!(id in levels)) return levels;
      const next = { ...levels };
      delete next[id];
      return next;
    });
  }

  takeLevelLabel(id: string): string {
    const level = this.takeLevels()[id];
    return level === "silent" ? "Take is silent" : level === "low" ? "Take is very quiet" : "";
  }

  private releaseInputStream(): void {
    this.currentStream()?.getTracks().forEach((track) => track.stop());
    this.currentStream.set(null);
  }

  async saveRecordingOffline(id: string): Promise<void> {
    const item = this.pendingRecordingSaves.get(id);
    if (!item || this.savingRecordings.has(id)) return;
    this.savingRecordings.add(id);
    try {
      const pendingItem = {
        ...item,
        name: this.recordings().find((recording) => recording.id === id)?.name || item.name,
      };
      await this.recorder.saveOfflineRecording(pendingItem);
      if (this.deletedRecordingIds.has(id)) {
        await this.recorder.deleteOfflineRecording(id);
        this.pendingRecordingSaves.delete(id);
        this.recordings.update((list) => list.filter((recording) => recording.id !== id));
        this.forgetTakeLevel(id);
        return;
      }
      this.pendingRecordingSaves.delete(id);
      this.recordings.update((list) =>
        list.map((recording) => recording.id === id ? { ...recording, savedOffline: true } : recording),
      );
      this.snackbar.success("Take saved on this device");
    } catch (error) {
      this.logger.error("Could not save recording offline", error);
      this.snackbar.error("Could not save take — check device storage and retry");
    } finally {
      this.savingRecordings.delete(id);
    }
  }

  isRecordingSaving(id: string): boolean {
    return this.savingRecordings.has(id);
  }

  recordingFormatLabel(): string {
    const mimeType = this.recorder.mediaRecorder?.mimeType || "audio/webm;codecs=opus";
    const [container, ...parameters] = mimeType.split(";");
    const codec = parameters.find((part) => part.trim().startsWith("codecs="));
    return codec
      ? `${container.replace("audio/", "").toUpperCase()} / ${codec.split("=")[1].toUpperCase()}`
      : container.replace("audio/", "").toUpperCase();
  }

  private closeAudioGraph(): void {
    this.stopLevelMeter();
    try {
      this.micSourceNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.micSourceNode = null;
    try {
      this.trimGainNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.trimGainNode = null;
    try {
      this.monitorGainNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.monitorGainNode = null;
    this.monitoringEnabled.set(false);
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }

  async refreshInputDevices(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      this.inputDevices.set(devices);
      this.inputDevicesKnown.set(true);
      const availableIds = devices.map((device) => device.deviceId);
      if (this.selectedInputId() && !availableIds.includes(this.selectedInputId()!)) {
        this.selectedInputId.set(null);
      }
      // A remembered input applies only while it is connected. The stored id is
      // kept when the device is missing, so plugging the interface back in and
      // hitting refresh restores the choice instead of silently resetting it.
      if (!this.selectedInputId()) {
        const resolved = resolveInputDeviceId(
          readPreferredInputDeviceId(),
          availableIds,
        );
        if (resolved) this.selectedInputId.set(resolved);
      }
      // The device can be restored after the first render; follow it with its
      // own trim. Do not move the trim while a take is armed.
      if (!this.deviceSwitchLocked()) {
        this.restoreInputTrimForDevice(this.selectedInputId());
      }
    } catch (error) {
      this.logger.warn("Could not enumerate recorder inputs", error);
    }
    // Output labels become readable with microphone permission, so refresh the
    // feedback guidance after every device poll.
    void this.refreshMonitorOutputs();
  }

  private async refreshMicPermission(): Promise<void> {
    try {
      await this.permissions.refreshAllStatuses();
    } catch (error) {
      this.logger.warn("Could not read the microphone permission state", error);
    }
  }

  /**
   * "Check again" on the banner. After a hard block the only thing that can
   * change the answer is the artist clearing it in site settings, so this
   * re-reads the browser's state instead of firing another request that cannot
   * prompt.
   */
  async recheckMicPermission(): Promise<void> {
    if (this.recheckingPermission()) return;
    this.recheckingPermission.set(true);
    try {
      await this.refreshMicPermission();
      if (this.micPermission() === "granted") {
        this.permissionsDenied.set(false);
        this.captureError.set(null);
        if (this.captureState() === "error") this.captureState.set("idle");
        this.snackbar.success("Microphone is allowed now — tap REC");
      } else {
        this.snackbar.warning(
          "Still blocked — allow the microphone in your browser's site settings",
        );
      }
    } finally {
      this.recheckingPermission.set(false);
    }
  }

  async setInputDevice(deviceId: string): Promise<void> {
    if (this.deviceSwitchLocked()) {
      this.snackbar.warning("Wait for microphone capture to finish before switching input");
      return;
    }
    if (deviceId && !this.inputDevices().some((device) => device.deviceId === deviceId)) {
      this.snackbar.warning("That microphone is no longer available");
      return;
    }
    if (deviceId === this.selectedInputId()) return;
    this.loadRecordingsRequest++;
    this.selectedInputId.set(deviceId || null);
    this.persistInputDevice(deviceId || null);
    this.restoreInputTrimForDevice(deviceId || null);
    this.currentStream()?.getTracks().forEach((track) => track.stop());
    this.currentStream.set(null);
    this.closeAudioGraph();
    await this.refreshInputDevices();
  }

  keepLatestTake(): void {
    const take = this.latestRecording();
    if (take) this.snackbar.success(`${take.name} kept in the recording bank`);
  }

  retryLatestTake(): void {
    if (this.deviceSwitchLocked()) return;
    void this.toggleRecord();
  }

  async addLatestToArrangement(): Promise<void> {
    const take = this.latestRecording();
    if (take) await this.exportToArrangement(take);
  }

  async toggleRecord(): Promise<void> {
    if (this.startingRecording || this.captureState() === "requesting" || this.captureState() === "stopping") return;
    this.haptic.medium();
    if (this.isRecording() || this.captureState() === "recording") {
      this.captureState.set("stopping");
      this.recorder.stopRecording();
      this.clearElapsedTimer();
      this.stopWaveform();
      this.stopFallbackTimer = setTimeout(() => {
        if (this.captureState() !== "stopping") return;
        this.captureState.set("idle");
        this.clearRecordingElapsedTimer();
        this.closeAudioGraph();
        this.releaseInputStream();
      }, 10000);
      this.snackbar.info("Recording stopped");
      return;
    }
    await this.startRecording();
  }

  private async startRecording(): Promise<void> {
    if (this.startingRecording || this.captureState() === "stopping") return;
    this.startingRecording = true;
    this.isRequestingMic.set(true);
    this.captureState.set("requesting");
    this.captureError.set(null);
    this.permissionsDenied.set(false);
    try {
      if (!this.currentStream()) {
        this.currentStream.set(await this.openInputStream());
        void this.refreshInputDevices();
      }
      this.restoreInputTrimForDevice(this.selectedInputId());
      void this.refreshMonitorOutputs();
      this.startLevelMeter(this.currentStream()!);
      const captureStream =
        this.captureDestination?.stream ?? this.currentStream()!;
      await this.recorder.startRecording(captureStream);
      this.startedAt = Date.now();
      this.captureState.set("recording");
      this.recordingStatus.beginRecording(this.captureStatusOwner, {
        type: "audio-recorder",
        inputLabel: this.inputDeviceName(),
        capturePath: this.capturePathLabel(),
        takeNumber: this.recordings().length + 1,
      });
      this.startElapsedTimer();
      this.startRecordingElapsedTimer();
      this.startWaveform();
      this.snackbar.success("Recording armed — capture live input");
    } catch (error: any) {
      this.releaseInputStream();
      this.stopLevelMeter();
      this.closeAudioGraph();
      this.recordingStatus.endRecording(this.captureStatusOwner);
      this.captureState.set("error");
      this.captureError.set(
        error?.name === "NotAllowedError"
          ? "Microphone permission denied"
          : error?.name === "NotFoundError"
            ? "No microphone was found"
            : error?.name === "NotReadableError"
              ? "Microphone is busy in another app"
              : "Could not access microphone",
      );
      this.permissionsDenied.set(error?.name === "NotAllowedError" || error?.name === "SecurityError");
      // Re-read the browser's own verdict: it distinguishes "the prompt was
      // dismissed" (ask again) from "this site is blocked" (settings + reload).
      if (this.permissionsDenied()) void this.refreshMicPermission();
      this.logger.error("Mic permission denied or unavailable", error);
      this.snackbar.error(this.captureError() || "Could not access microphone");
    } finally {
      this.startingRecording = false;
      this.isRequestingMic.set(false);
      if (this.captureState() === "requesting") this.captureState.set("idle");
    }
  }

  /**
   * Open the selected input, degrading to the system default when the chosen
   * device has gone away since it was picked — unplugged, or claimed by another
   * app. `{ exact: <absent id> }` rejects with `OverconstrainedError`, which used
   * to be reported as "could not access microphone" while a perfectly good
   * microphone was connected and selected by nobody.
   */
  private async openInputStream(): Promise<MediaStream> {
    const constraints = (deviceId: string | null) => ({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const selected = this.selectedInputId();

    try {
      return await navigator.mediaDevices.getUserMedia(constraints(selected));
    } catch (error) {
      const name = (error as DOMException)?.name;
      const deviceGone =
        selected !== null &&
        (name === "OverconstrainedError" || name === "NotFoundError");
      if (!deviceGone) throw error;

      this.selectedInputId.set(null);
      this.persistInputDevice(null);
      this.snackbar.warning(
        "That microphone isn't connected — recording from the default input",
      );
      return await navigator.mediaDevices.getUserMedia(constraints(null));
    }
  }

  private persistInputDevice(deviceId: string | null): void {
    // Studio-wide, so the vocal chain and every take path inherit the pick.
    rememberPreferredInputDevice(deviceId);
  }

  private startLevelMeter(stream: MediaStream): void {
    try {
      const restoreMonitoring = this.monitoringEnabled();
      this.closeAudioGraph();
      this.monitoringEnabled.set(restoreMonitoring);
      // Input monitoring is heard in real time, so the meter graph asks for an
      // interactive buffer explicitly (see AuxAudioContextService).
      this.audioContext = new AudioContext({ latencyHint: 'interactive' });
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(stream);
      this.meterSourceNode = source;
      this.trimGainNode = this.audioContext.createGain();
      this.trimGainNode.gain.value = inputTrimGain(this.inputTrimDb());
      this.gateNode = this.audioContext.createGain();
      this.gateNode.gain.value = this.noiseGateEnabled() ? 0 : 1;
      this.captureDestination = this.audioContext.createMediaStreamDestination();
      source.connect(this.trimGainNode);
      this.trimGainNode.connect(this.analyserNode);
      this.trimGainNode.connect(this.gateNode);
      this.gateNode.connect(this.captureDestination);
      if (this.audioContext.state === "suspended") void this.audioContext.resume();
      if (this.monitoringEnabled()) this.ensureMonitorNodes();
      this.clearClip();

      const dataArray = new Uint8Array(this.analyserNode.fftSize);
      this.levelTaskCleanup?.();
      this.levelTaskCleanup = this.visualScheduler.register(
        () => {
          if (!this.analyserNode) return;
          this.analyserNode.getByteTimeDomainData(dataArray);
          const db = this.measureInputLevel(dataArray);
          this.inputLevel.set(db);
          const peakDb = this.measureInputPeak(dataArray);
          // The analyser is post-trim; subtracting trim exposes the raw
          // converter peak too, so a hot interface still warns after a cut.
          this.trackInputClipping(
            Math.max(peakDb, peakDb - this.inputTrimDb()),
          );
          this.applyNoiseGate(db);
        },
        { fps: 24 },
      );
    } catch (error) {
      this.logger.warn("Could not start level meter", error);
    }
  }

  private measureInputLevel(samples: Uint8Array): number {
    if (!samples.length) return -60;
    let sumSquares = 0;
    for (const sample of samples) {
      const amplitude = (sample - 128) / 128;
      sumSquares += amplitude * amplitude;
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    if (rms <= 0.001) return -60;
    return Math.max(-60, Math.min(0, Math.round(20 * Math.log10(rms) * 10) / 10));
  }

  private measureInputPeak(samples: Uint8Array): number {
    if (!samples.length) return -60;
    let peak = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs((sample - 128) / 128));
    }
    if (peak <= 0.0001) return -60;
    return Math.max(-60, Math.min(0, Math.round(20 * Math.log10(peak) * 10) / 10));
  }

  private trackInputClipping(peakDb: number): void {
    if (peakDb >= -0.1) this.clipHoldUntil = Date.now() + 1500;
    this.inputClipping.set(Date.now() < this.clipHoldUntil);
  }

  private applyNoiseGate(db: number): void {
    if (!this.gateNode || !this.audioContext) return;
    const open = !this.noiseGateEnabled() || db > this.noiseGateThreshold();
    try {
      this.gateNode.gain.setTargetAtTime(open ? 1 : 0, this.audioContext.currentTime, open ? 0.005 : 0.08);
    } catch {
      /* context closed mid-take */
    }
  }

  private stopLevelMeter(): void {
    this.levelTaskCleanup?.();
    this.levelTaskCleanup = null;
    try {
      this.meterSourceNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.meterSourceNode = null;
    try {
      this.gateNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.gateNode = null;
    try {
      this.trimGainNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.trimGainNode = null;
    try {
      this.monitorGainNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.monitorGainNode = null;
    this.captureDestination = null;
    this.analyserNode = null;
    this.inputLevel.set(-60);
    this.clearClip();
  }

  private startWaveform(): void {
    if (!this.waveformCanvasRef) return;
    const canvas = this.waveformCanvasRef.nativeElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const buffer: number[] = new Array(200).fill(0);
    this.waveformTaskCleanup?.();
    this.waveformTaskCleanup = this.visualScheduler.register(
      () => {
        if (this.captureState() !== "recording") return;
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
        const width = Math.max(1, Math.round((rect.width || canvas.width) * ratio));
        const height = Math.max(1, Math.round((rect.height || canvas.height) * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.fillStyle = "#06091a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        buffer.push(Math.max(0, Math.min(1, (this.inputLevel() + 60) / 60)));
        buffer.shift();
        ctx.beginPath();
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = Math.max(1, ratio);
        for (let index = 0; index < buffer.length; index++) {
          const x = (index / buffer.length) * canvas.width;
          const y = (1 - buffer[index]) * canvas.height;
          if (!index) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      },
      { fps: 30 },
    );
  }

  private stopWaveform(): void {
    this.waveformTaskCleanup?.();
    this.waveformTaskCleanup = null;
  }

  private startElapsedTimer(): void {
    this.elapsedSec.set(0);
    this.clearElapsedTimer();
    this.elapsedTaskCleanup = this.visualScheduler.register(
      () => this.elapsedSec.set(Math.floor((Date.now() - this.startedAt) / 1000)),
      { fps: 4 },
    );
  }

  private clearElapsedTimer(): void {
    this.elapsedTaskCleanup?.();
    this.elapsedTaskCleanup = null;
  }

  private startRecordingElapsedTimer(): void {
    this.clearRecordingElapsedTimer();
    this.recordingElapsedTimer = setInterval(() => {
      if (this.recorder.isRecording()) {
        this.elapsedSec.set(Math.floor((Date.now() - this.startedAt) / 1000));
      }
    }, 1000);
  }

  private clearRecordingElapsedTimer(): void {
    if (this.recordingElapsedTimer) clearInterval(this.recordingElapsedTimer);
    this.recordingElapsedTimer = null;
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  }

  formatRecordedAt(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  deletingRecordingIds = signal<ReadonlySet<string>>(new Set());

  async deleteRecording(id: string): Promise<void> {
    if (this.deletingRecordings.has(id)) return;
    this.haptic.medium();
    this.deletedRecordingIds.add(id);
    this.deletingRecordings.add(id);
    this.deletingRecordingIds.update((ids) => new Set(ids).add(id));
    this.loadRecordingsRequest++;
    const entry = this.recordings().find((recording) => recording.id === id);
    try {
      if (entry?.savedOffline !== false) await this.recorder.deleteOfflineRecording(id);
      this.pendingRecordingSaves.delete(id);
      this.recordings.update((list) => list.filter((recording) => recording.id !== id));
      this.forgetTakeLevel(id);
      if (entry?.url) this.recorder.revokeRecordingUrl(entry.url);
      this.snackbar.info("Recording removed from list");
    } catch (error) {
      this.deletedRecordingIds.delete(id);
      this.loadRecordingsRequest++;
      this.logger.error("Could not delete saved recording", error);
      this.snackbar.error("Could not delete recording — try again");
    } finally {
      this.deletingRecordings.delete(id);
      this.deletingRecordingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  private async loadOfflineRecordings(): Promise<void> {
    this.loadRecordingsRequest++;
    const requestId = this.loadRecordingsRequest;
    try {
      const items =
        ((await this.recorder.getOfflineRecordings()) as RecordingItem[]) || [];
      // A newer refresh (or a take that just landed) may have moved on while we
      // were reading storage — never clobber that fresher state with this one.
      if (requestId !== this.loadRecordingsRequest) return;

      // A take deleted mid-read must not be resurrected by the stored snapshot.
      const stored = items.filter(
        (item) => !this.deletedRecordingIds.has(item.id),
      );
      const storedIds = new Set(stored.map((item) => item.id));
      // Anything the service has now persisted no longer needs a manual save.
      for (const id of [...this.pendingRecordingSaves.keys()]) {
        if (storedIds.has(id)) this.pendingRecordingSaves.delete(id);
      }

      const previousUrls = new Map(
        this.recordings().map((recording) => [recording.id, recording.url]),
      );
      const built: RecordingListEntry[] = stored.map((item) => ({
        id: item.id,
        name: item.name || "Recording",
        timestamp: item.timestamp || Date.now(),
        durationSec: Number(item.settings?.durationSec ?? 0) || 0,
        url: previousUrls.get(item.id) || this.createRecordingUrl(item.blob),
        savedOffline: true,
      }));
      // Takes that only live in this session (offline persistence failed) must
      // survive a refresh so the user can still save, rename or export them.
      for (const entry of this.recordings()) {
        if (storedIds.has(entry.id)) continue;
        if (!this.pendingRecordingSaves.has(entry.id)) continue;
        built.push(entry);
      }

      const builtIds = new Set(built.map((recording) => recording.id));
      for (const [id, url] of previousUrls) {
        if (!builtIds.has(id) && url) this.recorder.revokeRecordingUrl(url);
      }
      built.sort((a, b) => b.timestamp - a.timestamp);
      this.recordings.set(built);

      // Reattach the levels measured when the takes were recorded. Re-decoding
      // every stored blob on every load would cost more than the badge is worth,
      // and a take with no stored level stays unjudged rather than guessed.
      const surviving = new Set(built.map((recording) => recording.id));
      const restored: Record<string, TakeLevel> = {};
      for (const item of stored) {
        const level = normalizeTakeLevel(item.settings?.level);
        if (level) restored[item.id] = level;
      }
      this.takeLevels.update((levels) => {
        const next: Record<string, TakeLevel> = { ...restored };
        for (const [id, level] of Object.entries(levels)) {
          // A live measurement always wins, and a level for a take that no
          // longer exists must not resurrect a row's badge.
          if (surviving.has(id)) next[id] = level;
        }
        return next;
      });

      // Takes stored before the level was persisted still deserve a verdict.
      void this.backfillTakeLevels(stored);
    } catch (error) {
      this.logger.warn("No offline recordings available", error);
    }
  }

  /** Mint a blob URL only when the recorder can own it for later revoking. */
  private createRecordingUrl(blob?: Blob): string {
    if (!blob || typeof this.recorder.createRecordingUrl !== "function") {
      return "";
    }
    return this.recorder.createRecordingUrl(blob);
  }
}
