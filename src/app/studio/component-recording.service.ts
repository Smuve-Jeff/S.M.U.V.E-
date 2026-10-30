import { Injectable, inject, signal, computed, OnDestroy } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { MusicManagerService } from "../services/music-manager.service";
import { MicrophoneService } from "../services/microphone.service";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";
import { RecordingStatusService } from "./recording-status.service";
import { LoggingService } from "../services/logging.service";
import { SnackbarService } from "../services/snackbar.service";

export type RecordableComponent =
  | "arrangement"
  | "drum-machine"
  | "sampler"
  | "vocal-suite"
  | "audio-recorder"
  | "performer"
  | "mixer";

/**
 * Where this component's audio actually comes from.
 *
 * `master` taps the post-master output bus, so an internal instrument or the
 * sequencer is captured as it sounds. `input` opens the microphone/line
 * input, which is the only meaningful path for a live vocal or instrument.
 */
export type ComponentCaptureBus = "master" | "input";

export interface ComponentRecordingConfig {
  componentId: RecordableComponent;
  label: string;
  icon: string;
  /** Whether this component can perform MIDI (not what is captured). */
  supportsMidi: boolean;
  /** Whether this component can use external audio input. */
  usesInput: boolean;
  /** The real bus the recorder samples for this component. */
  sourceBus: ComponentCaptureBus;
}

export interface ComponentRecordingTake {
  id: string;
  name: string;
  trackId: string;
  durationSec: number;
  componentLabel: string;
}

