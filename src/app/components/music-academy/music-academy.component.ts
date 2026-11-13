import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { AcademyFamily, AcademyLesson, VocalPreset } from '../../composer/academy.types';
import { MusicAcademyService } from '../../composer/music-academy.service';

@Component({
  selector: 'app-music-academy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './music-academy.component.html',
  styleUrls: ['./music-academy.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MusicAcademyComponent {
  readonly academy = inject(MusicAcademyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly confirmingReset = signal(false);
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disarmReset());
    // Deep links like /academy?program=acting land on that program. Unknown
    // values are ignored so a stale link can never select a missing program.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const programId = params.get('program');
        if (programId) {
          this.disarmReset();
          this.academy.selectProgram(programId);
        }
      });
  }

  readonly familyChips = computed(() => {
    const families = this.academy.families();
    return [
      { id: 'all' as const, label: 'All disciplines' },
      ...families.map((family) => ({
        id: family,
        label: this.academy.familyLabels[family],
      })),
    ];
  });

  selectProgram(programId: string): void {
    this.disarmReset();
    this.academy.selectProgram(programId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { program: programId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setFamily(family: AcademyFamily | 'all'): void {
    this.disarmReset();
    this.academy.setFamilyFilter(family);
  }

  setSearch(event: Event): void {
    this.disarmReset();
    this.academy.setSearch((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.disarmReset();
    this.academy.clearFilters();
  }

  toggleLesson(lesson: AcademyLesson): void {
    this.disarmReset();
    this.academy.toggleLesson(lesson);
  }

  practice(): void {
    this.disarmReset();
    this.academy.practiceSelected(this.academy.selectedProgram());
  }

  practiceLabel(): string {
    return this.academy.practiceLabelFor(this.academy.selectedProgram());
  }

  /** Resetting a program is destructive, so the second press confirms it. */
  reset(): void {
    if (this.academy.selectedProgramProgress().completed === 0) return;
    if (!this.confirmingReset()) {
      this.confirmingReset.set(true);
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        this.confirmingReset.set(false);
        this.resetTimer = null;
      }, 4000);
      return;
    }
    this.disarmReset();
    this.academy.resetProgram(this.academy.selectedProgram().id);
  }

  private disarmReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.confirmingReset.set(false);
  }

  applyChain(preset: VocalPreset): void {
    this.disarmReset();
    this.academy.applyVocalChain(preset);
  }

  progressPercent(programId: string): number {
    const program = this.academy.programs.find((entry) => entry.id === programId);
    return program ? this.academy.progressFor(program).percent : 0;
  }

  completedInStage(stageId: string): number {
    const program = this.academy.selectedProgram();
    const stage = program.stages.find((entry) => entry.id === stageId);
    if (!stage) return 0;
    return stage.lessons.filter((lesson) => this.academy.isComplete(lesson)).length;
  }

  stageLessons(stageId: string): number {
    const program = this.academy.selectedProgram();
    const stage = program.stages.find((entry) => entry.id === stageId);
    return stage ? stage.lessons.length : 0;
  }

  trackByLesson(_index: number, lesson: AcademyLesson): string {
    return lesson.id;
  }
}
