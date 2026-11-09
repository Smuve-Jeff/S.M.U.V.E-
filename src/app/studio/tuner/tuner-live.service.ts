import { Injectable, computed, inject, signal } from "@angular/core";
import { LoggingService } from "../../services/logging.service";
import { detectPitch } from "../audio-to-midi.util";
import { preferredConnectedInputDeviceId } from "../input-device-prefs";
import {
  DEFAULT_TUNER_TOLERANCE_CENTS,
  centsToNeedle,
  frequencyToNote,
  type TunerReading,
} from "./tuner-pitch.util";

/**
 * Honest on-device verification of the live microphone path.
 *
 * This never opens the microphone: it checks whether the browser supports
 * capture, which audio inputs the device currently exposes, what the
 * permission state is, and whether the shared tuner stream is live. A
 * Director step and a user on their own device can therefore distinguish
 * "no microphone", "blocked permission" and "listening but silent" without
 * pretending a pitch was measured.
 */
export interface LiveInputVerification {
  /** `navigator.mediaDevices.getUserMedia` is available in this browser. */
  supported: boolean;
  /** Number of `audioinput` devices, or -1 when enumeration is unavailable. */
  audioInputCount: number;
  /** Non-empty device labels (empty until permission is granted). */
  audioInputLabels: string[];
  /** `navigator.permissions` microphone state, or null when unsupported. */
  permissionState: string | null;
  /** Whether the shared tuner input is currently open. */
  listening: boolean;
  /** Current stream track state: idle, live, muted or ended. */
  trackState: "idle" | "live" | "muted" | "ended";
  deviceLabel: string;
  level: number;
  reading: TunerReading | null;
  error: string | null;
}

/** Analysis cadence: 20 readings a second is faster than a needle needs. */
const FRAME_MS = 50;
/** Frames of silence before the note is cleared (~0.6 s). */
const MISS_LIMIT = 12;
/** Same-note needle easing, so one bad frame cannot make it jump. */
const SMOOTHING = 0.4;

/**
 * Shared live tuner input.
 *
 * The Tuner surface owns the needle UI, but the Director needs to open the
 * same microphone input without pretending to press the surface's button. It
 * reads the same input every capture path records from, and turns it into the
 * two things a player needs before a take: which note that is, and how far off
 * it is in cents. Pitch detection is the app's existing monophonic
 * autocorrelation (`detectPitch`), not a second implementation — the tuner and
 * audio-to-MIDI should agree about what an A is.
 */
@Injectable({ providedIn: "root" })
export class TunerLiveService {
  private readonly logger = inject(LoggingService);

  readonly listening = signal(false);
  /** True while the browser is opening the input (permission prompt or device). */
  readonly starting = signal(false);
  readonly reading = signal<TunerReading | null>(null);
  /** Input level 0–1, so a silent instrument is distinguishable from a dead mic. */
  readonly level = signal(0);
  readonly error = signal<string | null>(null);
  readonly deviceLabel = signal("System input");
  readonly needle = computed(() => {
    const current = this.reading();
    return current ? centsToNeedle(current.cents) : 50;
  });

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private misses = 0;
  private lastReading: TunerReading | null = null;

  get isRunning(): boolean {
    return this.listening();
  }

  /** Start or stop; returns the start promise so a caller can await the input. */
  toggle(): Promise<void> | void {
    if (this.listening()) {
      this.stop();
      return;
    }
    return this.start();
  }

  /**
   * Verify the live microphone on this device without opening it.
   *
   * Enumeration is the only browser call here, so this never prompts for
   * permission. When the tuner stream is already open, the reported track
   * state, level and needle reading come from that live stream.
   */
  async verifyDevice(): Promise<LiveInputVerification> {
    const media =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const supported = typeof media?.getUserMedia === "function";

    let audioInputCount = -1;
    let audioInputLabels: string[] = [];
    let enumerationError: string | null = null;
    if (typeof media?.enumerateDevices === "function") {
      try {
        const devices = await media.enumerateDevices();
        const inputs = devices.filter((device) => device.kind === "audioinput");
        audioInputCount = inputs.length;
        audioInputLabels = inputs
          .map((device) => device.label?.trim() ?? "")
          .filter((label) => label.length > 0);
      } catch (error) {
        enumerationError = this.describeError(error);
      }
    } else {
      enumerationError =
        "This browser cannot enumerate input devices, so the input count is unknown.";
    }

    let permissionState: string | null = null;
    try {
      const permissions =
        typeof navigator !== "undefined" ? navigator.permissions : undefined;
      if (typeof permissions?.query === "function") {
        const result = await permissions.query({
          name: "microphone" as PermissionName,
        });
        permissionState = result.state;
      }
    } catch {
      permissionState = null;
    }

    const track = this.stream?.getAudioTracks?.()[0];
    const trackState: LiveInputVerification["trackState"] = !track
      ? "idle"
      : track.readyState === "ended"
        ? "ended"
        : track.muted
          ? "muted"
          : "live";

    return {
      supported,
      audioInputCount,
      audioInputLabels,
      permissionState,
      listening: this.listening(),
      trackState,
      deviceLabel: this.deviceLabel(),
      level: this.level(),
      reading: this.reading(),
      error: enumerationError,
    };
  }

