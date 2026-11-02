import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MusicManagerService,
  type LaunchQuantize,
  type PatternSlot,
} from './music-manager.service';
import { LoggingService } from './logging.service';

export interface TemplateNote {
  midi: number;
  step: number;
  length: number;
  velocity: number;
}

export interface TemplateClip {
  start: number;
  length: number;
  type: 'midi' | 'audio';
  /** Which captured pattern slot this clip plays; null follows the live one. */
  patternSlotId?: string | null;
}

export interface TemplatePatternVersion {
  id: string;
  name: string;
  notes: TemplateNote[];
  steps?: boolean[];
}

export interface TemplatePatternSlot {
  id: string;
  name: string;
  /** Live editor state, which may be newer than the saved versions. */
  notes: TemplateNote[];
  steps?: boolean[];
  /** Saved versions, oldest first. */
  versions?: TemplatePatternVersion[];
  activeVersionId?: string;
  /** The slot's own launch boundary; null inherits the session grid. */
  launchQuantize?: LaunchQuantize | null;
}

export interface ProjectTemplateTrack {
  name: string;
  instrumentId: string;
  type: 'midi' | 'audio' | 'drum';
  /** Four-bar starter phrase, or captured pattern when the artist opted in. */
  notes?: TemplateNote[];
  /** One-bar drum cycle, looped across clips. */
  drumPatternLength?: number;
  /** Captured MIDI/drum clip windows; absent on channel-only templates. */
  clips?: TemplateClip[];
  /** Every referenced pattern, so verse and chorus stay distinct. */
  patternSlots?: TemplatePatternSlot[];
  activePatternSlotId?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  bpm: number;
  genre: string;
  tracks: ProjectTemplateTrack[];
}

const note = (
  midi: number,
  step: number,
  length = 1,
  velocity = 0.8,
): TemplateNote => ({ midi, step, length, velocity });

const chord = (
  midis: number[],
  step: number,
  length = 6,
  velocity = 0.6,
): TemplateNote[] => midis.map((midi) => note(midi, step, length, velocity));

const hits = (
  midi: number,
  steps: number[],
  velocity = 0.8,
): TemplateNote[] => steps.map((step) => note(midi, step, 1, velocity));

/** Repeat a one-bar cell across the four bars the template clip spans. */
const repeat = (cell: TemplateNote[], times = 4, span = 16): TemplateNote[] =>
  Array.from({ length: times }, (_, bar) =>
    cell.map((entry) => ({ ...entry, step: entry.step + bar * span })),
  ).flat();

/** User templates are local-only, like the rest of the project workspace. */
const USER_TEMPLATES_KEY = 'smuve_user_templates_v1';
const MAX_USER_TEMPLATES = 20;
const MAX_TEMPLATE_NAME = 60;
const MAX_TEMPLATE_NOTES = 512;
const MAX_TEMPLATE_CLIPS = 128;
const MAX_TEMPLATE_SLOTS = 16;
const MAX_TEMPLATE_VERSIONS = 12;

const normalizeSteps = (steps?: boolean[]): boolean[] =>
  Array.from({ length: 64 }, (_, index) => !!steps?.[index]);

type TemplateSourceNote = {
  midi: number;
  step: number;
  length: number;
  velocity?: number;
};

function toTemplateNotes(notes: TemplateSourceNote[]): TemplateNote[] {
  return notes
    .filter(
      (entry) =>
        Number.isFinite(entry.midi) &&
        entry.midi >= 0 &&
        entry.midi <= 127 &&
        Number.isFinite(entry.step) &&
        entry.step >= 0,
    )
    .slice(0, MAX_TEMPLATE_NOTES)
    .map((entry) => ({
      midi: entry.midi,
      step: entry.step,
      length: Math.max(0.0625, entry.length || 1),
      velocity: Math.min(1, Math.max(0, entry.velocity ?? 0.8)),
    }));
}

