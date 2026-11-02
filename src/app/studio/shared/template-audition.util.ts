import type {
  ComposerNote,
  ComposerPart,
  DrumHit,
  DrumLane,
  PartRole,
} from '../../composer/composer.types';
import type { AuditionScore } from '../../composer/composition-audition.service';
import type {
  ProjectTemplate,
  ProjectTemplateTrack,
  TemplateNote,
  TemplateSection,
} from '../../services/project-template.service';

const DRUM_LANES: Record<number, DrumLane> = {
  35: 'kick',
  36: 'kick',
  37: 'rim',
  38: 'snare',
  39: 'clap',
  40: 'rim',
  41: 'tom',
  42: 'hat',
  43: 'tom',
  44: 'hat',
  45: 'tom',
  46: 'openhat',
  47: 'tom',
  48: 'tom',
  49: 'crash',
  50: 'tom',
  51: 'ride',
};

function roleFor(track: ProjectTemplateTrack): PartRole {
  if (track.type === 'drum') return 'drums';
  const label = `${track.name} ${track.instrumentId}`.toLowerCase();
  if (/bass|sub/.test(label)) return 'bass';
  if (/pad|shimmer|wind|ethereal/.test(label)) return 'pad';
  if (/keys|piano|rhodes|organ/.test(label)) return 'chords';
  if (/drum|kit/.test(label)) return 'drums';
  return 'melody';
}

/** Notes for the pattern the template reopens on, falling back to the live notes. */
function activeNotes(track: ProjectTemplateTrack): TemplateNote[] {
  if (track.notes?.length) return track.notes;
  const slot =
    track.patternSlots?.find(
      (candidate) => candidate.id === track.activePatternSlotId,
    ) ?? track.patternSlots?.[0];
  return slot?.notes ?? [];
}

function playable(notes: TemplateNote[]): TemplateNote[] {
  return notes.filter(
    (note) => note.midi >= 0 && note.midi <= 127 && note.step >= 0,
  );
}

function buildPart(
  track: ProjectTemplateTrack,
  notes: TemplateNote[],
  suffix: string,
): { part: ComposerPart; maxStep: number } | null {
  const valid = playable(notes);
  if (!valid.length) return null;
  let maxStep = 0;

  if (track.type === 'drum') {
    const hits: DrumHit[] = valid.map((note) => {
      maxStep = Math.max(maxStep, note.step + Math.max(1, note.length));
      return {
        bar: Math.floor(note.step / 16),
        step: note.step % 16,
        lane: DRUM_LANES[note.midi] ?? 'perc',
        velocity: note.velocity,
      };
    });
    return {
      maxStep,
      part: {
        id: `template-${suffix}-drums`,
        role: 'drums',
        name: track.name,
        instrument: track.instrumentId,
        instrumentId: track.instrumentId,
        notes: [],
        hits,
        range: 'kit',
        mixNote: 'Template preview — drum lane',
      },
    };
  }

  const composerNotes: ComposerNote[] = valid.map((note) => {
    maxStep = Math.max(maxStep, note.step + Math.max(1, note.length));
    return {
      bar: Math.floor(note.step / 16),
      step: note.step % 16,
      midi: note.midi,
      length: Math.max(0.0625, note.length),
      velocity: note.velocity,
    };
  });
  const role = roleFor(track);
  return {
    maxStep,
    part: {
      id: `template-${suffix}-${role}`,
      role,
      name: track.name,
      instrument: track.instrumentId,
      instrumentId: track.instrumentId,
      notes: composerNotes,
      hits: [],
      range: '',
      mixNote: 'Template preview — written pattern',
    },
  };
}

function scoreFor(
  template: ProjectTemplate,
  id: string,
  parts: ComposerPart[],
  maxStep: number,
): AuditionScore {
  const bpm = Math.max(40, Math.min(240, template.bpm || 120));
  const totalBars = Math.max(1, Math.ceil(maxStep / 16));
  return {
    id,
    bpm,
    totalBars,
    durationSeconds: totalBars * (60 / bpm) * 4,
    parts,
  };
}

