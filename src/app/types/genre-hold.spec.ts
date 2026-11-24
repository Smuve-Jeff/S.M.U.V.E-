import { DEFAULT_PRIMARY_GENRE, isGenreAdviceHeld } from './genre-hold';
import { initialProfile } from './profile.types';

describe('genre hold rule', () => {
  it('holds the default genre while the interview is uncommitted', () => {
    expect(
      isGenreAdviceHeld({
        primaryGenre: DEFAULT_PRIMARY_GENRE,
        profileSetupCompleted: false,
      })
    ).toBe(true);

    // A name alone is not an accepted interview.
    const named = {
      ...JSON.parse(JSON.stringify(initialProfile)),
      artistName: 'Named Artist',
    };
    expect(isGenreAdviceHeld(named)).toBe(true);
  });

  it('releases the genre once the interview is committed, even when it is the default', () => {
    expect(
      isGenreAdviceHeld({
        primaryGenre: DEFAULT_PRIMARY_GENRE,
        profileSetupCompleted: true,
      })
    ).toBe(false);
  });

  it('does not hold a genre the artist explicitly typed', () => {
    expect(
      isGenreAdviceHeld({ primaryGenre: 'Country', profileSetupCompleted: false })
    ).toBe(false);
    expect(
      isGenreAdviceHeld({ primaryGenre: '  country trap ', profileSetupCompleted: false })
    ).toBe(false);
  });

  it('does not hold when there is no profile or no genre to hold', () => {
    expect(isGenreAdviceHeld(null)).toBe(false);
    expect(isGenreAdviceHeld(undefined)).toBe(false);
    expect(
      isGenreAdviceHeld({ primaryGenre: '', profileSetupCompleted: false })
    ).toBe(false);
  });
});
