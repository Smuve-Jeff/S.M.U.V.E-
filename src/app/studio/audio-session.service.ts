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
import {
  RecordingStatusService,
  RecordDestination,
} from "./recording-status.service";
import { alignRecordingStart } from "./recording-start-alignment.util";
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
  /**
   * The live transport pass, snapshotted when REC was armed. The destination,
   * punch position and tempo are fixed at that moment so a take lands where
   * the artist actually played even if selection or tempo changes mid-pass.
   */
  private pendingTransportTake: {
    destinations: RecordDestination[];
    /** Fractional transport position when REC was armed (may be pre-roll). */
    punchStep: number;
    /** Audio-clock time of that punch position. */
    punchTime: number;
    tempo: number;
    startedAt: number;
    expectsAudio: boolean;
  } | null = null;

  readonly playbackState = signal<PlaybackState>("stopped");
  readonly isPlaying = computed(() => this.playbackState() === "playing");
  readonly isRecording = computed(() => this.playbackState() === "recording");
  readonly isStopped = computed(() => this.playbackState() === "stopped");

  /**
   * The exact tracks the transport records onto.
   *
   * Mixer strips arm tracks through RecordingStatusService, so arm state — not
   * whichever track happens to be selected — decides the take destination.
   * With nothing armed the selected track is used; with neither, there is no
   * destination and REC must not arm over silence.
   */
  readonly recordDestinations = computed<RecordDestination[]>(() => {
    const tracks = this.musicManager.tracks();
    const armed = this.recordingStatus.armedTrackIds();
    const armedTracks = tracks.filter((track) => armed.has(track.id));
    if (armedTracks.length > 0) {
      return armedTracks.map((track) => ({
        trackId: track.id,
        trackName: track.name,
      }));
    }
    const selectedId = this.musicManager.selectedTrackId();
    const selected = selectedId
      ? tracks.find((track) => track.id === selectedId)
      : null;
    return selected
      ? [{ trackId: selected.id, trackName: selected.name }]
      : [];
  });

  /** Compact readout of where the next/active pass lands. */
  readonly recordTargetLabel = computed(() => {
    const destinations = this.recordDestinations();
    if (destinations.length === 0) return "No record target — arm a track";
    const names = destinations.map((destination) => destination.trackName);
    return destinations.length === 1
      ? `Rec target: ${names[0]}`
      : `Rec targets: ${names.join(" + ")}`;
  });

  /** Second line for the target readout: the armed/selected reason + input. */
  readonly recordTargetDetail = computed(() => {
    const destinations = this.recordDestinations();
    if (destinations.length === 0) {
      return "Arm a track in the mixer, or select one in the arrangement";
    }
    const armed = this.recordingStatus.armedTrackIds();
    const reason = destinations.every((destination) =>
      armed.has(destination.trackId),
    )
      ? "Armed in the mixer"
      : "Selected track";
    return `${reason} · ${
      this.recordingEngine.isInitialized()
        ? "Microphone input"
        : "MIDI + audio input"
    }`;
  });

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
      // Await the flush, then drop the pass onto its destination track as a
      // real clip. The promise is kept on `takeSaveInFlight` so a caller can
      // wait for the take to be editable before saving/exporting.
      this.takeSaveInFlight = this.finalizeTransportTake();
      this.playbackState.set("stopped");
      this.recordingStatus.endRecording("transport");
      return;
    }

    // No destination means the pass would capture into nowhere while the
    // transport showed REC. Refuse the arm instead of pretending.
    const destinations = this.recordDestinations();
    if (destinations.length === 0) {
      this.snackbar.warning(
        "Arm a track in the mixer, or select one in the arrangement, before recording",
      );
      return;
    }

    this.recordToggleInFlight = true;
    try {
      await this.ensureCapture();
      this.engine.start();
      this.musicManager.startRecording();
      this.playbackState.set("recording");
      // Snapshot the destinations for the whole pass: arming a strip mid-pass
      // must not claim a take that started before it was armed. The fractional
      // position and its audio-clock time are the punch anchor: the worklet's
      // first captured block is aligned against this pair later.
      const punchTime = this.engine.ctx.currentTime;
      this.pendingTransportTake = {
        destinations,
        punchStep:
          this.engine.transportStepAt?.(punchTime) ??
          Math.max(0, Math.floor(this.engine.visualStep())),
        punchTime,
        tempo: this.engine.tempo(),
        startedAt: Date.now(),
        expectsAudio: this.recordingEngine.isInitialized(),
      };
      this.recordingStatus.setRecordDestinations(destinations);
      const primary = destinations[0];
      this.recordingStatus.beginRecording("transport", {
        type: "transport",
        trackId: primary.trackId,
        trackName: primary.trackName,
        destinations,
        inputLabel: this.recordingEngine.isInitialized()
          ? "Microphone input"
          : "MIDI only",
        captureMode: "input",
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
    if (this.recordingEngine.isRecording() || this.pendingTransportTake) {
      // Keep the promise: the take is not durable until the engine has flushed
      // the worklet, encoded the WAV, committed the IndexedDB write and the
      // clip has been placed on its destination track.
      this.takeSaveInFlight = this.finalizeTransportTake();
    }
    this.playbackState.set("stopped");
    this.recordingStatus.endRecording("transport");
  }

  /**
   * Stop the capture engine, decode the finished WAV and place it on the
   * primary record destination as an audio clip.
   *
   * A pass can be armed on several mixer tracks, but the Studio has one input
   * stream: duplicating the same performance onto every armed track would
   * double it. The audio clip therefore lands on the primary destination (the
   * first armed track, else the selected one), while punch-in MIDI takes still
   * stamp on every destination track.
   */
  private async finalizeTransportTake(): Promise<{
    trackId: string;
    trackName: string;
    clipId: string;
    startBar: number;
    lengthBars: number;
  } | null> {
    const pass = this.pendingTransportTake;
    this.pendingTransportTake = null;
    if (!pass) {
      // A capture owned by another Studio component can still be running when
      // the transport stops. Flush it so backgrounding never loses audio, but
      // do not pretend the transport has a take to place.
      if (this.recordingEngine.isRecording()) {
        try {
          await this.musicManager.stopRecording(
            this.recordDestinations()[0]?.trackId ||
              this.musicManager.selectedTrackId() ||
              "",
          );
        } catch (error) {
          this.logger.warn("AudioSession: the take could not be flushed.", error);
        }
      }
      return null;
    }

    const primary = pass.destinations[0];
    try {
      await this.musicManager.stopRecording(primary?.trackId || "");
    } catch (error) {
      this.logger.warn("AudioSession: the take could not be flushed.", error);
      return null;
    }
    if (!primary) return null;

    try {
      const blob = this.recordingEngine.recordedBlob();
      const frames = this.recordingEngine.getRecordedFrameCount();
      if (!blob || frames <= 0) {
        // A MIDI-only pass is expected when no input is available; the
        // transport already warned about that, so do not double-report.
        if (pass.expectsAudio) {
          this.snackbar.warning(
            "No audio reached the recorder — the pass left no clip",
          );
        }
        return null;
      }

      const buffer = await this.engine.ctx.decodeAudioData(
        await blob.arrayBuffer(),
      );
      // The worklet timestamps its first render quantum; align that to the
      // transport instead of assuming capture began on the punch step.
      const alignment = alignRecordingStart({
        punchStep: pass.punchStep,
        punchTime: pass.punchTime,
        captureStartTime:
          this.recordingEngine.getCaptureStartedAt?.() ?? null,
        tempo: pass.tempo,
        stepsPerBeat: this.engine.stepsPerBeat?.() ?? 4,
        // The interface latency is inside the captured signal; aligning it
        // without this would place every performance that late.
        inputLatencySeconds:
          this.recordingEngine.getInputLatencySeconds?.() ?? 0,
      });
      if (alignment.startLatencySeconds > 0) {
        this.logger.info(
          `AudioSession: take aligned for ${Math.round(
            alignment.startLatencySeconds * 1000,
          )} ms of capture start latency.`,
        );
      }
      const placement = this.musicManager.placeRecordedTake({
        trackId: primary.trackId,
        name: `Take ${new Date(pass.startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}`,
        buffer,
        startStep: alignment.startStep,
        trimSeconds: alignment.trimSeconds,
        tempo: pass.tempo,
      });
      if (!placement) return null;

      const bar = Math.floor(placement.startBar) + 1;
      this.snackbar.success(
        pass.destinations.length > 1
          ? `Take placed on ${placement.trackName} at bar ${bar} · takes stamped on ${pass.destinations.length} tracks`
          : `Take placed on ${placement.trackName} at bar ${bar}`,
      );
      return placement;
    } catch (error) {
      this.logger.warn(
        "AudioSession: the recorded take could not be placed.",
        error,
      );
      this.snackbar.error(
        "The take was recorded but could not be placed on its track",
      );
      return null;
    }
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
