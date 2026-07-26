import { Injectable, inject, signal, computed } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { MusicManagerService } from '../services/music-manager.service';
import { ProjectService } from '../services/project.service';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';

export interface ProjectMetadata {
  id: string;
  name: string;
  bpm: number;
  key: string;
  genre: string;
  mood: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  version: number;
}

export interface ProjectBundle {
  metadata: ProjectMetadata;
  tracks: any[];
  automation: any;
  mixState: any;
  notes: string;
  exportedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectWorkspaceService {
  private readonly auth = inject(AuthService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly projectService = inject(ProjectService);
  private readonly storage = inject(LocalStorageService);
  private readonly logger = inject(LoggingService);

  /** Current project metadata */
  metadata = signal<ProjectMetadata | null>(null);
  /** Auto-save enabled */
  autoSaveEnabled = signal(true);
  /** Auto-save interval in ms */
  autoSaveIntervalMs = signal(30000); // 30s
  /** Last auto-save timestamp */
  lastAutoSave = signal<number>(0);
  /** Whether the current project has unsaved changes */
  isDirty = signal(false);
  /** Number of versions saved */
  versionCount = signal(0);

  /** Available genre templates */
  genres = ['pop', 'trap', 'house', 'lo-fi', 'neo-soul', 'drill', 'rnb', 'jazz', 'funk', 'ambient', 'techno', 'dnb', 'garage', 'reggaeton'];
  /** Available keys (Western) */
  keys = ['C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em', 'F', 'Fm', 'F#', 'F#m', 'G', 'Gm', 'Ab', 'Abm', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'];
  /** Available moods */
  moods = ['dark', 'bright', 'chill', 'energetic', 'melancholic', 'aggressive', 'dreamy', 'funky', 'ambient', 'uplifting', 'mysterious', 'romantic'];
  /** Common tempo profiles per genre */
  genreBpmMap: Record<string, number> = {
    'pop': 120, 'trap': 140, 'house': 124, 'lo-fi': 78,
    'neo-soul': 92, 'drill': 142, 'rnb': 90, 'jazz': 110,
    'funk': 100, 'ambient': 70, 'techno': 128, 'dnb': 174,
    'garage': 130, 'reggaeton': 100,
  };

  /** Auto-save timer ref */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initializeMetadata();
    this.startAutoSave();

    // Watch for dirty state changes
    this.musicManager.tracks;
  }

  // ── Project Metadata ───────────────────────────────────

  private initializeMetadata() {
    const existing = this.projectService.currentProject();
    if (existing) {
      this.metadata.set({
        id: existing.id,
        name: existing.name,
        bpm: existing.bpm,
        key: existing.timeSignature ? 'C' : 'C',
        genre: 'pop',
        mood: 'energetic',
        tags: [],
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
        lastOpenedAt: Date.now(),
        version: 1,
      });
    } else {
      this.createNewMetadata();
    }
  }

  private createNewMetadata() {
    const meta: ProjectMetadata = {
      id: `proj_${Date.now()}`,
      name: 'Untitled Project',
      bpm: 120,
      key: 'C',
      genre: 'pop',
      mood: 'energetic',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      version: 1,
    };
    this.metadata.set(meta);
  }

  updateMetadata(patch: Partial<ProjectMetadata>) {
    this.metadata.update((m) => {
      if (!m) return m;
      const updated = { ...m, ...patch, updatedAt: Date.now() };
      return updated;
    });
    this.isDirty.set(true);
  }

  setGenre(genre: string) {
    const bpm = this.genreBpmMap[genre];
    const moodMap: Record<string, string> = {
      'trap': 'dark', 'lo-fi': 'chill', 'house': 'energetic',
      'neo-soul': 'dreamy', 'drill': 'aggressive', 'pop': 'bright',
      'rnb': 'chill', 'jazz': 'chill', 'funk': 'funky',
      'ambient': 'dreamy', 'techno': 'dark', 'dnb': 'aggressive',
    };
    this.updateMetadata({
      genre,
      ...(bpm ? { bpm } : {}),
      ...(moodMap[genre] ? { mood: moodMap[genre] } : {}),
    });
    // Update engine tempo too
    if (bpm) {
      this.musicManager.engine?.tempo?.set?.(bpm);
    }
  }

  // ── Auto-Save ──────────────────────────────────────────

  private startAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);

    this.autoSaveTimer = setInterval(() => {
      if (this.autoSaveEnabled() && this.isDirty()) {
        this.autoSave();
      }
    }, this.autoSaveIntervalMs());
  }

