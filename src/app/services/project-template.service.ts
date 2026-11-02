import { Injectable, computed, inject, signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { LoggingService } from './logging.service';

export interface ProjectTemplate {
  id: string;
  name: string;
  bpm: number;
  genre: string;
  tracks: { name: string; instrumentId: string; type: 'midi' | 'audio' }[];
}

/** User templates are local-only, like the rest of the project workspace. */
const USER_TEMPLATES_KEY = 'smuve_user_templates_v1';
const MAX_USER_TEMPLATES = 20;
const MAX_TEMPLATE_NAME = 60;

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
              'string',
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
        { name: 'Hybrid Lead', instrumentId: 'analog-warmth', type: 'midi' },
        { name: 'Elite Piano', instrumentId: 'grand-piano', type: 'midi' },
        { name: 'Deep Sub', instrumentId: 'sub-commander', type: 'midi' },
        { name: 'Studio Drums', instrumentId: 'trap-808-elite', type: 'midi' },
      ],
    },
    {
      id: 'trap-elite',
      name: 'Trap Elite',
      bpm: 140,
      genre: 'trap',
      tracks: [
        { name: '808 Bass', instrumentId: 'trap-808-elite', type: 'midi' },
        { name: 'Dark Keys', instrumentId: 'grand-piano', type: 'midi' },
        { name: 'Cyber Lead', instrumentId: 'cyber-stab', type: 'midi' },
        { name: 'Drums', instrumentId: 'trap-808-elite', type: 'midi' },
      ],
    },
    {
      id: 'rnb-platinum',
      name: 'R&B Platinum',
      bpm: 92,
      genre: 'rnb',
      tracks: [
        { name: 'P-Bass', instrumentId: 'p-bass-elite', type: 'midi' },
        { name: 'Ethereal Keys', instrumentId: 'neon-shimmer', type: 'midi' },
        {
          name: 'Strat Guitar',
          instrumentId: 'strat-elite-clean',
          type: 'midi',
        },
        { name: 'Vocal Lead', instrumentId: 'grand-piano', type: 'midi' },
      ],
    },
    {
      id: 'synthwave-retro',
      name: 'Synthwave Retro',
      bpm: 115,
      genre: 'ambient',
      tracks: [
        { name: 'Analog Pad', instrumentId: 'ethereal-wind', type: 'midi' },
        { name: 'Sub Bass', instrumentId: 'sub-commander', type: 'midi' },
        { name: 'Neon Lead', instrumentId: 'neon-shimmer', type: 'midi' },
        { name: 'Cyber Drums', instrumentId: 'cyber-stab', type: 'midi' },
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
   * Only channel identity is stored — name, instrument and audio/MIDI kind —
   * which is the same contract the fixed starters use. Notes, clips and mix
   * state belong to the project, not to a template.
   */
  saveCurrentAsTemplate(name: string): ProjectTemplate | null {
    const trimmed = name.trim().slice(0, MAX_TEMPLATE_NAME);
    if (!trimmed) return null;

    const tracks = this.musicManager
      .tracks()
      .filter((track) => track.type !== 'bus')
      .map((track) => ({
        name: track.name,
        instrumentId: track.instrumentId || 'grand-piano',
        type: (track.type === 'audio' ? 'audio' : 'midi') as 'midi' | 'audio',
      }));
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
    template.tracks.forEach((t) => {
      this.musicManager.addTrack(t.name, t.instrumentId);
    });
    this.musicManager.engine.tempo.set(template.bpm);
    this.logger.info(
      `ProjectTemplateService: Applied template ${template.name}`,
    );
  }
}