@Injectable({ providedIn: "root" })
export class ComponentRecordingService implements OnDestroy {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly microphone = inject(MicrophoneService);
  private readonly recordingEngine = inject(StudioRecordingEngineService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly logger = inject(LoggingService);
  private readonly snackbar = inject(SnackbarService);

  private readonly ownerId = "component-recording";

  /** The currently active component recording source */
  activeSource = signal<RecordableComponent | null>(null);

  /** Whether we are currently recording */
  isRecording = signal(false);

  /** Recording duration in seconds */
  recordingDuration = signal(0);

  /** The last take this panel committed to the arrangement. */
  lastTake = signal<ComponentRecordingTake | null>(null);

  private durationInterval: ReturnType<typeof setInterval> | null = null;

  readonly activeConfig = computed(() => {
    const id = this.activeSource();
    return id ? (this.getConfig(id) ?? null) : null;
  });

  /** Live input name, shared with the rest of the Studio's take paths. */
  readonly inputLabel = this.microphone.inputDeviceName;

  /** Where a finished component pass appears after the take is committed. */
  readonly destinationLabel = "New arrangement track";

  /**
   * The exact route the NEXT pass will use. Shown before REC so choosing a
   * source also tells the artist what will be captured and where it lands.
   */
  readonly captureSummary = computed(() => {
    const config = this.activeConfig();
    if (!config) return "Choose a component to capture";
    const source =
      config.sourceBus === "master" ? "Studio master output" : this.inputLabel();
    return `${source} → ${this.destinationLabel}`;
  });

  /** Available recordable components with their configs */
  readonly componentConfigs: ComponentRecordingConfig[] = [
    {
      componentId: "arrangement",
      label: "Arrangement",
      icon: "view_quilt",
      supportsMidi: true,
      usesInput: false,
      sourceBus: "master",
    },
    {
      componentId: "drum-machine",
      label: "Drum Machine",
      icon: "grid_view",
      supportsMidi: true,
      usesInput: false,
      sourceBus: "master",
    },
    {
      componentId: "sampler",
      label: "Sampler",
      icon: "library_music",
      supportsMidi: false,
      usesInput: true,
      sourceBus: "master",
    },
    {
      componentId: "vocal-suite",
      label: "Vocal Suite",
      icon: "mic",
      supportsMidi: false,
      usesInput: true,
      sourceBus: "input",
    },
    {
      componentId: "audio-recorder",
      label: "Audio Recorder",
      icon: "mic_external_on",
      supportsMidi: false,
      usesInput: true,
      sourceBus: "input",
    },
    {
      componentId: "performer",
      label: "Performer",
      icon: "interpreter_mode",
      supportsMidi: true,
      usesInput: true,
      sourceBus: "master",
    },
    {
      componentId: "mixer",
      label: "Mixer",
      icon: "tune",
      supportsMidi: false,
      usesInput: true,
      sourceBus: "master",
    },
  ];

  /** Get config for a specific component */
  getConfig(id: RecordableComponent): ComponentRecordingConfig | undefined {
    return this.componentConfigs.find((c) => c.componentId === id);
  }

  /** Set the active recording source component */
  setActiveSource(component: RecordableComponent) {
    // The recorder has already committed to one bus; switching mid-pass would
    // leave the UI naming a source that is not the one being captured.
    if (this.isRecording()) {
      this.snackbar.warning("Stop the current pass before changing source");
      return;
    }
    this.activeSource.set(component);
    this.snackbar.info(`Recording source: ${this.getConfig(component)?.label}`);
  }

  /** Start recording from the active source */
  async startRecording(): Promise<boolean> {
    if (this.isRecording()) return false;

    const source = this.activeSource();
    if (!source) {
      this.snackbar.warning("Select a recording source first");
      return false;
    }

    const config = this.getConfig(source);
    if (!config) return false;

    try {
      let captureStream: MediaStream | undefined;

      if (config.sourceBus === "master") {
        // Internal sources are captured from the post-master bus. This needs
        // no microphone permission, and it records the component as it sounds
        // instead of whatever the room microphone happens to hear.
        this.audioEngine.resume();
        const ready = await this.recordingEngine.prepareCaptureWorklet();
        if (!ready) {
          this.snackbar.error(`Could not start the ${config.label} recorder`);
          return false;
        }
        const master = this.audioEngine.getMasterStream?.();
        if (!master?.stream) {
          this.snackbar.error("Studio master output is not available");
          return false;
        }
        captureStream = master.stream;
      } else if (!this.recordingEngine.isInitialized()) {
        const ok = await this.recordingEngine.initialize();
        if (!ok) {
          this.snackbar.error("Could not access microphone");
          return false;
        }
      }

      this.recordingEngine.startRecording(captureStream);
      // Trust the engine rather than the request. A refused start (worklet not
      // loaded, suspended context, a capture already in flight in another view)
      // must never leave the transport claiming REC over silence.
      if (!this.recordingEngine.isRecording()) {
        this.logger.error(
          `Component recording refused to start for ${config.label}`,
        );
        this.snackbar.error(
          "Recording could not start — check the audio input",
        );
        return false;
      }

      this.isRecording.set(true);
      this.audioEngine.isRecording.set(true);
      this.recordingDuration.set(0);
      this.lastTake.set(null);
      this.clearDurationTimer();
      this.durationInterval = setInterval(() => {
        this.recordingDuration.update((d) => d + 1);
      }, 1000);

      this.recordingStatus.beginRecording(this.ownerId, {
        type: "component",
        componentId: source,
        componentLabel: config.label,
        targetLabel: this.destinationLabel,
        inputLabel:
          config.sourceBus === "master"
            ? "Studio master output"
            : this.inputLabel(),
        captureMode: config.sourceBus,
      });

      this.snackbar.info(
        config.sourceBus === "master"
          ? `Recording ${config.label} from the master bus`
          : `Recording ${config.label} from ${this.inputLabel()}`,
      );
      if (config.sourceBus === "master" && !this.audioEngine.isPlaying()) {
        this.snackbar.info("Press Play to capture the part");
      }
      return true;
    } catch (e) {
      this.logger.error("Component recording start failed", e);
      this.recordingStatus.endRecording(this.ownerId);
      this.snackbar.error("Recording failed to start");
      return false;
    }
  }

  /**
   * Stop recording and commit the pass to the arrangement.
   *
   * The engine already has a streaming WAV at this point. Decoding it into an
   * AudioBuffer and handing it to the MusicManager is what turns a component
   * pass into a clip the artist can edit, mix, and export instead of a blob
   * that only the recorder panel knows about.
   */
  async stopRecording(): Promise<ComponentRecordingTake | null> {
    if (!this.isRecording()) return null;

    const config = this.activeConfig();
    this.clearDurationTimer();

    let take: ComponentRecordingTake | null = null;
    try {
      await this.recordingEngine.stopRecording();

      const blob = this.recordingEngine.recordedBlob();
      const capturedFrames = this.recordingEngine.getRecordedFrameCount();
      if (!config || !blob || capturedFrames <= 0) {
        this.snackbar.warning("Component pass finished with no audio — not added");
        return null;
      }

      const buffer = await this.audioEngine.ctx.decodeAudioData(
        await blob.arrayBuffer(),
      );
      const stamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const name = `${config.label} ${stamp}`;
      const trackId = `audio_component_${Date.now()}`;
      this.musicManager.addAudioTrack({
        id: trackId,
        name,
        color: "#E11D48",
        buffer,
        offset: 0,
      });

      take = {
        id: trackId,
        name,
        trackId,
        durationSec: Math.round(buffer.duration * 10) / 10,
        componentLabel: config.label,
      };
      this.lastTake.set(take);
      this.snackbar.success(
        `${name} added to the arrangement — ready to edit and mix`,
      );
      return take;
    } catch (e) {
      this.logger.warn("Recording stop warning", e);
      this.snackbar.error("The component take could not be added");
      return null;
    } finally {
      this.isRecording.set(false);
      this.audioEngine.isRecording.set(false);
      this.recordingStatus.endRecording(this.ownerId);
    }
  }

  ngOnDestroy(): void {
    this.clearDurationTimer();
    this.recordingStatus.endRecording(this.ownerId);
  }

  private clearDurationTimer(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  /** Toggle recording on/off */
  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /** Format seconds to mm:ss */
  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
}
