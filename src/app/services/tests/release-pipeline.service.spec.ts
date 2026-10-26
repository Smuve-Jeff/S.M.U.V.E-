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

  /** A freshly injected instance, so a test can seed the profile before load. */
  const rebootingWith = (profile: Record<string, unknown>) => {
    profileServiceSpy.profile.set(profile);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ReleasePipelineService,
        { provide: UserProfileService, useValue: profileServiceSpy },
        { provide: MarketingService, useValue: marketingServiceSpy },
        { provide: LoggingService, useValue: { info: jest.fn(), error: jest.fn() } },
      ],
    });
    return TestBed.inject(ReleasePipelineService);
  };

  it('adopts a catalogue split when the release has none', () => {
    const fresh = rebootingWith({
      artistName: 'Test Artist',
      catalog: [{ id: 'w1', title: 'Test Album', splitSheetRef: 'SPLIT-2025-01' }],
      knowledgeBase: {
        currentRelease: {
          id: 'rel-1',
          name: 'test  album',
          type: 'Album',
          description: '',
          status: 'Planning',
          tracks: [],
          credits: { artistName: 'Test Artist', collaborators: ['Rae'] },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    });

    expect(fresh.activeRelease()?.splitSheetRef).toBe('SPLIT-2025-01');
    // Adoption does not claim the split covers anyone; coverage has to be
    // confirmed by recording it against the release.
    expect(fresh.activeRelease()?.splitSheetFor).toBeUndefined();
    expect(profileServiceSpy.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps the release split when the catalogue holds a different reference', () => {
    const fresh = rebootingWith({
      artistName: 'Test Artist',
      catalog: [{ id: 'w1', title: 'Test Album', splitSheetRef: 'SPLIT-OLD' }],
      knowledgeBase: {
        currentRelease: {
          id: 'rel-1',
          name: 'Test Album',
          type: 'Album',
          description: '',
          status: 'Planning',
          tracks: [],
          credits: { artistName: 'Test Artist', collaborators: [] },
          splitSheetRef: 'SPLIT-NEW',
          splitSheetFor: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
    });

    expect(fresh.activeRelease()?.splitSheetRef).toBe('SPLIT-NEW');
  });

  it('links a release to its catalogue work and back', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.linkCatalogWork('  w7  ');
    expect(service.activeRelease()?.catalogWorkId).toBe('w7');

    await service.unlinkCatalogWork();
    expect(service.activeRelease()?.catalogWorkId).toBeUndefined();
  });

  it('ignores a blank catalogue link', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.linkCatalogWork('   ');

    expect(service.activeRelease()?.catalogWorkId).toBeUndefined();
  });

  it('writes a split to the linked work, not to the title match', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [
        { id: 'w1', title: 'Test Album' },
        { id: 'w7', title: 'Something Else Entirely' },
      ],
    });
    await service.initializeRelease('Test Album', 'Album');
    await service.linkCatalogWork('w7');

    await service.recordSplitReference('splits/renamed.pdf');

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog.find((work: any) => work.id === 'w7')).toMatchObject({
      splitSheetRef: 'splits/renamed.pdf',
    });
    expect(
      saved.catalog.find((work: any) => work.id === 'w1').splitSheetRef
    ).toBeUndefined();
  });

  it('mirrors a recorded split onto the matching catalogue entry', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [
        { id: 'w1', title: 'Test Album', isrc: 'US-AAA-25-00001' },
        { id: 'w2', title: 'Other Work' },
      ],
    });
    await service.initializeRelease('test  album', 'Album');

    await service.recordSplitReference('splits/test-album.pdf');

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog.find((work: any) => work.id === 'w1')).toMatchObject({
      splitSheetRef: 'splits/test-album.pdf',
      isrc: 'US-AAA-25-00001',
    });
    expect(
      saved.catalog.find((work: any) => work.id === 'w2').splitSheetRef
    ).toBeUndefined();
  });

  it('does not invent a catalogue entry for a release with no matching work', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [{ id: 'w1', title: 'Other Work' }],
    });
    await service.initializeRelease('Test Album', 'Album');

    await service.recordSplitReference('splits/test-album.pdf');

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog).toHaveLength(1);
    expect(saved.catalog[0]).toMatchObject({ id: 'w1', title: 'Other Work' });
    expect(saved.catalog[0].splitSheetRef).toBeUndefined();
  });

  it('leaves a catalogue split alone when the release records none', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [{ id: 'w1', title: 'Test Album', splitSheetRef: 'SPLIT-2025-01' }],
    });
    await service.initializeRelease('Test Album', 'Album');

    await service.addTrack('Intro');

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog[0].splitSheetRef).toBe('SPLIT-2025-01');
    expect(service.activeRelease()?.splitSheetRef).toBeUndefined();
  });

  it('stamps a recorded split with the collaborators it was confirmed against', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.updateCollaborators(['Blue Nine']);

    await service.recordSplitReference('splits/test-album.pdf');

    expect(service.activeRelease()?.splitSheetFor).toEqual(['Blue Nine']);
  });

  it('updates collaborators without widening the recorded split', async () => {
    await service.initializeRelease('Test Album', 'Album');
    await service.updateCollaborators(['Blue Nine']);
    await service.recordSplitReference('splits/test-album.pdf');

    await service.updateCollaborators(['Blue Nine', ' Weiss ', '  ', 'blue nine']);

    expect(service.activeRelease()?.credits.collaborators).toEqual([
      'Blue Nine',
      'Weiss',
    ]);
    expect(service.activeRelease()?.splitSheetRef).toBe('splits/test-album.pdf');
    expect(service.activeRelease()?.splitSheetFor).toEqual(['Blue Nine']);
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
