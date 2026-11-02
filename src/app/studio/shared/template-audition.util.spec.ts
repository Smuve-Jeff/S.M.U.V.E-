import {
  templatePatternsPreviewId,
  templatePatternsToAuditionScore,
  templatePatternToAuditionScore,
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
