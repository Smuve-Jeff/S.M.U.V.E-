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
import { Subscription } from "rxjs";

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

  @ViewChild("waveformCanvas")
  waveformCanvasRef!: ElementRef<HTMLCanvasElement>;

  recordings = signal<RecordingListEntry[]>([]);
  permissionsDenied = signal(false);
  isRequestingMic = signal(false);
  currentStream: MediaStream | null = null;
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

  isRecording = this.recorder.isRecording;
  recordingCount = computed(() => this.recordings().length);
  captureState = signal<
    "idle" | "requesting" | "recording" | "stopping" | "error"
  >("idle");
  captureError = signal<string | null>(null);
  inputDevices = signal<Array<{ deviceId: string; label: string }>>([]);
  selectedInputId = signal<string | null>(null);
  inputDeviceName = computed(
    () =>
      this.inputDevices().find(
        (device) => device.deviceId === this.selectedInputId(),
      )?.label || "Default microphone",
  );
  inputChannelLabel = computed(() => {
    const count = this.currentStream?.getAudioTracks()[0]?.getSettings?.().channelCount;
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
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private monitorGainNode: GainNode | null = null;
  private gateNode: GainNode | null = null;
  private captureDestination: MediaStreamAudioDestinationNode | null = null;

  toggleMonitoring(): void {
    this.haptic.light();
    this.monitoringEnabled.update((value) => !value);
    if (this.monitoringEnabled()) {
      if (!this.currentStream) {
        this.snackbar.info("Live monitoring will start when you arm the microphone");
      }
      this.ensureMonitorNodes();
    } else if (this.micSourceNode && this.monitorGainNode) {
      try {
        this.micSourceNode.disconnect(this.monitorGainNode);
        this.monitorGainNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.micSourceNode = null;
      this.monitorGainNode = null;
    }
    this.snackbar.info(
      this.monitoringEnabled()
        ? "Monitoring ON — hear yourself live"
        : "Monitoring OFF",
    );
  }

  private ensureMonitorNodes(): void {
    if (!this.currentStream || !this.audioContext) return;
    if (this.micSourceNode || this.monitorGainNode) return;
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume().catch((error) =>
        this.logger.warn("Could not resume audio for monitoring", error),
      );
    }
    try {
      this.micSourceNode = this.audioContext.createMediaStreamSource(
        this.currentStream,
      );
      this.monitorGainNode = this.audioContext.createGain();
      this.monitorGainNode.gain.value = 1;
      this.micSourceNode.connect(this.monitorGainNode);
      this.monitorGainNode.connect(this.audioContext.destination);
    } catch (error) {
      this.logger.warn("Could not enable monitoring", error);
      this.monitoringEnabled.set(false);
    }
  }

  toggleNoiseGate(): void {
    this.haptic.light();
    this.noiseGateEnabled.update((value) => !value);
    if (this.noiseGateEnabled() && !this.currentStream) {
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
    if (this.stopFallbackTimer) clearTimeout(this.stopFallbackTimer);
    this.stopFallbackTimer = null;
    this.clearElapsedTimer();
    this.clearRecordingElapsedTimer();
    this.stopLevelMeter();
    this.stopWaveform();
    this.closeAudioGraph();
    this.releaseInputStream();
    if (event.persisted === false) {
      this.snackbar.warning(`${entry.name} is in this session but could not be saved offline`);
    } else {
      this.snackbar.success(`${entry.name} captured — ready to keep or add`);
    }
  }

  private releaseInputStream(): void {
    this.currentStream?.getTracks().forEach((track) => track.stop());
    this.currentStream = null;
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
      if (this.selectedInputId() && !devices.some((device) => device.deviceId === this.selectedInputId())) {
        this.selectedInputId.set(null);
      }
    } catch (error) {
      this.logger.warn("Could not enumerate recorder inputs", error);
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
    this.currentStream?.getTracks().forEach((track) => track.stop());
    this.currentStream = null;
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
      if (!this.currentStream) {
        this.currentStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: this.selectedInputId() ? { exact: this.selectedInputId()! } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        void this.refreshInputDevices();
      }
      this.startLevelMeter(this.currentStream);
      const captureStream = this.captureDestination?.stream ?? this.currentStream;
      await this.recorder.startRecording(captureStream);
      this.startedAt = Date.now();
      this.captureState.set("recording");
      this.startElapsedTimer();
      this.startRecordingElapsedTimer();
      this.startWaveform();
      this.snackbar.success("Recording armed — capture live input");
    } catch (error: any) {
      this.releaseInputStream();
      this.stopLevelMeter();
      this.closeAudioGraph();
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
      this.logger.error("Mic permission denied or unavailable", error);
      this.snackbar.error(this.captureError() || "Could not access microphone");
    } finally {
      this.startingRecording = false;
      this.isRequestingMic.set(false);
      if (this.captureState() === "requesting") this.captureState.set("idle");
    }
  }

  private startLevelMeter(stream: MediaStream): void {
    try {
      const restoreMonitoring = this.monitoringEnabled();
      this.closeAudioGraph();
      this.monitoringEnabled.set(restoreMonitoring);
      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(stream);
      this.meterSourceNode = source;
      this.gateNode = this.audioContext.createGain();
      this.gateNode.gain.value = this.noiseGateEnabled() ? 0 : 1;
      this.captureDestination = this.audioContext.createMediaStreamDestination();
      if (this.audioContext.state === "suspended") void this.audioContext.resume();
      if (this.monitoringEnabled()) this.ensureMonitorNodes();
      source.connect(this.analyserNode);
      source.connect(this.gateNode);
      this.gateNode.connect(this.captureDestination);

      const dataArray = new Uint8Array(this.analyserNode.fftSize);
      this.levelTaskCleanup?.();
      this.levelTaskCleanup = this.visualScheduler.register(
        () => {
          if (!this.analyserNode) return;
          this.analyserNode.getByteTimeDomainData(dataArray);
          const db = this.measureInputLevel(dataArray);
          this.inputLevel.set(db);
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
    this.captureDestination = null;
    this.analyserNode = null;
    this.inputLevel.set(-60);
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
