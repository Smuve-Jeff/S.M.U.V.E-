import { Component, OnDestroy, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";

import { LoggingService } from "../../services/logging.service";
import { detectPitch } from "../audio-to-midi.util";
import { preferredConnectedInputDeviceId } from "../input-device-prefs";
import {
  DEFAULT_TUNER_TOLERANCE_CENTS,
  TunerReading,
  centsToNeedle,
  frequencyToNote,
} from "./tuner-pitch.util";

/** Analysis cadence: 20 readings a second is faster than a needle needs. */
const FRAME_MS = 50;
/** Frames of silence before the note is cleared (~0.6 s). */
const MISS_LIMIT = 12;
/** Same-note needle easing, so one bad frame cannot make it jump. */
const SMOOTHING = 0.4;

/**
 * Studio tuner.
 *
 * Reads the same input every capture path records from, and turns it into the
 * two things a player needs before a take: which note that is, and how far off
 * it is in cents. Pitch detection is the app's existing monophonic
 * autocorrelation (`detectPitch`), not a second implementation — the tuner and
 * audio-to-MIDI should agree about what an A is.
 */
@Component({
  selector: "app-tuner",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./tuner.component.html",
  styleUrls: ["./tuner.component.css"],
})
export class TunerComponent implements OnDestroy {
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
      this.deviceLabel.set(
        stream.getAudioTracks?.()[0]?.label?.trim() || "System input",
      );

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

  ngOnDestroy(): void {
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
