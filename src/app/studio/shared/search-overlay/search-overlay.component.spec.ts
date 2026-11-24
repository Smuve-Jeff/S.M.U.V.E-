import { TestBed } from '@angular/core/testing';

import { SearchOverlayComponent } from './search-overlay.component';

describe('SearchOverlayComponent with blocked storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('boots with no recent searches when the store cannot be read', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const fixture = TestBed.createComponent(SearchOverlayComponent);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.componentInstance.recentSearches()).toEqual([]);
    expect(() => fixture.componentInstance.clearRecentSearches()).not.toThrow();
    fixture.destroy();
  });
});
