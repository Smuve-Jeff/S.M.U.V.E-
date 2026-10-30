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
import { ArrangementMarkersService, type ArrangementMarker } from "./arrangement-markers.service";
import { SidechainRoutingService, type SidechainRoute } from "./sidechain-routing.service";
import { TempoMapService, type TempoMarker } from "./tempo-map.service";
import { VcaBusService, type VcaAssignments, type VcaBus } from "./vca-bus.service";
import { PROJECT_FORMAT_VERSION, buildProjectArchive } from "./project-archive.util";
import {
  describeAudioIntegrityFailure,
  inspectProjectAudioIntegrity,
  type ProjectAudioIntegrityReport,
} from "./project-integrity.util";

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

/** Everything applied to the master bus, saved with the song. */
export interface ProjectMasterState {
  gain: number;
  monitorMono: boolean;
  toneEq: { lowShelfDb: number; lowMidDb: number; highShelfDb: number };
  width: number;
  makeupDb: number;
  targets: { lufs: number; truePeak: number };
  pluginIds: string[];
  pluginParams: Record<string, Record<string, number>>;
}

/** A/B loop stored in sixteenth-note steps, end-exclusive. */
export interface ProjectPlaybackState {
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
}

export interface ProjectPerformanceState {
  tempoMap: TempoMarker[];
  markers: ArrangementMarker[];
  vca: { buses: VcaBus[]; assignments: VcaAssignments };
  sidechain: SidechainRoute[];
  playback: ProjectPlaybackState;
}

