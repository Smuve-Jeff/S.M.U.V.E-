import { TestBed } from '@angular/core/testing';
import { ReleasePipelineService } from '../release-pipeline.service';
import { UserProfileService } from '../user-profile.service';
import { MarketingService } from '../marketing.service';
import { LoggingService } from '../logging.service';
import { signal } from '@angular/core';

describe('ReleasePipelineService', () => {
  let service: ReleasePipelineService;
  let profileServiceSpy: any;
  let marketingServiceSpy: any;

  beforeEach(() => {
    profileServiceSpy = {
      profile: signal({
        artistName: 'Test Artist',
        knowledgeBase: {},
      }),
      updateProfile: jest.fn().mockResolvedValue(undefined),
    };

    marketingServiceSpy = {
      createCampaign: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        ReleasePipelineService,
        { provide: UserProfileService, useValue: profileServiceSpy },
        { provide: MarketingService, useValue: marketingServiceSpy },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(ReleasePipelineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize a release', async () => {
    await service.initializeRelease('Test Album', 'Album');
    expect(service.activeRelease()?.name).toBe('Test Album');
    expect(profileServiceSpy.updateProfile).toHaveBeenCalled();
  });

  it('should add a track', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.addTrack('New Track');
    expect(service.activeRelease()?.tracks.length).toBe(1);
    expect(service.activeRelease()?.tracks[0].title).toBe('New Track');
  });

  it('should update track stage and trigger marketing on release', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.addTrack('Track 1');
    const trackId = service.activeRelease()!.tracks[0].id;

    await service.updateTrackStage(trackId, 'instrumental', 'Completed');
    expect(service.activeRelease()?.tracks[0].stages.instrumental).toBe(
      'Completed'
    );

    await service.updateStatus('Released');
    expect(service.activeRelease()?.status).toBe('Released');
    expect(marketingServiceSpy.createCampaign).toHaveBeenCalled();
  });
});