  async start(): Promise<void> {
    if (this.listening() || this.starting()) return;
    this.error.set(null);

    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      this.error.set("This browser does not expose microphone capture.");
      return;
    }

    this.starting.set(true);
    try {
      const stream = await this.openInput(media);
      this.stream = stream;
      const firstTrack = stream.getAudioTracks?.()[0];
      this.deviceLabel.set(firstTrack?.label?.trim() || "System input");
      // If the OS or browser ends the track (device unplugged, another app
      // takes the input), stop the needle loop instead of reading a dead
      // stream forever.
      if (typeof firstTrack?.addEventListener === "function") {
        firstTrack.addEventListener("ended", () => {
          this.error.set(
            "The input ended — the device was unplugged or taken by another app. Start the tuner again when the input is back.",
          );
          this.stop();
        });
      }

      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      // A tuner wants the raw instrument, not a denoised, level-managed copy.
      this.source = this.ctx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      if (this.ctx.state === "suspended") void this.ctx.resume();

      this.buffer = new Float32Array(this.analyser.fftSize);
      this.misses = 0;
      this.listening.set(true);
      this.timer = setInterval(() => this.sample(), FRAME_MS);
    } catch (error) {
      this.error.set(this.describeError(error));
      this.logger.error("Tuner could not open the input", error);
      this.release();
    } finally {
      this.starting.set(false);
    }
  }

  stop(): void {
    this.listening.set(false);
    this.release();
  }

  /**
   * The remembered interface, with a fallback: an `{ exact }` constraint on a
   * device that was unplugged between enumeration and open rejects with
   * `OverconstrainedError`, which would read as "no microphone".
   */
  private async openInput(media: MediaDevices): Promise<MediaStream> {
    const deviceId = await preferredConnectedInputDeviceId();
    const constraints = (id: string | null): MediaStreamConstraints => ({
      audio: {
        deviceId: id ? { exact: id } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    try {
      return await media.getUserMedia(constraints(deviceId));
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (
        !deviceId ||
        (name !== "OverconstrainedError" && name !== "NotFoundError")
      ) {
        throw error;
      }
      return await media.getUserMedia(constraints(null));
    }
  }

  private sample(): void {
    const analyser = this.analyser;
    const buffer = this.buffer;
    const ctx = this.ctx;
    if (!analyser || !buffer || !ctx) return;

    analyser.getFloatTimeDomainData(buffer);

    let energy = 0;
    for (let index = 0; index < buffer.length; index++) {
      energy += buffer[index] * buffer[index];
    }
    const rms = Math.sqrt(energy / buffer.length);
    this.level.set(Math.min(1, rms * 6));

    const frequency = detectPitch(buffer, ctx.sampleRate, {
      clarityThreshold: 0.6,
      silenceThreshold: 0.004,
    });

    if (frequency === null) {
      this.misses++;
      if (this.misses >= MISS_LIMIT) {
        this.lastReading = null;
        this.reading.set(null);
      }
      return;
    }

    this.misses = 0;
    const measured = frequencyToNote(frequency);
    if (!measured) return;

    const previous = this.lastReading;
    const cents =
      previous && previous.midi === measured.midi
        ? previous.cents + (measured.cents - previous.cents) * SMOOTHING
        : measured.cents;
    const next: TunerReading = {
      ...measured,
      cents,
      inTune: Math.abs(cents) <= DEFAULT_TUNER_TOLERANCE_CENTS,
    };

    this.lastReading = next;
    this.reading.set(next);
  }

  private release(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.source?.disconnect();
    } catch {
      /* already detached */
    }
    this.stream?.getTracks?.().forEach((track) => track.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.buffer = null;
    this.lastReading = null;
    this.misses = 0;

    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);

    this.reading.set(null);
    this.level.set(0);
  }

  private describeError(error: unknown): string {
    const name = (error as DOMException)?.name;
    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access was blocked. Allow it in the browser, then start the tuner again.";
      case "NotFoundError":
        return "No microphone was found. Connect an input and try again.";
      case "NotReadableError":
        return "The input is busy in another app. Close it and try again.";
      default:
        return "Could not open the input for tuning.";
    }
  }
}
