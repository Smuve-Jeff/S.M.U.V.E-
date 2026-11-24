import { TestBed } from '@angular/core/testing';

import { DailyMissionsService } from './daily-missions.service';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';

const STORAGE_KEY = 'smuve_daily_missions_v1';
const STREAK_KEY = 'smuve_daily_mission_streak_v1';

describe('DailyMissionsService with an unreadable store', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  const createService = (): DailyMissionsService => {
    TestBed.configureTestingModule({
      providers: [
        DailyMissionsService,
        { provide: NotificationService, useValue: { show: jest.fn() } },
        {
          provide: HapticService,
          useValue: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() },
        },
      ],
    });
    return TestBed.inject(DailyMissionsService);
  };

  it('keeps corrupt mission state instead of writing a fresh day over it', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    localStorage.setItem(STREAK_KEY, '{not json');

    const service = createService();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    try {
      // The session still generates today's list and records progress...
      expect(service.missions()).toHaveLength(3);
      const first = service.missions()[0];
      service.recordProgress(first.type, 1);
      expect(
        service.missions().find((m) => m.id === first.id)?.progress,
      ).toBeGreaterThan(0);
      // ...but neither unreadable record is replaced by that view.
      expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    } finally {
      setItem.mockRestore();
    }

    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json');
    expect(localStorage.getItem(STREAK_KEY)).toBe('{not json');
  });
});