function isTemplateNote(value: unknown): value is TemplateNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Partial<TemplateNote>;
  return (
    Number.isFinite(note.midi) &&
    note.midi! >= 0 &&
    note.midi! <= 127 &&
    Number.isFinite(note.step) &&
    Number.isFinite(note.length) &&
    Number.isFinite(note.velocity) &&
    note.step! >= 0 &&
    note.length! > 0 &&
    note.velocity! >= 0 &&
    note.velocity! <= 1
  );
}

function isTemplateClip(value: unknown): value is TemplateClip {
  if (!value || typeof value !== 'object') return false;
  const clip = value as Partial<TemplateClip>;
  return (
    Number.isFinite(clip.start) &&
    Number.isFinite(clip.length) &&
    clip.start! >= 0 &&
    clip.length! > 0 &&
    (clip.type === 'midi' || clip.type === 'audio') &&
    (clip.patternSlotId === undefined ||
      clip.patternSlotId === null ||
      typeof clip.patternSlotId === 'string')
  );
}

function isTemplateLaunchQuantize(
  value: unknown,
): value is LaunchQuantize | null {
  return (
    value === null ||
    value === undefined ||
    value === 'none' ||
    value === '1bar' ||
    value === '2bar' ||
    value === '4bar'
  );
}

function isTemplatePatternVersion(
  value: unknown,
): value is TemplatePatternVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as Partial<TemplatePatternVersion>;
  return (
    typeof version.id === 'string' &&
    version.id.length > 0 &&
    typeof version.name === 'string' &&
    Array.isArray(version.notes) &&
    version.notes.every(isTemplateNote) &&
    (version.steps === undefined ||
      (Array.isArray(version.steps) &&
        version.steps.every((step) => typeof step === 'boolean')))
  );
}

function isTemplatePatternSlot(value: unknown): value is TemplatePatternSlot {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Partial<TemplatePatternSlot>;
  return (
    typeof slot.id === 'string' &&
    slot.id.length > 0 &&
    typeof slot.name === 'string' &&
    Array.isArray(slot.notes) &&
    slot.notes.every(isTemplateNote) &&
    (slot.steps === undefined ||
      (Array.isArray(slot.steps) &&
        slot.steps.every((step) => typeof step === 'boolean'))) &&
    (slot.versions === undefined ||
      (Array.isArray(slot.versions) &&
        slot.versions.every(isTemplatePatternVersion))) &&
    (slot.activeVersionId === undefined ||
      typeof slot.activeVersionId === 'string') &&
    isTemplateLaunchQuantize(slot.launchQuantize)
  );
}

function readUserTemplates(): ProjectTemplate[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USER_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((template): template is ProjectTemplate => {
      return (
        !!template &&
        typeof template.id === 'string' &&
        typeof template.name === 'string' &&
        Number.isFinite(template.bpm) &&
        Array.isArray(template.tracks) &&
        template.tracks.length > 0 &&
        template.tracks.every(
          (track: unknown) =>
            !!track &&
            typeof (track as { name?: unknown }).name === 'string' &&
            typeof (track as { instrumentId?: unknown }).instrumentId ===
              'string' &&
            ((track as { type?: unknown }).type === undefined ||
              ['midi', 'audio', 'drum'].includes(
                (track as { type?: unknown }).type as string,
              )) &&
            ((track as { notes?: unknown }).notes === undefined ||
              (Array.isArray((track as { notes?: unknown }).notes) &&
                ((track as { notes?: unknown[] }).notes ?? []).every(
                  isTemplateNote,
                ))) &&
            ((track as { clips?: unknown }).clips === undefined ||
              (Array.isArray((track as { clips?: unknown }).clips) &&
                ((track as { clips?: unknown[] }).clips ?? []).every(
                  isTemplateClip,
                ))) &&
            ((track as { patternSlots?: unknown }).patternSlots === undefined ||
              (Array.isArray((track as { patternSlots?: unknown }).patternSlots) &&
                ((track as { patternSlots?: unknown[] }).patternSlots ?? []).every(
                  isTemplatePatternSlot,
                ))) &&
            ((track as { activePatternSlotId?: unknown })
              .activePatternSlotId === undefined ||
              typeof (track as { activePatternSlotId?: unknown })
                .activePatternSlotId === 'string'),
        )
      );
    });
  } catch {
    return [];
  }
}