/** Stable ids so a preview can be stopped and restarted without re-rendering. */
export const templatePreviewId = (templateId: string): string =>
  `template-preview-${templateId}`;

export const templatePatternPreviewId = (
  templateId: string,
  trackIndex: number,
  slotId: string | null | undefined,
  versionId?: string,
): string =>
  `template-preview-${templateId}-${trackIndex}-${slotId ?? 'live'}-${
    versionId ?? 'active'
  }`;

/**
 * Turn a saved template into a short score preview.
 *
 * This is deliberately a read-only projection: it never restores a template,
 * changes the live pattern or touches the Studio tracks. The audition renderer
 * only needs parts, tempo and a length.
 */
export function templateToAuditionScore(
  template: ProjectTemplate,
): AuditionScore | null {
  const parts: ComposerPart[] = [];
  let maxStep = 0;

  template.tracks.forEach((track) => {
    const built = buildPart(track, activeNotes(track), track.name);
    if (!built) return;
    parts.push(built.part);
    maxStep = Math.max(maxStep, built.maxStep);
  });

  if (!parts.length) return null;
  return scoreFor(template, templatePreviewId(template.id), parts, maxStep);
}

/**
 * One row in the expanded breakdown: either the slot's live pattern or one of
 * its saved versions. The selection is resolved from the saved template only.
 */
export function templatePatternToAuditionScore(
  template: ProjectTemplate,
  trackIndex: number,
  slotId?: string | null,
  versionId?: string,
): AuditionScore | null {
  const track = template.tracks[trackIndex];
  if (!track) return null;
  const slot = slotId
    ? track.patternSlots?.find((candidate) => candidate.id === slotId)
    : undefined;

  let notes: TemplateNote[];
  if (versionId) {
    notes =
      slot?.versions?.find((version) => version.id === versionId)?.notes ?? [];
  } else if (slot) {
    notes = slot.notes?.length ? slot.notes : activeNotes(track);
  } else {
    notes = activeNotes(track);
  }

  const built = buildPart(track, notes, `${trackIndex}-${slotId ?? 'live'}`);
  if (!built) return null;
  return scoreFor(
    template,
    templatePatternPreviewId(template.id, trackIndex, slotId, versionId),
    [built.part],
    built.maxStep,
  );
}

/** One breakdown row selected for a combined arrangement preview. */
export interface TemplatePatternSelection {
  trackIndex: number;
  slotId: string | null;
  /** Chosen saved version, or null/omitted for the row's live pattern. */
  versionId?: string | null;
}

export const templatePatternSelectionKey = (
  trackIndex: number,
  slotId: string | null | undefined,
): string => `${trackIndex}:${slotId ?? "live"}`;

export const templateMixPreviewPrefix = (templateId: string): string =>
  `template-preview-${templateId}-mix-`;

/** Stable id for the current set of rows, independent of selection order. */
export const templatePatternsPreviewId = (
  templateId: string,
  selections: readonly TemplatePatternSelection[],
): string => {
  const keys = [
    ...new Set(
      selections.map((selection) => {
        const row = templatePatternSelectionKey(
          selection.trackIndex,
          selection.slotId,
        );
        return selection.versionId ? `${row}@${selection.versionId}` : row;
      }),
    ),
  ].sort();
  return `${templateMixPreviewPrefix(templateId)}${keys.join("~")}`;
};

/**
 * Combine several breakdown rows into one score so their patterns play
 * together. Each row contributes its live pattern or chosen saved version; the
 * score lasts as long as the longest selected pattern. Nothing is restored or
 * written to the project.
 */
