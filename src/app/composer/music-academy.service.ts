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

const PROGRESS_KEY = 'smuve.academy.progress.v1';

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
      return (
        program.label.toLowerCase().includes(query) ||
        program.familyLabel.toLowerCase().includes(query) ||
        program.skills.some((skill) => skill.toLowerCase().includes(query))
      );
    });
  });

  readonly selectedProgram = computed<InstrumentProgram>(() => {
    return (
      this.programs.find((program) => program.id === this.selectedProgramId()) ??
      this.programs[0]
    );
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

  readonly completedLessons = computed(() => Object.keys(this.progress()).length);

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
    const completedMap = this.progress();
    const lessons = program.stages.flatMap((stage) => stage.lessons);
    const completed = lessons.filter((lesson) => completedMap[lesson.id]).length;
    const nextLesson = lessons.find((lesson) => !completedMap[lesson.id]) ?? null;
    const stagesComplete = program.stages.filter((stage) =>
      stage.lessons.every((lesson) => completedMap[lesson.id])
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
    return Boolean(this.progress()[lesson.id]);
  }

  selectProgram(programId: string): void {
    this.selectedProgramId.set(programId);
  }

  setFamilyFilter(family: AcademyFamily | 'all'): void {
    this.familyFilter.set(family);
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  toggleLesson(lesson: AcademyLesson): void {
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
    if (this.progress()[lesson.id]) return;
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

  /** Opens the Studio with a track already set to the instrument being learned. */
  practiceInStudio(program: InstrumentProgram): void {
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

  private readProgress(): Record<string, number> {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const clean: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number') clean[key] = value;
      }
      return clean;
    } catch {
      return {};
    }
  }

  private writeProgress(progress: Record<string, number>): void {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // Storage unavailable — in-memory progress still works this session.
    }
  }
}