export interface ProjectBundle {
  metadata: ProjectMetadata;
  tracks: any[];
  audioAssets?: SerializedAudioAsset[];
  structure?: SongSection[];
  takeState?: TakeStateBundle;
  automation: any;
  mixState: any;
  /** Container revision. 2 = ZIP archive with raw Float32 audio. */
  formatVersion?: number;
  /** Tempo changes pinned to absolute song steps. */
  tempoMap?: TempoMarker[];
  /** Named arrangement locations, in bars. */
  markers?: ArrangementMarker[];
  /** VCA control-surface groups and their track assignments. */
  vca?: { buses: VcaBus[]; assignments: VcaAssignments };
  /** Real compressor ducking matrix: trigger → target. */
  sidechain?: SidechainRoute[];
  playback?: ProjectPlaybackState;
  master?: ProjectMasterState;
  /** Session performance state that is not per-track. */
  session?: {
    launchQuantize?: "none" | "1bar" | "2bar" | "4bar";
    /** Follow actions: advance to the next scene every `followBars` bars. */
    followEnabled?: boolean;
    followBars?: number;
    /**
     * Per-scene overrides keyed by scene identity (the scene's leftmost pattern
     * slot), so a rule stays with its scene when columns shift.
     */
    sceneFollowRules?: Record<
      string,
      { mode: "loop" | "advance"; bars?: number }
    >;
  };
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

/** One stored snapshot of a project — the rows the version history lists. */
export interface ProjectVersionSummary {
  recordId: string;
  version: number;
  source: ProjectPersistenceSource;
  savedAt: number;
  trackCount: number;
  name: string;
}

interface StoredProjectBundle extends ProjectBundle {
  id: string;
  savedAt: number;
  source: ProjectPersistenceSource;
}

type AudioAssetSerializationMode = "binary" | "json";
type SerializedAudioChannel = Float32Array | number[];

/**
 * Starting tempo and mood per genre, keyed by {@link normalizeGenre}.
 *
 * Every genre the questionnaire and Profile editor offer is covered, including
 * the hyphenated and ampersanded ones ("Hip Hop", "R&B", "Drum & Bass",
 * "K-Pop", "Lo-Fi"), because the old table was matched with a raw object
 * lookup and silently missed all of them — picking "Hip Hop" or "R&B" in Studio
 * left the previous tempo in place.
 *
 * These are starting points for a new session, not prescriptions.
 */
const GENRE_PROFILES: Record<string, { bpm: number; mood?: string }> = {
  // Hip hop family
  hiphop: { bpm: 90, mood: "dark" },
  rap: { bpm: 90, mood: "dark" },
  trap: { bpm: 140, mood: "dark" },
  drill: { bpm: 142, mood: "aggressive" },
  phonk: { bpm: 130, mood: "dark" },
  // Soul / R&B family
  rnb: { bpm: 90, mood: "smooth" },
  rb: { bpm: 90, mood: "smooth" },
  soul: { bpm: 95, mood: "smooth" },
  neosoul: { bpm: 92, mood: "dreamy" },
  gospel: { bpm: 90, mood: "uplifting" },
  blues: { bpm: 90, mood: "soulful" },
  // Pop / rock / indie
  pop: { bpm: 120, mood: "bright" },
  kpop: { bpm: 120, mood: "bright" },
  jpop: { bpm: 128, mood: "bright" },
  hyperpop: { bpm: 160, mood: "chaotic" },
  rock: { bpm: 120, mood: "driving" },
  indie: { bpm: 120, mood: "warm" },
  grunge: { bpm: 120, mood: "gritty" },
  punk: { bpm: 170, mood: "aggressive" },
  emo: { bpm: 150, mood: "melancholy" },
  metal: { bpm: 160, mood: "aggressive" },
  // Electronic / club
  electronic: { bpm: 128, mood: "energetic" },
  house: { bpm: 124, mood: "energetic" },
  techno: { bpm: 128, mood: "dark" },
  garage: { bpm: 130, mood: "energetic" },
  drumbass: { bpm: 174, mood: "aggressive" },
  dnb: { bpm: 174, mood: "aggressive" },
  drumandbass: { bpm: 174, mood: "aggressive" },
  dubstep: { bpm: 140, mood: "dark" },
  disco: { bpm: 120, mood: "funky" },
  funk: { bpm: 100, mood: "funky" },
  // Latin / Caribbean / African
  latin: { bpm: 96, mood: "warm" },
  reggaeton: { bpm: 96, mood: "warm" },
  cumbia: { bpm: 95, mood: "warm" },
  sambabossanova: { bpm: 100, mood: "warm" },
  dancehall: { bpm: 100, mood: "bright" },
  reggae: { bpm: 75, mood: "chill" },
  afrobeats: { bpm: 105, mood: "uplifting" },
  amapiano: { bpm: 112, mood: "hypnotic" },
  // Acoustic / roots / classical / screen
  country: { bpm: 120, mood: "warm" },
  folk: { bpm: 100, mood: "warm" },
  bluegrass: { bpm: 130, mood: "uplifting" },
  jazz: { bpm: 110, mood: "chill" },
  classical: { bpm: 90, mood: "cinematic" },
  opera: { bpm: 90, mood: "cinematic" },
  filmscore: { bpm: 90, mood: "cinematic" },
  videogamemusic: { bpm: 120, mood: "playful" },
  newage: { bpm: 60, mood: "dreamy" },
  ambient: { bpm: 70, mood: "dreamy" },
  lofi: { bpm: 78, mood: "chill" },
  childrens: { bpm: 110, mood: "playful" },
};

/**
 * Lowercase, punctuation-free genre key, so "R&B", "R&B / Soul" and "rnb" all
 * resolve to the same profile instead of three different silent misses.
 */
export function normalizeGenre(genre: string): string {
  return String(genre ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

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
  private readonly tempoMap = inject(TempoMapService);
  private readonly markers = inject(ArrangementMarkersService);
  private readonly vcaBuses = inject(VcaBusService);
  private readonly sidechainRouting = inject(SidechainRoutingService);
  readonly isSaving = signal(false);
  readonly persistenceError = signal('');
  readonly projectNotes = signal('');
  /** Last import/export/restore audio-reference check. */
  readonly audioIntegrity = signal<ProjectAudioIntegrityReport | null>(null);

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
    this.audioIntegrity.set(null);
    this.musicManager.setLaunchQuantize("none");
    this.musicManager.setSceneFollowEnabled(false);
    this.musicManager.setSceneFollowBars(4);
    this.musicManager.clearSceneFollowRules();
    this.takeManager.restore({ takes: {}, active: {}, punchIn: {}, compStack: {}, sections: {} });
    this.automationService.lanes.set([]);
    this.automationService.macros.set([]);
    this.automationService.modulationSources.set([]);
    // Project-scoped performance and master state must not leak in from the
    // set that was open before this fresh one.
    this.resetProjectState();
    const signature = this.captureStateSignature(
      meta,
      this.musicManager.tracks(),
      meta.bpm,
    );
    this.lastObservedSignature = signature;
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

  /**
   * Apply a genre's starting tempo and mood. An unknown genre still records the
   * genre itself and leaves the tempo alone, which is the honest outcome — the
   * point of the earlier bug was that *known* genres behaved that way too.
   */
  setGenre(genre: string) {
    const profile = GENRE_PROFILES[normalizeGenre(genre)];
    this.updateMetadata({
      genre,
      ...(profile ? { bpm: profile.bpm } : {}),
      ...(profile?.mood ? { mood: profile.mood } : {}),
    });
    // Update engine tempo too
    if (profile) {
      this.musicManager.engine?.tempo?.set?.(profile.bpm);
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
        record =
          (await this.readStoredProjects())
            .filter((item) => item.metadata?.id === projectId)
            .sort((a, b) => this.storedSavedAt(b) - this.storedSavedAt(a))[0] ??
          null;
      }
      if (record) {
        return this.restoreStoredRecord(record as StoredProjectBundle);
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
    let records: StoredProjectBundle[] = [];
    try {
      records = await this.readStoredProjects();
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Could not list local projects", e);
      return [];
    }

    const freshest = new Map<string, StoredProjectBundle>();
    for (const record of records) {
      const projectId = record.metadata?.id;
      if (!projectId) continue;
      const previous = freshest.get(projectId);
      if (
        !previous ||
        this.storedSavedAt(record) >= this.storedSavedAt(previous)
      ) {
        freshest.set(projectId, record);
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
   * Every stored record for one project, newest first — manual saves, autosave
   * snapshots and recovery records alike, unlike `listLocalProjects`, which
   * collapses them to one row per set.
   */
  async listProjectVersions(
    projectId: string,
  ): Promise<ProjectVersionSummary[]> {
    try {
      return (await this.readStoredProjects())
        .filter((record) => record.metadata?.id === projectId)
        .sort((a, b) => this.storedSavedAt(b) - this.storedSavedAt(a))
        .map((record) => ({
          recordId: record.id,
          version: record.metadata.version || 1,
          source: record.source || this.detectPersistenceSource(record.id),
          savedAt: this.storedSavedAt(record),
          trackCount: record.tracks?.length ?? 0,
          name: record.metadata.name || "Untitled Set",
        }));
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Could not list project versions", e);
      return [];
    }
  }

  /** Restore one specific stored version instead of the freshest record. */
  async restoreProjectVersion(recordId: string): Promise<boolean> {
    try {
      const record = (await this.readStoredProjects()).find(
        (item) => item.id === recordId,
      );
      if (!record) return false;

      this.restoreStoredRecord(record);
      return true;
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Version restore failed", e);
      return false;
    }
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
      const ids = (await this.readStoredProjects())
        .filter((item) => item.metadata?.id === projectId)
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
      const integrity = inspectProjectAudioIntegrity(bundle);
      this.audioIntegrity.set(integrity);
      if (!integrity.ok) {
        throw new Error(describeAudioIntegrityFailure(integrity, "import"));
      }
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

  /**
   * Download a portable `.smuve` archive.
   *
   * This used to serialise the whole bundle — including every audio sample as
   * a JSON number — into one string. A three-minute vocal take made a file
   * hundreds of megabytes wide that mobile Safari/Chrome could not parse back.
   * The archive keeps the manifest readable as JSON but stores audio as raw
   * little-endian Float32 files inside a ZIP.
   */
  downloadProjectBundle() {
    const meta = this.metadata();
    if (!meta) return;

    // Binary channels, not JSON arrays: the archive encoder turns these into
    // raw Float32 bytes directly instead of materialising millions of strings.
    const bundle = this.createStoredSnapshot();
    const integrity = inspectProjectAudioIntegrity(bundle);
    this.audioIntegrity.set(integrity);
    if (!integrity.ok) {
      throw new Error(describeAudioIntegrityFailure(integrity, "export"));
    }
    void this.offlineSync.saveLocal(
      `export_${bundle.metadata.id}_${bundle.exportedAt}`,
      bundle,
      30 * 24 * 60 * 60 * 1000,
    );
    const blob = buildProjectArchive(bundle);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.name.replace(/[^a-zA-Z0-9]/g, "_")}_v${meta.version}.smuve`;
    // Mobile browsers cancel a download whose anchor is not in the document,
    // and revoking the URL in the same tick can truncate larger archives.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
    const performance = this.capturePerformanceState();
    const master = this.captureMasterState();

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
        masterGain: master.gain,
        // Monitoring state travels with the set: reopening a club mix should
        // not silently put the engineer back in stereo.
        monitorMono: master.monitorMono,
      },
      formatVersion: PROJECT_FORMAT_VERSION,
      tempoMap: performance.tempoMap,
      markers: performance.markers,
      vca: performance.vca,
      sidechain: performance.sidechain,
      playback: performance.playback,
      master,
      session: {
        launchQuantize: this.musicManager.launchQuantize(),
        followEnabled: this.musicManager.sceneFollowEnabled(),
        followBars: this.musicManager.sceneFollowBars(),
        sceneFollowRules: {
          ...this.musicManager.sceneFollowRules(),
        },
      },
      notes: this.projectNotes(),
      exportedAt: Date.now(),
    };
  }

  restoreFromSnapshot(bundle: ProjectBundle) {
    this.validateBundle(bundle);
    const integrity = inspectProjectAudioIntegrity(bundle);
    this.audioIntegrity.set(integrity);
    if (!integrity.ok) {
      const message = describeAudioIntegrityFailure(integrity, "import");
      this.persistenceError.set(message);
      this.logger.warn("ProjectWorkspace: " + message);
    }
    this.restoreAudioAssets(bundle);
    this.musicManager.engine.stop();
    this.history.clear();
    this.musicManager.selectedTrackId.set(bundle.tracks[0]?.id ?? null);
    const structure = bundle.structure ?? [
      { id: 'section-1', name: 'Session', start: 0, length: 4, color: '#0e7c7b' },
    ];
    this.musicManager.structure.set(structure);
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
    // The structure effect that normally pushes song length runs after this
    // method, but the loop region is validated against it below. Set it now so
    // a saved loop near the end of the song is not rejected on restore.
    this.musicManager.engine.setSongLengthSteps(
      this.songLengthStepsFor(structure),
    );
    this.applyPerformanceState(bundle);
    this.applyMasterState(this.masterStateFromBundle(bundle));
    // Old bundles have no Session state; default to immediate launch rather
    // than leaking the previously open set's boundary into this one.
    this.musicManager.setLaunchQuantize(
      bundle.session?.launchQuantize ?? "none",
    );
    this.musicManager.setSceneFollowEnabled(
      bundle.session?.followEnabled === true,
    );
    this.musicManager.setSceneFollowBars(bundle.session?.followBars ?? 4);
    this.musicManager.setSceneFollowRules(
      bundle.session?.sceneFollowRules ?? {},
    );
    this.isDirty.set(false);
    this.logger.info(
      "ProjectWorkspace: Restored project " +
        (bundle.metadata?.name ?? "Untitled"),
    );
  }

  /**
   * Save every piece of state that describes how this song performs but was
   * previously session-global: tempo map, arrangement markers, VCA groups,
   * sidechain matrix and the A/B loop region.
   */
  private capturePerformanceState(): ProjectPerformanceState {
    const engine = this.musicManager.engine;
    return {
      tempoMap: this.tempoMap.markers().map((marker) => ({ ...marker })),
      markers: this.markers.markers().map((marker) => ({ ...marker })),
      vca: {
        buses: this.vcaBuses.buses().map((bus) => ({ ...bus })),
        assignments: { ...this.vcaBuses.assignments() },
      },
      sidechain: this.sidechainRouting
        .routes()
        .map((route) => ({ ...route })),
      playback: {
        loopEnabled: engine.playbackLoopEnabled(),
        loopStart: engine.playbackLoopStart(),
        loopEnd: engine.playbackLoopEnd(),
      },
    };
  }

  /** Full master-bus state, including the live insert chain and its params. */
  private captureMasterState(): ProjectMasterState {
    const engine = this.musicManager.engine as any;
    const targets = engine?.getMasteringTargets?.() ?? {
      lufs: -14,
      truePeak: -0.1,
    };
    const tone = engine?.getMasterToneEq?.() ?? {
      lowShelfDb: 0,
      lowMidDb: 0,
      highShelfDb: 0,
    };
    const plugins =
      (this.musicManager as any).captureMasterPluginState?.() ?? {
        pluginIds: [],
        params: {},
      };
    const gain = engine?.masterGain?.gain?.value;
    return {
      gain: Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 0.8,
      monitorMono: engine?.monoMonitoring?.() ?? false,
      toneEq: {
        lowShelfDb: Number.isFinite(tone.lowShelfDb) ? tone.lowShelfDb : 0,
        lowMidDb: Number.isFinite(tone.lowMidDb) ? tone.lowMidDb : 0,
        highShelfDb: Number.isFinite(tone.highShelfDb) ? tone.highShelfDb : 0,
      },
      width: Number.isFinite(engine?.getMasterWidth?.())
        ? engine.getMasterWidth()
        : 1,
      makeupDb: Number.isFinite(engine?.getMasterMakeupDb?.())
        ? engine.getMasterMakeupDb()
        : 0,
      targets: {
        lufs: Number.isFinite(targets.lufs) ? targets.lufs : -14,
        truePeak: Number.isFinite(targets.truePeak) ? targets.truePeak : -0.1,
      },
      pluginIds: Array.isArray(plugins.pluginIds)
        ? [...plugins.pluginIds]
        : [],
      pluginParams:
        plugins.params && typeof plugins.params === 'object'
          ? JSON.parse(JSON.stringify(plugins.params))
          : {},
    };
  }

  /** Apply saved tempo/markers/VCA/sidechain/loop, resetting when absent. */
  private applyPerformanceState(bundle: ProjectBundle): void {
    this.tempoMap.replaceAll(bundle.tempoMap ?? []);
    this.markers.replaceAll(bundle.markers ?? []);

    const vca = bundle.vca ?? { buses: [], assignments: {} };
    this.vcaBuses.replaceRouting(
      vca.buses ?? [],
      vca.assignments ?? {},
    );
    const trackIds = new Set<string>([
      ...this.musicManager.tracks().map((track) => track.id),
      ...Object.keys(this.vcaBuses.assignments()),
    ]);
    for (const trackId of trackIds) {
      this.musicManager.engine.setVcaMultiplier(
        trackId,
        this.vcaBuses.effectiveMultiplier(trackId),
      );
    }

    const savedSidechain = (bundle.sidechain ?? []).filter(
      (route) =>
        trackIds.has(route.triggerTrackId) &&
        trackIds.has(route.targetTrackId),
    );
    this.sidechainRouting.replaceAll(savedSidechain);

    const playback = bundle.playback;
    const engine = this.musicManager.engine;
    const start = playback?.loopStart ?? null;
    const end = playback?.loopEnd ?? null;
    const hasRegion =
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      (start as number) >= 0 &&
      (end as number) > (start as number);
    const restored = hasRegion
      ? engine.setPlaybackLoop(start, end)
      : false;
    if (!restored) {
      engine.setPlaybackLoop(null, null);
    } else {
      engine.togglePlaybackLoop(playback?.loopEnabled === true);
    }
  }

  /** Apply master gain, monitoring, tone, width, loudness targets and inserts. */
  private applyMasterState(master: ProjectMasterState): void {
    const engine = this.musicManager.engine as any;
    if (engine?.masterGain?.gain) {
      engine.masterGain.gain.value = Math.max(0, Math.min(1, master.gain));
    }
    engine?.setMonoMonitoring?.(master.monitorMono === true);
    engine?.setMasterToneEq?.(master.toneEq);
    engine?.setMasterWidth?.(master.width);
    engine?.setMasterMakeupDb?.(master.makeupDb);
    engine?.setMasteringTargets?.(master.targets);
    const applyPlugins = (this.musicManager as any).applyMasterPluginState;
    if (typeof applyPlugins === 'function') {
      applyPlugins.call(
        this.musicManager,
        master.pluginIds,
        master.pluginParams,
      );
    }
  }

  /** Master state for a bundle, including legacy `mixState` fallbacks. */
  private masterStateFromBundle(bundle: ProjectBundle): ProjectMasterState {
    if (bundle.master) {
      const saved = bundle.master;
      const tone = saved.toneEq;
      const targets = saved.targets;
      return {
        gain:
          Number.isFinite(saved.gain) && saved.gain >= 0 && saved.gain <= 1
            ? saved.gain
            : 0.8,
        monitorMono: saved.monitorMono === true,
        toneEq: {
          lowShelfDb: Number.isFinite(tone?.lowShelfDb) ? tone.lowShelfDb : 0,
          lowMidDb: Number.isFinite(tone?.lowMidDb) ? tone.lowMidDb : 0,
          highShelfDb: Number.isFinite(tone?.highShelfDb)
            ? tone.highShelfDb
            : 0,
        },
        width: Number.isFinite(saved.width) ? saved.width : 1,
        makeupDb: Number.isFinite(saved.makeupDb) ? saved.makeupDb : 0,
        targets: {
          lufs: Number.isFinite(targets?.lufs) ? targets.lufs : -14,
          truePeak: Number.isFinite(targets?.truePeak)
            ? targets.truePeak
            : -0.1,
        },
        pluginIds: Array.isArray(saved.pluginIds)
          ? saved.pluginIds.filter((id): id is string => typeof id === 'string')
          : [],
        pluginParams:
          saved.pluginParams && typeof saved.pluginParams === 'object'
            ? saved.pluginParams
            : {},
      };
    }
    return {
      gain: Number.isFinite(bundle.mixState?.masterGain)
        ? bundle.mixState.masterGain
        : 0.8,
      monitorMono: bundle.mixState?.monitorMono === true,
      toneEq: { lowShelfDb: 0, lowMidDb: 0, highShelfDb: 0 },
      width: 1,
      makeupDb: 0,
      targets: { lufs: -14, truePeak: -0.1 },
      pluginIds: [],
      pluginParams: {},
    };
  }

  private songLengthStepsFor(structure: SongSection[]): number {
    const fromStructure = (structure ?? []).reduce(
      (sum, section) => sum + Math.max(0, section?.length ?? 0),
      0,
    );
    const bars = Math.max(
      4,
      fromStructure,
      this.musicManager.activeLoopBars?.() ?? 0,
      (this.musicManager.arrangementEndBar?.() ?? 0) + 1,
    );
    return bars * 16;
  }

  /**
   * Clear project-scoped state for a new set. Without this, starting a fresh
   * project could inherit the previous song's tempo map, VCA groups and master
   * chain until a reload.
   */
  private resetProjectState(): void {
    this.tempoMap.clear();
    this.markers.clear();
    this.vcaBuses.replaceRouting([], {});
    this.sidechainRouting.clear();
    for (const track of this.musicManager.tracks()) {
      this.musicManager.engine.setVcaMultiplier(track.id, 1);
    }
    this.musicManager.engine.setPlaybackLoop(null, null);
    this.applyMasterState({
      gain: 0.8,
      monitorMono: false,
      toneEq: { lowShelfDb: 0, lowMidDb: 0, highShelfDb: 0 },
      width: 1,
      makeupDb: 0,
      targets: { lufs: -14, truePeak: -0.1 },
      pluginIds: [],
      pluginParams: {},
    });
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
    monitorMono = this.musicManager.engine?.monoMonitoring?.() ?? false,
    sessionLaunchQuantize = this.musicManager.launchQuantize(),
    sessionFollowEnabled = this.musicManager.sceneFollowEnabled(),
    sessionFollowBars = this.musicManager.sceneFollowBars(),
    sessionSceneFollowRules = this.musicManager.sceneFollowRules(),
    projectState: {
      performance: ProjectPerformanceState;
      master: ProjectMasterState;
    } = this.captureProjectState(),
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
      monitorMono,
      sessionLaunchQuantize,
      sessionFollowEnabled,
      sessionFollowBars,
      sessionSceneFollowRules,
      projectState,
    });
  }

  private captureProjectState(): {
    performance: ProjectPerformanceState;
    master: ProjectMasterState;
  } {
    return {
      performance: this.capturePerformanceState(),
      master: this.captureMasterState(),
    };
  }

  /** Project-scoped state as stored in a bundle, for clean-signature checks. */
  private projectStateFromBundle(bundle: ProjectBundle): {
    performance: ProjectPerformanceState;
    master: ProjectMasterState;
  } {
    return {
      performance: {
        tempoMap: (bundle.tempoMap ?? []).map((marker) => ({ ...marker })),
        markers: (bundle.markers ?? []).map((marker) => ({ ...marker })),
        vca: {
          buses: (bundle.vca?.buses ?? []).map((bus) => ({ ...bus })),
          assignments: { ...(bundle.vca?.assignments ?? {}) },
        },
        sidechain: (bundle.sidechain ?? []).map((route) => ({ ...route })),
        playback: bundle.playback ?? {
          loopEnabled: false,
          loopStart: null,
          loopEnd: null,
        },
      },
      master: this.masterStateFromBundle(bundle),
    };
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

  /** Every valid stored project record, in storage order, un-collapsed. */
  private async readStoredProjects(): Promise<StoredProjectBundle[]> {
    const stored = await this.storage.getAllItems("projects");
    return stored.filter(
      (item): item is StoredProjectBundle => this.isStoredProjectBundle(item),
    );
  }

  /**
   * Validate, load and mark one stored record clean. `loadProject` and
   * `restoreProjectVersion` differ only in how they choose the record, so the
   * restore itself lives here once instead of being copied per entry point.
   */
  private restoreStoredRecord(
    record: StoredProjectBundle,
  ): StoredProjectBundle {
    this.validateBundle(record);
    this.restoreFromSnapshot(record);
    this.markPersistenceClean(
      record,
      record.source || this.detectPersistenceSource(record.id),
      this.storedSavedAt(record),
    );
    return record;
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
      // Older bundles predate the field; treat the current monitor mode as the
      // saved one so opening them does not mark the project dirty immediately.
      typeof bundle.mixState?.monitorMono === "boolean"
        ? bundle.mixState.monitorMono
        : (this.musicManager.engine?.monoMonitoring?.() ?? false),
      bundle.session?.launchQuantize ?? "none",
      bundle.session?.followEnabled === true,
      bundle.session?.followBars ?? 4,
      bundle.session?.sceneFollowRules ?? {},
      this.projectStateFromBundle(bundle),
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
    if (bundle.tempoMap !== undefined) {
      if (!Array.isArray(bundle.tempoMap) || bundle.tempoMap.some((marker) =>
        !marker || typeof marker.id !== 'string' || !Number.isFinite(marker.step) ||
        marker.step < 0 || !Number.isFinite(marker.bpm) ||
        marker.bpm < 20 || marker.bpm > 300
      )) throw new Error('Invalid tempo map.');
    }
    if (bundle.markers !== undefined) {
      if (!Array.isArray(bundle.markers) || bundle.markers.some((marker) =>
        !marker || typeof marker.id !== 'string' || typeof marker.name !== 'string' ||
        !Number.isFinite(marker.time) || marker.time < 0
      )) throw new Error('Invalid arrangement markers.');
    }
    if (bundle.vca !== undefined) {
      if (!bundle.vca || !Array.isArray(bundle.vca.buses) ||
          !bundle.vca.assignments || typeof bundle.vca.assignments !== 'object' ||
          bundle.vca.buses.some((bus) => !bus || typeof bus.id !== 'string' ||
            !bus.id || !Number.isFinite(bus.faderValue))) {
        throw new Error('Invalid VCA routing.');
      }
    }
    if (bundle.sidechain !== undefined) {
      if (!Array.isArray(bundle.sidechain) || bundle.sidechain.some((route) =>
        !route || typeof route.triggerTrackId !== 'string' ||
        typeof route.targetTrackId !== 'string' ||
        !route.triggerTrackId || !route.targetTrackId ||
        route.triggerTrackId === route.targetTrackId
      )) throw new Error('Invalid sidechain routing.');
    }
    if (bundle.playback !== undefined) {
      const { loopStart, loopEnd } = bundle.playback;
      if (typeof bundle.playback.loopEnabled !== 'boolean' ||
          (loopStart !== null && (!Number.isFinite(loopStart) || loopStart < 0)) ||
          (loopEnd !== null && (!Number.isFinite(loopEnd) || loopEnd < 0)) ||
          (loopStart !== null && loopEnd !== null && loopEnd <= loopStart)) {
        throw new Error('Invalid playback loop.');
      }
    }
    if (bundle.master !== undefined) {
      const master = bundle.master;
      if (!master || !Number.isFinite(master.gain) || master.gain < 0 ||
          master.gain > 1 || typeof master.monitorMono !== 'boolean' ||
          !master.toneEq || !master.targets ||
          !Number.isFinite(master.width) ||
          !Number.isFinite(master.makeupDb) ||
          !Number.isFinite(master.targets.lufs) ||
          !Number.isFinite(master.targets.truePeak) ||
          !Array.isArray(master.pluginIds)) {
        throw new Error('Invalid master state.');
      }
    }
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
