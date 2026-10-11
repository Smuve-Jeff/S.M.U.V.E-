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
});
