import {
  GENRE_FAMILIES,
  bpmRangeForGenre,
  energyForGenre,
  resolveGenre,
  structureForGenre,
} from './genre-catalog.util';

describe('genre catalog', () => {
  describe('resolveGenre', () => {
    it('resolves the families the app previously called artist-defined', () => {
      expect(resolveGenre('Country')?.family.id).toBe('country');
      expect(resolveGenre('Blues')?.family.id).toBe('blues');
      expect(resolveGenre('Rock')?.family.id).toBe('rock');
      expect(resolveGenre('Gospel')?.family.id).toBe('gospel');
      expect(resolveGenre('Reggaeton')?.family.id).toBe('latin');
      expect(resolveGenre('Afrobeats')?.family.id).toBe('afrobeats');
      expect(resolveGenre('Jazz')?.family.id).toBe('jazz');
      expect(resolveGenre('Pop')?.family.id).toBe('pop');
    });

    it('handles casing, punctuation and the compact spellings artists type', () => {
      expect(resolveGenre('  RAP  ')?.family.id).toBe('hip-hop');
      expect(resolveGenre('HIP-HOP')?.family.id).toBe('hip-hop');
      expect(resolveGenre('rnb')?.family.id).toBe('rnb-soul');
      expect(resolveGenre('R&B')?.family.id).toBe('rnb-soul');
      expect(resolveGenre("R'n'B")?.family.id).toBe('rnb-soul');
      expect(resolveGenre('Drum and Bass')?.family.id).toBe('electronic');
      expect(resolveGenre('Lo-Fi')?.family.id).toBe('electronic');
    });

    it('prefers the specific phrase over a broader word inside it', () => {
      // "Chicago Blues" must be blues, not rock, and "Pop Punk" is its own
      // family entry rather than plain pop.
      expect(resolveGenre('Chicago Blues')?.family.id).toBe('blues');
      expect(resolveGenre('Pop Punk')?.family.id).toBe('rock');
      expect(resolveGenre('Country Rock')?.family.id).toBe('country');
    });

    it('reads a hybrid in the order the artist wrote it', () => {
      const countryTrap = resolveGenre('Country Trap');
      expect(countryTrap?.family.id).toBe('country');
      expect(countryTrap?.secondary.map((family) => family.id)).toEqual([
        'hip-hop',
      ]);
      expect(countryTrap?.hybrid).toBe(true);

      const rnbRap = resolveGenre('R&B/Hip-Hop');
      expect(rnbRap?.family.id).toBe('rnb-soul');
      expect(rnbRap?.secondary.map((family) => family.id)).toEqual([
        'hip-hop',
      ]);

      expect(resolveGenre('Pop')?.hybrid).toBe(false);
    });

    it('returns null rather than guessing an unknown genre', () => {
      expect(resolveGenre('')).toBeNull();
      expect(resolveGenre('   ')).toBeNull();
      expect(resolveGenre(undefined)).toBeNull();
      expect(resolveGenre(null)).toBeNull();
      expect(resolveGenre('zydeco polka')).toBeNull();
    });

    it('keeps the artist’s own wording as the label', () => {
      expect(resolveGenre('  country trap ')).toMatchObject({
        label: 'country trap',
      });
      expect(resolveGenre('Rap')?.label).toBe('Rap');
      expect(resolveGenre('')?.family).toBeUndefined();
    });
  });

  describe('song structures', () => {
    it('gives every family a complete, internally consistent form', () => {
      for (const family of GENRE_FAMILIES) {
        expect(family.structures.length).toBeGreaterThan(0);
        expect(family.bpmRange[0]).toBeGreaterThan(0);
        expect(family.bpmRange[1]).toBeGreaterThan(family.bpmRange[0]);
        expect(family.energy).toBeGreaterThan(0);
        expect(family.energy).toBeLessThanOrEqual(1);

        for (const structure of family.structures) {
          expect(structure.sections.length).toBeGreaterThanOrEqual(5);
          expect(structure.totalBars).toBe(
            structure.sections.reduce((total, section) => total + section.bars, 0)
          );
          expect(structure.genre).toBe(family.id);
          for (const section of structure.sections) {
            expect(section.type.trim()).toBeTruthy();
            expect(section.bars).toBeGreaterThan(0);
            // A section without a production instruction is just a label.
            expect(section.description.trim().length).toBeGreaterThanOrEqual(10);
          }
        }
      }
    });

    it('selects the right form through the artist’s spelling', () => {
      // This is the bug that mattered: Rap used to receive the Modern Pop
      // Standard because the lookup was an exact string match.
      expect(structureForGenre('Rap')?.name).toBe('Hook-First Rap');
      expect(structureForGenre('trap')?.name).toBe('Hook-First Rap');
      expect(structureForGenre('Country')?.name).toBe('Country Verse–Chorus');
      expect(structureForGenre('Blues')?.name).toBe('12-Bar Blues Form');
      expect(structureForGenre('rnb')?.name).toBe('R&B Slow Jam');
      expect(structureForGenre('Gospel')?.name).toBe('Gospel Build + Vamp');
      expect(structureForGenre('zydeco')?.name).toBeUndefined();
    });

    it('follows the form the genre actually uses', () => {
      const blues = structureForGenre('Chicago Blues');
      expect(blues?.totalBars).toBe(68);
      expect(blues?.sections.map((section) => section.bars)).toContain(12);

      const country = structureForGenre('Country');
      expect(country?.sections.some((section) => section.type === 'solo')).toBe(
        true
      );

      const jazz = structureForGenre('Jazz');
      expect(jazz?.sections.some((section) => section.type === 'head')).toBe(
        true
      );
      expect(jazz?.totalBars).toBe(144);
    });

    it('reports tempo and energy only for a genre it knows', () => {
      expect(bpmRangeForGenre('Country')).toEqual([76, 118]);
      expect(bpmRangeForGenre('Rap')).toEqual([84, 100]);
      expect(bpmRangeForGenre('zydeco')).toBeNull();
      expect(energyForGenre('Country')).toBe(0.6);
      expect(energyForGenre('zydeco')).toBeNull();
    });
  });

  it('keeps every alias unique across families', () => {
    const aliases = GENRE_FAMILIES.flatMap((family) =>
      family.aliases.map((alias) => alias.toLowerCase())
    );

    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
