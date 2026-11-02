import type { CompositionPass } from './composition-core.service';
import { comparePasses, passToCard } from './composition-compare';

interface PassOptions {
  id?: string;
  compositionId?: string;
  title?: string;
  variation?: string;
  bpm?: number;
  keyLabel?: string;
  bars?: number;
  seconds?: number;
  energy?: number;
  darkness?: number;
  complexity?: number;
  brief?: string;
  parts?: { name: string; reference?: boolean }[];
}

function makePass(options: PassOptions = {}): CompositionPass {
  return {
    id: options.id ?? 'pass-1',
    brief: options.brief ?? 'dark and 140 bpm',
    intensity: { complexity: options.complexity ?? 0.5, energy: options.energy ?? 0.6, darkness: options.darkness ?? 0.5 },
    createdAt: 1,
    composition: {
      id: options.compositionId ?? 'house-1',
      title: options.title ?? 'Concrete Protocol',
      variation: options.variation ?? 'fresh',
      bpm: options.bpm ?? 124,
      keyLabel: options.keyLabel ?? 'F# Minor (Aeolian)',
      totalBars: options.bars ?? 32,
      durationSeconds: options.seconds ?? 62,
      energy: options.energy ?? 0.6,
      darkness: options.darkness ?? 0.5,
      complexity: options.complexity ?? 0.55,
      parts: (options.parts ?? [
        { name: 'Bass' },
        { name: 'Chords', reference: true },
      ]).map((part, index) => ({
        id: `part-${index}`,
        name: part.name,
        reference: part.reference,
      })),
      sections: [
        { label: 'Intro', bars: 4 },
        { label: 'Drop', bars: 28 },
      ],
    } as unknown as CompositionPass['composition'],
  };
}

describe('composition A/B compare', () => {
  it('formats a pass card for display', () => {
    const card = passToCard(makePass());
    expect(card.duration).toBe('1:02');
    expect(card.partCount).toBe(1);
    expect(card.parts).toBe('Bass');
    expect(card.form).toBe('Intro 4 · Drop 28');
    expect(card.energy).toBe(60);
    expect(card.brief).toBe('dark and 140 bpm');
  });

  it('names every difference in B relative to A', () => {
    const a = makePass({ brief: 'dark and 124 bpm' });
    const b = makePass({
      id: 'pass-2',
      compositionId: 'house-2',
      variation: 'intensify',
      bpm: 140,
      keyLabel: 'D Dorian',
      bars: 48,
      energy: 0.9,
      darkness: 0.7,
      complexity: 0.8,
      brief: 'bright and 140 bpm',
      parts: [{ name: 'Bass' }, { name: 'Melody' }],
    });
    const comparison = comparePasses(a, b);
    const delta = comparison.delta.join(' · ');

    expect(delta).toContain('tempo +16 BPM');
    expect(delta).toContain('+16 bars');
    expect(delta).toContain('key F# Minor (Aeolian) → D Dorian');
    expect(delta).toContain('+1 parts');
    expect(delta).toContain('energy +30%');
    expect(delta).toContain('darkness +20%');
    expect(delta).toContain('complexity +25%');
    expect(delta).toContain('fresh → intensify');
    expect(delta).toContain('different brief');
  });

  it('reports an identical reading and a same-shape reading distinctly', () => {
    const pass = makePass();
    expect(comparePasses(pass, pass).delta).toEqual(['identical reading']);

    const sameShape = makePass({ id: 'pass-2', compositionId: 'house-2' });
    expect(comparePasses(pass, sameShape).delta).toEqual(['same shape and direction']);
  });
});
