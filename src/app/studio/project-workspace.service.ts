import { DestroyRef, Injectable, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AuthService } from "../services/auth.service";
import { Project } from "../types";
import { MusicManagerService, type SongSection } from "../services/music-manager.service";
import { TakeManagerService, type TakeStateBundle } from "../services/take-manager.service";
import { HistoryService } from "../services/history.service";
import { ProjectService } from "../services/project.service";
import { LocalStorageService } from "../services/local-storage.service";
import { OfflineSyncService } from "../services/offline-sync.service";
import { LoggingService } from "../services/logging.service";
import { APP_SECURITY_CONFIG } from "../app.security";
import { AutomationService } from "./automation.service";

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
  channels: SerializedAudioChannel[];
}

export interface ProjectBundle {
  metadata: ProjectMetadata;
  tracks: any[];
  audioAssets?: SerializedAudioAsset[];
  structure?: SongSection[];
  takeState?: TakeStateBundle;
  automation: any;
  mixState: any;
  notes: string;
  exportedAt: number;
}

export type ProjectPersistenceSource =
  | "manual"
  | "autosave"
  | "recovery"
  | "import";

/**
 * One row of the Studio Sets browser. Every stored record for a project
 * (manual save, autosave, recovery snapshot) collapses into a single summary
 * built from the freshest record, so the artist never sees three copies of
 * the same set — just the version worth reopening.
 */
export interface LocalProjectSummary {
  /** Stable project id shared by every stored record (`metadata.id`). */
  projectId: string;
  /** Storage key of the freshest record — the canonical row to delete. */
  recordId: string;
  name: string;
  bpm: number;
  genre: string;
  mood: string;
  tags: string[];
  savedAt: number;
  updatedAt: number;
  source: ProjectPersistenceSource;
  version: number;
  trackCount: number;
}

interface StoredProjectBundle extends ProjectBundle {
  id: string;
  savedAt: number;
  source: ProjectPersistenceSource;
}

type AudioAssetSerializationMode = "binary" | "json";
type SerializedAudioChannel = Float32Array | number[];

