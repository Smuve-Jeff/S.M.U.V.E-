import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ACADEMY_PROGRESS_KEY, MusicAcademyService } from './music-academy.service';
import { ALL_PROGRAMS } from './academy-data';
import { UserProfileService } from '../services/user-profile.service';
import { MusicManagerService } from '../services/music-manager.service';
import { NotificationService } from '../services/notification.service';

type ProfileSlice = {
  musicalJourney?: { experienceLevel?: string | null } | null;
  primaryGenre?: string | null;
} | null;

const VOICE = ALL_PROGRAMS.find((program) => program.id === 'voice')!;
const PIANO = ALL_PROGRAMS.find((program) => program.id === 'piano')!;
const DRUMS = ALL_PROGRAMS.find((program) => program.id === 'drum-kit')!;
const TOTAL_LESSONS = ALL_PROGRAMS.reduce(
  (sum, program) =>
    sum + program.stages.reduce((stageSum, stage) => stageSum + stage.lessons.length, 0),
  0
);

describe('MusicAcademyService', () => {
  let profile: WritableSignal<ProfileSlice>;
  let music: { addTrack: jest.Mock; setTrackPlugins: jest.Mock };
  let notify: { show: jest.Mock };
  let router: { navigate: jest.Mock };

  const create = (): MusicAcademyService => {
    TestBed.configureTestingModule({
      providers: [
        { provide: UserProfileService, useValue: { profile } },
        { provide: MusicManagerService, useValue: music },
        { provide: NotificationService, useValue: notify },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.inject(MusicAcademyService);
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    profile = signal<ProfileSlice>(null);
    music = {
      addTrack: jest.fn(() => 'track-1'),
      setTrackPlugins: jest.fn(),
    };
    notify = { show: jest.fn() };
    router = { navigate: jest.fn() };
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('ships unique program and lesson ids with a full staged curriculum', () => {
    const service = create();
    const programIds = service.programs.map((program) => program.id);
    const lessonIds = service.programs.flatMap((program) =>
      program.stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.id))
    );

    expect(new Set(programIds).size).toBe(programIds.length);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    expect(service.programs.every((program) => program.stages.length >= 3)).toBe(true);
    expect(
      service.programs.every((program) =>
        program.stages.every((stage) => stage.lessons.length >= 3)
      )
    ).toBe(true);
    expect(service.programs.find((program) => program.id === 'voice')).toBe(VOICE);
    expect(
      VOICE.stages.reduce((sum, stage) => sum + stage.lessons.length, 0)
    ).toBe(12);
    expect(service.vocalPresets.every((preset) => preset.pluginIds.length > 0)).toBe(true);
  });

  it('drops unknown, invalid and negative stored lessons instead of inflating progress', () => {
    const valid = VOICE.stages[0].lessons[0];
    localStorage.setItem(
      ACADEMY_PROGRESS_KEY,
      JSON.stringify({
        [valid.id]: Date.now(),
        'voice-s99-l99': Date.now(),
        'not-a-lesson': Date.now(),
        [VOICE.stages[0].lessons[1].id]: -1,
        [VOICE.stages[0].lessons[2].id]: 0,
      })
    );

    const service = create();

    expect(service.completedLessons()).toBe(1);
    expect(service.progress()).toEqual({ [valid.id]: expect.any(Number) });
    expect(service.overallPercent()).toBe(
      Math.round((1 / TOTAL_LESSONS) * 100)
    );
    expect(service.overallPercent()).toBeLessThanOrEqual(100);
  });

  it('counts only known curriculum ids even if progress is set directly', () => {
    const service = create();
    service.progress.set({
      [VOICE.stages[0].lessons[0].id]: Date.now(),
      'ghost-lesson': Date.now(),
    });

    expect(service.completedLessons()).toBe(1);
    expect(service.overallPercent()).toBeLessThanOrEqual(100);
  });

  it('persists a checked lesson across a reload and unchecks it again', () => {
    let service = create();
    const lesson = VOICE.stages[0].lessons[0];

    service.toggleLesson(lesson);
    expect(service.isComplete(lesson)).toBe(true);

    const stored = JSON.parse(localStorage.getItem(ACADEMY_PROGRESS_KEY) ?? '{}');
    expect(stored[lesson.id]).toEqual(expect.any(Number));

    TestBed.resetTestingModule();
    service = create();
    expect(service.isComplete(lesson)).toBe(true);

    service.toggleLesson(lesson);
    expect(service.isComplete(lesson)).toBe(false);
    expect(service.completedLessons()).toBe(0);
  });

  it('ignores lessons that are not part of the curriculum', () => {
    const service = create();
    const bogus = { ...VOICE.stages[0].lessons[0], id: 'invented-lesson' };

    service.toggleLesson(bogus);
    service.completeLesson(bogus);

    expect(service.completedLessons()).toBe(0);
    expect(service.isComplete(bogus)).toBe(false);
    expect(notify.show).not.toHaveBeenCalled();
  });

  it('tracks completion, next lesson and resets one program without touching another', () => {
    const service = create();
    const voiceLesson = VOICE.stages[0].lessons[0];
    const pianoLesson = PIANO.stages[0].lessons[0];

    service.completeLesson(voiceLesson);
    service.completeLesson(voiceLesson);
    service.completeLesson(VOICE.stages[0].lessons[1]);
    service.completeLesson(pianoLesson);

    expect(notify.show).toHaveBeenCalledWith(
      `Lesson complete: ${voiceLesson.title}`,
      'success'
    );
    expect(service.progressFor(VOICE).completed).toBe(2);
    expect(service.progressFor(VOICE).nextLesson?.id).toBe(
      VOICE.stages[0].lessons[2].id
    );

    service.resetProgram('voice');

    expect(service.progressFor(VOICE).completed).toBe(0);
    expect(service.progressFor(PIANO).completed).toBe(1);
    expect(notify.show).toHaveBeenCalledWith(
      'Voice / Vocal Coach progress reset.',
      'info'
    );

    service.resetAll();
    expect(service.completedLessons()).toBe(0);
  });

  it('keeps the selected program visible when filters change, and hides the detail when nothing matches', () => {
    const service = create();
    expect(service.selectedProgram().id).toBe('voice');

    service.setFamilyFilter('keys');
    expect(service.filteredPrograms().every((program) => program.family === 'keys')).toBe(
      true
    );
    expect(service.selectedProgram().family).toBe('keys');
    expect(service.selectedProgramInView()?.id).toBe(service.selectedProgram().id);

    service.setFamilyFilter('all');
    service.setSearch('bellows');
    expect(service.filteredPrograms().map((program) => program.id)).toEqual([
      'accordion',
    ]);
    expect(service.selectedProgram().id).toBe('accordion');
    expect(service.selectedProgramInView()?.id).toBe('accordion');

    service.setSearch('there-is-no-such-program');
    expect(service.filteredPrograms()).toHaveLength(0);
    expect(service.selectedProgramInView()).toBeNull();

    service.clearFilters();
    expect(service.familyFilter()).toBe('all');
    expect(service.search()).toBe('');
    expect(service.selectedProgramInView()).not.toBeNull();
  });

  it('searches the whole curriculum, not just labels and skill names', () => {
    const service = create();

    service.setSearch('ghosted snares');
    const drillMatches = service.filteredPrograms().map((program) => program.id);
    expect(drillMatches).toContain('drum-kit');
    expect(drillMatches).not.toContain('voice');

    service.setSearch('Harmony stacking');
    expect(service.filteredPrograms().map((program) => program.id)).toEqual(['voice']);

    service.setSearch('bellows pressure');
    expect(service.filteredPrograms().map((program) => program.id)).toEqual([
      'accordion',
    ]);
  });

  it('rejects an unknown program selection instead of showing a mismatched detail pane', () => {
    const service = create();

    service.selectProgram('not-a-program');

    expect(service.selectedProgram().id).toBe('voice');
    expect(service.selectedProgramInView()?.id).toBe('voice');
  });

  it('opens practice on the right instrument and view', () => {
    const service = create();

    service.practiceInStudio(VOICE);
    expect(music.addTrack).toHaveBeenCalledWith(
      'Voice / Vocal Coach practice',
      'choir-ensemble',
      'midi'
    );
    expect(router.navigate).toHaveBeenCalledWith(['/studio'], {
      queryParams: { view: 'vocal-suite' },
    });

    service.practiceInStudio(DRUMS);
    expect(music.addTrack).toHaveBeenLastCalledWith(
      'Drum Kit practice',
      DRUMS.studioInstrumentId,
      'drum'
    );
  });

  it('warns instead of navigating when the Studio has no track budget left', () => {
    const service = create();
    music.addTrack.mockReturnValueOnce(null);

    service.practiceInStudio(DRUMS);

    expect(notify.show).toHaveBeenCalledWith(
      'The Studio track limit is reached. Remove a track, then try again.',
      'warning'
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('applies a vocal preset chain and opens the Vocal Suite', () => {
    const service = create();
    const preset = service.vocalPresets[0];

    service.applyVocalChain(preset);

    expect(music.addTrack).toHaveBeenCalledWith(
      `Lead Vocal · ${preset.label}`,
      'whisper-choir',
      'vocal'
    );
    expect(music.setTrackPlugins).toHaveBeenCalledWith('track-1', preset.pluginIds);
    expect(router.navigate).toHaveBeenCalledWith(['/vocal-suite']);
    expect(notify.show).toHaveBeenCalledWith(
      `${preset.label} chain loaded: ${preset.pluginIds.length} plugins inserted. Set pitch correction in the Vocal Suite.`,
      'success'
    );
  });

  it('warns instead of applying a chain when no track can be created', () => {
    const service = create();
    music.addTrack.mockReturnValueOnce(null);

    service.applyVocalChain(service.vocalPresets[0]);

    expect(music.setTrackPlugins).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      'The Studio track limit is reached. Remove a track, then apply the chain.',
      'warning'
    );
  });

  it('maps the declared experience and genre to the Academy recommendation', () => {
    profile.set({
      musicalJourney: { experienceLevel: 'Advanced / professional' },
      primaryGenre: 'Jazz',
    });
    const service = create();

    expect(service.recommendedLevel()).toBe('Advanced');
    expect(service.declaredGenre()).toBe('Jazz');

    profile.set({ musicalJourney: { experienceLevel: 'Some intermediate playing' } });
    expect(service.recommendedLevel()).toBe('Intermediate');

    profile.set(null);
    expect(service.recommendedLevel()).toBe('Foundation');
  });
});
