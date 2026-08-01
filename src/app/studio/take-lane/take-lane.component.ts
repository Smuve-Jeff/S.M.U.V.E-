import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Take,
  TakeManagerService,
} from '../../services/take-manager.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { SnackbarService } from '../../services/snackbar.service';
import { HapticService } from '../../services/haptic.service';

/**
 * Sprint A3 Phase 3 — take-lane panel. Renders the `TakeManagerService` take
 * stack for one track as tappable chips: tap to comp-select (active highlight),
 * × to delete, punch-in toggle to arm the next record pass, and a + button to
 * stamp a take from the track's current note region.
 */
@Component({
  selector: 'app-take-lane',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './take-lane.component.html',
  styleUrls: ['./take-lane.component.css'],
})
export class TakeLaneComponent {
  /** Track whose take stack this panel displays. */
  readonly trackId = input.required<string>();

  private readonly takeManager = inject(TakeManagerService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly snack = inject(SnackbarService);
  private readonly haptic = inject(HapticService);

  /** Reactive take stack for the track (empty array on unknown tracks). */
  takes = computed(() => this.takeManager.getTakes(this.trackId())());

  /** Id of the currently comp-selected take, or null. */
  activeTakeId = computed(
    () => this.takeManager.getActiveTake(this.trackId())()?.id ?? null
  );

  /** Punch-in armed for this track? */
  punchIn = computed(() => this.takeManager.isPunchIn(this.trackId())());

  /** Comp-select a take — becomes the playback-priority take for the track. */
  selectTake(takeId: string): void {
    this.takeManager.setActiveTake(this.trackId(), takeId);
    this.haptic.light();
  }

  /** Arm / disarm punch-in recording for this track. */
  togglePunchIn(): void {
    const next = !this.punchIn();
    this.takeManager.setPunchIn(this.trackId(), next);
    this.haptic.light();
    this.snack[next ? 'success' : 'info'](
      next ? 'Punch-in armed — next record stop stamps a take' : 'Punch-in off'
    );
  }

  /** Stamp a take from the track's current note region (shared region math). */
  stampTake(): void {
    const track = this.musicManager
      .tracks()
      .find((t) => t.id === this.trackId());
    if (!track) return;
    const count = this.takes().length + 1;
    const take = this.takeManager.stampTake(
      this.trackId(),
      `Take ${count}`,
      track.notes ?? [],
      this.musicManager.currentStep()
    );
    this.haptic.medium();
    this.snack.success(
      `Take ${count} stamped · ${take.noteCount ?? 0} note${
        take.noteCount === 1 ? '' : 's'
      }`
    );
  }

  /** Delete a single take (keeps siblings + clears active if needed). */
  deleteTake(takeId: string, e: Event): void {
    e.stopPropagation();
    this.takeManager.removeTake(this.trackId(), takeId);
    this.haptic.light();
  }

  /** Compact region readout: "0–16" or '' when the take has no region. */
  formatRegion(take: Take): string {
    if (take.startStep === undefined || take.endStep === undefined) return '';
    return `${take.startStep}–${take.endStep}`;
  }
}
