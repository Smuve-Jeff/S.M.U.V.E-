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
  TemplateNote,
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

function roleFor(track: {
  name: string;
  instrumentId: string;
  type: 'midi' | 'audio' | 'drum';
}): PartRole {
  if (track.type === 'drum') return 'drums';
  const label = `${track.name} ${track.instrumentId}`.toLowerCase();
  if (/bass|sub/.test(label)) return 'bass';
  if (/pad|shimmer|wind|ethereal/.test(label)) return 'pad';
  if (/keys|piano|rhodes|organ/.test(label)) return 'chords';
  if (/drum|kit/.test(label)) return 'drums';
  return 'melody';
}

/** Notes for the pattern the template reopens on, falling back to the live notes. */
function activeNotes(track: ProjectTemplate['tracks'][number]): TemplateNote[] {
  if (track.notes?.length) return track.notes;
  const slot =
    track.patternSlots?.find(
      (candidate) => candidate.id === track.activePatternSlotId,
    ) ?? track.patternSlots?.[0];
  return slot?.notes ?? [];
}

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

  for (const track of template.tracks) {
    const notes = activeNotes(track).filter(
      (note) => note.midi >= 0 && note.midi <= 127 && note.step >= 0,
    );
    if (!notes.length) continue;

    if (track.type === 'drum') {
      const hits: DrumHit[] = notes.map((note) => {
        maxStep = Math.max(maxStep, note.step + Math.max(1, note.length));
        return {
          bar: Math.floor(note.step / 16),
          step: note.step % 16,
          lane: DRUM_LANES[note.midi] ?? 'perc',
          velocity: note.velocity,
        };
      });
      parts.push({
        id: `template-${track.name}-drums`,
        role: 'drums',
        name: track.name,
        instrument: track.instrumentId,
        instrumentId: track.instrumentId,
        notes: [],
        hits,
        range: 'kit',
        mixNote: 'Template preview — drum lane',
      });
      continue;
    }

    const composerNotes: ComposerNote[] = notes.map((note) => {
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
    parts.push({
      id: `template-${track.name}-${role}`,
      role,
      name: track.name,
      instrument: track.instrumentId,
      instrumentId: track.instrumentId,
      notes: composerNotes,
      hits: [],
      range: '',
      mixNote: 'Template preview — written pattern',
    });
  }

  if (!parts.length) return null;
  const bpm = Math.max(40, Math.min(240, template.bpm || 120));
  const totalBars = Math.max(1, Math.ceil(maxStep / 16));
  return {
    id: `template-preview-${template.id}`,
    bpm,
    totalBars,
    durationSeconds: totalBars * (60 / bpm) * 4,
    parts,
  };
}
