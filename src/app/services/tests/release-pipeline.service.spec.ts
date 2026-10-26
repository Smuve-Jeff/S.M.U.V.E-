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

  it('records the split reference the artist supplies and persists it', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.recordSplitReference('  splits/test-album.pdf  ');

    expect(service.activeRelease()?.splitSheetRef).toBe('splits/test-album.pdf');
    expect(profileServiceSpy.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        knowledgeBase: expect.objectContaining({
          currentRelease: expect.objectContaining({
            splitSheetRef: 'splits/test-album.pdf',
          }),
        }),
      })
    );
  });

  it('ignores a blank split reference instead of clearing the recorded one', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.recordSplitReference('splits/test-album.pdf');

    await service.recordSplitReference('   ');

    expect(service.activeRelease()?.splitSheetRef).toBe('splits/test-album.pdf');
  });

  it('records a PRO and IPI pair on the release credits', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.recordProRegistration('BMI', '0099887766');

    expect(service.activeRelease()?.credits.proName).toBe('BMI');
    expect(service.activeRelease()?.credits.proIpi).toBe('0099887766');
  });

  it('refuses a PRO registration missing either half', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.recordProRegistration('BMI', '0099887766');

    await service.recordProRegistration('ASCAP', '  ');

    expect(service.activeRelease()?.credits.proName).toBe('BMI');
    expect(service.activeRelease()?.credits.proIpi).toBe('0099887766');
  });

  it('updates a track stage without touching the release status', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.addTrack('Track 1');
    const trackId = service.activeRelease()!.tracks[0].id;

    await service.updateTrackStage(trackId, 'instrumental', 'Completed');
    expect(service.activeRelease()?.tracks[0].stages.instrumental).toBe(
      'Completed'
    );
  });

  it('attaches an existing campaign instead of creating one', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.attachCampaign('  camp-42  ');

    expect(service.activeRelease()?.marketingCampaignId).toBe('camp-42');
    expect(marketingServiceSpy.createCampaign).not.toHaveBeenCalled();
    expect(profileServiceSpy.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        knowledgeBase: expect.objectContaining({
          currentRelease: expect.objectContaining({
            marketingCampaignId: 'camp-42',
          }),
        }),
      })
    );
  });

  it('ignores a blank campaign attachment', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.attachCampaign('   ');

    expect(service.activeRelease()?.marketingCampaignId).toBeUndefined();
  });

  it('detaches the campaign reference without deleting the campaign', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.attachCampaign('camp-42');

    await service.detachCampaign();

    expect(service.activeRelease()?.marketingCampaignId).toBeUndefined();
    expect(marketingServiceSpy.createCampaign).not.toHaveBeenCalled();
  });

  it('marks a release live without inventing a campaign and its budget', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.updateStatus('Released');

    expect(service.activeRelease()?.status).toBe('Released');
    expect(marketingServiceSpy.createCampaign).not.toHaveBeenCalled();
  });
});
