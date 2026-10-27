import { Injectable, computed, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";

/** MIDI beat clock resolution: 24 pulses per quarter note. */
export const MIDI_CLOCK_PPQN = 24;

/**
 * Turns a stream of MIDI clock pulses into a tempo estimate.
 *
 * Kept free of Angular and Web MIDI so it can be reasoned about (and tested)
 * on its own: `pulse()` takes a millisecond timestamp and returns the BPM once
 * enough consecutive pulses have arrived. A gap longer than `RESET_AFTER_MS`
 * means the source stopped or skipped, so the window is dropped instead of
 * reporting a tempo halfway between two unrelated runs.
 */
export class MidiClockTracker {
  /** Pulses needed before an estimate is trustworthy (~1/3 beat). */
  static readonly LOCK_PULSES = 8;
  private static readonly RESET_AFTER_MS = 250;

  private timestamps: number[] = [];
  private smoothedIntervalMs: number | null = null;
  private locked = false;

  pulse(nowMs: number): number | null {
    const previous = this.timestamps[this.timestamps.length - 1];
    if (previous !== undefined) {
      const interval = nowMs - previous;
      if (interval <= 0) return this.currentBpm();
      if (interval > MidiClockTracker.RESET_AFTER_MS) {
        this.timestamps = [nowMs];
        this.smoothedIntervalMs = null;
        this.locked = false;
        return null;
      }
      this.smoothedIntervalMs =
        this.smoothedIntervalMs === null
          ? interval
          : this.smoothedIntervalMs * 0.82 + interval * 0.18;
    }

    this.timestamps.push(nowMs);
    if (this.timestamps.length > MIDI_CLOCK_PPQN * 2) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= MidiClockTracker.LOCK_PULSES) {
      this.locked = true;
    }
    return this.locked ? this.currentBpm() : null;
  }

  reset(): void {
    this.timestamps = [];
    this.smoothedIntervalMs = null;
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }

  private currentBpm(): number | null {
    if (this.smoothedIntervalMs === null || this.smoothedIntervalMs <= 0) {
      return null;
    }
    const bpm = 60000 / (this.smoothedIntervalMs * MIDI_CLOCK_PPQN);
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return null;
    return Math.round(bpm * 10) / 10;
  }
}

export type MidiClockStatus = "off" | "waiting" | "locked" | "unsupported";

/**
 * External MIDI clock sync (follow).
 *
 * The DJ deck could *send* MIDI clock but the studio could not follow an
 * external one, so a hardware sequencer, drum machine or another DAW could not
 * drive playback — the gap Cubasis and FL Mobile close with clock-in.
 *
 * This follows tempo and transport (start / continue / stop). It deliberately
 * does not reschedule audio on every pulse: the engine's own scheduler still
 * owns step timing, and phase is aligned by starting on the clock's START.
 */
@Injectable({ providedIn: "root" })
export class MidiClockSyncService {
  private readonly engine = inject(AudioEngineService);

  readonly enabled = signal(false);
  readonly status = signal<MidiClockStatus>("off");
  readonly bpm = signal<number | null>(null);
  readonly pulseCount = signal(0);

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case "off":
        return "OFF";
      case "waiting":
        return "WAITING FOR CLOCK";
      case "unsupported":
        return "NO WEB MIDI";
      case "locked": {
        const bpm = this.bpm();
        return bpm === null ? "LOCKING…" : `${bpm} BPM`;
      }
    }
  });

  private tracker = new MidiClockTracker();
  private access: any = null;
  private inputs: any[] = [];
  /** Tempo the artist had before external sync took over. */
  private tempoBeforeSync: number | null = null;

  async enable(): Promise<void> {
    if (this.enabled()) return;
    const request = (navigator as any)?.requestMIDIAccess;
    if (typeof request !== "function") {
      this.status.set("unsupported");
      return;
    }
    this.enabled.set(true);
    this.status.set("waiting");
    try {
      this.access = await request.call(navigator, { sysex: false });
      this.access.onstatechange = () => this.attachInputs();
      this.attachInputs();
    } catch {
      this.enabled.set(false);
      this.status.set("unsupported");
    }
  }

  disable(): void {
    if (!this.enabled() && this.status() === "off") return;
    this.detachInputs();
    this.tracker.reset();
    this.enabled.set(false);
    this.status.set("off");
    this.bpm.set(null);
    this.pulseCount.set(0);
    if (this.tempoBeforeSync !== null) {
      this.engine.tempo.set(this.tempoBeforeSync);
      this.tempoBeforeSync = null;
    }
  }

  toggle(): void {
    if (this.enabled()) this.disable();
    else void this.enable();
  }

  private attachInputs(): void {
    this.detachInputs();
    if (!this.access?.inputs) return;
    this.inputs = Array.from(this.access.inputs.values());
    for (const input of this.inputs) {
      input.onmidimessage = (event: { data: Uint8Array }) =>
        this.handleMessage(event);
    }
  }

  private detachInputs(): void {
    for (const input of this.inputs) {
      try {
        input.onmidimessage = null;
      } catch {}
    }
    this.inputs = [];
  }

  /** Web MIDI status byte handling for clock + transport. */
  private handleMessage(event: { data?: Uint8Array }): void {
    const data = event?.data;
    if (!data || data.length === 0) return;
    const status = data[0];

    if (status === 0xf8) {
      this.pulseCount.update((count) => count + 1);
      const estimate = this.tracker.pulse(this.now());
      if (estimate === null) {
        if (this.status() !== "waiting") this.status.set("waiting");
        return;
      }
      this.bpm.set(estimate);
      this.status.set("locked");
      if (this.tempoBeforeSync === null) {
        this.tempoBeforeSync = this.engine.tempo();
      }
      if (this.engine.tempo() !== estimate) {
        this.engine.tempo.set(estimate);
      }
      return;
    }

    if (status === 0xfa || status === 0xfb) {
      // START from the top, CONTINUE from the playhead: both begin playback,
      // and the clock's own phase keeps them aligned from here.
      this.engine.start();
      return;
    }

    if (status === 0xfc) {
      this.engine.stop();
    }
  }

  private now(): number {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }
}
