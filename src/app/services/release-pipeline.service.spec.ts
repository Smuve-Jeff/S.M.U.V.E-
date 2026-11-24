import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
  ReleasePipelineService,
} from './release-pipeline.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';

describe('ReleasePipelineService with an unreadable reconciliation history', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  const createService = (): ReleasePipelineService => {
    TestBed.configureTestingModule({
      providers: [
        ReleasePipelineService,
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({ id: 'artist-1', knowledgeBase: {} }),
            updateProfile: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    return TestBed.inject(ReleasePipelineService);
  };

  it('does not delete the stored history when it could not be read', () => {
    localStorage.setItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY, '{not json');

    const service = createService();
    // The failed load shows nothing, which is not evidence the store is empty.
    expect(service.reconciliationHistory()).toEqual([]);

    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    // Every history change funnels through this persist helper, which is where
    // an empty view used to remove the stored key.
    (service as any).persistReconciliationHistory();

    expect(removeItem).not.toHaveBeenCalledWith(
      PLANNED_DATE_RECONCILIATION_STORAGE_KEY,
    );
    expect(
      localStorage.getItem(PLANNED_DATE_RECONCILIATION_STORAGE_KEY),
    ).toBe('{not json');
  });
});
