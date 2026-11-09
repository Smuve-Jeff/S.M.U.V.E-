import { TestBed } from '@angular/core/testing';
import { AiService } from './ai.service';
import { CinemaDirectorService } from './cinema-director.service';
import { LoggingService } from './logging.service';

describe('CinemaDirectorService', () => {
  let ai: {
    getAIResponse: jest.Mock;
    generateImage: jest.Mock;
    generateShotVideo: jest.Mock;
    isFailureNotice: jest.Mock;
    lastAiCall: jest.Mock;
  };

  const createService = (response = '', failureNotice = false) => {
    ai = {
      getAIResponse: jest.fn().mockResolvedValue(response),
      generateImage: jest.fn().mockResolvedValue('https://cdn.example.test/still.png'),
      generateShotVideo: jest
        .fn()
        .mockResolvedValue({ url: 'https://cdn.example.test/shot.mp4', duration: 5 }),
      isFailureNotice: jest.fn().mockReturnValue(failureNotice),
      lastAiCall: jest.fn(() => null),
    };
    TestBed.configureTestingModule({
      providers: [
        CinemaDirectorService,
        { provide: AiService, useValue: ai },
        { provide: LoggingService, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    });
    return TestBed.inject(CinemaDirectorService);
  };

  const request = {
    brief: 'A night-drive performance cut',
    mode: 'music' as const,
    bpm: 120,
    durationSeconds: 10,
    existingClipCount: 1,
    existingTimeline: [
      { name: 'Hero take', startTime: 0, duration: 4, type: 'video', source: 'camera' },
    ],
    existingMarkers: [{ label: 'Hook', time: 4, kind: 'section' as const }],
  };

  beforeEach(() => localStorage.clear());

  it('includes existing coverage and markers in the AI prompt', () => {
    const service = createService();

    const prompt = service.buildPrompt(request);

    expect(prompt).toContain('Hero take [0-4s, camera]');
    expect(prompt).toContain('Hook@4s');
    expect(prompt).toContain('Existing footage on the timeline: 1 clips.');
  });

  it('falls back locally when the AI link returns no usable plan', async () => {
    const service = createService('Strategic Link Severed. Offline processing active.');

    const plan = await service.generateShotPlan(request);

    expect(plan.origin).toBe('local');
    expect(plan.shots.length).toBeGreaterThan(0);
    expect(service.isPlanning()).toBe(false);
  });

  it('opens the next session on the plan the last one cut', async () => {
    const first = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        editorial: ['Open on the dashboard.'],
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'establishing', bars: 4 }],
      })
    );
    await first.generateShotPlan(request);

    TestBed.resetTestingModule();
    const second = createService();

    expect(second.plan()?.title).toBe('Night Drive');
    expect(second.plan()?.editorial).toEqual(['Open on the dashboard.']);
    expect(second.brief()).toBe('A night-drive performance cut');
    expect(second.plannerNote()).toContain('restored');
  });

  it('carries the answering call into the stored plan', async () => {
    const first = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    ai.lastAiCall.mockReturnValue({
      model: 'gemini-2.5-flash',
      attempts: 2,
      latencyMs: 1400,
      at: 1,
    });
    await first.generateShotPlan(request);

    TestBed.resetTestingModule();
    const second = createService();

    expect(second.plan()?.call).toEqual({
      model: 'gemini-2.5-flash',
      attempts: 2,
      latencyMs: 1400,
    });
  });

  it('drops a stored call that is not shaped like one', () => {
    localStorage.setItem(
      'smuve_cinema_director_plan',
      JSON.stringify({
        brief: 'Night drive',
        plan: {
          title: 'Night Drive',
          logline: 'A headlight-lit cut.',
          shots: [
            {
              index: 1,
              title: 'Dashboard',
              description: 'Wide',
              size: 'wide',
              bars: 4,
              startTime: 0,
              durationSeconds: 8,
              section: 'Feature',
            },
          ],
          origin: 'smuve',
          call: { model: 'gemini-2.5-flash', latencyMs: 'fast' },
        },
      })
    );

    const service = createService();

    expect(service.plan()?.title).toBe('Night Drive');
    expect(service.plan()?.call).toBeUndefined();
  });

  it('forgets the stored plan when the shot list is cleared', async () => {
    const first = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    await first.generateShotPlan(request);
    first.clearPlan();

    TestBed.resetTestingModule();
    const second = createService();

    expect(second.plan()).toBeNull();
    expect(localStorage.getItem('smuve_cinema_director_plan')).toBeNull();
    expect(second.plannerNote()).toContain('stands ready');
  });

  it('ignores a corrupted stored plan instead of crashing the console', () => {
    localStorage.setItem('smuve_cinema_director_plan', '{"plan":');

    const service = createService();

    expect(service.plan()).toBeNull();
  });

  it('names the provider limit instead of blaming the connection', async () => {
    const service = createService(
      'S.M.U.V.E is being rate limited by its model provider. Nothing in this session was lost.',
      true
    );

    const plan = await service.generateShotPlan(request);

    expect(plan.origin).toBe('local');
    expect(service.plannerNote()).toContain('rate limited');
    expect(service.plannerNote()).not.toContain('offline');
  });

  it('separates a model that ignored the schema from a dead link', async () => {
    const service = createService('Sure! Here is a lovely plan, in prose.');

    const plan = await service.generateShotPlan(request);

    expect(plan.origin).toBe('local');
    expect(service.plannerNote()).toContain('not with a shot list');
    expect(service.plannerNote()).not.toContain('offline');
  });

  it('only calls the link offline when the model answered nothing at all', async () => {
    const service = createService('');

    await service.generateShotPlan(request);

    expect(service.plannerNote()).toContain('offline');
  });

  it('keeps an AI plan inside the requested runtime', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Overlong Cut',
        logline: 'A deliberately oversized plan',
        shots: [
          { title: 'First', description: 'One', size: 'wide', bars: 64 },
          { title: 'Second', description: 'Two', size: 'close', bars: 64 },
        ],
      })
    );

    const plan = await service.generateShotPlan(request);
    const end = plan.shots.at(-1)!.startTime + plan.shots.at(-1)!.durationSeconds;

    expect(end).toBeLessThanOrEqual(request.durationSeconds);
    expect(plan.shots).toHaveLength(1);
  });

  it('never lets a local plan exceed a short timeline', () => {
    const service = createService();

    const plan = service.buildLocalPlan('Short cut', request);
    const end = plan.shots.at(-1)!.startTime + plan.shots.at(-1)!.durationSeconds;

    expect(end).toBeLessThanOrEqual(request.durationSeconds);
  });

  it('styles one planned shot with a concept still', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);
    const shot = plan.shots[0];

    const url = await service.generateShotConcept(shot);

    expect(url).toBe('https://cdn.example.test/still.png');
    expect(ai.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('Dashboard')
    );
    expect(ai.generateImage).toHaveBeenCalledWith(expect.stringContaining('Wide'));
    expect(service.plan()?.shots[0].conceptImageUrl).toBe(
      'https://cdn.example.test/still.png'
    );
    expect(service.shotMediaBusy()).toBeNull();
  });

  it('persists a styled shot into the stored plan', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);
    await service.generateShotConcept(plan.shots[0]);

    const stored = JSON.parse(
      localStorage.getItem('smuve_cinema_director_plan') ?? ''
    );
    expect(stored.plan.shots[0].conceptImageUrl).toBe(
      'https://cdn.example.test/still.png'
    );
  });

  it('animates a styled shot into motion', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);
    const shot = plan.shots[0];
    await service.generateShotConcept(shot);

    const result = await service.animateShot(shot);

    expect(result.url).toBe('https://cdn.example.test/shot.mp4');
    expect(ai.generateShotVideo).toHaveBeenCalledWith(
      'https://cdn.example.test/still.png',
      expect.stringContaining('Dashboard'),
      shot.durationSeconds
    );
    expect(service.plan()?.shots[0].videoUrl).toBe(
      'https://cdn.example.test/shot.mp4'
    );
  });

  it('refuses to animate a shot that has no still', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);

    await expect(service.animateShot(plan.shots[0])).rejects.toThrow(/still/);
    expect(ai.generateShotVideo).not.toHaveBeenCalled();
  });

  it('streams one shot at a time instead of the whole list', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);
    service.shotMediaBusy.set(1);

    await expect(service.generateShotConcept(plan.shots[0])).rejects.toThrow(
      /already/
    );
    expect(ai.generateImage).not.toHaveBeenCalled();
  });

  it('frames a concept still through the active camera angle', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);

    await service.generateShotConcept(plan.shots[0], {
      cameraAngle: 'Rear camera',
    });

    expect(ai.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('Camera angle: Rear camera')
    );
  });

  it('frames a shot animation through the active camera angle', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [{ title: 'Dashboard', description: 'Wide', size: 'wide', bars: 4 }],
      })
    );
    const plan = await service.generateShotPlan(request);
    const shot = plan.shots[0];
    await service.generateShotConcept(shot);

    await service.animateShot(shot, { cameraAngle: 'Rear camera' });

    expect(ai.generateShotVideo).toHaveBeenCalledWith(
      'https://cdn.example.test/still.png',
      expect.stringContaining('Camera angle: Rear camera'),
      shot.durationSeconds
    );
  });

  it('uses safe defaults for invalid tempo and keeps a sub-frame runtime bounded', () => {
    const service = createService();

    const plan = service.buildLocalPlan('Micro cut', {
      ...request,
      bpm: Number.NaN,
      durationSeconds: 0.01,
    });

    expect(plan.shots).toHaveLength(1);
    expect(plan.shots[0].startTime + plan.shots[0].durationSeconds).toBeLessThanOrEqual(0.01);
    expect(plan.editorial[0]).toContain('120.00 BPM');
  });

  it('reads section ranges off the shot plan so effects follow the edit', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Night Drive',
        logline: 'A headlight-lit performance cut.',
        shots: [
          { title: 'Open', description: 'Wide', size: 'wide', bars: 2 },
          { title: 'Hook', description: 'Close', size: 'close', bars: 2 },
        ],
      })
    );
    const longRequest = { ...request, durationSeconds: 40 };
    await service.generateShotPlan(longRequest);

    const ranges = service.currentSectionRanges(longRequest);

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0].startTime).toBe(0);
    expect(ranges[0].section).toBeTruthy();
    expect(ranges.every((range) => range.endTime > range.startTime)).toBe(true);
  });

  it('directs a same-family section plan locally when the link is down', async () => {
    const service = createService('');

    const plan = await service.directSectionVfx({
      ...request,
      brief: 'a cartoon chase',
      style: 'music-video',
    });

    expect(plan.style).toBe('cartoon');
    expect(plan.origin).toBe('preset');
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.sections.every((section) => section.recipe.style === 'cartoon')).toBe(
      true
    );
    expect(service.isPlanningVfx()).toBe(false);
    expect(service.sectionVfxPlan()).not.toBeNull();
    expect(service.sectionVfxNote()).toContain('locally');
  });

  it('takes a directed section assignment from the model', async () => {
    const service = createService(
      JSON.stringify({
        title: 'Directed FX',
        sections: [{ section: 'Intro', preset: 'comic-impact', intensity: 0.8 }],
      })
    );

    const plan = await service.directSectionVfx({
      ...request,
      brief: 'a cartoon skit',
      style: 'cartoon',
    });

    expect(plan.origin).toBe('ai');
    expect(plan.title).toBe('Directed FX');
    expect(plan.sections.some((section) => section.recipe.name === 'Comic Impact')).toBe(
      true
    );
  });
});
