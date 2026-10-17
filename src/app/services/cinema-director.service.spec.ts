import { TestBed } from '@angular/core/testing';
import { AiService } from './ai.service';
import { CinemaDirectorService } from './cinema-director.service';
import { LoggingService } from './logging.service';

describe('CinemaDirectorService', () => {
  let ai: { getAIResponse: jest.Mock };

  const createService = (response = '') => {
    ai = { getAIResponse: jest.fn().mockResolvedValue(response) };
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
});
