import { removeStore, writeJsonStore } from './guarded-storage';
import {
  isQuotaExceededError,
  onStorageNotice,
  resetStorageNotices,
} from './storage-notice';

describe('guarded storage writes', () => {
  let notices: string[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    resetStorageNotices();
    notices = [];
    unsubscribe = onStorageNotice((message) => notices.push(message));
  });

  afterEach(() => {
    unsubscribe();
    jest.restoreAllMocks();
    resetStorageNotices();
    localStorage.clear();
  });

  it('writes JSON and reports success', () => {
    expect(writeJsonStore('Your cart', 'smuve_cart', [{ id: 'pack-1' }])).toBe(
      true
    );
    expect(localStorage.getItem('smuve_cart')).toBe('[{"id":"pack-1"}]');
    expect(notices).toEqual([]);
  });

  it('names a full device as full, not as blocked storage', () => {
    const quota = Object.assign(new Error('full'), {
      name: 'QuotaExceededError',
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quota;
    });

    expect(writeJsonStore('Your cart', 'smuve_cart', [])).toBe(false);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('Your cart could not be saved');
    expect(notices[0]).toContain('storage is full');
    expect(notices[0]).not.toContain('blocking storage');
  });

  it('names a blocked write as blocked and keeps it to one notice', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(writeJsonStore('Your cart', 'smuve_cart', [])).toBe(false);
    expect(writeJsonStore('Your cart', 'smuve_cart', [])).toBe(false);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('blocking storage');
  });

  it('reports a blocked removal instead of throwing', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(removeStore('Your cart', 'smuve_cart')).toBe(false);
    expect(notices[0]).toContain('Your cart could not be saved');
  });

  it('recognises the quota error names and legacy codes', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(
      true
    );
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
    expect(isQuotaExceededError(new Error('other'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });
});