@Injectable({
  providedIn: 'root',
})
export class ProjectTemplateService {
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);

  templates: ProjectTemplate[] = [
    {
      id: 'elite-instrumental',
      name: 'Elite Instrumental',
      bpm: 128,
      genre: 'house',
      tracks: [
        {
          name: 'Hybrid Lead',
          instrumentId: 'analog-warmth',
          type: 'midi',
          notes: repeat([
            note(69, 0, 2, 0.85),
            note(72, 3, 1, 0.75),
            note(76, 6, 2, 0.85),
            note(79, 10, 1, 0.9),
            note(76, 12, 2, 0.8),
            note(72, 15, 1, 0.7),
          ]),
        },
        {
          name: 'Elite Piano',
          instrumentId: 'grand-piano',
          type: 'midi',
          notes: [
            ...chord([57, 60, 64], 0, 6, 0.62),
            ...chord([53, 57, 60], 16, 6, 0.58),
            ...chord([48, 52, 55], 32, 6, 0.62),
            ...chord([55, 59, 62], 48, 6, 0.58),
          ],
        },
        {
          name: 'Deep Sub',
          instrumentId: 'sub-commander',
          type: 'midi',
          notes: [
            note(33, 0, 14, 0.9),
            note(29, 16, 14, 0.9),
            note(36, 32, 14, 0.9),
            note(31, 48, 14, 0.9),
          ],
        },
        {
          name: 'Studio Drums',
          instrumentId: 'trap-kit-elite',
          type: 'drum',
          drumPatternLength: 16,
          notes: [
            ...hits(36, [0, 4, 8, 12], 0.95),
            ...hits(38, [4, 12], 0.62),
            ...hits(42, [0, 2, 4, 6, 8, 10, 12, 14], 0.5),
          ],
        },
      ],
    },
    {
      id: 'trap-elite',
      name: 'Trap Elite',
      bpm: 140,
      genre: 'trap',
      tracks: [
        {
          name: '808 Bass',
          instrumentId: 'trap-808-elite',
          type: 'midi',
          notes: repeat([
            note(36, 0, 6, 0.95),
            note(31, 6, 3, 0.85),
            note(34, 10, 5, 0.9),
            note(36, 15, 1, 0.8),
          ]),
        },
        {
          name: 'Dark Keys',
          instrumentId: 'grand-piano',
          type: 'midi',
          notes: [
            ...chord([48, 51, 55], 0, 6, 0.58),
            ...chord([44, 48, 51], 16, 6, 0.54),
            ...chord([46, 50, 53], 32, 6, 0.58),
            ...chord([48, 51, 55], 48, 6, 0.54),
          ],
        },
        {
          name: 'Cyber Lead',
          instrumentId: 'cyber-stab',
          type: 'midi',
          notes: repeat([
            note(72, 0, 2, 0.82),
            note(75, 4, 1, 0.72),
            note(79, 6, 2, 0.86),
            note(82, 10, 1, 0.78),
            note(79, 12, 2, 0.8),
            note(75, 15, 1, 0.7),
          ]),
        },
        {
          name: 'Drums',
          instrumentId: 'trap-kit-elite',
          type: 'drum',
          drumPatternLength: 16,
          notes: [
            ...hits(36, [0, 3, 7, 10, 14], 0.95),
            ...hits(38, [4, 12], 0.72),
            ...hits(42, [0, 2, 4, 6, 8, 10, 12, 14], 0.48),
            ...hits(42, [3, 7, 11, 15], 0.32),
          ],
        },
      ],
    },
    {
      id: 'rnb-platinum',
      name: 'R&B Platinum',
      bpm: 92,
      genre: 'rnb',
      tracks: [
        {
          name: 'P-Bass',
          instrumentId: 'p-bass-elite',
          type: 'midi',
          notes: repeat([
            note(38, 0, 6, 0.88),
            note(41, 6, 2, 0.78),
            note(45, 8, 4, 0.84),
            note(48, 12, 4, 0.76),
          ]),
        },
        {
          name: 'Ethereal Keys',
          instrumentId: 'neon-shimmer',
          type: 'midi',
          notes: [
            ...chord([50, 53, 57], 0, 7, 0.56),
            ...chord([46, 50, 53], 16, 7, 0.5),
            ...chord([41, 45, 48], 32, 7, 0.56),
            ...chord([48, 52, 55], 48, 7, 0.5),
          ],
        },
        {
          name: 'Strat Guitar',
          instrumentId: 'strat-elite-clean',
          type: 'midi',
          notes: repeat([
            note(62, 0, 2, 0.66),
            note(65, 3, 1, 0.58),
            note(69, 5, 2, 0.62),
            note(72, 8, 2, 0.6),
            note(69, 11, 1, 0.56),
            note(65, 13, 2, 0.58),
          ]),
        },
        {
          name: 'Vocal Lead',
          instrumentId: 'grand-piano',
          type: 'midi',
          notes: repeat([
            note(69, 0, 3, 0.72),
            note(72, 4, 2, 0.68),
            note(74, 7, 3, 0.74),
            note(77, 11, 2, 0.7),
            note(74, 14, 2, 0.62),
          ]),
        },
      ],
    },
    {
      id: 'synthwave-retro',
      name: 'Synthwave Retro',
      bpm: 115,
      genre: 'ambient',
      tracks: [
        {
          name: 'Analog Pad',
          instrumentId: 'ethereal-wind',
          type: 'midi',
          notes: [
            ...chord([54, 57, 61], 0, 14, 0.5),
            ...chord([50, 54, 57], 16, 14, 0.46),
            ...chord([45, 49, 52], 32, 14, 0.5),
            ...chord([52, 56, 59], 48, 14, 0.46),
          ],
        },
        {
          name: 'Sub Bass',
          instrumentId: 'sub-commander',
          type: 'midi',
          notes: [
            note(30, 0, 12, 0.9),
            note(38, 16, 12, 0.84),
            note(33, 32, 12, 0.88),
            note(40, 48, 12, 0.84),
          ],
        },
        {
          name: 'Neon Lead',
          instrumentId: 'neon-shimmer',
          type: 'midi',
          notes: repeat([
            note(66, 0, 2, 0.78),
            note(69, 4, 2, 0.74),
            note(73, 8, 2, 0.82),
            note(76, 12, 2, 0.76),
          ]),
        },
        {
          name: 'Cyber Drums',
          instrumentId: 'trap-kit-elite',
          type: 'drum',
          drumPatternLength: 16,
          notes: [
            ...hits(36, [0, 4, 8, 12], 0.92),
            ...hits(38, [4, 12], 0.66),
            ...hits(42, [2, 6, 10, 14], 0.48),
          ],
        },
      ],
    },
  ];

  /** Templates the artist saved from their own sessions, newest first. */
  readonly userTemplates = signal<ProjectTemplate[]>(readUserTemplates());

  /** Fixed starters first, then the artist's own. */
  readonly allTemplates = computed<ProjectTemplate[]>(() => [
    ...this.templates,
    ...this.userTemplates(),
  ]);

  /**
   * Capture the current session's channels and tempo as a reusable template.
   *
   * Channel identity is always stored. With `includePattern`, the active
   * MIDI/drum pattern and its clip windows are captured too, so a personal
   * starter can reopen with its groove. Audio clips are skipped because their
   * source buffers are project data and do not travel in a template.
   */
  saveCurrentAsTemplate(
    name: string,
    includePattern = false,
  ): ProjectTemplate | null {
    const trimmed = name.trim().slice(0, MAX_TEMPLATE_NAME);
    if (!trimmed) return null;

    const tracks = this.musicManager
      .tracks()
      .filter((track) => track.type !== 'bus')
      .map((track) => {
        const type = (track.type === 'audio'
          ? 'audio'
          : track.type === 'drum'
            ? 'drum'
            : 'midi') as 'midi' | 'audio' | 'drum';
        const channel: ProjectTemplateTrack = {
          name: track.name,
          instrumentId: track.instrumentId || 'grand-piano',
          type,
        };
        if (!includePattern || type === 'audio') return channel;

        const notes = toTemplateNotes(track.notes ?? []);
        const clips = (track.clips ?? [])
          .filter((clip) => clip.type !== 'audio')
          .slice(0, MAX_TEMPLATE_CLIPS)
          .map((clip) => ({
            start: Math.max(0, clip.start || 0),
            length: Math.max(0.25, clip.length || 4),
            type: 'midi' as const,
            patternSlotId: clip.patternSlotId ?? null,
          }));
        const activeSlotId =
          track.activePatternSlotId ?? track.patternSlots?.[0]?.id ?? null;
        const referenced = new Set<string>();
        for (const clip of clips) {
          if (clip.patternSlotId) referenced.add(clip.patternSlotId);
        }
        if (activeSlotId) referenced.add(activeSlotId);

        const patternSlots: TemplatePatternSlot[] = (track.patternSlots ?? [])
          .filter((slot) => referenced.has(slot.id))
          .map((slot) => {
            const source =
              slot.id === activeSlotId
                ? { notes: track.notes ?? [], steps: track.steps ?? [] }
                : slot.versions.at(-1) ?? { notes: [], steps: [] };
            const versions = slot.versions
              .slice(-MAX_TEMPLATE_VERSIONS)
              .map((version) => ({
                id: version.id,
                name: version.name,
                notes: toTemplateNotes(version.notes ?? []),
                steps: normalizeSteps(version.steps),
              }));
            const activeVersionId =
              versions.find((version) => version.id === slot.activeVersionId)
                ?.id ?? versions.at(-1)?.id;
            return {
              id: slot.id,
              name: slot.name || 'Pattern',
              notes: toTemplateNotes(source.notes ?? []),
              steps: normalizeSteps(source.steps),
              ...(versions.length
                ? {
                    versions,
                    ...(activeVersionId ? { activeVersionId } : {}),
                  }
                : {}),
              launchQuantize: slot.launchQuantize ?? null,
            };
          })
          .slice(0, MAX_TEMPLATE_SLOTS);

        return {
          ...channel,
          ...(notes.length ? { notes } : {}),
          // Present even when empty: it marks a captured pattern rather than a
          // fixed four-bar starter.
          clips,
          ...(patternSlots.length
            ? {
                patternSlots,
                ...(activeSlotId ? { activePatternSlotId: activeSlotId } : {}),
              }
            : {}),
          ...(type === 'drum'
            ? { drumPatternLength: track.drumPatternLength ?? 16 }
            : {}),
        };
      });
    if (tracks.length === 0) return null;

    const template: ProjectTemplate = {
      id: `user-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      name: trimmed,
      bpm: this.musicManager.engine.tempo(),
      genre: 'user',
      tracks,
    };

    const next = [template, ...this.userTemplates()].slice(
      0,
      MAX_USER_TEMPLATES,
    );
    this.userTemplates.set(next);
    this.persist(next);
    this.logger.info(
      `ProjectTemplateService: Saved user template ${template.name}`,
    );
    return template;
  }

  /** Remove one of the artist's templates. Fixed starters are not deletable. */
  deleteUserTemplate(id: string): boolean {
    const next = this.userTemplates().filter((template) => template.id !== id);
    if (next.length === this.userTemplates().length) return false;
    this.userTemplates.set(next);
    this.persist(next);
    return true;
  }

  private persist(templates: ProjectTemplate[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(templates));
    } catch {
      // Storage full or refused: the in-memory list still works this session.
    }
  }

  applyTemplate(templateId: string) {
    const template = this.allTemplates().find((t) => t.id === templateId);
    if (!template) return;

    this.musicManager.newProject(true);
    for (const t of template.tracks) {
      const trackId = this.musicManager.addTrack(
        t.name,
        t.instrumentId,
        t.type,
      );
      if (!trackId) break;

      const patternSlots: PatternSlot[] = (t.patternSlots ?? []).map(
        (slot, slotIndex) => {
          const versions = slot.versions?.length
            ? slot.versions
                .slice(-MAX_TEMPLATE_VERSIONS)
                .map((version, versionIndex) => ({
                  id: version.id || `v${versionIndex + 1}`,
                  name: version.name || `v${versionIndex + 1}`,
                  steps: normalizeSteps(version.steps),
                  notes: version.notes.map((entry, index) => ({
                    ...entry,
                    id: `tpl_${trackId}_${slotIndex}_${versionIndex}_${index}`,
                  })),
                }))
            : [
                {
                  id: 'v1',
                  name: 'v1',
                  steps: normalizeSteps(slot.steps),
                  notes: slot.notes.map((entry, index) => ({
                    ...entry,
                    id: `tpl_${trackId}_${slotIndex}_0_${index}`,
                  })),
                },
              ];
          const activeVersionId =
            versions.find((version) => version.id === slot.activeVersionId)
              ?.id ?? versions[versions.length - 1].id;
          return {
            id: slot.id,
            name: slot.name,
            activeVersionId,
            versions,
            launchQuantize: slot.launchQuantize ?? null,
          };
        },
      );
      const activeSlotId =
        patternSlots.find((slot) => slot.id === t.activePatternSlotId)?.id ??
        patternSlots[0]?.id ??
        null;
      const activeTemplateSlot = t.patternSlots?.find(
        (slot) => slot.id === activeSlotId,
      );
      const activeNotes = activeTemplateSlot
        ? activeTemplateSlot.notes.map((entry, index) => ({
            ...entry,
            id: `tpl_${trackId}_live_${index}`,
          }))
        : (t.notes ?? []).map((entry, index) => ({
            ...entry,
            id: `tpl_${trackId}_${index}`,
          }));
      const hasPattern =
        patternSlots.length > 0 || (t.notes?.length ?? 0) > 0;
      if (!hasPattern) continue;

      if (patternSlots.length) {
        // One patch restores every referenced pattern and makes the intended
        // one live, so the editor and the clips agree immediately.
        this.musicManager.applyTrackPatch(
          trackId,
          {
            patternSlots,
            activePatternSlotId: activeSlotId,
            notes: activeNotes,
            steps: normalizeSteps(activeTemplateSlot?.steps),
            ...(t.type === 'drum'
              ? { drumPatternLength: t.drumPatternLength ?? 16 }
              : {}),
          },
          `Template · ${t.name}`,
        );
      } else {
        this.musicManager.replaceTrackNotes(
          trackId,
          activeNotes,
          `Template · ${t.name}`,
        );
        if (t.type === 'drum') {
          this.musicManager.applyTrackPatch(
            trackId,
            { drumPatternLength: t.drumPatternLength ?? 16 },
            `Template · ${t.name} cycle`,
          );
        }
      }

      if (t.clips?.length) {
        for (const clip of t.clips) {
          const clipSlotId = t.patternSlots
            ? clip.patternSlotId &&
              t.patternSlots.some((slot) => slot.id === clip.patternSlotId)
              ? clip.patternSlotId
              : null
            : undefined;
          this.musicManager.addClipToTrack(trackId, {
            name: `${t.name} · pattern`,
            start: clip.start,
            length: clip.length,
            type: clip.type === 'audio' ? 'audio' : 'midi',
            ...(clipSlotId !== undefined
              ? { patternSlotId: clipSlotId }
              : {}),
          });
        }
      } else {
        // Fixed starters span four bars. A captured pattern with no clips keeps
        // whatever length its notes actually need.
        const lastNoteStep = activeNotes.reduce(
          (end, entry) => Math.max(end, entry.step + entry.length),
          0,
        );
        const length = t.clips
          ? Math.max(1, Math.ceil(lastNoteStep / 16))
          : 4;
        this.musicManager.addClipToTrack(trackId, {
          name: `${t.name} · ${length} bars`,
          start: 0,
          length,
          type: 'midi',
        });
      }
    }
    this.musicManager.engine.tempo.set(template.bpm);
    this.logger.info(
      `ProjectTemplateService: Applied template ${template.name}`,
    );
  }
}
