import { TestBed } from '@angular/core/testing';
import { CareerPipelineService } from './career-pipeline.service';
import { MarketingService } from './marketing.service';
import { LoggingService } from './logging.service';
import { NotificationService } from './notification.service';
import { ReleaseProject } from '../types/release.types';

class StubMarketing {
  createCampaign = jest.fn().mockResolvedValue({ id: 'cmp-stub' });
}

class StubLogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

class StubNotify {
  show = jest.fn();
}

const TEST_RELEASE: ReleaseProject = {
  id: 'rel-1',
  name: 'Night Code',
  type: 'Single',
  description: 'AI Produce smoke release',
  status: 'Planning',
  tracks: [],
  credits: {
    artistName: 'Smuve Jeff',
    proName: '',
    proIpi: '',
    collaborators: [],
  },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
} as any;

describe('CareerPipelineService · Sprint B4', () => {
  let sut: CareerPipelineService;
  let marketing: StubMarketing;

  beforeEach(() => {
    marketing = new StubMarketing();
    TestBed.configureTestingModule({
      providers: [
        CareerPipelineService,
        { provide: MarketingService, useValue: marketing },
        { provide: LoggingService, useValue: new StubLogger() },
        { provide: NotificationService, useValue: new StubNotify() },
      ],
    });
    sut = TestBed.inject(CareerPipelineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('buildCharter returns a fresh draft with three artifacts', async () => {
    const charter = await sut.buildCharter(
      TEST_RELEASE,
      'Trap',
      'dark',
      'Smuve Jeff'
    );
    expect(charter.status).toBe('draft');
    expect(charter.releaseId).toBe('rel-1');
    expect(charter.metadataDraft.title).toBe('Night Code');
    expect(charter.metadataDraft.primaryGenre).toBe('Trap');
    expect(charter.forecast.monthlyStreamsMid).toBeGreaterThan(0);
    expect(charter.outreach.body.length).toBeGreaterThan(80);
    expect(charter.outreach.subject).toContain('Smuve Jeff');
  });

  it('buildCharter is deterministic — re-running yields the same shape', async () => {
    // Tiny delay so Date.now() advances between charter ids even on fast
    // machines (otherwise same-millisecond runs would collide).
    const a = await sut.buildCharter(TEST_RELEASE, 'Pop', 'pop', 'Smuve Jeff');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = await sut.buildCharter(TEST_RELEASE, 'Pop', 'pop', 'Smuve Jeff');
    expect(a.id).not.toBe(b.id);
    expect(a.forecast.marketTier).toBe(b.forecast.marketTier);
    expect(a.outreach.subject).toBe(b.outreach.subject);
    expect(a.outreach.body).toBe(b.outreach.body);
  });

  it('charters are indexed by releaseId and the most recent is exposed via latestCharter', async () => {
    const a = await sut.buildCharter(TEST_RELEASE, 'Trap', 'dark', 'Smuve Jeff');
    expect(sut.charterFor('rel-1')?.id).toBe(a.id);
    expect(sut.latestCharter()?.id).toBe(a.id);
    expect(sut.charterFor('unknown-release')).toBeNull();
  });

  it('prepareDistributionMetadata fills slots the user will later edit', () => {
    const md = sut.prepareDistributionMetadata(TEST_RELEASE, 'Trap');
    expect(md.title).toBe('Night Code');
    expect(md.type).toBe('Single');
    expect(md.artistName).toBe('Smuve Jeff');
    expect(md.primaryGenre).toBe('Trap');
    expect(md.platforms.length).toBeGreaterThan(0);
    expect(md.explicit).toBe(false);
    expect(md.copyright).toMatch(/Smuve Jeff/);
  });

  it('estimateRevenueForecast tiers trap higher than indie jazz', () => {
    const trap = sut.estimateRevenueForecast(TEST_RELEASE, 'Trap');
    const jazz = sut.estimateRevenueForecast(TEST_RELEASE, 'Jazz');
    expect(trap.monthlyStreamsMid).toBeGreaterThan(jazz.monthlyStreamsMid);
    expect(trap.marketTier === 'mainstream' || trap.marketTier === 'mid').toBe(true);
    expect(jazz.marketTier).toBe('indie');
    expect(trap.notes.length).toBeGreaterThan(0);
  });

  it('draftOutreachPacket CTA targets genre-appropriate programming', () => {
    const trap = sut.draftOutreachPacket(TEST_RELEASE, 'Trap', 'dark', 'Smuve Jeff');
    const lofi = sut.draftOutreachPacket(TEST_RELEASE, 'Lo-Fi', 'chill', 'Smuve Jeff');
    expect(trap.callToAction.toLowerCase()).toContain('hip-hop');
    expect(lofi.callToAction.toLowerCase()).toMatch(/lo-fi|study/);
    expect(trap.targetListSize).toBeGreaterThan(lofi.targetListSize);
    expect(trap.body).toContain('Smuve Jeff');
  });

  it('commitCharter promotes draft → committed and triggers the marketing kickoff', async () => {
    const charter = await sut.buildCharter(TEST_RELEASE, 'Pop', 'chill', 'Smuve Jeff');
    expect(charter.status).toBe('draft');
    await sut.commitCharter(charter.id);
    expect(sut.charterFor('rel-1')?.status).toBe('committed');
    expect(marketing.createCampaign).toHaveBeenCalledTimes(1);
    expect(marketing.createCampaign.mock.calls[0][0]).toMatchObject({
      budget: 250,
      platforms: expect.any(Array),
    });
  });

  it('commitCharter with an unknown id is a safe no-op', async () => {
    await sut.commitCharter('does-not-exist');
    expect(marketing.createCampaign).not.toHaveBeenCalled();
    expect(sut.lastError()).toBe('Charter not found for commit.');
  });

  it('isGenerating returns to false after a build resolves', async () => {
    expect(sut.isGenerating()).toBe(false);
    await sut.buildCharter(TEST_RELEASE, 'Lo-Fi', 'chill', 'Smuve Jeff');
    expect(sut.isGenerating()).toBe(false);
  });
});
