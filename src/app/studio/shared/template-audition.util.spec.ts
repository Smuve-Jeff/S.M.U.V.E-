import {
  templatePatternsPreviewId,
  templatePatternsToAuditionScore,
  templatePatternToAuditionScore,
  templateSectionBars,
  templateSectionPreviewId,
  templateSectionsPreviewId,
  templateSectionsToAuditionScore,
  templateSectionToAuditionScore,
  templateToAuditionScore,
} from './template-audition.util';
import type { ProjectTemplate } from '../../services/project-template.service';

const template = (overrides: Partial<ProjectTemplate> = {}): ProjectTemplate => ({
  id: 'tpl',
  name: 'Night Sketch',
  bpm: 120,
  genre: 'user',
  tracks: [
    {
      name: 'Sub Bass',
      instrumentId: 'sub-commander',
      type: 'midi',
      notes: [{ midi: 33, step: 0, length: 4, velocity: 0.9 }],
    },
    {
      name: 'Keys',
      instrumentId: 'grand-piano',
      type: 'midi',
      notes: [{ midi: 60, step: 8, length: 2, velocity: 0.7 }],
    },
    {
      name: 'Drums',
      instrumentId: 'trap-kit-elite',
      type: 'drum',
      notes: [
        { midi: 36, step: 0, length: 1, velocity: 0.95 },
        { midi: 42, step: 2, length: 1, velocity: 0.5 },
      ],
    },
  ],
  ...overrides,
});

