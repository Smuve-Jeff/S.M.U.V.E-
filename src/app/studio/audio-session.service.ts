import { LoggingService } from "../services/logging.service";
import {
  Injectable,
  signal,
  computed,
  effect,
  inject,
  DestroyRef,
} from "@angular/core";
import { InstrumentService } from "./instrument.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { PlaybackState } from "./playback-state";
import { MusicManagerService } from "../services/music-manager.service";
import { MicrophoneService } from "../services/microphone.service";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";
import { RecordingStatusService } from "./recording-status.service";
import { ScreenWakeLockService } from "../services/screen-wake-lock.service";
import { SnackbarService } from "../services/snackbar.service";

export interface MicChannel {
  id: string;
  label: string;
  level: number;
  muted: boolean;
  pan: number;
  armed: boolean;
  deviceId?: string;
}

@Injectable({
  providedIn: "root",
})
export class AudioSessionService {
  private logger = inject(LoggingService);
  private readonly instrumentService = inject(InstrumentService);
  public readonly engine = inject(AudioEngineService);
  private readonly micService = inject(MicrophoneService);
  private readonly recordingEngine = inject(StudioRecordingEngineService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly wakeLock = inject(ScreenWakeLockService);
  private readonly snackbar = inject(SnackbarService);

  /** Shared in-flight input open, so two gestures never open the same device
   *  twice — `StudioRecordingEngineService.initialize()` tears down the
   *  previous graph, which would break the other caller's stream. */
  private inputInitInFlight: Promise<void> | null = null;
  /** Guards a double press while the record pass is being armed. */
  private recordToggleInFlight = false;
  /** The "no input" warning is a session-level thing, not a per-pass one. */
  private captureWarningShown = false;

  /**
   * Set when the app going to the background (hidden / freeze / pagehide)
   * finalized a live session, with the moment it happened. The Studio can tell
   * the artist their take was saved and why the transport stopped.
   */
  readonly lastBackgroundStopAt = signal<number | null>(null);
  /**
   * The in-flight take save. Background stops cannot await inside an event
   * handler, so the promise is kept here instead of being dropped: a caller
   * that needs to know the audio is durable (a test, a future native handoff)
   * can await it.
   */
  private takeSaveInFlight: Promise<unknown> | null = null;

  readonly playbackState = signal<PlaybackState>("stopped");
  readonly isPlaying = computed(() => this.playbackState() === "playing");
  readonly isRecording = computed(() => this.playbackState() === "recording");
  readonly isStopped = computed(() => this.playbackState() === "stopped");

  masterVolume = signal(80);
  micChannels = signal<MicChannel[]>([
    {
      id: "mic-1",
      label: "Lead Vocals",
      level: 70,
      muted: false,
      pan: 0,
      armed: true,
    },
    {
      id: "guitar-1",
      label: "Secondary In",
      level: 60,
      muted: false,
      pan: 20,
      armed: false,
    },
  ]);

  availableDevices = this.micService.availableDevices;

  constructor() {
    // AudioEngineService already owns the instrument/master bus routing.
    // Connecting the master gain directly to destination here would bypass
    // the compressor, limiter, metering, and worklet chain.
    //
    // The pre-armed "Lead Vocals" channel is NOT initialized here. Calling
    // getUserMedia() from a constructor fires before any user gesture — which
    // browsers reject or which hard-fails with NotFoundError on machines with
    // no microphone (headless CI, desktops without a mic, some Android TV).
    // That used to surface as "StudioRecordingEngine: Initialization failed:
    // Requested device not found" on every Studio boot. Arm on the first
    // real interaction instead (armOnFirstUserGesture), mirroring how the
    // AudioContext itself is armed.
    this.armOnFirstUserGesture();

    // Keep the display awake for the whole of a playing/recording session.
    // Android's screen timeout fires `visibilitychange`, which the listener
    // below answers by stopping the transport — so without a wake lock a
    // phone-propped recording dies mid-take. Released the moment the
    // transport stops so idle sessions let the screen sleep normally.
    effect(() => {
      if (this.isPlaying() || this.isRecording()) {
        this.wakeLock.request();
      } else {
        this.wakeLock.release();
      }
    });

    // Mobile audio hygiene: stop playback when the app/tab is backgrounded so
    // the engine doesn't keep consuming battery or resume mid-bar unannounced.
    if (typeof document !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
      // `freeze` (Page Lifecycle API, Chromium/Android WebView) fires just
      // before the page is suspended — the last moment a worklet flush can
      // still complete and the WAV can reach IndexedDB.
      document.addEventListener("freeze", this.handleFreeze);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener(
          "visibilitychange",
          this.handleVisibilityChange,
        );
        document.removeEventListener("freeze", this.handleFreeze);
      });
    }