export function templatePatternsToAuditionScore(
  template: ProjectTemplate,
  selections: readonly TemplatePatternSelection[],
): AuditionScore | null {
  if (!selections.length) return null;

  const seen = new Set<string>();
  const parts: ComposerPart[] = [];
  let maxStep = 0;

  for (const selection of selections) {
    const key = templatePatternSelectionKey(
      selection.trackIndex,
      selection.slotId,
    );
    if (seen.has(key)) continue;
    seen.add(key);

    const track = template.tracks[selection.trackIndex];
    if (!track) continue;
    const slot = selection.slotId
      ? track.patternSlots?.find(
          (candidate) => candidate.id === selection.slotId,
        )
      : undefined;
    if (selection.slotId && !slot) continue;
    const version = selection.versionId
      ? slot?.versions?.find(
          (candidate) => candidate.id === selection.versionId,
        )
      : undefined;
    if (selection.versionId && !version) continue;
    const notes = version
      ? version.notes
      : slot
        ? slot.notes?.length
          ? slot.notes
          : activeNotes(track)
        : activeNotes(track);
    const built = buildPart(
      track,
      notes,
      `${selection.trackIndex}-${selection.slotId ?? "live"}-mix`,
    );
    if (!built) continue;
    parts.push(built.part);
    maxStep = Math.max(maxStep, built.maxStep);
  }

  if (!parts.length) return null;
  return scoreFor(
    template,
    templatePatternsPreviewId(template.id, selections),
    parts,
    maxStep,
  );
}

/** Stable id for a one-pass arrangement of saved sections in list order. */
export const templateSectionsPreviewId = (
  templateId: string,
  sections: readonly TemplateSection[],
): string => {
  const signature = sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) =>
            `${row.trackIndex}:${row.slotId ?? "live"}@${row.versionId ?? "active"}`,
        )
        .join(",");
      return `${section.id}[${rows}]`;
    })
    .join("|");
  return `${templateMixPreviewPrefix(templateId)}arrangement-${signature}`;
};

/** Shift every note and drum hit in a part by a whole number of bars. */
function offsetPart(part: ComposerPart, bars: number): ComposerPart {
  if (!bars) return part;
  return {
    ...part,
    notes: part.notes.map((note) => ({ ...note, bar: note.bar + bars })),
    hits: part.hits.map((hit) => ({ ...hit, bar: hit.bar + bars })),
  };
}

/**
 * Sequence saved sections into one one-pass score, in their listed order.
 *
 * Each section contributes its saved rows and chosen versions, with missing
 * versions falling back to the live pattern just like the section audition.
 * A section lasts as long as its longest pattern and the next section begins
 * on the following bar. Only the projection is changed; the template and the
 * live project are never touched.
 */
export function templateSectionsToAuditionScore(
  template: ProjectTemplate,
  sections: readonly TemplateSection[],
): AuditionScore | null {
  if (!sections.length) return null;

  const parts: ComposerPart[] = [];
  let startBar = 0;

  sections.forEach((section, sectionIndex) => {
    const seen = new Set<string>();
    const sectionParts: ComposerPart[] = [];
    let sectionMaxStep = 0;

    for (const row of section.rows) {
      const key = templatePatternSelectionKey(row.trackIndex, row.slotId);
      if (seen.has(key)) continue;
      seen.add(key);

      const track = template.tracks[row.trackIndex];
      if (!track) continue;
      const slot = row.slotId
        ? track.patternSlots?.find((candidate) => candidate.id === row.slotId)
        : undefined;
      if (row.slotId && !slot) continue;
      const version = row.versionId
        ? slot?.versions?.find(
            (candidate) => candidate.id === row.versionId,
          )
        : undefined;
      const notes = version
        ? version.notes
        : slot
          ? slot.notes?.length
            ? slot.notes
            : activeNotes(track)
          : activeNotes(track);
      const built = buildPart(
        track,
        notes,
        `sections-${sectionIndex}-${key.replace(":", "-")}`,
      );
      if (!built) continue;
      sectionParts.push(built.part);
      sectionMaxStep = Math.max(sectionMaxStep, built.maxStep);
    }

    if (!sectionParts.length) return;
    const sectionBars = Math.max(1, Math.ceil(sectionMaxStep / 16));
    parts.push(...sectionParts.map((part) => offsetPart(part, startBar)));
    startBar += sectionBars;
  });

  if (!parts.length) return null;
  return scoreFor(
    template,
    templateSectionsPreviewId(template.id, sections),
    parts,
    startBar * 16,
  );
}
