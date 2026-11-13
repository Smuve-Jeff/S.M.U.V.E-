import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserProfileService } from '../services/user-profile.service';
import { MusicManagerService } from '../services/music-manager.service';
import { NotificationService } from '../services/notification.service';
import type {
  AcademyFamily,
  AcademyLevel,
  AcademyLesson,
  InstrumentProgram,
  ProgramProgress,
  VocalPreset,
} from './academy.types';
import {
  ALL_PROGRAMS,
  FAMILY_LABELS,
  VOCAL_COACH_NOTES,
  VOCAL_PRESETS,
  VOCAL_PROGRAM,
} from './academy-data';

export const ACADEMY_PROGRESS_KEY = 'smuve.academy.progress.v1';

/** Only real curriculum lessons count, even if storage was written by an old build. */
const LESSON_IDS = new Set(
  ALL_PROGRAMS.flatMap((program) =>
    program.stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.id))
  )
);

/** Searchable text for a program: the whole curriculum, not just the card. */
const SEARCH_INDEX = new Map<string, string>(
  ALL_PROGRAMS.map((program) => [
    program.id,
    [
      program.label,
      program.familyLabel,
      program.summary,
      program.technique,
      ...program.skills,
      ...program.faults,
      ...program.repertoire,
      ...program.stages.flatMap((stage) => [
        stage.label,
        stage.summary,
        ...stage.lessons.flatMap((lesson) => [
          lesson.title,
          lesson.focus,
          lesson.drill,
          lesson.criteria,
          lesson.studioStep,
        ]),
      ]),
    ]
      .join(' ')
      .toLowerCase(),
  ])
);

/**
 * The Academy surface.
 *
 * Learning is available to any artist at any level — it is not gated behind the
 * profile — but when the profile exists S.M.U.V.E. uses the declared experience
 * level to recommend where to start, and the declared genre to frame the
 * repertoire. Progress is stored locally and survives reloads.
 */
@Injectable({ providedIn: 'root' })
export class MusicAcademyService {
  private profiles = inject(UserProfileService);
  private music = inject(MusicManagerService);
  private notify = inject(NotificationService);
  private router = inject(Router);

  readonly programs = ALL_PROGRAMS;
  readonly familyLabels = FAMILY_LABELS;
  readonly vocalPresets = VOCAL_PRESETS;
  readonly vocalCoachNotes = VOCAL_COACH_NOTES;

  selectedProgramId = signal<string>(VOCAL_PROGRAM.id);
  familyFilter = signal<AcademyFamily | 'all'>('all');
  search = signal('');
  progress = signal<Record<string, number>>({});

  constructor() {
    this.progress.set(this.readProgress());
  }

  readonly families = computed(() => {
    const families = new Set<AcademyFamily>();
    for (const program of this.programs) families.add(program.family);
    return [...families];
  });

  readonly filteredPrograms = computed<InstrumentProgram[]>(() => {
    const family = this.familyFilter();
    const query = this.search().trim().toLowerCase();
    return this.programs.filter((program) => {
      if (family !== 'all' && program.family !== family) return false;
      if (!query) return true;
      return (SEARCH_INDEX.get(program.id) ?? '').includes(query);
    });
  });

  readonly selectedProgram = computed<InstrumentProgram>(() => {
    return (
      this.programs.find((program) => program.id === this.selectedProgramId()) ??
      this.programs[0]
    );
  });

  /** Null when the active filter/search hides the selected program. */
  readonly selectedProgramInView = computed<InstrumentProgram | null>(() => {
    const selected = this.selectedProgram();
    return this.filteredPrograms().some(
      (program) => program.id === selected.id
    )
      ? selected
      : null;
  });

  readonly isVocalProgram = computed(() => this.selectedProgram().family === 'voice');

  /** Where S.M.U.V.E. suggests starting, based on the declared experience. */
  readonly recommendedLevel = computed<AcademyLevel>(() => {
    const declared = String(
      this.profiles.profile()?.musicalJourney?.experienceLevel ?? ''
    ).toLowerCase();
    if (declared.includes('advanc') || declared.includes('professional') || declared.includes('pro')) {
      return 'Advanced';
    }
    if (declared.includes('inter') || declared.includes('some')) return 'Intermediate';
    return 'Foundation';
  });

  /** The declared genre, used to frame repertoire and practice context. */
  readonly declaredGenre = computed(
    () => this.profiles.profile()?.primaryGenre ?? ''
  );

  /** Stored IDs that no longer exist in the curriculum do not count. */
  readonly completedLessons = computed(() => {
    const progress = this.progress();
    return Object.keys(progress).filter(
      (id) => LESSON_IDS.has(id) && Boolean(progress[id])
    ).length;
  });

  readonly overallPercent = computed(() => {
    const total = this.programs.reduce(
      (sum, program) => sum + this.lessonCount(program),
      0
    );
    if (!total) return 0;
    return Math.round((this.completedLessons() / total) * 100);
  });

  lessonCount(program: InstrumentProgram): number {
    return program.stages.reduce((sum, stage) => sum + stage.lessons.length, 0);
  }

