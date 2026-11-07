/**
 * AI Produce → handoff builders.
 *
 * A run ends with artifacts that only exist inside this app: a beat
 * arrangement, lyric sections and a mastering report. Both downstream
 * audiences need different shapes of the same run:
 *
 *   • a creator (collaborator, session musician, vocalist) needs a brief they
 *     can work from without opening the session — tempo, key, sections, chords,
 *     the hook and the mix notes;
 *   • the release pipeline needs the delivery state — which stages are done,
 *     what is still outstanding, and the one next step.
 *
 * Pure functions so the shapes, the plain-text rendering and the "what is
 * still pending" rule can be pinned down without Angular.
 */

export interface CreatorHandoffSection {
  name: string;
  bars: number;
  energy: number;
  elements: string[];
}

export interface CreatorHandoffInput {
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  key: string;
  sections: CreatorHandoffSection[];
  chords: string[];
  hookLines: string[];
  mixNotes: string[];
}

export interface CreatorHandoff extends CreatorHandoffInput {
  /** Stable per title, so a re-run overwrites the same brief. */
  id: string;
  /** Markdown the artist can paste into a message or commit to a repo. */
  brief: string;
  generatedAt: number;
}

export interface ReleaseHandoffStage {
  name: string;
  status: string;
}

export interface ReleaseHandoffInput {
  title: string;
  bpm: number;
  key: string;
  releaseId: string | null;
  releaseName: string | null;
  stages: Record<string, string>;
}

export interface ReleaseHandoff {
  id: string;
  title: string;
  bpm: number;
  key: string;
  releaseId: string | null;
  releaseName: string | null;
  stages: ReleaseHandoffStage[];
  /** Stage names that are not complete, in pipeline order. */
  pending: string[];
  nextStep: string;
  brief: string;
  generatedAt: number;
}

/** Only a stage marked complete is done; anything else is still work. */
function isComplete(status: string): boolean {
  return (status || '').trim().toLowerCase() === 'completed';
}

export function handoffSlug(title: string): string {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

export function buildCreatorHandoff(
  input: CreatorHandoffInput,
  generatedAt = Date.now(),
): CreatorHandoff {
  const sections = (input.sections ?? []).map((section) => ({
    ...section,
    elements: [...(section.elements ?? [])],
  }));
  const chords = [...(input.chords ?? [])];
  const hookLines = [...(input.hookLines ?? [])];
  const mixNotes = [...(input.mixNotes ?? [])];

  const lines: string[] = [
    `# ${input.title} — creator handoff`,
    '',
    `Genre: ${input.genre} · ${input.bpm} BPM · ${input.key} · ${input.mood} mood`,
    '',
    sections.length
      ? `Sections: ${sections
          .map(
            (section) =>
              `${section.name} (${section.bars} bars, energy ${section.energy.toFixed(2)})${
                section.elements.length
                  ? ` — ${section.elements.join(', ')}`
                  : ''
              }`,
          )
          .join(' → ')}`
      : 'Sections: not generated yet',
    `Chords: ${chords.length ? chords.join(' · ') : 'open — pick a progression'}`,
  ];

  if (hookLines.length) {
    lines.push('', 'Hook:', ...hookLines.map((line) => `- ${line}`));
  } else {
    lines.push('', 'Hook: not drafted yet');
  }

  if (mixNotes.length) {
    lines.push('', 'Mix notes:', ...mixNotes.map((note) => `- ${note}`));
  }

  return {
    ...input,
    sections,
    chords,
    hookLines,
    mixNotes,
    id: `handoff_${handoffSlug(input.title)}`,
    brief: lines.join('\n'),
    generatedAt,
  };
}

export function buildReleaseHandoff(
  input: ReleaseHandoffInput,
  generatedAt = Date.now(),
): ReleaseHandoff {
  const stages: ReleaseHandoffStage[] = Object.entries(input.stages ?? {}).map(
    ([name, status]) => ({ name, status: status || 'Pending' }),
  );
  const pending = stages
    .filter((stage) => !isComplete(stage.status))
    .map((stage) => stage.name);

  const nextStep = !input.releaseId
    ? 'Initialize the release row from AI Produce before packaging delivery.'
    : pending.length
      ? `Finish ${pending.join(', ')} before delivery.`
      : 'Every stage is complete — file the master against the release.';

  const lines: string[] = [
    `# ${input.title} — release handoff`,
    '',
    `Release: ${input.releaseName || 'not initialized'}${
      input.releaseId ? ` (${input.releaseId})` : ''
    }`,
    `Track: ${input.title} · ${input.bpm} BPM · ${input.key}`,
    '',
    stages.length
      ? `Stages: ${stages.map((stage) => `${stage.name} — ${stage.status}`).join('; ')}`
      : 'Stages: no track staged on the release yet',
    `Next: ${nextStep}`,
  ];

  return {
    ...input,
    id: `release_handoff_${handoffSlug(input.title)}`,
    stages,
    pending,
    nextStep,
    brief: lines.join('\n'),
    generatedAt,
  };
}
