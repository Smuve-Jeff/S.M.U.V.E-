import { Component, computed, inject, input, signal } from '@angular/core';
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

  /** Sprint A3 Phase 4 — comp mode: chip taps build an ordered comp stack. */
  compMode = signal(false);

  /** Ordered comp stack (take ids) for this track. */
  compStack = computed(() => this.takeManager.compStack(this.trackId())());

  /** 1-based order badge for a take inside the comp stack, or null. */
  compOrderOf(takeId: string): number | null {
    const idx = this.compStack().indexOf(takeId);
    return idx === -1 ? null : idx + 1;
  }

  /** Comp-select a take — becomes the playback-priority take for the track. */
  selectTake(takeId: string): void {
    this.takeManager.setActiveTake(this.trackId(), takeId);
    this.haptic.light();
  }

  /** Toggle comp mode (chip taps build the stack instead of selecting). */
  toggleCompMode(): void {
    this.compMode.update((v) => !v);
    this.haptic.light();
  }

  /** In comp mode: add/remove a take from the ordered comp stack. */
  toggleComp(takeId: string): void {
    this.takeManager.toggleCompTake(this.trackId(), takeId);
    this.haptic.light();
  }

  /** In comp mode: clear the stack without touching the takes. */
  clearComp(): void {
    this.takeManager.clearCompStack(this.trackId());
    this.haptic.light();
  }

  /**
   * In comp mode: merge the stacked takes (later wins overlaps) and write the
   * result back into the working track, then clear the stack.
   */
  applyComp(): void {
    const merged = this.takeManager.applyComp(this.trackId());
    if (merged.length === 0) {
      this.snack.info('Comp stack is empty — tap takes in order first');
      return;
    }
    this.musicManager.replaceTrackNotes(this.trackId(), merged);
    this.takeManager.clearCompStack(this.trackId());
    this.compMode.set(false);
    this.haptic.medium();
    this.snack.success(`Comp applied · ${merged.length} notes written`);
  }

  /** Route a chip tap: comp build when in comp mode, else select active. */
  onChipTap(takeId: string): void {
    if (this.compMode()) {
      this.toggleComp(takeId);
    } else {
      this.selectTake(takeId);
    }
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