  progressFor(program: InstrumentProgram): ProgramProgress {
    const lessons = program.stages.flatMap((stage) => stage.lessons);
    const completed = lessons.filter((lesson) => this.isComplete(lesson)).length;
    const nextLesson = lessons.find((lesson) => !this.isComplete(lesson)) ?? null;
    const stagesComplete = program.stages.filter((stage) =>
      stage.lessons.every((lesson) => this.isComplete(lesson))
    ).length;
    return {
      programId: program.id,
      completed,
      total: lessons.length,
      percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
      nextLesson,
      stagesComplete,
    };
  }

  selectedProgramProgress = computed(() => this.progressFor(this.selectedProgram()));

  isComplete(lesson: AcademyLesson): boolean {
    return LESSON_IDS.has(lesson.id) && Boolean(this.progress()[lesson.id]);
  }

  selectProgram(programId: string): void {
    if (!this.programs.some((program) => program.id === programId)) return;
    this.selectedProgramId.set(programId);
  }

  setFamilyFilter(family: AcademyFamily | 'all'): void {
    this.familyFilter.set(family);
    this.ensureVisibleSelection();
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.ensureVisibleSelection();
  }

  clearFilters(): void {
    this.familyFilter.set('all');
    this.search.set('');
    this.ensureVisibleSelection();
  }

  toggleLesson(lesson: AcademyLesson): void {
    if (!LESSON_IDS.has(lesson.id)) return;
    const current = { ...this.progress() };
    if (current[lesson.id]) {
      delete current[lesson.id];
    } else {
      current[lesson.id] = Date.now();
    }
    this.progress.set(current);
    this.writeProgress(current);
  }

  completeLesson(lesson: AcademyLesson): void {
    if (!LESSON_IDS.has(lesson.id) || this.progress()[lesson.id]) return;
    const current = { ...this.progress(), [lesson.id]: Date.now() };
    this.progress.set(current);
    this.writeProgress(current);
    this.notify.show(`Lesson complete: ${lesson.title}`, 'success');
  }

  resetProgram(programId: string): void {
    const program = this.programs.find((entry) => entry.id === programId);
    if (!program) return;
    const current = { ...this.progress() };
    for (const stage of program.stages) {
      for (const lesson of stage.lessons) delete current[lesson.id];
    }
    this.progress.set(current);
    this.writeProgress(current);
    this.notify.show(`${program.label} progress reset.`, 'info');
  }

  resetAll(): void {
    this.progress.set({});
    this.writeProgress({});
  }

  /**
   * Creates a vocal track and inserts the preset's real built-in plugin chain,
   * then opens the Vocal Suite. The tuning step is still the artist's to set —
   * the chain never pretends to have fixed a performance it has not heard.
   */
  applyVocalChain(preset: VocalPreset): void {
    const trackId = this.music.addTrack(
      `Lead Vocal · ${preset.label}`,
      'whisper-choir',
      'vocal'
    );
    if (!trackId) {
      this.notify.show(
        'The Studio track limit is reached. Remove a track, then apply the chain.',
        'warning'
      );
      return;
    }
    this.music.setTrackPlugins(trackId, preset.pluginIds);
    this.notify.show(
      `${preset.label} chain loaded: ${preset.pluginIds.length} plugins inserted. Set pitch correction in the Vocal Suite.`,
      'success'
    );
    this.router.navigate(['/vocal-suite']);
  }

  /** Practice CTA label, including workspaces outside the Studio. */
  practiceLabelFor(program: InstrumentProgram): string {
    return program.practiceLabel ?? 'Open in Studio';
  }

  /** Sends Studio programs to the Studio and other disciplines to their workspace. */
  practiceSelected(program: InstrumentProgram): void {
    if (program.practiceRoute) {
      void this.router.navigate([program.practiceRoute]);
      return;
    }
    this.practiceInStudio(program);
  }

  /** Opens the Studio with a track already set to the instrument being learned. */
  practiceInStudio(program: InstrumentProgram): void {
    if (!program.studioInstrumentId || !program.studioView) {
      this.notify.show(
        `${program.label} opens in its own workspace, not on a Studio track.`,
        'info'
      );
      if (program.practiceRoute) void this.router.navigate([program.practiceRoute]);
      return;
    }
    const trackId = this.music.addTrack(
      `${program.label} practice`,
      program.studioInstrumentId,
      program.family === 'drums' ? 'drum' : 'midi'
    );
    if (!trackId) {
      this.notify.show(
        'The Studio track limit is reached. Remove a track, then try again.',
        'warning'
      );
      return;
    }
    this.notify.show(`${program.label} track created in the Studio.`, 'success');
    this.router.navigate(['/studio'], {
      queryParams: { view: program.studioView },
    });
  }

  /** Keep filters and the detail panel in agreement. */
  private ensureVisibleSelection(): void {
    const visible = this.filteredPrograms();
    if (!visible.length) return;
    if (!visible.some((program) => program.id === this.selectedProgramId())) {
      this.selectedProgramId.set(visible[0].id);
    }
  }

  private readProgress(): Record<string, number> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(ACADEMY_PROGRESS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const clean: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          LESSON_IDS.has(key) &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value > 0
        ) {
          clean[key] = value;
        }
      }
      return clean;
    } catch {
      return {};
    }
  }

  private writeProgress(progress: Record<string, number>): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(ACADEMY_PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // Storage unavailable — in-memory progress still works this session.
    }
  }
}
