import { normalizeReleaseTitle, withAdoptedSplit } from './release-split.util';
import { ReleaseProject } from '../types/release.types';
import { UserProfile } from './user-profile.service';

/**
 * The helper decides which split reference every reader sees. Its contract is
 * the whole point: it resolves the catalogue's reference only when the release
 * has none, it never writes, and it never invents coverage.
 */
describe('release-split.util', () => {
  const release = (overrides: Partial<ReleaseProject> = {}): ReleaseProject => ({
    id: 'rel-1',
    name: 'Window Light',
    type: 'Single',
    description: '',
    status: 'Planning',
    tracks: [],
    credits: { artistName: 'North Star', collaborators: ['Blue Nine'] },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  const profile = (catalog: unknown[]): UserProfile =>
    ({ catalog }) as unknown as UserProfile;

  it('matches titles the way the readers do', () => {
    expect(normalizeReleaseTitle('Test-Album')).toBe('test album');
    expect(normalizeReleaseTitle('test  album')).toBe('test album');
    expect(normalizeReleaseTitle(undefined)).toBe('');
  });

  it('adopts the catalogue reference when the release has none', () => {
    const resolved = withAdoptedSplit(
      profile([{ title: 'test  album', splitSheetRef: 'SPLIT-2025-01' }]),
      release({ name: 'Test-Album' })
    );

    expect(resolved?.splitSheetRef).toBe('SPLIT-2025-01');
    // Adoption never claims coverage.
    expect(resolved?.splitSheetFor).toBeUndefined();
  });

  it('keeps the release reference when it has one', () => {
    const resolved = withAdoptedSplit(
      profile([{ title: 'Window Light', splitSheetRef: 'SPLIT-OLD' }]),
      release({ splitSheetRef: 'SPLIT-NEW', splitSheetFor: ['Blue Nine'] })
    );

    expect(resolved?.splitSheetRef).toBe('SPLIT-NEW');
    expect(resolved?.splitSheetFor).toEqual(['Blue Nine']);
  });

  it('returns the release untouched when no work matches or holds a split', () => {
    const own = release();
    expect(withAdoptedSplit(profile([]), own)).toBe(own);
    expect(withAdoptedSplit(profile([{ title: 'Other Work' }]), own)).toBe(own);
    expect(
      withAdoptedSplit(profile([{ title: 'Window Light', splitSheetRef: '  ' }]), own)
    ).toBe(own);
  });

  it('passes an absent release through rather than inventing one', () => {
    expect(withAdoptedSplit(profile([]), null)).toBeNull();
    expect(withAdoptedSplit(profile([]), undefined)).toBeUndefined();
  });
});
