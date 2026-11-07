import {
  buildCreatorHandoff,
  buildReleaseHandoff,
  handoffSlug,
} from './ai-produce-handoff.util';

describe('AI Produce handoff builders', () => {
  it('renders a creator brief with sections, chords, hook and mix notes', () => {
    const handoff = buildCreatorHandoff(
      {
        title: 'Night Code',
        genre: 'Trap',
        mood: 'dark',
        bpm: 140,
        key: 'C#m',
        sections: [
          { name: 'Intro', bars: 8, energy: 0.3, elements: ['hihat'] },
          { name: 'Verse', bars: 16, energy: 0.6, elements: ['kick', 'bass'] },
        ],
        chords: ['i', 'VI'],
        hookLines: ['hold the line', 'no sleep tonight'],
        mixNotes: ['Trap preset engaged.', 'Target -10 LUFS.'],
      },
      1234,
    );

    expect(handoff.id).toBe('handoff_night-code');
    expect(handoff.generatedAt).toBe(1234);
    expect(handoff.brief).toContain('# Night Code — creator handoff');
    expect(handoff.brief).toContain('Trap · 140 BPM · C#m · dark');
    expect(handoff.brief).toContain('Intro (8 bars, energy 0.30) — hihat');
    expect(handoff.brief).toContain('Chords: i · VI');
    expect(handoff.brief).toContain('- no sleep tonight');
    expect(handoff.brief).toContain('- Target -10 LUFS.');
  });

  it('keeps an empty run honest instead of inventing a hook or chords', () => {
    const handoff = buildCreatorHandoff({
      title: '',
      genre: 'Pop',
      mood: 'pop',
      bpm: 120,
      key: 'C',
      sections: [],
      chords: [],
      hookLines: [],
      mixNotes: [],
    });

    expect(handoff.id).toBe('handoff_untitled');
    expect(handoff.brief).toContain('Sections: not generated yet');
    expect(handoff.brief).toContain('Chords: open — pick a progression');
    expect(handoff.brief).toContain('Hook: not drafted yet');
  });

  it('lists only the release stages that are not complete', () => {
    const handoff = buildReleaseHandoff({
      title: 'Night Code',
      bpm: 140,
      key: 'C#m',
      releaseId: 'rel-1',
      releaseName: 'Night Code (AI Produce)',
      stages: {
        instrumental: 'Completed',
        lyrics: 'Completed',
        vocals: 'In Progress',
        mixing: 'Completed',
        mastering: 'Completed',
      },
    });

    expect(handoff.stages).toHaveLength(5);
    expect(handoff.pending).toEqual(['vocals']);
    expect(handoff.nextStep).toBe('Finish vocals before delivery.');
    expect(handoff.brief).toContain('vocals — In Progress');
  });

  it('points at release initialization when no release exists yet', () => {
    const handoff = buildReleaseHandoff({
      title: 'Draft',
      bpm: 90,
      key: 'Am',
      releaseId: null,
      releaseName: null,
      stages: {},
    });

    expect(handoff.pending).toEqual([]);
    expect(handoff.nextStep).toContain('Initialize the release row');
    expect(handoff.brief).toContain('Release: not initialized');
  });

  it('slugs titles into stable handoff ids', () => {
    expect(handoffSlug('Night Code!')).toBe('night-code');
    expect(handoffSlug('   ')).toBe('untitled');
  });
});
