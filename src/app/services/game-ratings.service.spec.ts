import { GameRatingsService } from './game-ratings.service';

const STORAGE_KEY = 'smuve_game_ratings_v1';

describe('GameRatingsService with an unreadable store', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps corrupt ratings instead of replacing them with the session view', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const service = new GameRatingsService();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    try {
      // The session still records the play...
      const stats = service.recordPlay('game-1', { result: 'win', score: 10 });
      expect(stats.plays).toBe(1);
      expect(service.allStats()['game-1']?.wins).toBe(1);
      // ...but the unreadable stored ratings are not replaced by that view.
      expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    } finally {
      setItem.mockRestore();
    }

    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json');
  });
});
