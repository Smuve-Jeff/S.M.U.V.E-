import {
  briefRationale,
  briefSummary,
  parseCompositionBrief,
} from './composition-brief';

describe('parseCompositionBrief', () => {
  it('leaves every steering value untouched for an empty brief', () => {
    const brief = parseCompositionBrief('   ');
    expect(brief).toEqual({ raw: '', moods: [], references: [] });
    expect(briefSummary(brief)).toEqual([]);
    expect(briefRationale(brief)).toEqual([]);
  });

  it('reads tempo, key and length asks', () => {
    const brief = parseCompositionBrief('140 bpm in F# minor, 16 bars');
    expect(brief.bpm).toBe(140);
    expect(brief.keyLabel).toBe('F# minor');
    expect(brief.bars).toBe(16);
  });

  it('accepts "at 128" and rejects impossible tempos', () => {
    expect(parseCompositionBrief('at 128').bpm).toBe(128);
    expect(parseCompositionBrief('at 400 bpm').bpm).toBeUndefined();
  });

  it('normalizes major and minor keys', () => {
    expect(parseCompositionBrief('key of Bb major').keyLabel).toBe('Bb major');
    expect(parseCompositionBrief('in C maj').keyLabel).toBe('C major');
    expect(parseCompositionBrief('in A min').keyLabel).toBe('A minor');
  });

  it('maps mood language onto energy, darkness and complexity', () => {
    const brief = parseCompositionBrief('dark, aggressive and intricate');
    expect(brief.darkness).toBeGreaterThan(0.7);
    expect(brief.energy).toBeGreaterThan(0.7);
    expect(brief.complexity).toBeGreaterThan(0.7);
    expect(brief.moods).toEqual(expect.arrayContaining(['dark', 'high energy', 'intricate']));
  });

  it('handles the opposite direction', () => {
    const brief = parseCompositionBrief('bright, chill and minimal');
    expect(brief.darkness).toBeLessThan(0.3);
    expect(brief.energy).toBeLessThan(0.4);
    expect(brief.complexity).toBeLessThan(0.3);
  });

  it('extracts reference direction without copying it', () => {
    const brief = parseCompositionBrief('inspired by Portishead, dark and slow at 90 bpm');
    expect(brief.references).toContain('Portishead');
    expect(briefRationale(brief)[1]).toContain('compass only');
  });

  it('summarizes steering for display', () => {
    const brief = parseCompositionBrief('darker, high energy, 140 BPM, F# minor, 16 bars');
    expect(briefSummary(brief)).toEqual([
      'dark',
      'high energy',
      '140 BPM',
      'F# minor',
      '16 bars',
    ]);
  });
});
