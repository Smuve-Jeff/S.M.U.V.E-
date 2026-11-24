import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { AiService } from './ai.service';
import { GROWTH_WITHHELD } from './growth-brief.util';
import { STRATEGIC_DECREES } from './ai-knowledge.data';
import {
  MarketingService,
  MonthOverMonthGrowth,
} from './marketing.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import { SmuveCareerDirectorService } from './smuve-career-director.service';
import { SmuveMemoryService } from './smuve-memory.service';
import { ArtistProfileFinetuneService } from './artist-profile-finetune.service';
import { ArtistRelationshipService } from './artist-relationship.service';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { MusicManagerService } from './music-manager.service';
import { NotificationService } from './notification.service';
import { UserStoreService } from './user-store.service';
import { TokenService } from './token.service';
import { LoggingService } from './logging.service';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Instagram skipped Sep–Oct, so its Aug → Nov direction spans a gap. */
const growthRecord: MonthOverMonthGrowth = {
  state: 'no-baseline',
  latestMonth: '2026-11',
  previousMonth: '2026-10',
  newPlatforms: ['Instagram'],
  followers: null,
  monthlyListeners: null,
  trends: [
    {
      platform: 'Instagram',
      points: [
        { month: '2026-08', value: 900 },
        {
          month: '2026-11',
          value: 1100,
          gapBefore: ['2026-09', '2026-10'],
        },
      ],
      delta: 200,
    },
  ],
  recordedOnce: [{ platform: 'Facebook', month: '2026-08' }],
};

/** Six platforms so the brief outgrows the 1,200-character prompt slice. */
const crowdedRecord: MonthOverMonthGrowth = {
  ...growthRecord,
  trends: Array.from({ length: 6 }, (_, index) => ({
    platform: `Platform ${index + 1}`,
    points: [
      { month: '2026-10', value: 1000 },
      { month: '2026-11', value: 1200 },
    ],
    delta: 200,
  })),
  recordedOnce: [],
  newPlatforms: [],
};