  async autoSave() {
    try {
      const snapshot = this.createSnapshot();
      await this.storage.saveItem('autosave', `autosave_${snapshot.metadata.id}`);
      this.lastAutoSave.set(Date.now());
      this.isDirty.set(false);
      this.versionCount.update((v) => v + 1);
      this.logger.info('ProjectWorkspace: Auto-saved ' + snapshot.metadata.name);

      // Keep last 5 versions
      await this.pruneOldVersions(snapshot.metadata.id, 5);
    } catch (e) {
      this.logger.warn('ProjectWorkspace: Auto-save failed', e);
    }
  }

  async manualSave(): Promise<ProjectBundle> {
    const bundle = this.createSnapshot();
    try {
      await this.storage.saveItem('projects', `project_${bundle.metadata.id}`);
      await this.storage.saveItem('prefs', 'last_saved_project_id');
      this.isDirty.set(false);
      this.versionCount.update((v) => v + 1);
      this.logger.info('ProjectWorkspace: Saved ' + bundle.metadata.name);
    } catch (e) {
      this.logger.warn('ProjectWorkspace: Manual save failed', e);
    }
    return bundle;
  }

  async loadProject(projectId: string): Promise<ProjectBundle | null> {
    try {
      const bundle = await this.storage.getItem('projects', `project_${projectId}`);
      if (bundle) {
        this.restoreFromSnapshot(bundle as ProjectBundle);
        return bundle as ProjectBundle;
      }
    } catch (e) {
      this.logger.warn(`ProjectWorkspace: Load failed for ${projectId}`, e);
    }
    return null;
  }

  async exportProjectBundle(): Promise<ProjectBundle> {
    const bundle = this.createSnapshot();
    bundle.exportedAt = Date.now();
    return bundle;
  }

  async importProjectBundle(bundle: ProjectBundle): Promise<boolean> {
    try {
      await this.storage.saveItem('projects', `project_${bundle.metadata.id}`);
      this.restoreFromSnapshot(bundle);
      this.logger.info('ProjectWorkspace: Imported ' + bundle.metadata.name);
      return true;
    } catch (e) {
      this.logger.warn('ProjectWorkspace: Import failed', e);
      return false;
    }
  }

  /** Download project bundle as JSON file */
  downloadProjectBundle() {
    const meta = this.metadata();
    if (!meta) return;

    const bundle = this.createSnapshot();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.name.replace(/[^a-zA-Z0-9]/g, '_')}_v${meta.version}.smuve`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Snapshot ───────────────────────────────────────────

  createSnapshot(): ProjectBundle {
    const meta = this.metadata() || this.createNewMetadata() || {
      id: `proj_${Date.now()}`,
      name: 'Untitled',
      bpm: 120,
      key: 'C',
      genre: 'pop',
      mood: 'energetic',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      version: 1,
    };

    return {
      metadata: meta,
      tracks: this.musicManager.tracks(),
      automation: {},
      mixState: {
        masterGain: this.musicManager.engine?.masterGain?.gain?.value ?? 0.8,
      },
      notes: '',
      exportedAt: Date.now(),
    };
  }

  restoreFromSnapshot(bundle: ProjectBundle) {
    this.metadata.set({ ...bundle.metadata });
    if (bundle.tracks) {
      // Restore tracks through music manager
      // (actual track restoration handled by MusicManagerService)
    }
  }

  /** Keep only the N most recent auto-saves */
  private async pruneOldVersions(projectId: string, keep: number) {
    // Versions are individual storage items — the latest write wins
    // This is a placeholder for future version history
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
}
