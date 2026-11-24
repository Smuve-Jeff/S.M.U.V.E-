import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
  ReleasePipelineService,
} from './release-pipeline.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';

const release = {
  id: 'rel-1',
  name: 'Night Drive',
  plannedReleaseDate: '2026-12-01',
};

const profile = {
  id: 'artist-1',
  knowledgeBase: { currentRelease: release },
  catalog: [{ id: 'work-1', title: 'Night Drive', releaseDate: '2026-11-01' }],
};

describe('ReleasePipelineService with an unreadable reconciliation history', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  const createService = () => {
    const updateProfile = jest.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        ReleasePipelineService,
        {
          provide: UserProfileService,
          useValue: { profile: signal(profile), updateProfile },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    return { service: TestBed.inject(ReleasePipelineService), updateProfile };
  };

  it('does not delete the stored history when a reconciliation is recorded after a failed read', async () => {
    localStorage.setItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY, '{not json');

    const { service, updateProfile } = createService();
    // The failed load shows nothing, which is not evidence the store is empty.
    expect(service.reconciliationHistory()).toEqual([]);

    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');

    // Public path: copying the planned date records a reconciliation, which
    // used to persist the empty (failed) history and remove the stored key.
    await expect(service.copyPlannedDateToCatalogue()).resolves.toEqual({
      workId: 'work-1',
      date: '2026-12-01',
    });

    expect(updateProfile).toHaveBeenCalled();
    // The new entry is visible for this session...
    expect(service.reconciliationHistory()).toHaveLength(1);
    // ...but the unreadable stored history is left untouched.
    expect(removeItem).not.toHaveBeenCalledWith(
      PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
    );
    expect(
      localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY),
    ).toBe('{not json');
  });
});