    // `pagehide` covers the discard/close/swipe-away cases where
    // `visibilitychange` never fires. Without it a live take is destroyed with
    // the process and the artist never learns it happened.
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.handlePageHide);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener("pagehide", this.handlePageHide);
      });
    }
  }

  private handleVisibilityChange = (): void => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      this.finalizeForBackground("app hidden");
    }
  };

  private handlePageHide = (): void => this.finalizeForBackground("page discarded");

  private handleFreeze = (): void => this.finalizeForBackground("app frozen");

  /**
   * Is there audio work worth protecting? A transport that is playing or
   * recording, or a capture graph that is still running (which can outlive the
   * transport when a pass was started outside the transport record button).
   */
  hasLiveSession(): boolean {
    return (
      this.isPlaying() ||
      this.isRecording() ||
      this.recordingEngine.isRecording()
    );
  }

  /**
   * Stop cleanly the moment the OS is about to take the page away, so the
   * captured audio is encoded and persisted while the process is still alive.
   * Web Audio capture cannot continue once the WebView is frozen (that needs a
   * native microphone foreground service) — this makes the take survive instead
   * of vanishing with the process.
   */
  private finalizeForBackground(reason: string): void {
    if (!this.hasLiveSession()) return;
    this.lastBackgroundStopAt.set(Date.now());
    this.logger.info(`AudioSession: finalizing the session (${reason}).`);
    this.stop();
  }

  async initializeMic(channelId: string, deviceId?: string): Promise<void> {
    const channel = this.micChannels().find((ch) => ch.id === channelId);
    if (channel) {
      await this.recordingEngine.initialize(deviceId || channel.deviceId);
      if (deviceId) {
        this.updateChannelDevice(channelId, deviceId);
      }
    }
  }

  /**
   * Open the audio input once, sharing the in-flight attempt with whoever else
   * asked for it (the gesture arm and the record button can race).
   */
  private openInput(channelId: string): Promise<void> {
    if (!this.inputInitInFlight) {
      this.inputInitInFlight = this.initializeMic(channelId).finally(() => {
        this.inputInitInFlight = null;
      });
    }
    return this.inputInitInFlight;
  }

  /**
   * Best-effort priming of the capture graph before a record pass. Never
   * throws: a machine without a usable input still records MIDI.
   */
  private async ensureCapture(): Promise<void> {
    if (this.recordingEngine.isInitialized()) return;
    const channel =
      this.micChannels().find((ch) => ch.armed) || this.micChannels()[0];
    if (!channel) return;
    try {
      await this.openInput(channel.id);
    } catch (error) {
      this.logger.warn(
        "AudioSession: audio input unavailable; the pass records MIDI only.",
        error,
      );
    }
  }

  togglePlay(): void {
    if (this.engine.isPlaying()) {
      this.engine.stop();
      this.playbackState.set("stopped");
    } else {
      this.engine.start();
      this.playbackState.set("playing");
    }
  }

  /**
   * Toggle the transport record pass.
   *
   * Capture is primed *before* REC is armed. The studio engine refuses to start
   * until its input graph exists, and the very first user gesture can be this
   * button — the gesture-armed init is still awaiting getUserMedia at that
   * point, so the transport used to show REC over a dead input and the pass
   * captured nothing. An input that cannot be opened is a warning, not a
   * blocker: the pass still records MIDI onto the armed track.
   */
  async toggleRecord(): Promise<void> {
    if (this.recordToggleInFlight) return;

    if (this.isRecording()) {
      this.engine.stop();
      void this.musicManager.stopRecording(
        this.musicManager.selectedTrackId() || "",
      );
      this.playbackState.set("stopped");
      this.recordingStatus.clearRecordingSource();
      return;
    }

    this.recordToggleInFlight = true;
    try {
      await this.ensureCapture();
      this.engine.start();
      this.musicManager.startRecording();
      this.playbackState.set("recording");
      const trackId = this.musicManager.selectedTrackId();
      const track = trackId
        ? this.musicManager.tracks().find((t) => t.id === trackId)
        : null;
      this.recordingStatus.setRecordingSource({
        type: "transport",
        trackId: trackId || undefined,
        trackName: track?.name,
      });
      if (!this.recordingEngine.isRecording() && !this.captureWarningShown) {
        this.captureWarningShown = true;
        this.snackbar.warning("Audio input unavailable — recording MIDI only");
      }
    } finally {
      this.recordToggleInFlight = false;
    }
  }

  stop(): void {
    this.engine.stop();
    if (this.recordingEngine.isRecording()) {
      // Keep the promise: the take is not durable until the engine has flushed
      // the worklet, encoded the WAV and committed the IndexedDB write.
      this.takeSaveInFlight = Promise.resolve(
        this.musicManager.stopRecording(
          this.musicManager.selectedTrackId() || "",
        ),
      ).catch((error) => {
        this.logger.warn("AudioSession: the take could not be saved.", error);
        return null;
      });
    }
    this.playbackState.set("stopped");
    this.recordingStatus.clearRecordingSource();
  }

  /**
   * Resolves once the take finalized by the last stop has been encoded and
   * persisted. Returns immediately when there is no take in flight.
   */
  whenTakeSaved(): Promise<unknown> {
    return this.takeSaveInFlight ?? Promise.resolve(null);
  }

  updateMasterVolume(newVolume: number): void {
    this.masterVolume.set(newVolume);
    this.engine.setMasterOutputLevel(newVolume / 100);
  }

  updateChannelLevel(id: string, newLevel: number): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, level: newLevel } : ch)),
    );
  }

  toggleChannelMute(id: string): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, muted: !ch.muted } : ch)),
    );
  }

  updateChannelPan(id: string, newPan: number): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, pan: newPan } : ch)),
    );
  }

  toggleChannelArm(id: string): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, armed: !ch.armed } : ch)),
    );
    const channel = this.micChannels().find((ch) => ch.id === id);
    if (channel?.armed && !this.recordingEngine.isInitialized()) {
      this.initializeMic(id);
    }
  }

  updateChannelDevice(id: string, deviceId: string): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, deviceId } : ch)),
    );
  }

  /**
   * Initialize the pre-armed mic channel on the first genuine user gesture.
   * Browsers only expose real capture devices after a gesture, and devices
   * without any microphone must degrade to "channel armed but idle" instead
   * of spraying a boot-time NotFoundError.
   */
  private armOnFirstUserGesture(): void {
    if (typeof document === 'undefined' || !document.body) return;
    const events = ['click', 'touchstart', 'keydown'] as const;
    let armed = false;
    const arm = async () => {
      if (armed) return;
      const channel = this.micChannels().find((ch) => ch.armed);
      if (!channel || this.recordingEngine.isInitialized()) {
        cleanup();
        return;
      }
      // One gesture is enough; the listener is removed either way.
      cleanup();
      armed = true;
      try {
        await this.openInput(channel.id);
      } catch (error) {
        // No mic / denied permission: the channel stays armed-but-idle and
        // the Vocal Suite can retry with an explicit device pick.
        this.logger.warn(
          'AudioSession: pre-armed microphone unavailable; channel stays idle.',
          error,
        );
      }
    };
    const cleanup = () =>
      events.forEach((event) =>
        document.body.removeEventListener(event, arm, { capture: true }),
      );
    this.destroyRef.onDestroy(cleanup);
    events.forEach((event) =>
      document.body.addEventListener(event, arm, { capture: true }),
    );
  }

  onNoteClicked(note: { midi: number; velocity: number }): void {
    this.logger.info("AudioSession: Note clicked:", note);
    this.instrumentService.play("0", note.midi ?? 60, note.velocity ?? 0.8);
  }
}
