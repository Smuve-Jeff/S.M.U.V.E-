import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { MusicManagerService } from '../services/music-manager.service';
import { ProjectService } from '../services/project.service';
import { LocalStorageService } from '../services/local-storage.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { LoggingService } from '../services/logging.service';
import { APP_SECURITY_CONFIG } from '../app.security';

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

export interface SerializedAudioAsset {
  id: string;
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  duration: number;
  channels: number[][];
}

export interface ProjectBundle {
  metadata: ProjectMetadata;
  tracks: any[];
  audioAssets?: SerializedAudioAsset[];
  automation: any;
  mixState: any;
  notes: string;
  exportedAt: number;
}

export type ProjectPersistenceSource =
  | 'manual'
  | 'autosave'
  | 'recovery'
  | 'import';

interface StoredProjectBundle extends ProjectBundle {
  id: string;
  savedAt: number;
  source: ProjectPersistenceSource;
}

@Injectable({ providedIn: 'root' })
export class ProjectWorkspaceService {
  private readonly auth = inject(AuthService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly projectService = inject(ProjectService);
  private readonly storage = inject(LocalStorageService);
  private readonly offlineSync = inject(OfflineSyncService);
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
  /** Timestamp of the last successful local/manual persistence. */
  lastPersistedAt = signal<number>(0);
  /** Most recent queued cloud operation, if the user is authenticated. */
  lastQueuedSyncId = signal<string | null>(null);
  /** True while a local save has been queued for cloud sync. */
  cloudSyncQueued = signal(false);
  /** Timestamp of the most recent restored local bundle. */
  lastRecoveredAt = signal<number | null>(null);
  /** Source of the most recent restored local bundle. */
  lastRecoveredSource = signal<ProjectPersistenceSource | null>(null);

  /** Available genre templates */
  genres = [
    'pop',
    'trap',
    'house',
    'lo-fi',
    'neo-soul',
    'drill',
    'rnb',
    'jazz',
    'funk',
    'ambient',
    'techno',
    'dnb',
    'garage',
    'reggaeton',
  ];
  /** Available keys (Western) */
  keys = [
    'C',
    'Cm',
    'C#',
    'C#m',
    'D',
    'Dm',
    'Eb',
    'Ebm',
    'E',
    'Em',
    'F',
    'Fm',
    'F#',
    'F#m',
    'G',
    'Gm',
    'Ab',
    'Abm',
    'A',
    'Am',
    'Bb',
    'Bbm',
    'B',
    'Bm',
  ];
  /** Available moods */
  moods = [
    'dark',
    'bright',
    'chill',
    'energetic',
    'melancholic',
    'aggressive',
    'dreamy',
    'funky',
    'ambient',
    'uplifting',
    'mysterious',
    'romantic',
  ];
  /** Common tempo profiles per genre */
  genreBpmMap: Record<string, number> = {
    pop: 120,
    trap: 140,
    house: 124,
    'lo-fi': 78,
    'neo-soul': 92,
    drill: 142,
    rnb: 90,
    jazz: 110,
    funk: 100,
    ambient: 70,
    techno: 128,
    dnb: 174,
    garage: 130,
    reggaeton: 100,
  };

  /** Auto-save timer ref */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private lastObservedSignature = '';
  private lastSavedSignature = '';

  constructor() {
    this.initializeMetadata();
    this.lastObservedSignature = this.captureStateSignature();
    this.lastSavedSignature = this.lastObservedSignature;
    this.watchWorkspaceChanges();
    this.startAutoSave();
    this.installLifecyclePersistence();
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

  private createNewMetadata(
    patch: Partial<ProjectMetadata> = {}
  ): ProjectMetadata {
    const now = Date.now();
    const meta: ProjectMetadata = {
      id: patch.id || `proj_${now}`,
      name: patch.name || 'Untitled Project',
      bpm: patch.bpm ?? this.currentTempo() ?? 120,
      key: patch.key || 'C',
      genre: patch.genre || 'pop',
      mood: patch.mood || 'energetic',
      tags: patch.tags ? [...patch.tags] : [],
      createdAt: patch.createdAt ?? now,
      updatedAt: patch.updatedAt ?? now,
      lastOpenedAt: patch.lastOpenedAt ?? now,
      version: patch.version ?? 1,
    };
    this.metadata.set(meta);
    return meta;
  }

  startFreshProject(seed: Partial<ProjectMetadata> = {}): ProjectMetadata {
    const meta = this.createNewMetadata(seed);
    const signature = this.captureStateSignature(
      meta,
      this.musicManager.tracks(),
      meta.bpm
    );
    this.lastObservedSignature = signature;
    this.lastSavedSignature = '';
    this.lastAutoSave.set(0);
    this.lastPersistedAt.set(0);
    this.versionCount.set(0);
    this.lastQueuedSyncId.set(null);
    this.cloudSyncQueued.set(false);
    this.lastRecoveredAt.set(null);
    this.lastRecoveredSource.set(null);
    this.isDirty.set(this.musicManager.tracks().length > 0);
    return meta;
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
      trap: 'dark',
      'lo-fi': 'chill',
      house: 'energetic',
      'neo-soul': 'dreamy',
      drill: 'aggressive',
      pop: 'bright',
      rnb: 'chill',
      jazz: 'chill',
      funk: 'funky',
      ambient: 'dreamy',
      techno: 'dark',
      dnb: 'aggressive',
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
      const stored = this.toStoredBundle(snapshot, 'autosave');
      await this.storage.saveItem('projects', stored);
      await this.queueCloudSync(snapshot);
      this.lastAutoSave.set(stored.savedAt);
      this.markPersistenceClean(snapshot, 'autosave', stored.savedAt);
      this.versionCount.update((v) => v + 1);
      this.logger.info(
        'ProjectWorkspace: Auto-saved ' + snapshot.metadata.name
      );

      // Keep last 5 versions
      await this.pruneOldVersions(snapshot.metadata.id, 5);
    } catch (e) {
      this.logger.warn('ProjectWorkspace: Auto-save failed', e);
    }
  }

  async manualSave(): Promise<ProjectBundle> {
    const bundle = this.createSnapshot();
    try {
      const stored = this.toStoredBundle(bundle, 'manual');
      // Persist the complete bundle locally before attempting any network work.
      await this.storage.saveItem('projects', stored);
      await this.storage.saveItem('offline_local_cache', {
        id: 'last_saved_project_id',
        payload: bundle.metadata.id,
        savedAt: stored.savedAt,
      });
      await this.queueCloudSync(bundle);
      this.markPersistenceClean(bundle, 'manual', stored.savedAt);
      this.versionCount.update((v) => v + 1);
      this.logger.info('ProjectWorkspace: Saved ' + bundle.metadata.name);
    } catch (e) {
      // A local save should never be reported as lost if optional cloud
      // persistence is unavailable. The next save can retry the queue.
      this.logger.warn('ProjectWorkspace: Manual save failed', e);
    }
    return bundle;
  }

  async loadProject(projectId: string): Promise<ProjectBundle | null> {
    try {
      const bundle = await this.storage.getItem(
        'projects',
        `project_${projectId}`
      );
      if (bundle) {
        this.restoreFromSnapshot(bundle as ProjectBundle);
        this.markPersistenceClean(
          bundle as ProjectBundle,
          'manual',
          (bundle as StoredProjectBundle).savedAt
        );
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
    await this.offlineSync.saveLocal(
      `export_${bundle.metadata.id}_${bundle.exportedAt}`,
      bundle,
      30 * 24 * 60 * 60 * 1000
    );
    return bundle;
  }

  async importProjectBundle(bundle: ProjectBundle): Promise<boolean> {
    try {
      const stored = this.toStoredBundle(bundle, 'import');
      await this.storage.saveItem('projects', stored);
      await this.storage.saveItem('offline_local_cache', {
        id: 'last_saved_project_id',
        payload: bundle.metadata.id,
        savedAt: stored.savedAt,
      });
      this.restoreFromSnapshot(bundle);
      await this.queueCloudSync(bundle);
      this.markPersistenceClean(bundle, 'import', stored.savedAt);
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
    void this.offlineSync.saveLocal(
      `export_${bundle.metadata.id}_${bundle.exportedAt}`,
      bundle,
      30 * 24 * 60 * 60 * 1000
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.name.replace(/[^a-zA-Z0-9]/g, '_')}_v${meta.version}.smuve`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async restoreLatestProjectState(): Promise<boolean> {
    if (this.musicManager.tracks().length > 0) return false;

    try {
      const stored = (await this.storage.getAllItems('projects'))
        .filter((item) => this.isStoredProjectBundle(item))
        .sort(
          (a, b) =>
            this.storedSavedAt(b as StoredProjectBundle) -
            this.storedSavedAt(a as StoredProjectBundle)
        ) as StoredProjectBundle[];

      const freshest = stored.find((bundle) => bundle.tracks?.length > 0);
      if (!freshest) return false;

      const source = freshest.source || this.detectPersistenceSource(freshest.id);
      const recoveredMeta = {
        ...freshest.metadata,
        lastOpenedAt: Date.now(),
      };
      const recoveredBundle: ProjectBundle = {
        ...freshest,
        metadata: recoveredMeta,
      };

      this.restoreFromSnapshot(recoveredBundle);
      this.markPersistenceClean(
        recoveredBundle,
        source,
        this.storedSavedAt(freshest)
      );
      this.lastRecoveredAt.set(this.storedSavedAt(freshest));
      this.lastRecoveredSource.set(source);
      return true;
    } catch (e) {
      this.logger.warn('ProjectWorkspace: Restore failed', e);
      return false;
    }
  }

  private async queueCloudSync(bundle: ProjectBundle): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.cloudSyncQueued.set(false);
      return;
    }

    const syncId = await this.offlineSync.queueOperation(
      'CREATE',
      `${APP_SECURITY_CONFIG.api_url}/projects`,
      {
        projectId: bundle.metadata.id,
        userId,
        title: bundle.metadata.name,
        projectData: bundle,
      },
      { userId }
    );
    this.lastQueuedSyncId.set(syncId);
    this.cloudSyncQueued.set(true);
  }

  // ── Snapshot ───────────────────────────────────────────

  createSnapshot(metadata: ProjectMetadata = this.currentSyncedMetadata()): ProjectBundle {
    const meta = {
      ...metadata,
      bpm: metadata.bpm || this.currentTempo() || 120,
    };
    const { tracks, audioAssets } = this.captureSnapshotTracks();

    return {
      metadata: meta,
      tracks,
      audioAssets,
      automation: {},
      mixState: {
        masterGain: this.musicManager.engine?.masterGain?.gain?.value ?? 0.8,
      },
      notes: '',
      exportedAt: Date.now(),
    };
  }

  restoreFromSnapshot(bundle: ProjectBundle) {
    this.metadata.set({
      ...bundle.metadata,
      lastOpenedAt: Date.now(),
    });
    this.restoreAudioAssets(bundle);
    if (bundle.tracks) {
      this.musicManager.tracks.set(bundle.tracks as any);
      this.isDirty.set(false);
    }
    if (bundle.metadata?.bpm) {
      this.musicManager.engine?.tempo?.set?.(bundle.metadata.bpm);
    }
    this.logger.info('ProjectWorkspace: Restored project ' + (bundle.metadata?.name ?? 'Untitled'));
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

  private watchWorkspaceChanges() {
    effect(() => {
      const signature = this.captureStateSignature(
        this.metadata(),
        this.musicManager.tracks(),
        this.currentTempo()
      );
      if (!this.lastObservedSignature) {
        this.lastObservedSignature = signature;
        if (!this.lastSavedSignature) {
          this.lastSavedSignature = signature;
        }
        return;
      }
      if (signature === this.lastObservedSignature) {
        return;
      }
      this.lastObservedSignature = signature;
      this.isDirty.set(signature !== this.lastSavedSignature);
    });
  }

  private installLifecyclePersistence() {
    if (typeof window === 'undefined') return;

    window.addEventListener('pagehide', () => {
      void this.persistRecoverySnapshot();
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          void this.persistRecoverySnapshot();
        }
      });
    }
  }

  private async persistRecoverySnapshot(): Promise<void> {
    if (!this.metadata() || this.musicManager.tracks().length === 0) return;

    try {
      const bundle = this.toStoredBundle(this.createSnapshot(), 'recovery');
      await this.storage.saveItem('projects', bundle);
      await this.storage.saveItem('offline_local_cache', {
        id: 'last_saved_project_id',
        payload: bundle.metadata.id,
        savedAt: bundle.savedAt,
      });
    } catch (e) {
      this.logger.warn('ProjectWorkspace: Recovery snapshot failed', e);
    }
  }

  private currentSyncedMetadata(): ProjectMetadata {
    const meta = this.metadata() ?? this.createNewMetadata();
    return {
      ...meta,
      bpm: this.currentTempo() || meta.bpm,
      updatedAt: Date.now(),
      lastOpenedAt: meta.lastOpenedAt || Date.now(),
    };
  }

  private currentTempo(): number {
    const tempoSignal = this.musicManager.engine?.tempo;
    if (typeof tempoSignal === 'function') {
      const value = Number(tempoSignal());
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return this.metadata()?.bpm || 120;
  }

  private captureStateSignature(
    metadata: ProjectMetadata | null = this.metadata(),
    tracks: any[] = this.musicManager.tracks(),
    tempo: number = this.currentTempo()
  ): string {
    return JSON.stringify({
      metadata,
      tempo,
      tracks,
      masterGain: this.musicManager.engine?.masterGain?.gain?.value ?? 0.8,
    });
  }

  private toStoredBundle(
    bundle: ProjectBundle,
    source: ProjectPersistenceSource
  ): StoredProjectBundle {
    return {
      id: `${source === 'manual' || source === 'import' ? 'project' : source}_${bundle.metadata.id}`,
      ...bundle,
      savedAt: Date.now(),
      source,
    };
  }

  private markPersistenceClean(
    bundle: ProjectBundle,
    source: ProjectPersistenceSource,
    savedAt: number = Date.now()
  ) {
    const signature = this.captureStateSignature(
      bundle.metadata,
      bundle.tracks,
      bundle.metadata.bpm
    );
    this.lastObservedSignature = signature;
    this.lastSavedSignature = signature;
    this.metadata.set({ ...bundle.metadata });
    this.lastPersistedAt.set(savedAt);
    this.isDirty.set(false);
    if (source !== 'autosave') {
      this.lastRecoveredAt.set(null);
      this.lastRecoveredSource.set(null);
    }
  }

  private isStoredProjectBundle(item: any): item is StoredProjectBundle {
    return (
      !!item &&
      typeof item.id === 'string' &&
      item.metadata &&
      Array.isArray(item.tracks) &&
      (item.id.startsWith('project_') ||
        item.id.startsWith('autosave_') ||
        item.id.startsWith('recovery_'))
    );
  }

  private storedSavedAt(bundle: StoredProjectBundle): number {
    return bundle.savedAt || bundle.metadata?.updatedAt || 0;
  }

  private detectPersistenceSource(id: string): ProjectPersistenceSource {
    if (id.startsWith('autosave_')) return 'autosave';
    if (id.startsWith('recovery_')) return 'recovery';
    if (id.startsWith('project_')) return 'manual';
    return 'manual';
  }

  private captureSnapshotTracks(): {
    tracks: any[];
    audioAssets: SerializedAudioAsset[];
  } {
    const audioAssets = new Map<string, SerializedAudioAsset>();
    const tracks = this.musicManager.tracks().map((track) =>
      JSON.parse(
        JSON.stringify({
          ...track,
          clips: (track.clips ?? []).map((clip: any) => {
            if (clip?.type !== 'audio') {
              return { ...clip };
            }
            const refId =
              typeof clip.audioRefId === 'string' && clip.audioRefId.trim().length > 0
                ? clip.audioRefId
                : clip.id;
            const persistedClip = {
              ...clip,
              ...(refId ? { audioRefId: refId } : {}),
            };
            delete persistedClip.audioData;
            const buffer = this.resolveClipAudioBuffer(clip);
            if (buffer && refId && !audioAssets.has(refId)) {
              audioAssets.set(refId, this.serializeAudioAsset(refId, buffer));
            }
            return persistedClip;
          }),
        })
      )
    );
    return { tracks, audioAssets: Array.from(audioAssets.values()) };
  }

  private restoreAudioAssets(bundle: ProjectBundle): void {
    this.musicManager.stemAudioCache?.clear?.();
    for (const asset of bundle.audioAssets ?? []) {
      const buffer = this.deserializeAudioAsset(asset);
      if (buffer) {
        this.musicManager.stemAudioCache?.set(asset.id, buffer);
      }
    }
  }

  private resolveClipAudioBuffer(clip: any): {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    duration: number;
    getChannelData(channel: number): Float32Array;
  } | null {
    if (this.isAudioBufferLike(clip?.audioData)) {
      return clip.audioData;
    }
    const refId = clip?.audioRefId;
    if (typeof refId === 'string' && refId.trim().length > 0) {
      const cached = this.musicManager.stemAudioCache?.get(refId);
      if (this.isAudioBufferLike(cached)) {
        return cached;
      }
    }
    return null;
  }

  private serializeAudioAsset(
    id: string,
    buffer: {
      numberOfChannels: number;
      length: number;
      sampleRate: number;
      duration: number;
      getChannelData(channel: number): Float32Array;
    }
  ): SerializedAudioAsset {
    return {
      id,
      sampleRate: buffer.sampleRate,
      channelCount: buffer.numberOfChannels,
      frameCount: buffer.length,
      duration: buffer.duration,
      channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
        Array.from(buffer.getChannelData(channel))
      ),
    };
  }

  private deserializeAudioAsset(asset: SerializedAudioAsset): AudioBuffer | null {
    const ctx = this.musicManager.engine?.ctx;
    if (!ctx?.createBuffer) {
      return null;
    }
    const channelCount = Math.max(1, Number(asset.channelCount) || 1);
    const frameCount = Math.max(1, Number(asset.frameCount) || 1);
    const sampleRate = Math.max(1, Number(asset.sampleRate) || 44100);
    const buffer = ctx.createBuffer(channelCount, frameCount, sampleRate);
    for (let channel = 0; channel < channelCount; channel++) {
      const source = asset.channels?.[channel];
      if (!Array.isArray(source)) continue;
      buffer.copyToChannel(Float32Array.from(source), channel);
    }
    return buffer;
  }

  private isAudioBufferLike(value: any): value is {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    duration: number;
    getChannelData(channel: number): Float32Array;
  } {
    return (
      !!value &&
      typeof value.numberOfChannels === 'number' &&
      typeof value.length === 'number' &&
      typeof value.sampleRate === 'number' &&
      typeof value.duration === 'number' &&
      typeof value.getChannelData === 'function'
    );
  }
}
