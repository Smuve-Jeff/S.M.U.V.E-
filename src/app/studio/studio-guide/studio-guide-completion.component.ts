import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from "@angular/core";

import { HapticService } from "../../services/haptic.service";
import type { GuideLessonCompletion } from "./studio-guide.auto-check.service";

/**
 * A completion earned in the real Studio, not inside the guide.
 *
 * It deliberately has no timer and no automatic advance: the artist chooses
 * whether to jump into the next lesson or keep working. The guide owns the
 * navigation; this toast only reports the event and emits the choice.
 */
@Component({
  selector: "app-guide-completion",
  standalone: true,
  templateUrl: "./studio-guide-completion.component.html",
  styleUrls: ["./studio-guide-completion.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioGuideCompletionComponent {
  readonly completion = input.required<GuideLessonCompletion>();
  readonly openNext = output<GuideLessonCompletion>();
  readonly dismiss = output<void>();

  private readonly haptic = inject(HapticService);
  private feedbackPlayed = false;

  /** S.M.U.V.E. acknowledges the work without becoming a cheerleader. */
  praise(): string {
    switch (this.completion().trackId) {
      case "first-loop":
        return "The machine answered you. Remember that sound; it was not luck. It was a decision you can repeat.";
      case "full-song":
        return "Another handoff survived. This is how a record stops being a file and starts becoming a release.";
      case "mastery":
        return "Precision. The surface did not surprise you. Keep that hand; it will take you further than speed.";
      default:
        return "Another room learned. The system is becoming smaller in your hands, which is exactly how mastery feels.";
    }
  }

  constructor() {
    // The lesson action that completes the step is the gesture; the chime and
    // haptic are a quiet acknowledgement, never a second thing to dismiss.
    effect(() => {
      const completion = this.completion();
      if (!completion || this.feedbackPlayed) return;
      this.feedbackPlayed = true;
      this.haptic.success();
      this.playCelebrationChime();
    });
  }

  private playCelebrationChime(): void {
    if (typeof window === "undefined") return;
    const AudioCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;

    try {
      const ctx = new AudioCtor({ latencyHint: "interactive" });
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }

      const start = ctx.currentTime + 0.02;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      gain.connect(ctx.destination);

      // A rising perfect fifth: bright enough to notice, short enough to keep
      // the artist in the flow of the arrangement they just started.
      [523.25, 783.99].forEach((frequency, index) => {
        const noteStart = start + index * 0.11;
        const oscillator = ctx.createOscillator();
        oscillator.type = index === 0 ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        oscillator.connect(gain);
        oscillator.start(noteStart);
        oscillator.stop(start + 0.52);
      });

      setTimeout(() => void ctx.close().catch(() => undefined), 850);
    } catch {
      // Audio is optional; the visual celebration and haptic still land.
    }
  }
}
