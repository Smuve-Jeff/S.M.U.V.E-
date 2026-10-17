import { SmuveKnowledgeEngine } from './smuve-knowledge-engine';

describe('Music manager local knowledge', () => {
  const knowledge = new SmuveKnowledgeEngine();
  it('ranks multiword questions and ignores empty/stopword-only searches', () => {
    expect(knowledge.search('How do I clear samples?')[0].id).toBe('legal-04');
    expect(knowledge.search('publishing royalties')[0].id).toBe('biz-02');
    expect(knowledge.search('')).toEqual([]);
    expect(knowledge.search('what is the')).toEqual([]);
  });
  it('removes unsafe clearance myths and supplies official source evidence', () => {
    const sample = knowledge.getAllKnowledge().find((e) => e.id === 'legal-04')!;
    expect(sample.content).toContain('no universal safe number');
    expect(sample.content).toContain('interpolation');
    expect(sample.content).not.toContain('50% of the master');
    expect(sample.actionRequired).toContain('Do not treat processing as legal clearance');
    expect(sample.sources).toContain('https://www.copyright.gov/help/faq/faq-fairuse.html');
  });
  it('separates jurisdiction-specific royalty streams and normalization from artistic targets', () => {
    const royalties = knowledge.getAllKnowledge().find((e) => e.id === 'biz-02')!;
    expect(royalties.content).toContain('non-interactive');
    expect(royalties.content).toContain('Other territories differ');
    const loudness = knowledge.getAllKnowledge().find((e) => e.id === 'prod-10')!;
    expect(loudness.content).toContain('not a universal mastering requirement');
    expect(loudness.sources).toHaveLength(1);
  });
  it('offers domain-appropriate lessons with case-insensitive categories', () => {
    expect(knowledge.generateLesson('legal' as any)?.sourceEntry.category).toBe('Legal');
    expect(knowledge.generateLesson('Legal')?.steps.join(' ')).toContain('goals, resources and territory');
  });

  it('ships the inventory its domain headers claim', () => {
    // Frozen on purpose. The headers, the /knowledge overview and every
    // coverage claim read from this inventory, and a previous pass advertised
    // 92 entries while shipping 47. Adding knowledge means updating this map.
    expect(knowledge.getCounts()).toEqual({
      Production: 20,
      Songwriting: 7,
      Vocal: 5,
      Marketing: 15,
      Business: 10,
      Legal: 8,
      Distribution: 6,
      Career: 6,
    });
    expect(knowledge.getAllKnowledge()).toHaveLength(77);

    const ids = knowledge.getAllKnowledge().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every entry usable: real guidance, tags, and a next move', () => {
    for (const entry of knowledge.getAllKnowledge()) {
      expect(entry.content.length).toBeGreaterThan(120);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.actionRequired?.trim()).toBeTruthy();
    }
  });

  it('states the scope of every legal entry it offers', () => {
    for (const entry of knowledge.getByCategory('Legal')) {
      const scoped =
        !!entry.jurisdiction ||
        (entry.sources?.length ?? 0) > 0 ||
        /not a legal (?:opinion|advice)/i.test(entry.content);
      expect({ id: entry.id, scoped }).toEqual({ id: entry.id, scoped: true });
    }
  });

  it('answers the business and promotion questions the domains were expanded for', () => {
    expect(knowledge.search('isrc upc identifiers')[0].id).toBe('biz-04');
    expect(
      knowledge.getAllKnowledge().find((e) => e.id === 'biz-03')?.content
    ).toContain('do not share a collector');
    const promoTitles = knowledge
      .getByCategory('Marketing')
      .map((entry) => entry.title);
    expect(promoTitles).toContain('The Pre-Release Asset Ladder');
    expect(promoTitles).toContain(
      'Paid Promotion: Do the Math Before the Spend'
    );
    expect(
      knowledge
        .search('release day promotion')
        .some((entry) => entry.id === 'dist-05')
    ).toBe(true);
  });
});
