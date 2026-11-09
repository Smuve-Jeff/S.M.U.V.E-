import { TestBed } from '@angular/core/testing';
import {
  assessJourney,
  deterministicReport,
  parseCoachJson,
  DirectorCoachService,
  type CoachState,
} from './director-coach.service';
import { AiService } from './ai.service';
import { SmuveMemoryService } from './smuve-memory.service';

const state = (overrides: Partial<CoachState> = {}): CoachState => ({
  hasPlan: false,
  shotCount: 0,
  stagedShots: 0,
  styledShots: 0,
  animatedShots: 0,
  hasOverlay: false,
  hasPhoto: false,
  laneClipCount: 0,
  hasTalkingHead: false,
  ...overrides,
});

describe('assessJourney', () => {
  it('starts at the audio bed when nothing is loaded', () => {
    const steps = assessJourney(state());
    expect(steps[0]).toMatchObject({ id: 'audio', state: 'active' });
    expect(steps.filter((step) => step.state === 'done')).toHaveLength(0);
    expect(steps.filter((step) => step.state === 'upcoming')).toHaveLength(5);
  });

  it('walks the ladder as each step lands', () => {
    const steps = assessJourney(
      state({
        hasOverlay: true,
        hasPlan: true,
        planTitle: 'Night Drive',
        shotCount: 3,
        stagedShots: 3,
        styledShots: 1,
        animatedShots: 0,
      }),
    );
    expect(steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'done',
      'active',
      'upcoming',
      'upcoming',
    ]);
    const style = steps.find((step) => step.id === 'style');
    expect(style?.hint).toContain('2 of 3');
  });

  it('marks every step done on a finished cut', () => {
    const steps = assessJourney(
      state({
        hasOverlay: true,
        hasPlan: true,
        shotCount: 2,
        stagedShots: 2,
        styledShots: 2,
        animatedShots: 2,
        hasPhoto: true,
        hasTalkingHead: true,
        laneClipCount: 4,
      }),
    );
    expect(steps.every((step) => step.state === 'done')).toBe(true);
  });

  it('does not vacuously clear a shotless plan', () => {
    const steps = assessJourney(
      state({ hasOverlay: true, hasPlan: true, shotCount: 0 }),
    );
    // Nothing staged and nothing styled: staging is the honest next move,
    // and an empty plan must not read as "every shot styled".
    expect(steps.find((step) => step.id === 'stage')?.state).toBe('active');
    expect(steps.find((step) => step.id === 'style')?.state).toBe('upcoming');
  });
});

describe('deterministicReport', () => {
  it('teaches the active step in the coach voice', () => {
    const report = deterministicReport(state());
    expect(report.headline).toBe('Load the audio bed');
    expect(report.narration).toContain('audio bed');
    expect(report.steps).toHaveLength(6);
  });

  it('points at export on a finished cut', () => {
    const report = deterministicReport(
      state({
        hasOverlay: true,
        hasPlan: true,
        shotCount: 1,
        stagedShots: 1,
        styledShots: 1,
        animatedShots: 1,
        hasPhoto: true,
        hasTalkingHead: true,
      }),
    );
    expect(report.headline).toContain('export');
    expect(report.nextAction).toContain('Export');
  });

  it('does not stall on the optional performance step without a still', () => {
    const report = deterministicReport(
      state({
        hasOverlay: true,
        hasPlan: true,
        shotCount: 1,
        stagedShots: 1,
        styledShots: 1,
        animatedShots: 1,
      }),
    );
    expect(report.nextAction).toContain('Export');
  });
});

describe('parseCoachJson', () => {
  it('pulls the object out of surrounding prose', () => {
    const parsed = parseCoachJson(
      'Sure thing. {"headline":"H","narration":"N","nextAction":"A"} done.',
    );
    expect(parsed).toEqual({ headline: 'H', narration: 'N', nextAction: 'A' });
  });

  it('rejects prose and empty objects', () => {
    expect(parseCoachJson('no facts here')).toBeNull();
    expect(parseCoachJson('{"other":1}')).toBeNull();
  });

  it('caps field lengths', () => {
    const parsed = parseCoachJson(
      JSON.stringify({ narration: 'x'.repeat(5000) }),
    );
    expect(parsed?.narration).toHaveLength(700);
  });
});

describe('DirectorCoachService', () => {
  const setup = (answer: string | Error) => {
    const ai = {
      getAIResponse: jest.fn().mockImplementation(() => {
        if (answer instanceof Error) return Promise.reject(answer);
        return Promise.resolve(answer);
      }),
    };
    const memory = { captureTurn: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AiService, useValue: ai },
        { provide: SmuveMemoryService, useValue: memory },
      ],
    });
    return { service: TestBed.inject(DirectorCoachService), ai, memory };
  };

  it('narrates from the facts and files the line to the case memory', async () => {
    const { service, ai, memory } = setup(
      '{"headline":"H","narration":"N","nextAction":"A"}',
    );
    const report = await service.coach(
      state({
        hasOverlay: true,
        overlayName: 'bed.wav',
        overlayDurationSeconds: 187,
        hasPlan: true,
        planTitle: 'Night Drive',
        shotCount: 3,
        stagedShots: 3,
      }),
      'What is the next move?',
    );

    expect(report).toMatchObject({
      headline: 'H',
      narration: 'N',
      nextAction: 'A',
    });
    const prompt = ai.getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain('Night Drive');
    expect(prompt).toContain('3 shots');
    expect(prompt).toContain('187');
    expect(memory.captureTurn).toHaveBeenCalledWith(
      'video',
      'Image & Video Lab',
      'What is the next move?',
      'N',
    );
  });

  it('teaches the ladder when the link is down', async () => {
    const { service, memory } = setup(new Error('severed'));
    const report = await service.coach(state());
    expect(report.headline).toBe('Load the audio bed');
    expect(report.steps).toHaveLength(6);
    expect(memory.captureTurn).toHaveBeenCalled();
  });

  it('falls back when the model answers in prose', async () => {
    const { service } = setup('Darling, the edit breathes nicely.');
    const report = await service.coach(
      state({ hasOverlay: true, hasPlan: true, shotCount: 2, stagedShots: 2 }),
    );
    expect(report.headline).toBe('Style the shots');
    expect(report.narration).toContain('2 of 2');
  });
});
