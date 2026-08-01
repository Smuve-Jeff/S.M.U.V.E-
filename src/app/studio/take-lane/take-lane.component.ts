import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CompSection,
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

  /** Sprint A3 Phase 5 — section mode: pick a take, then tap bars to assign. */
  sectionMode = signal(false);

  /** Take currently armed for bar assignment in section mode. */
  pickedTakeId = signal<string | null>(null);

  /** Ordered comp stack (take ids) for this track. */
  compStack = computed(() => this.takeManager.compStack(this.trackId())());

  /** Comp sections for this track, sorted by start step. */
  sections = computed(() => this.takeManager.sections(this.trackId())());

  /** Number of bars to comp over (from the track's furthest note, min 4). */
  sectionBars = computed(() => {
    const track = this.musicManager
      .tracks()
      .find((t) => t.id === this.trackId());
    const furthest = (track?.notes ?? []).reduce(
      (max, n) => Math.max(max, n.step + (n.length ?? 1)),
      0
    );
    return Math.max(4, Math.ceil(furthest / 16));
  });

  /** Bar numbers available for section assignment (1-based). */
  sectionBarColumns = computed(() =>
    Array.from({ length: this.sectionBars() }, (_, i) => i + 1)
  );

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

  /** Route a chip tap: pick a take in section mode, comp build in comp mode. */
  onChipTap(takeId: string): void {
    if (this.sectionMode()) {
      this.pickedTakeId.set(takeId);
      this.snack.info(`Section take picked — tap a bar to assign ${this.labelFor(takeId)}`);
    } else if (this.compMode()) {
      this.toggleComp(takeId);
    } else {
      this.selectTake(takeId);
    }
  }

  /** Toggle section mode (bar-by-bar comp assignment). */
  toggleSectionMode(): void {
    this.sectionMode.update((v) => !v);
    if (!this.sectionMode()) this.pickedTakeId.set(null);
    this.haptic.light();
  }

  /** The section covering a bar, or undefined. */
  sectionForBar(bar: number): CompSection | undefined {
    const start = (bar - 1) * 16;
    return this.sections().find(
      (s) => s.startStep <= start && s.endStep > start
    );
  }

  /** Short take label for a take id (falls back to 'Take ?'). */
  labelFor(takeId: string): string {
    return this.takes().find((t) => t.id === takeId)?.label ?? 'Take';
  }

  /** Assign the picked take to a bar (toggles off if already that take). */
  assignBar(bar: number): void {
    const takeId = this.pickedTakeId();
    if (!takeId) {
      this.snack.info('Tap a take chip first to pick which take to assign');
      return;
    }
    const existing = this.sectionForBar(bar);
    if (existing) {
      this.takeManager.removeSection(this.trackId(), existing.id);
      if (existing.takeId === takeId) {
        this.snack.info(`Bar ${bar} unassigned`);
        this.haptic.light();
        return;
      }
    }
    const start = (bar - 1) * 16;
    const end = bar * 16;
    this.takeManager.setSection(this.trackId(), start, end, takeId);
    this.haptic.medium();
    this.snack.success(`Bar ${bar} → ${this.labelFor(takeId)}`);
  }

  /** Clear all sections for this track. */
  clearSections(): void {
    for (const s of this.sections()) {
      this.takeManager.removeSection(this.trackId(), s.id);
    }
    this.pickedTakeId.set(null);
    this.haptic.light();
  }

  /** Bake the sectional comp into the working track notes. */
  applySections(): void {
    const track = this.musicManager
      .tracks()
      .find((t) => t.id === this.trackId());
    if (!track) return;
    if (this.sections().length === 0) {
      this.snack.info('No sections assigned — pick a take, then tap bars');
      return;
    }
    const merged = this.takeManager.applySections(
      this.trackId(),
      track.notes ?? []
    );
    this.musicManager.replaceTrackNotes(this.trackId(), merged);
    this.sectionMode.set(false);
    this.pickedTakeId.set(null);
    this.haptic.medium();
    this.snack.success(`Sections baked · ${merged.length} notes in track`);
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
