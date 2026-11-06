import {
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";

import { AudioEngineService } from "../../services/audio-engine.service";
import { MusicManagerService } from "../../services/music-manager.service";
import {
  PPQ,
  STEPS_PER_BEAT,
  TICKS_PER_BAR,
  TICKS_PER_STEP,
  secondsPerTickAtBpm,
  stepsToTicks,
} from "./ppq";

/**
 * Live PPQ timing diagnostics.
 *
 * Shows the clock the sequencer actually schedules from: the absolute tick,
 * the tempo in force at this step and the next boundary, and the exact ticks
 * and milliseconds handed to the last scheduled note. This is the readout to
 * open when a triplet, swung hit or micro-offset sounds early or late — it
 * separates an editing error (wrong tick) from a tempo-ramp error (right tick,
 * wrong seconds).
 */
@Component({
  selector: "app-timing-diagnostics",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./timing-diagnostics.component.html",
  styleUrls: ["./timing-diagnostics.component.css"],
})
export class TimingDiagnosticsComponent {
  private readonly engine = inject(AudioEngineService);
  private readonly musicManager = inject(MusicManagerService);

  /** The transport closes the overlay; the component never owns its shell. */
  @Output() readonly closed = new EventEmitter<void>();

  readonly ppq = PPQ;
  readonly ticksPerStep = TICKS_PER_STEP;

  /** Coarse transport step (the grid cell the playhead is in). */
  readonly transportStep = computed(() =>
    Math.max(0, Math.floor(this.engine.visualStep())),
  );

  /** Absolute tick at the start of the current step. */
  readonly absoluteTick = computed(() => stepsToTicks(this.transportStep()));

  /** Tick position inside the current bar. */
  readonly barTick = computed(() => this.absoluteTick() % TICKS_PER_BAR);

  readonly bpmStart = computed(() => this.tempoAt(this.transportStep()));
  readonly bpmEnd = computed(() => this.tempoAt(this.transportStep() + 1));

  /** A tempo ramp is in force while the next boundary differs from this one. */
  readonly isRamping = computed(
    () => Math.abs(this.bpmEnd() - this.bpmStart()) > 0.05,
  );

  readonly bpmLabel = computed(() =>
    this.isRamping()
      ? `${this.formatBpm(this.bpmStart())} → ${this.formatBpm(this.bpmEnd())}`
      : this.formatBpm(this.bpmStart()),
  );

  readonly rampLabel = computed(() => (this.isRamping() ? "RAMP" : "HOLD"));

  /** Seconds this step actually lasts, integrated through any ramp. */
  readonly stepSecondsMs = computed(() => {
    const step = this.transportStep();
    const between = (this.engine as Partial<AudioEngineService>)
      .secondsBetweenSteps;
    const seconds =
      typeof between === "function"
        ? between.call(this.engine, step, step + 1)
        : 60 / this.bpmStart() / this.stepsPerBeat();
    return this.round(seconds * 1000, 2);
  });

  readonly markerCount = computed(() => {
    const getMap = (this.engine as Partial<AudioEngineService>).getTempoMap;
    if (typeof getMap !== "function") return 0;
    try {
      return getMap.call(this.engine).length;
    } catch {
      return 0;
    }
  });

  /** Most recent note the sequencer scheduled, or null before playback. */
  readonly lastNote = this.musicManager.lastScheduledNote;

  readonly lastNoteDurationMs = computed(() => {
    const note = this.lastNote();
    if (!note) return 0;
    return this.round(note.durationTicks * secondsPerTickAtBpm(note.bpm) * 1000, 2);
  });

  readonly lastNoteLeadLabel = computed(() => {
    const note = this.lastNote();
    if (!note) return "—";
    const context = this.audioContext();
    if (!context) return "—";
    const lead = Math.max(0, (note.scheduledTime - context.currentTime) * 1000);
    return `${this.round(lead, 1)} ms`;
  });

  /** Decimal tempo without a pointless trailing ".0". */
  formatBpm(bpm: number): string {
    const safe = Math.max(1, Number.isFinite(bpm) ? bpm : 0);
    return Number.isInteger(safe) ? String(safe) : safe.toFixed(1);
  }

  private tempoAt(step: number): number {
    const resolve = (this.engine as Partial<AudioEngineService>).tempoAtStep;
    if (typeof resolve === "function") {
      const bpm = resolve.call(this.engine, step);
      if (Number.isFinite(bpm)) return bpm;
    }
    return this.engine.tempo();
  }

  private stepsPerBeat(): number {
    try {
      return this.engine.stepsPerBeat() || STEPS_PER_BEAT;
    } catch {
      return STEPS_PER_BEAT;
    }
  }

  private audioContext(): AudioContext | null {
    try {
      return this.engine.getContext?.() ?? null;
    } catch {
      return null;
    }
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
