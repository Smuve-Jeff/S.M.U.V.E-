import { Injectable, computed, inject, signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
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

function isTemplateNote(value: unknown): value is TemplateNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Partial<TemplateNote>;
  return (
    Number.isFinite(note.midi) &&
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
    (clip.type === 'midi' || clip.type === 'audio')
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
                ))),
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

        const notes = (track.notes ?? [])
          .filter((entry) => Number.isFinite(entry.step) && entry.step >= 0)
          .slice(0, MAX_TEMPLATE_NOTES)
          .map((entry) => ({
            midi: entry.midi,
            step: entry.step,
            length: Math.max(0.0625, entry.length || 1),
            velocity: Math.min(1, Math.max(0, entry.velocity ?? 0.8)),
          }));
        const clips = (track.clips ?? [])
          .filter((clip) => clip.type !== 'audio')
          .slice(0, MAX_TEMPLATE_CLIPS)
          .map((clip) => ({
            start: Math.max(0, clip.start || 0),
            length: Math.max(0.25, clip.length || 4),
            type: 'midi' as const,
          }));
        return {
          ...channel,
          ...(notes.length ? { notes } : {}),
          // Present even when empty: it marks a captured pattern rather than a
          // fixed four-bar starter.
          clips,
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
      if (!t.notes?.length) continue;

      // Fixed starters ship a playable four-bar phrase, not just channels.
      // Note ids are derived from the track so a re-apply is deterministic.
      this.musicManager.replaceTrackNotes(
        trackId,
        t.notes.map((entry, index) => ({
          ...entry,
          id: `tpl_${trackId}_${index}`,
        })),
        `Template · ${t.name}`,
      );
      if (t.type === 'drum') {
        this.musicManager.applyTrackPatch(
          trackId,
          { drumPatternLength: t.drumPatternLength ?? 16 },
          `Template · ${t.name} cycle`,
        );
      }
      if (t.clips?.length) {
        for (const clip of t.clips) {
          this.musicManager.addClipToTrack(trackId, {
            name: `${t.name} · pattern`,
            start: clip.start,
            length: clip.length,
            type: clip.type === 'audio' ? 'audio' : 'midi',
          });
        }
      } else {
        // Fixed starters span four bars. A captured pattern with no clips keeps
        // whatever length its notes actually need.
        const lastNoteStep = t.notes.reduce(
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