describe('templateToAuditionScore', () => {
  it('projects every playable channel into a four-bar preview score', () => {
    const score = templateToAuditionScore(template());

    expect(score).not.toBeNull();
    expect(score!.id).toBe('template-preview-tpl');
    expect(score!.bpm).toBe(120);
    expect(score!.parts).toHaveLength(3);
    expect(score!.parts.map((part) => part.role)).toEqual([
      'bass',
      'chords',
      'drums',
    ]);
    expect(score!.parts[0].notes[0]).toEqual({
      bar: 0,
      step: 0,
      midi: 33,
      length: 4,
      velocity: 0.9,
    });
    expect(score!.parts[2].hits.map((hit) => hit.lane)).toEqual([
      'kick',
      'hat',
    ]);
  });

  it('uses the active pattern when the live notes are absent', () => {
    const score = templateToAuditionScore(
      template({
        tracks: [
          {
            name: 'Lead',
            instrumentId: 'analog-warmth',
            type: 'midi',
            activePatternSlotId: 'slot-1',
            patternSlots: [
              {
                id: 'slot-0',
                name: 'Verse',
                notes: [{ midi: 60, step: 0, length: 1, velocity: 0.7 }],
              },
              {
                id: 'slot-1',
                name: 'Chorus',
                notes: [{ midi: 67, step: 4, length: 2, velocity: 0.8 }],
              },
            ],
          },
        ],
      }),
    );

    expect(score!.parts[0].notes[0].midi).toBe(67);
    expect(score!.parts[0].notes[0].step).toBe(4);
  });

  it('expands the preview length to the last written step and rejects an empty template', () => {
    const score = templateToAuditionScore(
      template({
        bpm: 90,
        tracks: [
          {
            name: 'Pad',
            instrumentId: 'ethereal-wind',
            type: 'midi',
            notes: [{ midi: 50, step: 48, length: 4, velocity: 0.5 }],
          },
        ],
      }),
    );

    expect(score!.totalBars).toBe(4);
    expect(score!.durationSeconds).toBeCloseTo((4 * 60) / 90 * 4, 5);
    expect(score!.parts[0].role).toBe('pad');
    expect(templateToAuditionScore(template({ tracks: [] }))).toBeNull();
  });

  it('resolves a single slot and a specific saved version', () => {
    const source = template({
      tracks: [
        {
          name: 'Lead',
          instrumentId: 'analog-warmth',
          type: 'midi',
          activePatternSlotId: 'slot-1',
          patternSlots: [
            {
              id: 'slot-1',
              name: 'Verse',
              notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
              activeVersionId: 'v2',
              versions: [
                {
                  id: 'v1',
                  name: 'first',
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
                {
                  id: 'v2',
                  name: 'lift',
                  notes: [{ midi: 67, step: 4, length: 4, velocity: 0.9 }],
                },
              ],
            },
          ],
        },
      ],
    });

    const live = templatePatternToAuditionScore(source, 0, 'slot-1');
    expect(live!.parts[0].notes[0].midi).toBe(64);
    expect(live!.id).toBe('template-preview-tpl-0-slot-1-active');

    const version = templatePatternToAuditionScore(source, 0, 'slot-1', 'v1');
    expect(version!.parts[0].notes[0].midi).toBe(60);
    expect(version!.id).toBe('template-preview-tpl-0-slot-1-v1');

    expect(
      templatePatternToAuditionScore(source, 0, 'slot-1', 'missing'),
    ).toBeNull();
    expect(templatePatternToAuditionScore(source, 3, 'slot-1')).toBeNull();
  });
});

describe('templatePatternsToAuditionScore', () => {
  it('combines the selected rows and keeps a stable id regardless of order', () => {
    const source = template();
    const before = JSON.stringify(source);
    const selections = [
      { trackIndex: 0, slotId: null },
      { trackIndex: 2, slotId: null },
    ];

    const score = templatePatternsToAuditionScore(source, selections);

    expect(score).not.toBeNull();
    expect(score!.parts.map((part) => part.role)).toEqual(['bass', 'drums']);
    expect(score!.id).toBe('template-preview-tpl-mix-0:live~2:live');
    expect(
      templatePatternsToAuditionScore(source, [...selections].reverse())!.id,
    ).toBe(score!.id);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('uses a chosen saved version for a mixed row', () => {
    const source = template({
      tracks: [
        {
          name: 'Lead',
          instrumentId: 'analog-warmth',
          type: 'midi',
          activePatternSlotId: 'slot-1',
          patternSlots: [
            {
              id: 'slot-1',
              name: 'Verse',
              notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
              activeVersionId: 'v2',
              versions: [
                {
                  id: 'v1',
                  name: 'first',
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
                {
                  id: 'v2',
                  name: 'lift',
                  notes: [{ midi: 67, step: 4, length: 4, velocity: 0.9 }],
                },
              ],
            },
          ],
        },
        {
          name: 'Keys',
          instrumentId: 'grand-piano',
          type: 'midi',
          notes: [{ midi: 48, step: 4, length: 2, velocity: 0.6 }],
        },
      ],
    });
    const before = JSON.stringify(source);

    const score = templatePatternsToAuditionScore(source, [
      { trackIndex: 0, slotId: 'slot-1', versionId: 'v1' },
      { trackIndex: 1, slotId: null },
    ]);

    expect(score!.parts[0].notes[0].midi).toBe(60);
    expect(score!.parts[1].notes[0].midi).toBe(48);
    expect(score!.id).toBe('template-preview-tpl-mix-0:slot-1@v1~1:live');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('skips a mix row whose chosen version no longer exists', () => {
    const source = template({
      tracks: [
        {
          name: 'Lead',
          instrumentId: 'analog-warmth',
          type: 'midi',
          patternSlots: [
            {
              id: 'slot-1',
              name: 'Verse',
              notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
              versions: [
                {
                  id: 'v1',
                  name: 'first',
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(
      templatePatternsToAuditionScore(source, [
        { trackIndex: 0, slotId: 'slot-1', versionId: 'missing' },
      ]),
    ).toBeNull();
  });

  it('uses the longest selected row for the mix length', () => {
    const score = templatePatternsToAuditionScore(
      template({
        tracks: [
          {
            name: 'Lead',
            instrumentId: 'analog-warmth',
            type: 'midi',
            notes: [{ midi: 67, step: 0, length: 4, velocity: 0.8 }],
          },
          {
            name: 'Pad',
            instrumentId: 'ethereal-wind',
            type: 'midi',
            notes: [{ midi: 50, step: 48, length: 4, velocity: 0.5 }],
          },
        ],
      }),
      [
        { trackIndex: 0, slotId: null },
        { trackIndex: 1, slotId: null },
      ],
    );

    expect(score!.totalBars).toBe(4);
    expect(score!.parts).toHaveLength(2);
  });

  it('deduplicates rows and rejects empty or invalid selections', () => {
    const source = template();
    const one = templatePatternsToAuditionScore(source, [
      { trackIndex: 0, slotId: null },
      { trackIndex: 0, slotId: null },
    ]);
    expect(one!.parts).toHaveLength(1);

    expect(templatePatternsToAuditionScore(source, [])).toBeNull();
    expect(
      templatePatternsToAuditionScore(source, [{ trackIndex: 9, slotId: null }]),
    ).toBeNull();
    expect(templatePatternsPreviewId('tpl', [])).toBe(
      'template-preview-tpl-mix-',
    );
  });
});

describe('templateSectionsToAuditionScore', () => {
  const source = () =>
    template({
      tracks: [
        {
          name: 'Lead',
          instrumentId: 'analog-warmth',
          type: 'midi',
          activePatternSlotId: 'slot-1',
          patternSlots: [
            {
              id: 'slot-1',
              name: 'Verse',
              notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
              versions: [
                {
                  id: 'v1',
                  name: 'long',
                  notes: [{ midi: 60, step: 16, length: 4, velocity: 0.7 }],
                },
              ],
            },
          ],
        },
        {
          name: 'Keys',
          instrumentId: 'grand-piano',
          type: 'midi',
          notes: [{ midi: 48, step: 0, length: 4, velocity: 0.6 }],
        },
      ],
    });

  const intro = {
    id: 'sec-intro',
    name: 'Intro',
    rows: [
      { trackIndex: 0, slotId: 'slot-1', versionId: 'v1' },
      { trackIndex: 1, slotId: null },
    ],
  };
  const hook = {
    id: 'sec-hook',
    name: 'Hook',
    rows: [{ trackIndex: 1, slotId: null }],
  };

  it('sequences sections at bar boundaries and shifts their notes', () => {
    const templateSource = source();
    const before = JSON.stringify(templateSource);
    const score = templateSectionsToAuditionScore(templateSource, [
      intro,
      hook,
    ]);

    expect(score).not.toBeNull();
    expect(score!.totalBars).toBe(3);
    expect(score!.durationSeconds).toBe(6);
    expect(score!.parts).toHaveLength(3);
    expect(score!.parts.map((part) => part.role)).toEqual([
      'melody',
      'chords',
      'chords',
    ]);
    expect(score!.parts[0].notes[0]).toMatchObject({ midi: 60, bar: 1 });
    expect(score!.parts[1].notes[0].bar).toBe(0);
    expect(score!.parts[2].notes[0].bar).toBe(2);
    expect(new Set(score!.parts.map((part) => part.id)).size).toBe(3);
    expect(score!.id).toBe(
      templateSectionsPreviewId(templateSource.id, [intro, hook]),
    );
    expect(score!.id.startsWith('template-preview-tpl-mix-arrangement-')).toBe(
      true,
    );
    expect(JSON.stringify(templateSource)).toBe(before);
  });

  it('changes the preview id when the section order changes', () => {
    const forward = templateSectionsToAuditionScore(source(), [intro, hook]);
    const reverse = templateSectionsToAuditionScore(source(), [hook, intro]);

    expect(forward!.id).not.toBe(reverse!.id);
    expect(reverse!.parts[0].notes[0].bar).toBe(0);
    expect(reverse!.parts[1].notes[0].bar).toBe(2);
    expect(reverse!.parts[2].notes[0].bar).toBe(1);
    expect(reverse!.totalBars).toBe(3);
  });

  it("uses each section's set length and starts the next section after it", () => {
    const sourceTemplate = source();
    const sizedIntro = { ...intro, bars: 4 };
    const sizedHook = { ...hook, bars: 2 };
    const score = templateSectionsToAuditionScore(sourceTemplate, [
      sizedIntro,
      sizedHook,
    ]);

    expect(score!.totalBars).toBe(6);
    expect(score!.durationSeconds).toBe(12);
    expect(score!.parts[0].notes[0].bar).toBe(1);
    expect(score!.parts[1].notes[0].bar).toBe(0);
    expect(score!.parts[2].notes[0].bar).toBe(4);
    expect(score!.id).toBe(
      templateSectionsPreviewId(sourceTemplate.id, [sizedIntro, sizedHook]),
    );

    // Auto length still measures the saved pattern.
    expect(templateSectionBars(sourceTemplate, intro)).toBe(2);
    expect(templateSectionBars(sourceTemplate, sizedIntro)).toBe(4);
    expect(templateSectionsPreviewId('tpl', [intro])).not.toBe(
      templateSectionsPreviewId('tpl', [{ ...intro, bars: 2 }]),
    );
  });

  it('pads a longer section and trims notes past a shorter one', () => {
    const padded = templateSectionsToAuditionScore(source(), [
      { ...hook, bars: 3 },
      hook,
    ]);
    expect(padded!.totalBars).toBe(4);
    expect(padded!.parts[0].notes[0].bar).toBe(0);
    expect(padded!.parts[1].notes[0].bar).toBe(3);

    const overflowing = template({
      tracks: [
        {
          name: 'Lead',
          instrumentId: 'analog-warmth',
          type: 'midi',
          notes: [
            { midi: 60, step: 8, length: 16, velocity: 0.8 },
            { midi: 62, step: 20, length: 2, velocity: 0.7 },
          ],
        },
      ],
    });
    const clipped = templateSectionsToAuditionScore(overflowing, [
      {
        id: 'sec-clipped',
        name: 'Clipped',
        bars: 1,
        rows: [{ trackIndex: 0, slotId: null }],
      },
    ]);
    expect(clipped!.totalBars).toBe(1);
    expect(clipped!.parts[0].notes).toHaveLength(1);
    expect(clipped!.parts[0].notes[0]).toMatchObject({
      bar: 0,
      step: 8,
      length: 8,
    });
  });

  it("clips a single section audition to its set length", () => {
    const sourceTemplate = source();
    const oneBar = templateSectionToAuditionScore(sourceTemplate, {
      ...intro,
      bars: 1,
    });

    expect(oneBar).not.toBeNull();
    expect(oneBar!.totalBars).toBe(1);
    expect(oneBar!.durationSeconds).toBe(2);
    expect(oneBar!.id).toBe(
      templateSectionPreviewId(sourceTemplate, { ...intro, bars: 1 }),
    );
    // The version note starts in bar 2 and is dropped; the keys note remains.
    expect(oneBar!.parts.flatMap((part) => part.notes).map((note) => note.bar))
      .toEqual([0]);

    const fourBars = templateSectionToAuditionScore(sourceTemplate, {
      ...intro,
      bars: 4,
    });
    expect(fourBars!.totalBars).toBe(4);
    expect(fourBars!.parts.flatMap((part) => part.notes)[0].bar).toBe(1);
    expect(templateSectionPreviewId(sourceTemplate, { ...intro, bars: 1 }))
      .not.toBe(
        templateSectionPreviewId(sourceTemplate, { ...intro, bars: 4 }),
      );

    expect(
      templateSectionToAuditionScore(sourceTemplate, {
        id: 'sec-empty',
        name: 'Empty',
        bars: 1,
        rows: [{ trackIndex: 9, slotId: null }],
      }),
    ).toBeNull();
  });

  it('falls back to the live pattern and skips empty sections', () => {
    const fallback = templateSectionsToAuditionScore(source(), [
      {
        id: 'sec-fallback',
        name: 'Fallback',
        rows: [{ trackIndex: 0, slotId: 'slot-1', versionId: 'missing' }],
      },
    ]);
    expect(fallback!.parts[0].notes[0].midi).toBe(64);
    expect(fallback!.totalBars).toBe(1);

    const empty = {
      id: 'sec-empty',
      name: 'Empty',
      rows: [{ trackIndex: 9, slotId: null }],
    };
    const afterEmpty = templateSectionsToAuditionScore(source(), [
      empty,
      hook,
    ]);
    expect(afterEmpty!.parts).toHaveLength(1);
    expect(afterEmpty!.parts[0].notes[0].bar).toBe(0);
    expect(afterEmpty!.totalBars).toBe(1);
    expect(templateSectionsToAuditionScore(source(), [empty])).toBeNull();
    expect(templateSectionsToAuditionScore(source(), [])).toBeNull();
  });
});
