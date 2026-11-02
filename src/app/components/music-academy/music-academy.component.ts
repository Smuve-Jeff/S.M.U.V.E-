import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
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

  readonly familyChips = computed(() => {
    const families = this.academy.families();
    return [
      { id: 'all' as const, label: 'All instruments' },
      ...families.map((family) => ({
        id: family,
        label: this.academy.familyLabels[family],
      })),
    ];
  });

  selectProgram(programId: string): void {
    this.academy.selectProgram(programId);
  }

  setFamily(family: AcademyFamily | 'all'): void {
    this.academy.setFamilyFilter(family);
  }

  setSearch(event: Event): void {
    this.academy.setSearch((event.target as HTMLInputElement).value);
  }

  toggleLesson(lesson: AcademyLesson): void {
    this.academy.toggleLesson(lesson);
  }

  practice(): void {
    this.academy.practiceInStudio(this.academy.selectedProgram());
  }

  reset(): void {
    this.academy.resetProgram(this.academy.selectedProgram().id);
  }

  applyChain(preset: VocalPreset): void {
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
