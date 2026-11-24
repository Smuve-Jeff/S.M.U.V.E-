import { buildArtistMusicContext, initialProfile } from './profile.types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sharedProfile = (overrides: Record<string, unknown>) => ({
  ...clone(initialProfile),
  ...overrides,
  settings: {
    ...clone(initialProfile.settings),
    security: {
      ...clone(initialProfile.settings.security),
      shareProfileInDiscovery: true,
      shareProfileAnswersWithAi: true,
    },
  },
});

describe('buildArtistMusicContext genre line', () => {
  it('does not send the untouched default genre to the model', () => {
    const prompt = buildArtistMusicContext(
      sharedProfile({ artistName: 'Named Artist' }) as any
    );

    expect(prompt).toContain('- Genre: Not declared yet');
    expect(prompt).not.toContain('- Genre: Hip Hop');
  });

  it('sends the committed genre, including a committed default', () => {
    expect(
      buildArtistMusicContext(
        sharedProfile({
          artistName: 'Named Artist',
          primaryGenre: 'Country',
          profileSetupCompleted: true,
        }) as any
      )
    ).toContain('- Genre: Country');

    expect(
      buildArtistMusicContext(
        sharedProfile({
          artistName: 'Named Artist',
          primaryGenre: 'Hip Hop',
          profileSetupCompleted: true,
        }) as any
      )
    ).toContain('- Genre: Hip Hop');
  });
});
