import { Component, OnDestroy, inject } from "@angular/core";
import { CommonModule } from "@angular/common";

import { TunerLiveService } from "./tuner-live.service";

/**
 * Studio tuner surface.
 *
 * The microphone stream, analyser and pitch loop live in
 * `TunerLiveService` so the Studio Director can open and read the same live
 * input without pretending to press this surface's button. This component is
 * only the needle UI over that shared service.
 */
@Component({
  selector: "app-tuner",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./tuner.component.html",
  styleUrls: ["./tuner.component.css"],
})
export class TunerComponent implements OnDestroy {
  private readonly tunerLive = inject(TunerLiveService);

  readonly listening = this.tunerLive.listening;
  readonly starting = this.tunerLive.starting;
  readonly reading = this.tunerLive.reading;
  readonly level = this.tunerLive.level;
  readonly error = this.tunerLive.error;
  readonly deviceLabel = this.tunerLive.deviceLabel;
  readonly needle = this.tunerLive.needle;

  get isRunning(): boolean {
    return this.tunerLive.isRunning;
  }

  /** Start or stop; returns the start promise so a caller can await the input. */
  toggle(): Promise<void> | void {
    return this.tunerLive.toggle();
  }

  start(): Promise<void> {
    return this.tunerLive.start();
  }

  stop(): void {
    this.tunerLive.stop();
  }

  ngOnDestroy(): void {
    this.tunerLive.stop();
  }
}
