import { TestBed } from '@angular/core/testing';

import {
  VIEWER_HEALTH_STORAGE_KEY,
  ViewerHealthSettingsService,
} from './viewer-health-settings.service';

describe('ViewerHealthSettingsService with an unreadable store', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps corrupt overrides instead of replacing them with the session map', () => {
    localStorage.setItem(VIEWER_HEALTH_STORAGE_KEY, '{not json');

    TestBed.configureTestingModule({ providers: [ViewerHealthSettingsService] });
    const service = TestBed.inject(ViewerHealthSettingsService);
    expect(service.overrideCount()).toBe(0);

    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    try {
      // The session still applies the new thresholds...
      service.setOverride('preset-a', {
        rttFairMs: 100,
        rttPoorMs: 200,
        kbpsFair: 1200,
        kbpsPoor: 400,
      });
      expect(service.isCustomized('preset-a')).toBe(true);
      // ...but the unreadable stored overrides are not replaced by that map.
      expect(setItem).not.toHaveBeenCalledWith(
        VIEWER_HEALTH_STORAGE_KEY,
        expect.any(String),
      );
    } finally {
      setItem.mockRestore();
    }

    expect(localStorage.getItem(VIEWER_HEALTH_STORAGE_KEY)).toBe('{not json');
  });
});
