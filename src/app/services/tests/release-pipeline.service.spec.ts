import { TestBed } from '@angular/core/testing';
import {
  LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
  PLANNED_DATE_RECONCILIATION_HISTORY_LIMIT,
  PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
  ReleasePipelineService,
} from '../release-pipeline.service';
import { UserProfileService } from '../user-profile.service';
import { MarketingService } from '../marketing.service';
import { LoggingService } from '../logging.service';
import { signal } from '@angular/core';

describe('ReleasePipelineService', () => {
  let service: ReleasePipelineService;
  let profileServiceSpy: any;
  let marketingServiceSpy: any;

  beforeEach(() => {
    localStorage.removeItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY);
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

  it('records a planned release date and persists it', async () => {
    await service.initializeRelease('Test Album', 'Album');

    await service.setPlannedReleaseDate(' 2026-12-01 ');

    expect(service.activeRelease()?.plannedReleaseDate).toBe('2026-12-01');
    expect(profileServiceSpy.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        knowledgeBase: expect.objectContaining({
          currentRelease: expect.objectContaining({
            plannedReleaseDate: '2026-12-01',
          }),
        }),
      })
    );
  });

  it('clears a planned release date without touching the catalogue date', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [{ id: 'w1', title: 'Test Album', releaseDate: '2026-12-01' }],
    });
    await service.initializeRelease('Test Album', 'Album');
    await service.setPlannedReleaseDate('2026-11-15');

    await service.setPlannedReleaseDate('   ');

    expect(service.activeRelease()?.plannedReleaseDate).toBeUndefined();
    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog[0].releaseDate).toBe('2026-12-01');
  });

  it('copies the planned date onto the matching catalogue work', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [
        { id: 'w1', title: 'Test Album', isrc: 'US-AAA-25-00001' },
        { id: 'w2', title: 'Other Work' },
      ],
    });
    await service.initializeRelease('Test Album', 'Album');
    await service.setPlannedReleaseDate('2026-12-01');

    const result = await service.copyPlannedDateToCatalogue();

    expect(result).toEqual({ workId: 'w1', date: '2026-12-01' });
    expect(service.lastPlannedDateReconciliation()).toMatchObject({
      releaseId: service.activeRelease()!.id,
      workId: 'w1',
      workTitle: 'Test Album',
      plannedDate: '2026-12-01',
      previousCatalogueDate: undefined,
    });
    expect(
      localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)
    ).toContain('"plannedDate":"2026-12-01"');
    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog.find((work: any) => work.id === 'w1')).toMatchObject({
      releaseDate: '2026-12-01',
      isrc: 'US-AAA-25-00001',
    });
    expect(saved.catalog.find((work: any) => work.id === 'w2')).toEqual({
      id: 'w2',
      title: 'Other Work',
    });
  });

  it('writes nothing when there is no planned date to copy', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [{ id: 'w1', title: 'Test Album' }],
    });
    await service.initializeRelease('Test Album', 'Album');
    const writes = profileServiceSpy.updateProfile.mock.calls.length;

    expect(await service.copyPlannedDateToCatalogue()).toBeNull();
    expect(profileServiceSpy.updateProfile.mock.calls.length).toBe(writes);
  });

  it('writes nothing when no catalogue work matches', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [{ id: 'w1', title: 'Other Work' }],
    });
    await service.initializeRelease('Test Album', 'Album');
    await service.setPlannedReleaseDate('2026-12-01');
    const writes = profileServiceSpy.updateProfile.mock.calls.length;

    expect(await service.copyPlannedDateToCatalogue()).toBeNull();
    expect(profileServiceSpy.updateProfile.mock.calls.length).toBe(writes);
  });

  const reconciledWith = async (catalogueDate?: string) => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [
        {
          id: 'w1',
          title: 'Test Album',
          ...(catalogueDate ? { releaseDate: catalogueDate } : {}),
        },
      ],
    });
    await service.initializeRelease('Test Album', 'Album');
    await service.setPlannedReleaseDate('2026-12-01');
    await service.copyPlannedDateToCatalogue();
    // The real profile service updates its signal; mirror that for the undo.
    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    profileServiceSpy.profile.set({
      ...saved,
      knowledgeBase: {
        ...saved.knowledgeBase,
        currentRelease: service.activeRelease(),
      },
    });
  };

  it('restores the catalogue date the last reconciliation overwrote', async () => {
    await reconciledWith('2025-01-01');

    expect(await service.undoPlannedDateReconciliation()).toBe('restored');

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog.find((work: any) => work.id === 'w1')).toMatchObject({
      id: 'w1',
      title: 'Test Album',
      releaseDate: '2025-01-01',
    });
    expect(service.lastPlannedDateReconciliation()).toBeNull();
    const history = JSON.parse(
      localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)!
    );
    expect(history).toHaveLength(1);
    expect(history[0].restoredAt).toBeTruthy();
  });

  it('removes the catalogue date when it was unrecorded before reconciling', async () => {
    await reconciledWith();

    expect(await service.undoPlannedDateReconciliation()).toBe('restored');

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    const work = saved.catalog.find((entry: any) => entry.id === 'w1');
    expect('releaseDate' in work).toBe(false);
  });

  it('refuses to undo after the catalogue date changed again', async () => {
    await reconciledWith('2025-01-01');
    const current = profileServiceSpy.profile();
    profileServiceSpy.profile.set({
      ...current,
      catalog: current.catalog.map((work: any) =>
        work.id === 'w1' ? { ...work, releaseDate: '2027-01-01' } : work
      ),
    });
    const writes = profileServiceSpy.updateProfile.mock.calls.length;

    expect(await service.undoPlannedDateReconciliation()).toBe('date-changed');
    expect(profileServiceSpy.updateProfile.mock.calls.length).toBe(writes);
    expect(service.lastPlannedDateReconciliation()).toBeNull();
  });

  it('has nothing to undo when no reconciliation was recorded', async () => {
    expect(await service.undoPlannedDateReconciliation()).toBe(
      'no-reconciliation'
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

  it('restores the last reconciliation after a service reload', async () => {
    await reconciledWith('2025-01-01');
    expect(
      localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)
    ).toContain('"plannedDate":"2026-12-01"');

    const fresh = rebootingWith(profileServiceSpy.profile());

    expect(fresh.lastPlannedDateReconciliation()).toMatchObject({
      releaseId: service.activeRelease()!.id,
      workId: 'w1',
      plannedDate: '2026-12-01',
      previousCatalogueDate: '2025-01-01',
    });
    expect(await fresh.undoPlannedDateReconciliation()).toBe('restored');
    expect(fresh.lastPlannedDateReconciliation()).toBeNull();
  });

  it('keeps timestamped entries and restores them in sequence', async () => {
    await reconciledWith('2025-01-01');
    const first = service.reconciliationHistory()[0];
    expect(first.appliedAt).toBeTruthy();

    await service.setPlannedReleaseDate('2027-02-01');
    await service.copyPlannedDateToCatalogue();
    const secondSaved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    profileServiceSpy.profile.set({
      ...secondSaved,
      knowledgeBase: {
        ...secondSaved.knowledgeBase,
        currentRelease: service.activeRelease(),
      },
    });

    const [latest, earliest] = service.reconciliationHistory();
    expect(latest).toMatchObject({
      plannedDate: '2027-02-01',
      previousCatalogueDate: '2026-12-01',
    });
    expect(earliest).toMatchObject({
      id: first.id,
      plannedDate: '2026-12-01',
      previousCatalogueDate: '2025-01-01',
    });
    expect(Date.parse(latest.appliedAt!)).toBeGreaterThanOrEqual(
      Date.parse(earliest.appliedAt!)
    );

    expect(await service.restoreReconciliation(latest.id)).toBe('restored');
    const restoredSaved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    profileServiceSpy.profile.set({
      ...restoredSaved,
      knowledgeBase: {
        ...restoredSaved.knowledgeBase,
        currentRelease: service.activeRelease(),
      },
    });
    expect(service.reconciliationHistory()[0].restoredAt).toBeTruthy();
    expect(service.lastPlannedDateReconciliation()?.id).toBe(earliest.id);

    expect(await service.restoreReconciliation(earliest.id)).toBe('restored');
    expect(service.lastPlannedDateReconciliation()).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)!)
    ).toHaveLength(2);
  });

  it('clears only the active release history without writing catalogue data', async () => {
    await reconciledWith('2025-01-01');
    service.reconciliationHistory.update((history) => [
      ...history,
      {
        id: 'other-release',
        releaseId: 'rel-other',
        workId: 'w2',
        workTitle: 'Other Work',
        plannedDate: '2027-03-01',
        appliedAt: '2026-11-06T10:00:00.000Z',
      },
    ]);
    const writes = profileServiceSpy.updateProfile.mock.calls.length;
    const profileBefore = profileServiceSpy.profile();

    expect(service.clearPlannedDateReconciliationHistory()).toBe(1);

    expect(profileServiceSpy.updateProfile.mock.calls.length).toBe(writes);
    expect(profileServiceSpy.profile()).toBe(profileBefore);
    expect(service.reconciliationHistory()).toHaveLength(1);
    expect(service.reconciliationHistory()[0].id).toBe('other-release');
    expect(
      JSON.parse(localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)!)
    ).toHaveLength(1);
    expect(service.clearPlannedDateReconciliationHistory()).toBe(0);
  });

  it('removes the browser history key when the active release was the only history', async () => {
    await reconciledWith('2025-01-01');

    expect(service.clearPlannedDateReconciliationHistory()).toBe(1);

    expect(service.reconciliationHistory()).toEqual([]);
    expect(
      localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)
    ).toBeNull();
  });

  it('migrates the old single reconciliation without inventing a timestamp', () => {
    localStorage.setItem(
      LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
      JSON.stringify({
        releaseId: 'rel-1',
        workId: 'w1',
        workTitle: 'Test Album',
        plannedDate: '2026-12-01',
        previousCatalogueDate: '2025-01-01',
      })
    );

    const fresh = rebootingWith(profileServiceSpy.profile());

    expect(fresh.reconciliationHistory()).toHaveLength(1);
    expect(fresh.reconciliationHistory()[0]).toMatchObject({
      id: expect.stringContaining('legacy-'),
      releaseId: 'rel-1',
      plannedDate: '2026-12-01',
      previousCatalogueDate: '2025-01-01',
    });
    expect(fresh.reconciliationHistory()[0].appliedAt).toBeUndefined();
    expect(
      localStorage.getItem(LEGACY_PLANNED_DATE_RECONCILIATION_STORAGE_KEY)
    ).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY)!)
    ).toHaveLength(1);
  });

  it('keeps only the most recent entries in the browser history', () => {
    const seeded = Array.from(
      { length: PLANNED_DATE_RECONCILIATION_HISTORY_LIMIT + 2 },
      (_, index) => ({
        id: `seed-${index}`,
        releaseId: 'rel-1',
        workId: 'w1',
        workTitle: 'Test Album',
        plannedDate: '2026-12-01',
        appliedAt: new Date(2026, 0, index + 1).toISOString(),
      })
    );
    localStorage.setItem(
      PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
      JSON.stringify(seeded)
    );

    const fresh = rebootingWith(profileServiceSpy.profile());

    expect(fresh.reconciliationHistory()).toHaveLength(
      PLANNED_DATE_RECONCILIATION_HISTORY_LIMIT
    );
    expect(fresh.reconciliationHistory()[0].id).toBe('seed-0');
  });

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

  it('creates a catalogue work from what the release records and links it', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [],
    });
    await service.initializeRelease('Test Album', 'Album');
    await service.recordSplitReference('splits/test-album.pdf');

    const result = await service.createCatalogWorkFromRelease();

    expect(result?.created).toBe(true);
    expect(service.activeRelease()?.catalogWorkId).toBe(result!.workId);

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    const work = saved.catalog.find((entry: any) => entry.id === result!.workId);
    expect(work).toMatchObject({
      title: 'Test Album',
      artist: 'Test Artist',
      releaseType: 'Album',
      splitSheetRef: 'splits/test-album.pdf',
    });
    // Nothing the release does not record is filled in.
    expect(work.isrc).toBeUndefined();
    expect(work.upc).toBeUndefined();
    expect(work.distributor).toBeUndefined();
    expect(work.releaseDate).toBeUndefined();
    expect(saved.knowledgeBase.currentRelease.catalogWorkId).toBe(
      result!.workId
    );
  });

  it('links the existing work instead of creating a duplicate', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [{ id: 'w-9', title: 'Test Album' }],
    });
    await service.initializeRelease('test album', 'Album');

    const result = await service.createCatalogWorkFromRelease();

    expect(result).toEqual({ workId: 'w-9', created: false });
    expect(service.activeRelease()?.catalogWorkId).toBe('w-9');
    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog).toHaveLength(1);
  });

  it('records delivery identifiers onto the matching catalogue work', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [
        { id: 'w1', title: 'Test Album', isrc: 'OLD-ISRC' },
        { id: 'w2', title: 'Other Work' },
      ],
    });
    await service.initializeRelease('Test Album', 'Album');

    const result = await service.recordDeliveryMetadata({
      isrc: '  US-AAA-25-00009  ',
      upc: '00123456789012',
      releaseDate: '2026-03-01',
      distributor: 'DistroKid',
      platforms: ['Spotify', ' Apple Music '],
    });

    expect(result?.recorded).toEqual([
      'ISRC',
      'UPC',
      'release date',
      'distributor',
      'platforms',
    ]);
    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog.find((work: any) => work.id === 'w1')).toMatchObject({
      isrc: 'US-AAA-25-00009',
      upc: '00123456789012',
      releaseDate: '2026-03-01',
      distributor: 'DistroKid',
      platforms: ['Spotify', 'Apple Music'],
    });
    expect(saved.catalog.find((work: any) => work.id === 'w2')).toEqual({
      id: 'w2',
      title: 'Other Work',
    });
    expect(service.activeRelease()?.catalogWorkId).toBe('w1');
  });

  it('creates the work and records the identifiers in the same write', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [],
    });
    await service.initializeRelease('Test Album', 'Album');

    const result = await service.recordDeliveryMetadata({ isrc: 'US-AAA-25-00009' });

    const saved = profileServiceSpy.updateProfile.mock.calls.at(-1)![0];
    expect(saved.catalog).toHaveLength(1);
    expect(saved.catalog[0]).toMatchObject({
      title: 'Test Album',
      isrc: 'US-AAA-25-00009',
      artist: 'Test Artist',
    });
    // Nothing the artist did not state is filled in.
    expect(saved.catalog[0].upc).toBeUndefined();
    expect(saved.catalog[0].distributor).toBeUndefined();
    expect(service.activeRelease()?.catalogWorkId).toBe(result?.workId);
    expect(profileServiceSpy.updateProfile).toHaveBeenCalledTimes(2);
  });

  it('leaves recorded values alone when a field is submitted blank', async () => {
    profileServiceSpy.profile.set({
      artistName: 'Test Artist',
      knowledgeBase: {},
      catalog: [
        { id: 'w1', title: 'Test Album', upc: '00123456789012', distributor: 'DistroKid' },
      ],
    });
    await service.initializeRelease('Test Album', 'Album');
    const writesBefore = profileServiceSpy.updateProfile.mock.calls.length;

    const result = await service.recordDeliveryMetadata({
      isrc: '   ',
      distributor: '',
      platforms: [],
    });

    expect(result?.recorded).toEqual([]);
    // A save that recorded nothing writes nothing.
    expect(profileServiceSpy.updateProfile.mock.calls.length).toBe(writesBefore);
  });

  it('returns nothing to create without an active release', async () => {
    expect(await service.createCatalogWorkFromRelease()).toBeNull();
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
