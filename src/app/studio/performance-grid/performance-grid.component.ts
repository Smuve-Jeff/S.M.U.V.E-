import { Component, inject, signal, OnInit, OnDestroy } from "@angular/core";
import { AudioSessionService } from "../audio-session.service";
import { CommonModule } from "@angular/common";
import {
  MusicManagerService,
  TrackModel,
} from "../../services/music-manager.service";
import { HapticService } from "../../services/haptic.service";
import { StudioVisualSchedulerService } from "../shared/studio-visual-scheduler.service";

@Component({
  selector: "app-performance-grid",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./performance-grid.component.html",
  styleUrls: ["./performance-grid.component.css", "../shared/platform-ux.css"],
})
export class PerformanceGridComponent implements OnInit, OnDestroy {
  private musicManager = inject(MusicManagerService);
  private haptic = inject(HapticService);
  private audioSession = inject(AudioSessionService);
  private readonly visualScheduler = inject(StudioVisualSchedulerService);

  trackLevels = signal<Record<string, number>>({});
  private analysers = new Map<string, AnalyserNode>();
  private stopMeteringTask: (() => void) | null = null;
  /** Row currently selected for row-launch (across all tracks). */
  selectedRow = signal<number | null>(null);

  tracks = this.musicManager.tracks;
  rows = Array.from({ length: 8 }, (_, index) => index);

  private static readonly LONG_PRESS_MS = 500;
  /**
   * Window in which the click that follows a long press is swallowed. It has to
   * outlast the synthesised click but stay short enough that a keyboard or
   * screen-reader activation of the same slot still works straight afterwards.
   */
  private static readonly LONG_PRESS_SUPPRESS_MS = 700;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Click-suppression deadline. It is armed when the long press captures the
   * scene and re-armed on release, because the browser pairs a release with a
   * click and that click is the one that must never launch the scene the hold
   * just overwrote. Measuring from the press alone lost that click on slow
   * devices, where it can arrive hundreds of ms after the finger lifts.
   */
  private suppressClickUntil = 0;
  /** True between the long press firing and the finger lifting. */
  private longPressFired = false;

  ngOnInit() {
    this.startMetering();
  }

  ngOnDestroy() {
    this.stopMeteringTask?.();
    this.stopMeteringTask = null;
    this.clearPressTimer();
    for (const analyser of this.analysers.values()) {
      try {
        analyser.disconnect();
      } catch {
        // The audio graph may already have been torn down.
      }
    }
    this.analysers.clear();
  }

  private startMetering() {
    this.stopMeteringTask = this.visualScheduler.register(
      () => this.updateMeters(),
      { fps: 20, immediate: true },
    );
  }

  private updateMeters(): void {
    const levels: Record<string, number> = {};
    this.tracks().forEach((track) => {
      let analyser = this.analysers.get(track.id);
      if (!analyser) {
        analyser = this.audioSession.engine.ctx.createAnalyser();
        analyser.fftSize = 32;
        this.audioSession.engine.getTrackOutput(track.id).connect(analyser);
        this.analysers.set(track.id, analyser);
      }
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      levels[track.id] = data.length
        ? data.reduce((a, b) => a + b, 0) / data.length / 255
        : 0;
    });
    this.trackLevels.set(levels);
  }

  getTrackLevel(id: string) {
    return this.trackLevels()[id] || 0;
  }

  private slotId(row: number): string {
    return `slot-${row}`;
  }

  /** Latest captured notes for a scene (empty scene = never captured). */
  hasContent(track: TrackModel, row: number): boolean {
    const slot = track.patternSlots?.find((s) => s.id === this.slotId(row));
    const version = slot?.versions[slot.versions.length - 1];
    if (!version) return false;
    return version.notes.length > 0 || version.steps.some(Boolean);
  }

  /** Launch the captured pattern for the selected row across all tracks. */
  launchRow(row = this.selectedRow()): void {
    if (row === null || row === undefined) return;
    const slotId = this.slotId(row);
    const tracks = this.tracks();
    tracks.forEach((track) => {
      const slot = track.patternSlots?.find((s) => s.id === slotId);
      if (slot && slot.versions.length > 0) {
        const version = slot.versions[slot.versions.length - 1];
        if (version.notes.length > 0 || version.steps.some(Boolean)) {
          this.musicManager.recallPatternSlot(track.id, slotId);
        }
      }
    });
    this.selectedRow.set(null);
  }

  /**
   * Scene trigger: empty scenes CAPTURE the track's current pattern,
   * filled scenes LAUNCH their captured pattern. The header promise
   * ("tap slot to trigger") now holds — notes/steps actually switch.
   */
  toggleClip(trackId: string, clipIndex: number) {
    // A long-press already recaptured this slot; never also launch it.
    if (Date.now() < this.suppressClickUntil) return;
    const track = this.tracks().find((t) => t.id === trackId);
    if (!track) return;
    const slotId = this.slotId(clipIndex);
    this.haptic.light();
    if (this.hasContent(track, clipIndex)) {
      this.musicManager.recallPatternSlot(trackId, slotId);
    } else {
      this.musicManager.capturePatternSlot(
        trackId,
        slotId,
        `Scene ${clipIndex + 1}`,
      );
    }
  }

  /**
   * Touch equivalent of the right-click "overwrite this scene" action: hold a
   * slot for half a second and it recaptures the current pattern. Phones had no
   * path to this at all, while the hover title told them to right-click.
   */
  onSlotPointerDown(
    track: TrackModel,
    clipIndex: number,
    event?: PointerEvent,
  ) {
    if (event && event.pointerType === "mouse" && event.button !== 0) return;
    this.clearPressTimer();
    this.pressTimer = setTimeout(() => {
      this.longPressFired = true;
      this.suppressClickUntil =
        Date.now() + PerformanceGridComponent.LONG_PRESS_SUPPRESS_MS;
      this.recaptureClip(track, clipIndex);
    }, PerformanceGridComponent.LONG_PRESS_MS);
  }

  onSlotPointerUp() {
    this.clearPressTimer();
    // Only a gesture that actually long-pressed re-arms the window, and it
    // re-arms from the release: a plain tap has nothing to suppress and must
    // launch straight away, however long the artist held the finger down.
    if (this.longPressFired) {
      this.longPressFired = false;
      this.suppressClickUntil =
        Date.now() + PerformanceGridComponent.LONG_PRESS_SUPPRESS_MS;
    }
  }

  private clearPressTimer() {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  /** Right-click or long-press a scene to overwrite it with the current pattern. */
  recaptureClip(track: TrackModel, clipIndex: number) {
    this.clearPressTimer();
    this.haptic.medium();
    this.musicManager.capturePatternSlot(
      track.id,
      this.slotId(clipIndex),
      `Scene ${clipIndex + 1}`,
    );
  }

  isActive(track: TrackModel, row: number) {
    return track.activePatternSlotId === this.slotId(row);
  }

  slotName(track: TrackModel, row: number) {
    return (
      track.patternSlots?.find((slot) => slot.id === this.slotId(row))?.name ||
      `Slot ${row + 1}`
    );
  }
}
