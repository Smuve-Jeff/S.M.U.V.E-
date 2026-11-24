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

  it('keeps a picked result in this session’s recents when the write is blocked', () => {
    const fixture = TestBed.createComponent(SearchOverlayComponent);
    fixture.detectChanges();
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage blocked');
      });

    try {
      expect(() =>
        fixture.componentInstance.onSelectResult({
          id: '1',
          title: 'Deep Bass Synth',
          type: 'preset',
          icon: 'settings_input_component',
        })
      ).not.toThrow();
    } finally {
      setItem.mockRestore();
    }

    expect(fixture.componentInstance.recentSearches()).toEqual([
      'Deep Bass Synth',
    ]);
    fixture.destroy();
  });
});