describe('AiService growth brief', () => {
  let service: AiService;
  let httpMock: HttpTestingController;

  const configure = (options: {
    security?: Record<string, unknown>;
    growth?: MonthOverMonthGrowth;
    profanity?: boolean;
  } = {}) => {
    const profile = signal({
      ...clone(initialProfile),
      artistName: 'Test Artist',
      settings: {
        ...clone(initialProfile.settings),
        ai: {
          ...clone(initialProfile.settings).ai,
          aiProfanityEnabled: options.profanity ?? true,
        },
        security: {
          shareProfileAnswersWithAi: true,
          hideSensitiveProfileDetails: false,
          ...options.security,
        },
      },
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AiService,
        { provide: UserProfileService, useValue: { profile } },
        {
          provide: MarketingService,
          useValue: { monthOverMonth: () => options.growth ?? growthRecord },
        },
        {
          provide: SmuveCareerDirectorService,
          useValue: {
            currentSurface: () => 'strategy',
            compactDirective: () => 'ROOM LENS BLOCK',
            directiveFor: () => 'ROOM LENS BLOCK',
            surfaceIntel: () => ({}),
          },
        },
        {
          provide: SmuveMemoryService,
          useValue: {
            promptBlock: () => 'CASE FILE BLOCK',
            latestVerdict: () => null,
            openLoops: () => [],
          },
        },
        {
          provide: ArtistProfileFinetuneService,
          useValue: {
            promptBlock: () => 'ARTIST FINE-TUNE BLOCK',
            contextHeading: () => 'ARTIST CONTEXT HEADING',
            profileCalibration: () => null,
          },
        },
        {
          provide: ArtistRelationshipService,
          useValue: { brief: () => 'RELATIONSHIP BLOCK' },
        },
        { provide: ArtistLifecycleService, useValue: {} },
        { provide: MusicManagerService, useValue: {} },
        { provide: NotificationService, useValue: { show: jest.fn() } },
        { provide: UserStoreService, useValue: { user: () => ({ role: 'Artist' }) } },
        {
          provide: TokenService,
          useValue: { jwtToken: () => null, isApiToken: () => false },
        },
        {
          provide: LoggingService,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(AiService);
    httpMock = TestBed.inject(HttpTestingController);
  };

  /** Sends one prompt through the real proxy call and returns it as sent. */
  const sentPrompt = async (): Promise<string> => {
    const pending = service.getAIResponse('how am I doing?');
    const request = httpMock.expectOne((candidate) =>
      candidate.url.includes('/ai/analyze')
    );
    const prompt = String(
      (request.request.body as { prompt?: unknown }).prompt ?? ''
    );
    request.flush({
      text: 'You are flat.',
      meta: { model: 'test-model', attempts: 1, latencyMs: 12 },
    });
    await expect(pending).resolves.toBe('You are flat.');
    httpMock.verify();
    return prompt;
  };

  it('sends the recorded figures, per-platform trends and skipped months to the model', async () => {
    configure();

    const prompt = await sentPrompt();

    expect(prompt).toContain('ARTIST GROWTH RECORD');
    expect(prompt).toContain('BINDING GROWTH RULES');
    expect(prompt).toContain(
      'Instagram: Aug 2026 900 → [no data for Sep–Oct 2026] → Nov 2026 1,100'
    );
    expect(prompt).toContain(
      'RECORDED IN ONE MONTH ONLY (no direction, and not growth): Facebook (Aug 2026).'
    );
    // No percentage is invented for a month with no baseline.
    expect(prompt).not.toMatch(/\d%/);
  });

  it('trims the growth block on a line boundary, never mid-figure', async () => {
    configure({ growth: crowdedRecord });
    const brief = service.growthAdvisorBrief();
    expect(brief.length).toBeGreaterThan(1200);

    const prompt = await sentPrompt();

    const start = prompt.indexOf('ARTIST GROWTH RECORD');
    const end = prompt.indexOf('ROOM LENS BLOCK');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const region = prompt.slice(start, end).trim();

    // The slice dropped data (it outgrew the budget), kept the rules, and ended
    // on a complete platform row rather than half of one.
    expect(region.length).toBeLessThan(brief.length);
    expect(region).toContain('BINDING GROWTH RULES');
    const wholeLines = brief.split('\n');
    // Every line that survived is a whole line of the brief, and the last one
    // is a complete platform row rather than the front half of one.
    region
      .split('\n')
      .filter((line) => line.trim())
      .forEach((line) => expect(wholeLines).toContain(line));
    const lastLine = region.split('\n').pop() ?? '';
    expect(lastLine).toMatch(/^- Platform \d+: .+\)\.$/);
    expect(wholeLines).toContain(lastLine);
  });

  it('withholds every figure until the artist shares profile answers', async () => {
    configure({ security: { shareProfileAnswersWithAi: false } });

    expect(service.growthAdvisorBrief()).toBe(GROWTH_WITHHELD);
    const prompt = await sentPrompt();
    expect(prompt).toContain('ARTIST GROWTH RECORD — withheld');
    expect(prompt).not.toContain('1,100');
    expect(prompt).not.toContain('Instagram: Aug 2026');
  });

  it('serves a decree unfiltered even when the artist mutes model profanity', () => {
    configure({ profanity: false });

    // Model replies honour the mute…
    expect(service.sanitizePersonaText('fuck this mix')).toBe('**** this mix');
    // …but a strategic decree is delivered exactly as filed.
    const decree = service.generateStrategicDecree();
    expect(STRATEGIC_DECREES).toContain(decree);
    expect(decree).not.toMatch(/\*{2,}/);
  });

  it('withholds the record when sensitive profile details are hidden', async () => {
    configure({ security: { hideSensitiveProfileDetails: true } });

    expect(service.growthAdvisorBrief()).toBe(GROWTH_WITHHELD);
    const prompt = await sentPrompt();
    expect(prompt).not.toContain('1,100');
  });
});