@Injectable({ providedIn: "root" })
export class ProjectWorkspaceService {
  private readonly auth = inject(AuthService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly projectService = inject(ProjectService);
  private readonly storage = inject(LocalStorageService);
  private readonly offlineSync = inject(OfflineSyncService);
  private readonly logger = inject(LoggingService);
  private readonly automationService = inject(AutomationService);
  private readonly takeManager = inject(TakeManagerService);
  private readonly history = inject(HistoryService);
  private readonly destroyRef = inject(DestroyRef);
  readonly isSaving = signal(false);
  readonly persistenceError = signal('');
  readonly projectNotes = signal('');

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
    "pop",
    "trap",
    "house",
    "lo-fi",
    "neo-soul",
    "drill",
    "rnb",
    "jazz",
    "funk",
    "ambient",
    "techno",
    "dnb",
    "garage",
    "reggaeton",
  ];
  /** Available keys (Western) */
  keys = [
    "C",
    "Cm",
    "C#",
    "C#m",
    "D",
    "Dm",
    "Eb",
    "Ebm",
    "E",
    "Em",
    "F",
    "Fm",
    "F#",
    "F#m",
    "G",
    "Gm",
    "Ab",
    "Abm",
    "A",
    "Am",
    "Bb",
    "Bbm",
    "B",
    "Bm",
  ];
  /** Available moods */
  moods = [
    "dark",
    "bright",
    "chill",
    "energetic",
    "melancholic",
    "aggressive",
    "dreamy",
    "funky",
    "ambient",
    "uplifting",
    "mysterious",
    "romantic",
  ];
  /** Common tempo profiles per genre */
  genreBpmMap: Record<string, number> = {
    pop: 120,
    trap: 140,
    house: 124,
    "lo-fi": 78,
    "neo-soul": 92,
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
  private lastObservedSignature = "";
  private lastSavedSignature = "";

  constructor() {
    this.initializeMetadata();
    this.lastObservedSignature = this.captureStateSignature();
    this.lastSavedSignature = this.lastObservedSignature;
    this.watchWorkspaceChanges();
    this.startAutoSave();
    this.installLifecyclePersistence();
    this.destroyRef.onDestroy(() => this.stopAutoSave());
    this.projectService.projectDeleted$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((id) => {
        if (this.metadata()?.id === id) {
          // Keep unsaved tracks available, but detach them from the deleted id.
          // Auto-save/pagehide must not silently recreate the deleted project.
          this.autoSaveEnabled.set(false);
          this.startFreshProject({ name: 'Unsaved session' });
        }
      });
  }

  // ── Project Metadata ───────────────────────────────────

  private initializeMetadata() {
    const existing = this.projectService.currentProject();
    if (existing) {
      this.metadata.set({
        id: (existing as Project & { metadata?: ProjectMetadata }).metadata?.id || existing.id,
        name: existing.name,
        bpm: existing.bpm,
        key: existing.timeSignature ? "C" : "C",
        genre: "pop",
        mood: "energetic",
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
    patch: Partial<ProjectMetadata> = {},
  ): ProjectMetadata {
    const now = Date.now();
    const meta: ProjectMetadata = {
      id: patch.id || `proj_${now}`,
      name: patch.name || "Untitled Project",
      bpm: patch.bpm ?? this.currentTempo() ?? 120,
      key: patch.key || "C",
      genre: patch.genre || "pop",
      mood: patch.mood || "energetic",
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
      meta.bpm,
    );
    this.lastObservedSignature = signature;
    this.lastSavedSignature = "";
    this.lastAutoSave.set(0);
    this.lastPersistedAt.set(0);
    this.versionCount.set(0);
    this.lastQueuedSyncId.set(null);
    this.cloudSyncQueued.set(false);
    this.lastRecoveredAt.set(null);
    this.lastRecoveredSource.set(null);
    this.persistenceError.set('');
    this.projectNotes.set('');
    this.takeManager.restore({ takes: {}, active: {}, punchIn: {}, compStack: {}, sections: {} });
    this.automationService.lanes.set([]);
    this.automationService.macros.set([]);
    this.automationService.modulationSources.set([]);
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
      trap: "dark",
      "lo-fi": "chill",
      house: "energetic",
      "neo-soul": "dreamy",
      drill: "aggressive",
      pop: "bright",
      rnb: "chill",
      jazz: "chill",
      funk: "funky",
      ambient: "dreamy",
      techno: "dark",
      dnb: "aggressive",
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
    if (this.isSaving()) return;
    try {
      const snapshot = this.createStoredSnapshot();
      const stored = this.toStoredBundle(snapshot, "autosave");
      await this.requirePersistence();
      await this.storage.saveItem("projects", stored);
      await this.tryQueueCloudSync(snapshot.metadata);
      this.lastAutoSave.set(stored.savedAt);
      this.markPersistenceClean(snapshot, "autosave", stored.savedAt);
      this.versionCount.update((v) => v + 1);
      this.logger.info(
        "ProjectWorkspace: Auto-saved " + snapshot.metadata.name,
      );

      this.persistenceError.set('');
    } catch (e) {
      this.persistenceError.set(e instanceof Error ? e.message : 'Auto-save failed. Save or export a backup.');
      this.logger.warn("ProjectWorkspace: Auto-save failed", e);
    }
  }

  async manualSave(): Promise<ProjectBundle> {
    if (this.isSaving()) throw new Error('A project save is already in progress.');
    this.isSaving.set(true);
    this.persistenceError.set('');
    // Bump the revision on every explicit save. The metadata version used to
    // stay at 1 forever, so exported bundles were always named `_v1` and the
    // saved record could not distinguish one save from the next.
    const previousVersion = this.metadata()?.version ?? 1;
    this.metadata.update((m) =>
      m ? { ...m, version: previousVersion + 1, updatedAt: Date.now() } : m,
    );
    try {
      const bundle = this.createStoredSnapshot();
      const stored = this.toStoredBundle(bundle, "manual");
      await this.requirePersistence();
      await this.storage.saveItem("projects", stored);
      this.markPersistenceClean(bundle, "manual", stored.savedAt);
      this.versionCount.update((v) => v + 1);
      await this.projectService.refresh();
      // The bundle is already durable. Optional pointers/cloud failures must
      // not misreport that local save as lost.
      try {
        await this.storage.saveItem("offline_local_cache", {
          id: "last_saved_project_id", payload: bundle.metadata.id, savedAt: stored.savedAt,
        });
      } catch (error) {
        this.logger.warn('ProjectWorkspace: Latest-project pointer failed', error);
      }
      await this.tryQueueCloudSync(bundle.metadata);
      this.logger.info("ProjectWorkspace: Saved " + bundle.metadata.name);
      return bundle;
    } catch (error) {
      // A failed save must not leave the in-memory revision ahead of what is
      // actually stored (roll back only the version, never other edits).
      this.metadata.update((m) => (m ? { ...m, version: previousVersion } : m));
      this.persistenceError.set(error instanceof Error ? error.message : 'Project could not be saved.');
      this.logger.warn("ProjectWorkspace: Manual save failed", error);
      throw error;
    } finally {
      this.isSaving.set(false);
    }
  }

  private async requirePersistence(): Promise<void> {
    const status = await this.storage.persistenceStatus();
    if (status !== 'ready') throw new Error(`Project storage is ${status}. Export a backup before leaving.`);
  }

  private async tryQueueCloudSync(metadata: ProjectMetadata): Promise<void> {
    try {
      await this.queueCurrentSnapshotCloudSync(metadata);
    } catch (error) {
      this.cloudSyncQueued.set(false);
      this.logger.warn('ProjectWorkspace: Saved locally; cloud queue unavailable', error);
    }
  }

  async loadProject(projectId: string): Promise<ProjectBundle | null> {
    try {
      let record = await this.storage.getItem(
        "projects",
        `project_${projectId}`,
      );
      if (!record) {
        // The set may only exist as an autosave or recovery snapshot (the
        // manual record was never written, or was pruned). Fall back to the
        // freshest record for this project instead of reporting it missing.
        const stored = await this.storage.getAllItems("projects");
        record =
          stored
            .filter(
              (item) =>
                this.isStoredProjectBundle(item) &&
                item.metadata?.id === projectId,
            )
            .sort((a, b) => this.storedSavedAt(b) - this.storedSavedAt(a))[0] ??
          null;
      }
      if (record) {
        const storedBundle = record as StoredProjectBundle;
        this.validateBundle(storedBundle);
        this.restoreFromSnapshot(storedBundle);
        this.markPersistenceClean(
          storedBundle,
          storedBundle.source || this.detectPersistenceSource(storedBundle.id),
          this.storedSavedAt(storedBundle),
        );
        return storedBundle;
      }
    } catch (e) {
      this.logger.warn(`ProjectWorkspace: Load failed for ${projectId}`, e);
    }
    return null;
  }

  /**
   * Every locally-stored set, newest first. Manual, autosave and recovery
   * records for one project are collapsed to a single row so the browser
   * lists projects, not save files.
   */
  async listLocalProjects(): Promise<LocalProjectSummary[]> {
    let stored: any[] = [];
    try {
      stored = await this.storage.getAllItems("projects");
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Could not list local projects", e);
      return [];
    }

    const freshest = new Map<string, StoredProjectBundle>();
    for (const item of stored) {
      if (!this.isStoredProjectBundle(item)) continue;
      const projectId = item.metadata?.id;
      if (!projectId) continue;
      const previous = freshest.get(projectId);
      if (!previous || this.storedSavedAt(item) >= this.storedSavedAt(previous)) {
        freshest.set(projectId, item);
      }
    }

    return Array.from(freshest.values())
      .sort((a, b) => this.storedSavedAt(b) - this.storedSavedAt(a))
      .map((record) => ({
        projectId: record.metadata.id,
        recordId: record.id,
        name: record.metadata.name || "Untitled Set",
        bpm: record.metadata.bpm,
        genre: record.metadata.genre || "",
        mood: record.metadata.mood || "",
        tags: Array.isArray(record.metadata.tags)
          ? [...record.metadata.tags]
          : [],
        savedAt: this.storedSavedAt(record),
        updatedAt: record.metadata.updatedAt || this.storedSavedAt(record),
        source: record.source || this.detectPersistenceSource(record.id),
        version: record.metadata.version || 1,
        trackCount: record.tracks.length,
      }));
  }

  /**
   * Delete a set and every stored record for it. Delegates to ProjectService
   * so the home Projects surface stays consistent and `projectDeleted$` fires
   * (which detaches the workspace if the deleted set was open).
   */
  async deleteLocalProject(projectId: string): Promise<boolean> {
    try {
      await this.projectService.refresh();
      const removed = await this.projectService.remove(`project_${projectId}`);
      if (removed) return true;
      // Fallback: a set that only has autosave/recovery records is not in
      // ProjectService's project list, so remove it directly.
      const stored = await this.storage.getAllItems("projects");
      const ids = stored
        .filter(
          (item) =>
            this.isStoredProjectBundle(item) &&
            item.metadata?.id === projectId,
        )
        .map((item) => item.id);
      if (ids.length === 0) return false;
      await this.storage.deleteItems("projects", ids);
      // No `projectDeleted$` fires for records ProjectService never listed, so
      // detach the workspace here to keep autosave from recreating the set.
      if (this.metadata()?.id === projectId) {
        this.autoSaveEnabled.set(false);
        this.startFreshProject({ name: "Unsaved session" });
      }
      await this.projectService.refresh();
      return true;
    } catch (e) {
      this.logger.warn(`ProjectWorkspace: Delete failed for ${projectId}`, e);
      return false;
    }
  }

  async exportProjectBundle(): Promise<ProjectBundle> {
    const bundle = this.createSnapshot();
    bundle.exportedAt = Date.now();
    await this.offlineSync.saveLocal(
      `export_${bundle.metadata.id}_${bundle.exportedAt}`,
      bundle,
      30 * 24 * 60 * 60 * 1000,
    );
    return bundle;
  }

  async importProjectBundle(bundle: ProjectBundle): Promise<boolean> {
    try {
      this.validateBundle(bundle);
      await this.requirePersistence();
      const stored = this.toStoredBundle(bundle, "import");
      await this.storage.saveItem("projects", stored);
      await this.projectService.refresh();
      await this.storage.saveItem("offline_local_cache", {
        id: "last_saved_project_id",
        payload: bundle.metadata.id,
        savedAt: stored.savedAt,
      });
      this.restoreFromSnapshot(bundle);
      await this.tryQueueCloudSync(bundle.metadata);
      this.markPersistenceClean(bundle, "import", stored.savedAt);
      this.persistenceError.set('');
      this.logger.info("ProjectWorkspace: Imported " + bundle.metadata.name);
      return true;
    } catch (e) {
      this.persistenceError.set(e instanceof Error ? e.message : 'Invalid project bundle.');
      this.logger.warn("ProjectWorkspace: Import failed", e);
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
      30 * 24 * 60 * 60 * 1000,
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.name.replace(/[^a-zA-Z0-9]/g, "_")}_v${meta.version}.smuve`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async restoreLatestProjectState(): Promise<boolean> {
    if (this.musicManager.tracks().length > 0) return false;

    try {
      const stored = (await this.storage.getAllItems("projects"))
        .filter((item) => this.isStoredProjectBundle(item))
        .sort(
          (a, b) =>
            this.storedSavedAt(b as StoredProjectBundle) -
            this.storedSavedAt(a as StoredProjectBundle),
        ) as StoredProjectBundle[];

      const freshest = stored.find((bundle) => {
        try { this.validateBundle(bundle); return bundle.tracks.length > 0; }
        catch (error) { this.logger.warn('ProjectWorkspace: Skipping invalid recovery bundle', error); return false; }
      });
      if (!freshest) return false;

      const source =
        freshest.source || this.detectPersistenceSource(freshest.id);
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
        this.storedSavedAt(freshest),
      );
      this.lastRecoveredAt.set(this.storedSavedAt(freshest));
      this.lastRecoveredSource.set(source);
      return true;
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Restore failed", e);
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
      "CREATE",
      `${APP_SECURITY_CONFIG.api_url}/projects`,
      {
        projectId: bundle.metadata.id,
        userId,
        title: bundle.metadata.name,
        projectData: bundle,
      },
      { userId },
    );
    this.lastQueuedSyncId.set(syncId);
    this.cloudSyncQueued.set(true);
  }

  // ── Snapshot ───────────────────────────────────────────

  createSnapshot(
    metadata: ProjectMetadata = this.currentSyncedMetadata(),
  ): ProjectBundle {
    return this.buildSnapshot(metadata, "json");
  }

  private createStoredSnapshot(
    metadata: ProjectMetadata = this.currentSyncedMetadata(),
  ): ProjectBundle {
    return this.buildSnapshot(metadata, "binary");
  }

  private buildSnapshot(
    metadata: ProjectMetadata,
    audioAssetMode: AudioAssetSerializationMode,
  ): ProjectBundle {
    const meta = {
      ...metadata,
      bpm: metadata.bpm || this.currentTempo() || 120,
    };
    const { tracks, audioAssets } = this.captureSnapshotTracks(audioAssetMode);

    return {
      metadata: meta,
      tracks,
      audioAssets,
      structure: JSON.parse(JSON.stringify(this.musicManager.structure())),
      takeState: JSON.parse(JSON.stringify(this.takeManager.serialize())),
      automation: {
        lanes: JSON.parse(JSON.stringify(this.automationService.lanes())),
        macros: JSON.parse(JSON.stringify(this.automationService.macros())),
        modulationSources: JSON.parse(JSON.stringify(this.automationService.modulationSources())),
      },
      mixState: {
        masterGain: this.musicManager.engine?.masterGain?.gain?.value ?? 0.8,
      },
      notes: this.projectNotes(),
      exportedAt: Date.now(),
    };
  }

  restoreFromSnapshot(bundle: ProjectBundle) {
    this.validateBundle(bundle);
    this.restoreAudioAssets(bundle);
    this.musicManager.engine.stop();
    this.history.clear();
    this.musicManager.selectedTrackId.set(bundle.tracks[0]?.id ?? null);
    this.musicManager.structure.set(bundle.structure ?? [{ id: 'section-1', name: 'Session', start: 0, length: 4, color: '#0e7c7b' }]);
    this.takeManager.restore(bundle.takeState ?? { takes: {}, active: {}, punchIn: {}, compStack: {}, sections: {} });
    this.projectNotes.set(bundle.notes ?? '');
    this.automationService.lanes.set(JSON.parse(JSON.stringify(bundle.automation?.lanes ?? [])));
    this.automationService.macros.set(JSON.parse(JSON.stringify(bundle.automation?.macros ?? [])));
    this.automationService.modulationSources.set(JSON.parse(JSON.stringify(bundle.automation?.modulationSources ?? [])));
    this.metadata.set({
      ...bundle.metadata,
      lastOpenedAt: Date.now(),
    });
    if (bundle.tracks) {
      this.musicManager.tracks.set(bundle.tracks as any);
      this.isDirty.set(false);
    }
    if (bundle.metadata?.bpm) {
      this.musicManager.engine?.tempo?.set?.(bundle.metadata.bpm);
    }
    const gain = bundle.mixState?.masterGain;
    if (Number.isFinite(gain) && this.musicManager.engine?.masterGain?.gain) {
      this.musicManager.engine.masterGain.gain.value = Math.max(0, Math.min(1, gain));
    }
    this.logger.info(
      "ProjectWorkspace: Restored project " +
        (bundle.metadata?.name ?? "Untitled"),
    );
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
        this.currentTempo(),
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
    if (typeof window === "undefined") return;

    const pagehide = () => { void this.persistRecoverySnapshot(); };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void this.persistRecoverySnapshot();
    };
    window.addEventListener('pagehide', pagehide);
    document.addEventListener('visibilitychange', visibility);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('pagehide', pagehide);
      document.removeEventListener('visibilitychange', visibility);
    });
  }

  private async persistRecoverySnapshot(): Promise<void> {
    if (!this.metadata() || this.musicManager.tracks().length === 0) return;

    try {
      const bundle = this.toStoredBundle(
        this.createStoredSnapshot(),
        "recovery",
      );
      await this.storage.saveItem("projects", bundle);
      await this.storage.saveItem("offline_local_cache", {
        id: "last_saved_project_id",
        payload: bundle.metadata.id,
        savedAt: bundle.savedAt,
      });
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Recovery snapshot failed", e);
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
    if (typeof tempoSignal === "function") {
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
    tempo: number = this.currentTempo(),
    automation: any = {
      lanes: this.automationService.lanes(), macros: this.automationService.macros(),
      modulationSources: this.automationService.modulationSources(),
    },
    structure = this.musicManager.structure(),
    takeState = this.takeManager.serialize(),
    masterGain = this.musicManager.engine?.masterGain?.gain?.value ?? 0.8,
    notes = this.projectNotes(),
  ): string {
    return JSON.stringify({
      metadata: metadata ? { ...metadata, bpm: tempo, updatedAt: undefined, lastOpenedAt: undefined } : null,
      tempo,
      tracks,
      automation,
      structure,
      takeState,
      notes,
      masterGain,
    });
  }

  private toStoredBundle(
    bundle: ProjectBundle,
    source: ProjectPersistenceSource,
  ): StoredProjectBundle {
    return {
      id: `${source === "manual" || source === "import" ? "project" : source}_${bundle.metadata.id}`,
      ...bundle,
      savedAt: Date.now(),
      source,
    };
  }

  private markPersistenceClean(
    bundle: ProjectBundle,
    source: ProjectPersistenceSource,
    savedAt: number = Date.now(),
  ) {
    const signature = this.captureStateSignature(
      bundle.metadata,
      bundle.tracks,
      bundle.metadata.bpm,
      bundle.automation,
      bundle.structure,
      bundle.takeState,
      bundle.mixState?.masterGain,
      bundle.notes,
    );
    // An older in-flight save must not rename or clean a newly opened project.
    if (this.metadata()?.id !== bundle.metadata.id) return;
    const currentSignature = this.captureStateSignature();
    this.lastSavedSignature = signature;
    this.lastObservedSignature = currentSignature;
    this.lastPersistedAt.set(savedAt);
    this.isDirty.set(currentSignature !== signature);
    if (source !== "autosave") {
      this.lastRecoveredAt.set(null);
      this.lastRecoveredSource.set(null);
    }
  }

  private isStoredProjectBundle(item: any): item is StoredProjectBundle {
    return (
      !!item &&
      typeof item.id === "string" &&        item.metadata &&
      Array.isArray(item.tracks) &&
      (item.id.startsWith("project_") ||
        item.id.startsWith("autosave_") ||
        item.id.startsWith("recovery_"))
    );
  }

  private storedSavedAt(bundle: StoredProjectBundle): number {
    return bundle.savedAt || bundle.metadata?.updatedAt || 0;
  }

  private detectPersistenceSource(id: string): ProjectPersistenceSource {
    if (id.startsWith("autosave_")) return "autosave";
    if (id.startsWith("recovery_")) return "recovery";
    if (id.startsWith("project_")) return "manual";
    return "manual";
  }

  private async queueCurrentSnapshotCloudSync(
    metadata: ProjectMetadata,
  ): Promise<void> {
    if (!this.auth.currentUser()?.id) {
      this.cloudSyncQueued.set(false);
      return;
    }
    await this.queueCloudSync(this.createSnapshot(metadata));
  }

  private captureSnapshotTracks(audioAssetMode: AudioAssetSerializationMode): {
    tracks: any[];
    audioAssets: SerializedAudioAsset[];
  } {
    const audioAssets = new Map<string, SerializedAudioAsset>();
    const tracks = this.musicManager.tracks().map((track) =>
      JSON.parse(
        JSON.stringify({
          ...track,
          ...(Array.isArray(track.clips)
            ? {
                clips: track.clips.map((clip: any) => {
                  if (clip?.type !== "audio") {
                    return { ...clip };
                  }
                  const refId =
                    typeof clip.audioRefId === "string" &&
                    clip.audioRefId.trim().length > 0
                      ? clip.audioRefId
                      : clip.id;
                  const persistedClip = {
                    ...clip,
                    ...(refId ? { audioRefId: refId } : {}),
                  };
                  delete persistedClip.audioData;
                  const buffer = this.resolveClipAudioBuffer(clip);
                  if (buffer && refId && !audioAssets.has(refId)) {
                    audioAssets.set(
                      refId,
                      this.serializeAudioAsset(refId, buffer, audioAssetMode),
                    );
                  }
                  return persistedClip;
                }),
              }
            : {}),
        }),
      ),
    );
    return { tracks, audioAssets: Array.from(audioAssets.values()) };
  }

  private restoreAudioAssets(bundle: ProjectBundle): void {
    // Allocate all buffers before touching the current cache so failures leave
    // the active session's audio intact.
    const restored = (bundle.audioAssets ?? []).map((asset) => ({ id: asset.id, buffer: this.deserializeAudioAsset(asset) }));
    this.musicManager.stemAudioCache?.clear?.();
    for (const asset of restored) {
      if (asset.buffer) this.musicManager.stemAudioCache?.set(asset.id, asset.buffer);
    }
  }

  private validateBundle(bundle: ProjectBundle): void {
    const meta = bundle?.metadata;
    if (!meta || typeof meta.id !== 'string' || !meta.id.trim() ||
        typeof meta.name !== 'string' || !meta.name.trim() ||
        !Number.isFinite(meta.bpm) || meta.bpm < 20 || meta.bpm > 300 ||
        !Array.isArray(bundle.tracks)) {
      throw new Error('Invalid project metadata or track list.');
    }
    if (bundle.structure !== undefined && (!Array.isArray(bundle.structure) || bundle.structure.some((section) =>
      !section || typeof section.id !== 'string' || typeof section.name !== 'string' || !Number.isInteger(section.length) || section.length < 1 || !Number.isFinite(section.start) || section.start < 0
    ))) throw new Error('Invalid arrangement structure.');
    const ids = new Set<string>();
    for (const track of bundle.tracks) {
      if (!track || typeof track.id !== 'string' || !track.id || ids.has(track.id) ||
          (track.notes !== undefined && !Array.isArray(track.notes)) ||
          (track.clips !== undefined && !Array.isArray(track.clips))) {
        throw new Error('Invalid or duplicate project track.');
      }
      ids.add(track.id);
    }
    if (bundle.audioAssets !== undefined && !Array.isArray(bundle.audioAssets)) throw new Error('Invalid audio asset list.');
    let audioBytes = 0;
    for (const asset of bundle.audioAssets ?? []) {
      if (!asset || typeof asset.id !== 'string' || !Number.isInteger(asset.channelCount) ||
          asset.channelCount < 1 || asset.channelCount > 32 || !Number.isInteger(asset.frameCount) ||
          asset.frameCount < 1 || !Number.isFinite(asset.sampleRate) || asset.sampleRate < 3000 ||
          asset.sampleRate > 384000 || !Array.isArray(asset.channels) ||
          asset.channels.length !== asset.channelCount) throw new Error('Invalid project audio asset.');
      audioBytes += asset.frameCount * asset.channelCount * 4;
      if (audioBytes > 256 * 1024 * 1024) throw new Error('Project audio exceeds the 256 MiB import limit.');
      for (const channel of asset.channels) {
        if (!(Array.isArray(channel) || channel instanceof Float32Array) || channel.length !== asset.frameCount ||
            !channel.every((sample) => typeof sample === 'number' && Number.isFinite(sample))) {
          throw new Error('Invalid project audio samples.');
        }
      }
    }
    for (const key of ['lanes', 'macros', 'modulationSources']) {
      if (bundle.automation?.[key] !== undefined && !Array.isArray(bundle.automation[key])) throw new Error('Invalid automation state.');
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
    if (typeof refId === "string" && refId.trim().length > 0) {
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
    },
    audioAssetMode: AudioAssetSerializationMode,
  ): SerializedAudioAsset {
    return {
      id,
      sampleRate: buffer.sampleRate,
      channelCount: buffer.numberOfChannels,
      frameCount: buffer.length,
      duration: buffer.duration,
      channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
        audioAssetMode === "binary"
          ? buffer.getChannelData(channel).slice()
          : Array.from(buffer.getChannelData(channel)),
      ),
    };
  }

  private deserializeAudioAsset(
    asset: SerializedAudioAsset,
  ): AudioBuffer | null {
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
      if (!(Array.isArray(source) || source instanceof Float32Array)) continue;
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
      typeof value.numberOfChannels === "number" &&
      typeof value.length === "number" &&
      typeof value.sampleRate === "number" &&
      typeof value.duration === "number" &&
      typeof value.getChannelData === "function"
    );
  }
}
