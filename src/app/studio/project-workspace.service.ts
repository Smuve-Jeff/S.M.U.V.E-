import { DestroyRef, Injectable, computed, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AuthService } from "../services/auth.service";
import { Project } from "../types";
import { MusicManagerService, type SongSection } from "../services/music-manager.service";
import {
  LiveEngineService,
  type LivePerformanceState,
} from "../services/live-engine.service";
import { TakeManagerService, type TakeStateBundle } from "../services/take-manager.service";
import { HistoryService } from "../services/history.service";
import { ProjectService } from "../services/project.service";
import {
  LocalStorageService,
  type StorageDurability,
} from "../services/local-storage.service";
import { SessionSafetyService } from "../services/session-safety.service";
import { OfflineSyncService } from "../services/offline-sync.service";
import { CloudSyncService } from "../services/cloud-sync.service";
import { ArtistRelationshipService } from "../services/artist-relationship.service";
import { LoggingService } from "../services/logging.service";
import { AutomationService } from "./automation.service";
import { ArrangementMarkersService, type ArrangementMarker } from "./arrangement-markers.service";
import { SidechainRoutingService, type SidechainRoute } from "./sidechain-routing.service";
import { TempoMapService, type TempoMarker } from "./tempo-map.service";
import { MeterMapService, type MeterMarker } from "./meter-map.service";
import { VcaBusService, type VcaAssignments, type VcaBus } from "./vca-bus.service";
import {
  PROJECT_FORMAT_VERSION,
  buildProjectArchive,
  type ImportedProjectBundle,
} from "./project-archive.util";
import {
  describeAudioIntegrityFailure,
  inspectProjectAudioIntegrity,
  type AudioIntegrityIssue,
  type ProjectAudioIntegrityReport,
} from "./project-integrity.util";
import { PROJECT_BACKING_TRACK } from "./project-backing-track.token";
import {
  FLOAT32_CHANNEL_PREFIX,
  decodeFloat32Channel,
  encodeFloat32Channel,
} from "./audio-channel-codec.util";

export interface ProjectMetadata {
  id: string;
  name: string;
  bpm: number;
  /** [beats, beat-unit] of the notated bar, e.g. [3, 4]. */
  timeSignature?: [number, number];
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
  meterMap?: MeterMarker[];
  markers: ArrangementMarker[];
  vca: { buses: VcaBus[]; assignments: VcaAssignments };
  sidechain: SidechainRoute[];
  playback: ProjectPlaybackState;
}

export interface DirectorBundleState {
  runs: Array<{
    surfaceId: string;
    startedAt: number;
    finishedAt: number;
    completed: number;
    failed: number;
    report: string[];
    results: Array<{
      ok: boolean;
      message: string;
      durationMs: number;
      step: {
        id: string;
        surfaceId: string;
        label: string;
        detail: string;
        executable: boolean;
        targetSurfaceId?: string;
      };
    }>;
  }>;
  briefs?: Array<{ surfaceId: string; brief: string; at: number }>;
}

/**
 * The set's guide vocal as it travels inside a cloud snapshot: the raw
 * upload bytes (base64), capped so an instrumental never turns a version
 * push into a phone-radio ordeal. Local records and archive exports keep
 * using the media store / archive entry instead.
 */
export interface SharedGuideTrack {
  name: string;
  mimeType: string;
  dataBase64: string;
  byteSize: number;
}

/** Guide uploads above this stay on-device; the song never waits on its guide. */
const SHARED_GUIDE_MAX_BYTES = 6 * 1024 * 1024;

/**
 * Hard ceiling for one versioned cloud snapshot, checked from the binary
 * bundle before any PCM is expanded into base64. The resumable upload path can
 * carry large sets, but an unbounded queue payload can still exhaust a phone's
 * memory while it is being encoded and stored. Kept in line with the existing
 * 512 MiB project import/export ceiling.
 */
export const MAX_CLOUD_BUNDLE_BYTES = 512 * 1024 * 1024;

/** Durable cloud state shown per set, independent of the current session. */
export type ProjectSyncState =
  | "local-only"
  | "queued"
  | "synced"
  | "conflict"
  | "too-large";

export interface ProjectCloudSizeBreakdown {
  totalBytes: number;
  audioBytes: number;
  guideBytes: number;
  projectBytes: number;
}

export interface ProjectSyncStatus {
  /** IndexedDB key; always the stable project id. */
  id: string;
  projectId: string;
  state: ProjectSyncState;
  reason: string;
  updatedAt: number;
  /** Last time a cloud version was confirmed, even after newer local edits. */
  lastSyncedAt?: number;
  /**
   * Identity of the upload this `queued` state is waiting on. Confirmation is
   * matched against it, so a slower older push cannot mark a newer queued
   * save as synced just because it finished later.
   */
  uploadId?: string;
  cloudBytes: number;
  breakdown: ProjectCloudSizeBreakdown;
}

export interface ProjectLeaseConflict {
  projectId: string;
  ownerId: string;
  ownerLabel: string;
  acquiredAt: number;
  expiresAt: number;
  message: string;
}

/** A small record, deliberately separate from the multi-megabyte set. */
export const PROJECT_SYNC_STATUS_STORE = "project_sync_status";
/** localStorage key prefix; the owner id is unique per browser tab. */
export const PROJECT_LEASE_KEY_PREFIX = "smuve_studio_project_lease:";
const PROJECT_TAB_ID_KEY = "smuve_studio_tab_id";
const PROJECT_LEASE_TTL_MS = 15_000;
const PROJECT_LEASE_HEARTBEAT_MS = 5_000;

interface ProjectLeaseRecord {
  projectId: string;
  ownerId: string;
  ownerLabel: string;
  acquiredAt: number;
  expiresAt: number;
}

const EMPTY_SIZE_BREAKDOWN: ProjectCloudSizeBreakdown = {
  totalBytes: 0,
  audioBytes: 0,
  guideBytes: 0,
  projectBytes: 0,
};

class CloudBundleTooLargeError extends Error {
  readonly size: ProjectCloudSizeBreakdown;

  constructor(size: ProjectCloudSizeBreakdown) {
    const limitMb = Math.round(MAX_CLOUD_BUNDLE_BYTES / (1024 * 1024));
    const estimatedMb = (size.totalBytes / (1024 * 1024)).toFixed(1);
    super(
      `Saved on this device, but this version is too large to sync ` +
        `(about ${estimatedMb} MB; the cloud limit is ${limitMb} MB). ` +
        `Remove unused takes or export a backup.`,
    );
    this.name = "CloudBundleTooLargeError";
    this.size = size;
  }
}

/** Chunked base64 so a multi-megabyte guide never blows the call stack. */
function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface ProjectBundle {
  metadata: ProjectMetadata;
  tracks: any[];
  audioAssets?: SerializedAudioAsset[];
  /** Guide vocal shared through the cloud. Absent = no guide to share. */
  guideTrack?: SharedGuideTrack;
  structure?: SongSection[];
  takeState?: TakeStateBundle;
  automation: any;
  mixState: any;
  /** Container revision. 2 = ZIP archive with raw Float32 audio. */
  formatVersion?: number;
  /** Tempo changes pinned to absolute song steps. */
  tempoMap?: TempoMarker[];
  /** Time-signature changes pinned to absolute song steps. */
  meterMap?: MeterMarker[];
  /** Named arrangement locations, in bars. */
  markers?: ArrangementMarker[];
  /** VCA control-surface groups and their track assignments. */
  vca?: { buses: VcaBus[]; assignments: VcaAssignments };
  /** Real compressor ducking matrix: trigger → target. */
  sidechain?: SidechainRoute[];
  playback?: ProjectPlaybackState;
  master?: ProjectMasterState;
  /** Director evidence: recent runs and briefs travel with the project. */
  director?: DirectorBundleState;
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
    /** The live rig: chord mode, scale lock/root, note repeat, octave, stamp. */
    performance?: LivePerformanceState;
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
  /** Saved meter of the set, e.g. [3, 4]. */
  timeSignature: [number, number];
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
type SerializedAudioChannel = Float32Array | number[] | string;

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
/** Device-kept versions, used when the cloud history cannot be reached. */
const LOCAL_VERSION_STORE = "offline_local_cache";
const LOCAL_VERSION_PREFIX = "version_";
const LOCAL_VERSION_LIMIT = 5;

export interface LocalStorageUsage {
  projectId: string;
  /** Bytes taken by the set's own stored record(s). */
  setBytes: number;
  /** Bytes taken by the device versions kept for it. */
  versionBytes: number;
  versionCount: number;
  /** Versions past the newest one, which clearing would remove. */
  staleVersionBytes: number;
  staleVersionCount: number;
}

export interface DeviceStorageQuota {
  usedBytes: number;
  totalBytes: number;
  percentUsed: number;
}

export interface LocalProjectVersion {
  id: string;
  projectId: string;
  savedAt: number;
  title: string;
  version: number;
  payload: StoredProjectBundle;
}

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

  /**
   * Guest clearance promises work is never written to a vault. Auto-save,
   * manual save and the page-hide recovery snapshot all ignored the session
   * role, so a guest's project was persisted anyway — the opposite of what
   * the login and guest-clearance screens say.
   */
  private get isGuestSession(): boolean {
    return this.auth.isGuest?.() === true;
  }
  private readonly musicManager = inject(MusicManagerService);
  /** The engine owns the live rig's real state; saves read it directly. */
  private readonly liveEngine = inject(LiveEngineService);
  private readonly projectService = inject(ProjectService);
  private readonly storage = inject(LocalStorageService);
  private readonly sessionSafety = inject(SessionSafetyService);
  private readonly offlineSync = inject(OfflineSyncService);
  private readonly logger = inject(LoggingService);
  private readonly automationService = inject(AutomationService);
  private readonly takeManager = inject(TakeManagerService);
  private readonly history = inject(HistoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tempoMap = inject(TempoMapService);
  private readonly meterMap = inject(MeterMapService);
  /**
   * Optional: only hosts with the vocal services store guide tracks. The port
   * keeps audio bytes out of the JSON bundle while still tying them to a set.
   */
  private readonly backingTrack = inject(PROJECT_BACKING_TRACK, {
    optional: true,
  });
  /** The one cloud writer: every versioned push goes through here. */
  private readonly cloudSync = inject(CloudSyncService);
  /**
   * Behavioural learning: a finished save is evidence of how this artist
   * works. Best-effort and silent — a learning failure must never fail
   * the save it observed.
   */
  private readonly relationship = inject(ArtistRelationshipService, {
    optional: true,
  });
  private readonly markers = inject(ArrangementMarkersService);
  private readonly vcaBuses = inject(VcaBusService);
  private readonly sidechainRouting = inject(SidechainRoutingService);
  readonly isSaving = signal(false);
  /**
   * Whether this browser promised to keep saved sets instead of evicting them
   * under storage pressure. Read defensively: older test doubles of
   * LocalStorageService predate the signal, and the shell must still render.
   */
  readonly storageDurability = computed<StorageDurability>(
    () => this.storage.durability?.() ?? 'unknown'
  );
  readonly persistenceError = signal('');
  readonly projectNotes = signal('');
  /** Last import/export/restore audio-reference check. */
  readonly audioIntegrity = signal<ProjectAudioIntegrityReport | null>(null);
  /**
   * True only while the reported issues belong to the project currently open,
   * so an import that was blocked before opening cannot offer repair actions
   * against clips that are not on screen.
   */
  readonly canRepairAudio = computed(() => {
    const report = this.audioIntegrity();
    if (!report || report.ok || report.issues.length === 0) return false;
    return report.issues.every((issue) => {
      if (!issue.clipId) return false;
      const track = this.musicManager
        .tracks()
        .find((candidate) => candidate.id === issue.trackId);
      return !!track?.clips?.some((clip) => clip.id === issue.clipId);
    });
  });

  /** Current project metadata */
  metadata = signal<ProjectMetadata | null>(null);
  /**
   * Bridge to the Director service without a circular injection: Director
   * registers these on construction so snapshots and restores can carry
   * Director evidence inside the bundle itself.
   */
  directorStateProvider: (() => DirectorBundleState | undefined) | null = null;
  directorStateConsumer: ((state: DirectorBundleState | undefined) => void) | null = null;
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
  /**
   * Set when the local save succeeded but its cloud version was refused before
   * encoding. The shell shows this beside the persistence warning so the
   * artist knows the work is safe and what to do next.
   */
  readonly cloudSyncRefusal = signal('');
  /**
   * Cloud state persisted for every set on this device. This is what keeps a
   * local-only save from looking cloud-safe after a reload or route change.
   */
  readonly syncStatuses = signal<Record<string, ProjectSyncStatus>>({});
  readonly currentSyncStatus = computed<ProjectSyncStatus | null>(() => {
    const projectId = this.metadata()?.id;
    return projectId ? (this.syncStatuses()[projectId] ?? null) : null;
  });
  /**
   * Set while another Studio tab owns this project. All project writes refuse
   * until the lease expires or the artist explicitly takes over here.
   */
  readonly leaseConflict = signal<ProjectLeaseConflict | null>(null);
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
  /** Unique per browser tab; a reload of this tab keeps the same owner. */
  private readonly leaseOwnerId = this.readOrCreateTabId();
  private activeLeaseProjectId: string | null = null;
  private leaseHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initializeMetadata();
    void this.loadSyncStatuses();
    this.acquireProjectLease(this.metadata()?.id);
    this.watchCloudSyncOutcomes();
    this.lastObservedSignature = this.captureStateSignature();
    this.lastSavedSignature = this.lastObservedSignature;
    this.watchWorkspaceChanges();
    this.startAutoSave();
    this.watchTransportEdits();
    this.installLifecyclePersistence();
    // The shell's update gate reads dirty/saving state from a store it can
    // import without this service's project graph. Mirror it live.
    effect(() => {
      this.sessionSafety.hasUnsavedChanges.set(this.isDirty());
      this.sessionSafety.isProjectSaving.set(this.isSaving());
    });
    // The shell may save before applying an update. Route it through the real
    // manual-save path so guest refusal, audio integrity and quota rules apply
    // exactly as they do from the Studio.
    this.sessionSafety.registerSaveHandler(async () => {
      try {
        await this.manualSave();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message
              ? error.message
              : 'This set could not be saved.',
        };
      } finally {
        // Effects flush on the next change detection; publish the settled
        // state now so the shell's immediate re-check sees this save.
        this.sessionSafety.hasUnsavedChanges.set(this.isDirty());
        this.sessionSafety.isProjectSaving.set(this.isSaving());
      }
    });
    // Guests cannot save, so their only protection is a downloaded backup.
    // Expose the Studio's real export path to the shell and guest-exit flows.
    this.sessionSafety.registerExportHandler(() => {
      if (!this.metadata()) {
        return { ok: false, message: 'No set is open to export.' };
      }
      try {
        this.downloadProjectBundle();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message
              ? error.message
              : 'This set could not be exported.',
        };
      }
    });
    this.destroyRef.onDestroy(() => {
      this.stopAutoSave();
      this.releaseProjectLease();
      this.sessionSafety.registerSaveHandler(null);
      this.sessionSafety.registerExportHandler(null);
      this.sessionSafety.hasUnsavedChanges.set(false);
      this.sessionSafety.isProjectSaving.set(false);
    });
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

  // ── Durable cloud state and cross-tab project lease ─────

  /** Read every persisted set status once, then keep the map current. */
  private async loadSyncStatuses(): Promise<void> {
    if (this.isGuestSession) return;
    try {
      const rows = await this.storage.getAllItems(PROJECT_SYNC_STATUS_STORE);
      const loaded: Record<string, ProjectSyncStatus> = {};
      for (const row of rows ?? []) {
        const projectId = String(row?.projectId ?? row?.id ?? "").trim();
        if (!projectId) continue;
        loaded[projectId] = {
          id: projectId,
          projectId,
          state: this.normalizeSyncState(row?.state),
          reason: String(row?.reason ?? ""),
          updatedAt: Number(row?.updatedAt) || 0,
          lastSyncedAt: Number(row?.lastSyncedAt) || undefined,
          uploadId:
            typeof row?.uploadId === "string" && row.uploadId
              ? row.uploadId
              : undefined,
          cloudBytes: Math.max(0, Number(row?.cloudBytes) || 0),
          breakdown: this.normalizeSizeBreakdown(row?.breakdown),
        };
      }
      // A save can land while IndexedDB is still opening. Never let the
      // initial read put stale state back over a newer in-memory record.
      this.syncStatuses.update((current) => {
        const merged = { ...loaded };
        for (const [projectId, status] of Object.entries(current)) {
          if (!merged[projectId] || status.updatedAt >= merged[projectId].updatedAt) {
            merged[projectId] = status;
          }
        }
        return merged;
      });
      this.applyPersistedSyncWarning();
      this.reconcileQueuedFromCloudHistory(
        this.cloudSync.timeline?.() ?? [],
      );
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Could not load cloud status", error);
    }
  }

  /**
   * A queued badge is only stale while no cloud confirmation exists. The sync
   * timeline is persisted by CloudSyncService, so this also repairs a replay
   * that finished before this service subscribed (or before the page loaded).
   */
  private reconcileQueuedFromCloudHistory(
    history: ReadonlyArray<{
      projectId?: string;
      direction?: string;
      status?: string;
      at?: number;
      uploadId?: string;
    }>,
  ): void {
    // One confirmation belongs to one upload. Time alone cannot tell two
    // saves apart: an older push that finishes late is newer than the queued
    // status it must not clear, so entries carrying an upload id are matched
    // by that id. Entries from before identities existed fall back to time.
    const confirmedUploads = new Map<string, number>();
    const legacyConfirmedAt = new Map<string, number>();
    for (const entry of history) {
      if (entry?.direction !== "push" || entry.status !== "success") continue;
      const projectId = String(entry.projectId ?? "");
      const at = Number(entry.at) || 0;
      if (!projectId || !at) continue;
      const uploadId = String(entry.uploadId ?? "");
      if (uploadId) {
        const key = this.uploadKey(projectId, uploadId);
        confirmedUploads.set(key, Math.max(confirmedUploads.get(key) ?? 0, at));
      } else {
        legacyConfirmedAt.set(
          projectId,
          Math.max(legacyConfirmedAt.get(projectId) ?? 0, at),
        );
      }
    }
    for (const [projectId, status] of Object.entries(this.syncStatuses())) {
      if (status.state !== "queued") continue;
      const uploadId = status.uploadId ?? "";
      let at: number;
      if (uploadId) {
        at = confirmedUploads.get(this.uploadKey(projectId, uploadId)) ?? 0;
        if (!at) continue;
      } else {
        at = legacyConfirmedAt.get(projectId) ?? 0;
        if (!at || at < status.updatedAt) continue;
      }
      void this.recordSyncStatus(
        projectId,
        "synced",
        "Cloud version confirmed.",
        undefined,
        at,
      );
    }
  }

  /** Composite key so an upload id only matches inside its own set. */
  private uploadKey(projectId: string, uploadId: string): string {
    return `${projectId}\u0000${uploadId}`;
  }

  /** Connect queued updates to the moment the cloud actually accepts them. */
  private watchCloudSyncOutcomes(): void {
    this.cloudSync.pushSucceeded$?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ projectId, at, uploadId }) => {
      // Only the queued version can become "synced". If a newer local save
      // replaced it while the upload was in flight, this project is local-only
      // again; marking it synced would claim the latest edit is in the cloud.
      const status = this.syncStatuses()[projectId];
      if (status?.state !== "queued") return;
      // ...and only the exact upload the badge is waiting on may confirm it.
      // An older queued push that finishes late carries a different id even
      // though its timestamp is newer than the newer save.
      if (status.uploadId) {
        if (status.uploadId !== uploadId) return;
      } else if (uploadId || at < status.updatedAt) {
        // A status queued before identities existed has no id to compare; an
        // untagged push may confirm it only if it is not older than the save.
        return;
      }
      void this.recordSyncStatus(
        projectId,
        "synced",
        "Cloud version confirmed.",
        undefined,
        at,
      );
    });

    effect(() => {
      const history = this.cloudSync.timeline?.();
      if (history) this.reconcileQueuedFromCloudHistory(history);
    });

    effect(() => {
      const conflicts = this.cloudSync.conflictMap?.();
      if (!conflicts) return;
      for (const [projectId, conflict] of Object.entries(conflicts)) {
        const existing = this.syncStatuses()[projectId];
        if (existing?.state === "conflict") continue;
        void this.recordSyncStatus(
          projectId,
          "conflict",
          `Cloud version v${conflict.remoteVersion} is newer than this device's copy.`,
        );
      }
    });
  }

  /** The durable record for one set, including when it is not open now. */
  syncStatusFor(projectId: string): ProjectSyncStatus | null {
    return this.syncStatuses()[projectId] ?? null;
  }

  /**
   * Autosaves and recovery snapshots are still local-only, but they must not
   * erase a cloud conflict or an oversized-set warning the artist has not
   * resolved yet. Those states describe the set, not just the last save.
   */
  private async recordLocalSaveStatus(
    projectId: string,
    reason: string,
    size: ProjectCloudSizeBreakdown,
  ): Promise<void> {
    const previous = this.syncStatuses()[projectId];
    if (previous?.state === "conflict") {
      await this.recordSyncStatus(projectId, "conflict", previous.reason, size);
      return;
    }
    if (
      previous?.state === "too-large" &&
      size.totalBytes > MAX_CLOUD_BUNDLE_BYTES
    ) {
      await this.recordSyncStatus(
        projectId,
        "too-large",
        new CloudBundleTooLargeError(size).message,
        size,
      );
      return;
    }
    await this.recordSyncStatus(projectId, "local-only", reason, size);
  }

  /** Fresh identity for one queued upload, unique per save attempt. */
  private newUploadId(): string {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    );
  }

  /** A local save is not a cloud save; record that distinction durably. */
  private async recordSyncStatus(
    projectId: string,
    state: ProjectSyncState,
    reason: string,
    size?: ProjectCloudSizeBreakdown,
    lastSyncedAt?: number,
    uploadId?: string,
  ): Promise<void> {
    if (!projectId || this.isGuestSession) return;
    const previous = this.syncStatuses()[projectId];
    const now = Date.now();
    const next: ProjectSyncStatus = {
      id: projectId,
      projectId,
      state,
      reason,
      updatedAt: now,
      lastSyncedAt: state === "synced" ? (lastSyncedAt ?? now) : previous?.lastSyncedAt,
      // Only a queued state is waiting on an upload; every other state is
      // final for this save, so its pending identity is dropped.
      uploadId: state === "queued" ? (uploadId ?? previous?.uploadId) : undefined,
      cloudBytes: size?.totalBytes ?? previous?.cloudBytes ?? 0,
      breakdown: size ?? previous?.breakdown ?? { ...EMPTY_SIZE_BREAKDOWN },
    };
    this.syncStatuses.update((map) => ({ ...map, [projectId]: next }));
    if (this.metadata()?.id === projectId) {
      if (state === "too-large") {
        this.cloudSyncRefusal.set(reason);
      } else if (previous?.state === "too-large") {
        // A fresh local save now fits, or another state superseded the old
        // refusal; do not leave a stale "too large" warning behind.
        this.cloudSyncRefusal.set("");
      }
    }
    try {
      await this.storage.saveItem(PROJECT_SYNC_STATUS_STORE, next);
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Cloud status write failed", error);
    }
  }

  /** Restore the warning after a reload, not only during the save that made it. */
  private applyPersistedSyncWarning(): void {
    const status = this.currentSyncStatus();
    if (status?.state === "too-large") this.cloudSyncRefusal.set(status.reason);
  }

  private async deleteSyncStatus(projectId: string): Promise<void> {
    this.syncStatuses.update((map) => {
      if (!map[projectId]) return map;
      const next = { ...map };
      delete next[projectId];
      return next;
    });
    if (this.activeLeaseProjectId === projectId) this.releaseProjectLease();
    try {
      await this.storage.deleteItems(PROJECT_SYNC_STATUS_STORE, [projectId]);
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Cloud status delete failed", error);
    }
  }

  private normalizeSyncState(value: unknown): ProjectSyncState {
    return value === "queued" || value === "synced" || value === "conflict" || value === "too-large"
      ? value
      : "local-only";
  }

  private normalizeSizeBreakdown(value: unknown): ProjectCloudSizeBreakdown {
    const raw = (value ?? {}) as Partial<ProjectCloudSizeBreakdown>;
    return {
      totalBytes: Math.max(0, Number(raw.totalBytes) || 0),
      audioBytes: Math.max(0, Number(raw.audioBytes) || 0),
      guideBytes: Math.max(0, Number(raw.guideBytes) || 0),
      projectBytes: Math.max(0, Number(raw.projectBytes) || 0),
    };
  }

  // ── Project lease ───────────────────────────────────────

  private readOrCreateTabId(): string {
    try {
      const existing = sessionStorage.getItem(PROJECT_TAB_ID_KEY);
      if (existing) return existing;
      const id =
        globalThis.crypto?.randomUUID?.() ??
        `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(PROJECT_TAB_ID_KEY, id);
      return id;
    } catch {
      return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  private projectLeaseStorage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private projectLeaseKey(projectId: string): string {
    return `${PROJECT_LEASE_KEY_PREFIX}${projectId}`;
  }

  private readProjectLease(projectId: string): ProjectLeaseRecord | null {
    const storage = this.projectLeaseStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.projectLeaseKey(projectId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ProjectLeaseRecord>;
      if (
        !parsed ||
        parsed.projectId !== projectId ||
        typeof parsed.ownerId !== "string" ||
        typeof parsed.ownerLabel !== "string" ||
        !Number.isFinite(parsed.expiresAt)
      ) {
        return null;
      }
      return {
        projectId,
        ownerId: parsed.ownerId,
        ownerLabel: parsed.ownerLabel,
        acquiredAt: Number(parsed.acquiredAt) || 0,
        expiresAt: Number(parsed.expiresAt) || 0,
      };
    } catch {
      return null;
    }
  }

  private leaseConflictFor(lease: ProjectLeaseRecord): ProjectLeaseConflict {
    return {
      projectId: lease.projectId,
      ownerId: lease.ownerId,
      ownerLabel: lease.ownerLabel,
      acquiredAt: lease.acquiredAt,
      expiresAt: lease.expiresAt,
      message:
        `This set is open in another Studio window (${lease.ownerLabel}). ` +
        `This window is read-only until you take over editing here.`,
    };
  }

  /** Claim the open set for this tab. Returns false when another tab owns it. */
  private acquireProjectLease(projectId: string | undefined, force = false): boolean {
    if (!projectId) return false;
    const storage = this.projectLeaseStorage();
    if (!storage) return true;
    if (this.activeLeaseProjectId && this.activeLeaseProjectId !== projectId) {
      this.releaseProjectLease();
    }
    this.activeLeaseProjectId = projectId;
    const now = Date.now();
    const existing = this.readProjectLease(projectId);
    if (existing && existing.ownerId !== this.leaseOwnerId && existing.expiresAt > now && !force) {
      this.leaseConflict.set(this.leaseConflictFor(existing));
      this.startLeaseHeartbeat(projectId);
      return false;
    }
    const ownerLabel =
      typeof navigator !== "undefined" && navigator.platform
        ? navigator.platform
        : "Studio";
    const lease: ProjectLeaseRecord = {
      projectId,
      ownerId: this.leaseOwnerId,
      ownerLabel: `${ownerLabel} · ${this.leaseOwnerId.slice(-4)}`,
      acquiredAt: force || !existing || existing.ownerId !== this.leaseOwnerId ? now : existing.acquiredAt,
      expiresAt: now + PROJECT_LEASE_TTL_MS,
    };
    try {
      storage.setItem(this.projectLeaseKey(projectId), JSON.stringify(lease));
    } catch {
      // A storage write failure is already a persistence failure; do not
      // invent a second-tab conflict when the browser cannot hold any state.
      return true;
    }
    const confirmed = this.readProjectLease(projectId);
    if (!confirmed || confirmed.ownerId !== this.leaseOwnerId) {
      if (confirmed) this.leaseConflict.set(this.leaseConflictFor(confirmed));
      this.startLeaseHeartbeat(projectId);
      return false;
    }
    this.leaseConflict.set(null);
    this.startLeaseHeartbeat(projectId);
    return true;
  }

  /** A save must refuse if another tab has taken the set since it opened. */
  private ensureProjectLease(): boolean {
    const projectId = this.metadata()?.id;
    if (!projectId) return true;
    const existing = this.readProjectLease(projectId);
    if (existing && existing.ownerId !== this.leaseOwnerId && existing.expiresAt > Date.now()) {
      this.leaseConflict.set(this.leaseConflictFor(existing));
      return false;
    }
    if (!existing || existing.ownerId !== this.leaseOwnerId) {
      return this.acquireProjectLease(projectId);
    }
    this.leaseConflict.set(null);
    return true;
  }

  /** Explicit recovery when the other window is closed or the artist chooses. */
  takeOverProjectLease(): boolean {
    const projectId = this.metadata()?.id;
    return projectId ? this.acquireProjectLease(projectId, true) : false;
  }

  private startLeaseHeartbeat(projectId: string): void {
    if (
      this.activeLeaseProjectId === projectId &&
      this.leaseHeartbeatTimer !== null
    ) {
      return;
    }
    this.stopLeaseHeartbeat();
    this.activeLeaseProjectId = projectId;
    this.leaseHeartbeatTimer = setInterval(() => {
      this.refreshProjectLease(projectId);
    }, PROJECT_LEASE_HEARTBEAT_MS);
  }

  private refreshProjectLease(projectId: string): void {
    if (this.activeLeaseProjectId !== projectId) return;
    const existing = this.readProjectLease(projectId);
    const now = Date.now();
    if (!existing || existing.ownerId === this.leaseOwnerId || existing.expiresAt <= now) {
      if (!existing || existing.ownerId !== this.leaseOwnerId) {
        this.acquireProjectLease(projectId);
        return;
      }
      const storage = this.projectLeaseStorage();
      if (storage) {
        try {
          storage.setItem(
            this.projectLeaseKey(projectId),
            JSON.stringify({ ...existing, expiresAt: now + PROJECT_LEASE_TTL_MS }),
          );
        } catch {
          return;
        }
      }
      this.leaseConflict.set(null);
      return;
    }
    this.leaseConflict.set(this.leaseConflictFor(existing));
  }

  private stopLeaseHeartbeat(): void {
    if (this.leaseHeartbeatTimer !== null) {
      clearInterval(this.leaseHeartbeatTimer);
      this.leaseHeartbeatTimer = null;
    }
  }

  private releaseProjectLease(): void {
    const projectId = this.activeLeaseProjectId;
    this.stopLeaseHeartbeat();
    this.activeLeaseProjectId = null;
    this.leaseConflict.set(null);
    if (!projectId) return;
    const storage = this.projectLeaseStorage();
    const existing = this.readProjectLease(projectId);
    if (storage && existing?.ownerId === this.leaseOwnerId) {
      try {
        storage.removeItem(this.projectLeaseKey(projectId));
      } catch {
        // A failed cleanup leaves a short TTL, not a permanent lock.
      }
    }
  }

  // ── Project Metadata ───────────────────────────────────

  private initializeMetadata() {
    const existing = this.projectService.currentProject();
    if (existing) {
      const meter = this.normalizeMeter(existing.timeSignature);
      this.metadata.set({
        id: (existing as Project & { metadata?: ProjectMetadata }).metadata?.id || existing.id,
        name: existing.name,
        bpm: existing.bpm,
        timeSignature: meter,
        key: existing.timeSignature ? "C" : "C",
        genre: "pop",
        mood: "energetic",
        tags: [],
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
        lastOpenedAt: Date.now(),
        version: 1,
      });
      this.musicManager.engine?.setTimeSignature?.(meter[0], meter[1]);
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
      timeSignature: this.normalizeMeter(patch.timeSignature),
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
    this.acquireProjectLease(meta.id);
    this.lastSavedSignature = "";
    this.lastAutoSave.set(0);
    this.lastPersistedAt.set(0);
    this.versionCount.set(0);
    this.lastQueuedSyncId.set(null);
    this.cloudSyncQueued.set(false);
    this.cloudSyncRefusal.set('');
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
    this.musicManager.engine?.setTimeSignature?.(4, 4);
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

  private transportSaveTimer: ReturnType<typeof setTimeout> | null = null;

  private startAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);

    this.autoSaveTimer = setInterval(() => {
      if (this.autoSaveEnabled() && this.isDirty()) {
        this.autoSave();
      }
    }, this.autoSaveIntervalMs());
  }

  /**
   * Tempo and meter edits used to wait for the 30 s autosave window (or a
   * manual save). They now schedule one debounced autosave, so a quick tab
   * close does not lose a change the engine is already playing.
   */
  private watchTransportEdits() {
    effect(() => {
      // The accessors already tolerate bare/mocked engines (`tempo` may be a
      // plain `{ set }` in tests); reading them here tracks the real signals.
      void this.currentTempo();
      void this.currentMeter();
      this.scheduleTransportSave();
    });
    this.destroyRef.onDestroy(() => {
      if (this.transportSaveTimer) clearTimeout(this.transportSaveTimer);
      this.transportSaveTimer = null;
    });
  }

  private scheduleTransportSave(): void {
    if (this.transportSaveTimer) clearTimeout(this.transportSaveTimer);
    this.transportSaveTimer = setTimeout(() => {
      this.transportSaveTimer = null;
      if (!this.autoSaveEnabled() || !this.isDirty() || this.isSaving()) return;
      void this.autoSave();
    }, 1200);
  }

  /**
   * Snapshot the open project.
   *
   * Resolves false when nothing was stored — a guest session, incomplete
   * audio, or a failed write. Callers that are about to replace the canvas
   * (a one-tap recipe, a template, a new session) use that answer to stop
   * instead of discarding a sketch this device never received.
   */
  async autoSave(): Promise<boolean> {
    if (this.isSaving()) return false;
    if (this.isGuestSession) {
      this.logger.info('ProjectWorkspace: Auto-save skipped for guest session');
      return false;
    }
    if (!this.ensureProjectLease()) {
      this.logger.warn('ProjectWorkspace: Auto-save refused; another tab owns this set');
      return false;
    }
    try {
      const snapshot = this.createStoredSnapshot();
      const integrity = inspectProjectAudioIntegrity(snapshot);
      this.audioIntegrity.set(integrity);
      if (!integrity.ok) {
        this.persistenceError.set(
          describeAudioIntegrityFailure(integrity, "autosave"),
        );
        this.logger.warn(
          "ProjectWorkspace: Auto-save skipped; audio is incomplete",
        );
        return false;
      }
      const stored = this.toStoredBundle(snapshot, "autosave");
      await this.requirePersistence();
      await this.storage.saveItem("projects", stored);
      await this.persistBackingTrack(snapshot.metadata.id);
      // Local only by design: every cloud row must be a restorable
      // version, and autosaves fire while the artist is still mid-thought.
      // Manual and import saves queue the versioned push below.
      this.lastAutoSave.set(stored.savedAt);
      this.markPersistenceClean(snapshot, "autosave", stored.savedAt);
      this.versionCount.update((v) => v + 1);
      await this.recordLocalSaveStatus(
        snapshot.metadata.id,
        "Autosaved on this device. Press Save to create a cloud version.",
        this.measureCloudBundle(snapshot),
      );
      this.logger.info(
        "ProjectWorkspace: Auto-saved " + snapshot.metadata.name,
      );

      this.persistenceError.set('');
      return true;
    } catch (e) {
      this.persistenceError.set(e instanceof Error ? e.message : 'Auto-save failed. Save or export a backup.');
      this.logger.warn("ProjectWorkspace: Auto-save failed", e);
      return false;
    }
  }

  async manualSave(): Promise<ProjectBundle> {
    if (this.isSaving()) throw new Error('A project save is already in progress.');
    if (this.isGuestSession) {
      throw new Error(
        'Guest sessions are not saved. Create an account to keep this project.',
      );
    }
    if (!this.ensureProjectLease()) {
      throw new Error(
        this.leaseConflict()?.message ??
          'This set is open in another Studio window. This window is read-only.',
      );
    }
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
      const integrity = inspectProjectAudioIntegrity(bundle);
      this.audioIntegrity.set(integrity);
      if (!integrity.ok) {
        throw new Error(describeAudioIntegrityFailure(integrity, "save"));
      }
      const stored = this.toStoredBundle(bundle, "manual");
      await this.requirePersistence();
      await this.storage.saveItem("projects", stored);
      await this.persistBackingTrack(bundle.metadata.id);
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
      // This save now covers anything a recovery snapshot was holding.
      await this.pruneRedundantRecoveryRecords();
      // A save is a version: the Sets browser lists these, so history fills
      // up from ordinary saving instead of waiting for a cloud push. Failures
      // are swallowed — the save itself already succeeded.
      await this.saveLocalVersion(bundle);
      await this.tryQueueCloudSync(bundle);
      this.logger.info("ProjectWorkspace: Saved " + bundle.metadata.name);
      void this.relationship
        ?.observe({
          dimension: "production",
          summary:
            `Saved ${bundle.metadata.name || "Untitled"} with ` +
            `${bundle.tracks?.length ?? 0} tracks at ${bundle.metadata.bpm ?? "?"} BPM`,
          weight: 0.3,
        })
        .catch(() => undefined);
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

  /** A copy of an imported bundle without the archive's in-memory media. */
  private withoutImportedMedia(bundle: ProjectBundle): ProjectBundle {
    if (!(bundle as ImportedProjectBundle).importedBackingTrack) return bundle;
    const { importedBackingTrack: _media, ...rest } =
      bundle as ImportedProjectBundle;
    return rest as ProjectBundle;
  }

  /**
   * Keep the set's guide track with the set. Best-effort by design: a refused
   * media write must never turn a stored project into a failed save.
   */
  private async persistBackingTrack(projectId: string): Promise<void> {
    if (!this.backingTrack) return;
    try {
      await this.backingTrack.persistProject(projectId);
    } catch (error) {
      this.logger.warn("ProjectWorkspace: backing track not stored", error);
    }
  }

  private async requirePersistence(): Promise<void> {
    const status = await this.storage.persistenceStatus();
    if (status !== 'ready') throw new Error(`Project storage is ${status}. Export a backup before leaving.`);
  }

  private async tryQueueCloudSync(bundle: ProjectBundle): Promise<void> {
    this.cloudSyncRefusal.set('');
    try {
      // A cloud snapshot must never replace a complete one with a version
      // missing audio. The local save can still succeed and be repaired.
      const integrity = inspectProjectAudioIntegrity(bundle);
      this.audioIntegrity.set(integrity);
      if (!integrity.ok) {
        this.cloudSyncQueued.set(false);
        const reason = describeAudioIntegrityFailure(integrity, "cloud");
        await this.recordSyncStatus(
          bundle.metadata.id,
          "local-only",
          `${reason} This copy is saved on this device only.`,
          this.measureCloudBundle(bundle),
        );
        this.logger.warn("ProjectWorkspace: Cloud sync skipped; audio is incomplete", reason);
        return;
      }
      if (!this.auth.currentUser()?.id) {
        this.cloudSyncQueued.set(false);
        await this.recordSyncStatus(
          bundle.metadata.id,
          "local-only",
          "Saved on this device. Sign in to create a cloud version.",
          this.measureCloudBundle(bundle),
        );
        return;
      }
      // Reuse the bundle the save already built. Taking a second JSON snapshot
      // here duplicated the whole PCM capture on every manual save; the queued
      // converter below base64-encodes the channels without building another
      // project graph.
      const size = await this.queueCloudSync(bundle);
      if (!size) {
        await this.recordSyncStatus(
          bundle.metadata.id,
          "local-only",
          "Saved on this device. Sign in to create a cloud version.",
          this.measureCloudBundle(bundle),
        );
      }
    } catch (error) {
      this.cloudSyncQueued.set(false);
      if (error instanceof CloudBundleTooLargeError) {
        this.cloudSyncRefusal.set(error.message);
        await this.recordSyncStatus(
          bundle.metadata.id,
          "too-large",
          error.message,
          error.size,
        );
        this.logger.warn(
          'ProjectWorkspace: Cloud sync refused; version exceeds the size cap',
          error.message,
        );
        return;
      }
      await this.recordSyncStatus(
        bundle.metadata.id,
        "local-only",
        "Saved on this device. Cloud sync could not be queued.",
      );
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
        return this.restoreStoredRecord(this.withMeter(record as StoredProjectBundle));
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
        timeSignature: this.normalizeMeter(record.metadata.timeSignature),
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
      const records = (await this.readStoredProjects()).filter(
        (record) => record.metadata?.id === projectId,
      );
      const newestSaveAt = records.reduce((newest, record) => {
        const source = record.source || this.detectPersistenceSource(record.id);
        return source === "recovery"
          ? newest
          : Math.max(newest, this.storedSavedAt(record));
      }, 0);
      return records
        // A recovery snapshot that a later save already covers is not a version:
        // it only duplicated the save that followed it. Anything newer than the
        // newest save holds work that was never persisted and stays listed.
        .filter((record) => {
          const source = record.source || this.detectPersistenceSource(record.id);
          return (
            source !== "recovery" || this.storedSavedAt(record) > newestSaveAt
          );
        })
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
    if (this.metadata()?.id === projectId && !this.ensureProjectLease()) {
      this.logger.warn('ProjectWorkspace: Delete refused; another tab owns this set');
      return false;
    }
    try {
      await this.projectService.refresh();
      void this.backingTrack
        ?.forgetProject(projectId)
        .catch((error) =>
          this.logger.warn(
            "ProjectWorkspace: backing track delete failed",
            error,
          ),
        );
      const removed = await this.projectService.remove(`project_${projectId}`);
      if (removed) {
        await this.deleteSyncStatus(projectId);
        return true;
      }
      // Fallback: a set that only has autosave/recovery records is not in
      // ProjectService's project list, so remove it directly.
      const ids = (await this.readStoredProjects())
        .filter((item) => item.metadata?.id === projectId)
        .map((item) => item.id);
      if (ids.length === 0) return false;
      await this.storage.deleteItems("projects", ids);
      await this.deleteSyncStatus(projectId);
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

  /**
   * Delete recovery snapshots that a later save already covers.
   *
   * Before the write-path guard, every tab hide stored one. Those old rows are
   * still in IndexedDB and surface in a set's version history as copies of the
   * save that landed after them. A recovery record newer than the newest save
   * is left alone — it is the only copy of work that was never saved.
   * Returns how many rows were removed.
   */
  async pruneRedundantRecoveryRecords(): Promise<number> {
    try {
      const records = await this.readStoredProjects();
      const newestSaveByProject = new Map<string, number>();
      for (const record of records) {
        const source = record.source || this.detectPersistenceSource(record.id);
        if (source === "recovery") continue;
        const projectId = record.metadata?.id;
        if (!projectId) continue;
        newestSaveByProject.set(
          projectId,
          Math.max(
            newestSaveByProject.get(projectId) ?? 0,
            this.storedSavedAt(record),
          ),
        );
      }

      const superseded = records.filter((record) => {
        const source = record.source || this.detectPersistenceSource(record.id);
        if (source !== "recovery") return false;
        const newestSave = newestSaveByProject.get(record.metadata?.id);
        return (
          newestSave !== undefined && this.storedSavedAt(record) <= newestSave
        );
      });
      if (superseded.length === 0) return 0;

      await this.storage.deleteItems(
        "projects",
        superseded.map((record) => record.id),
      );
      this.logger.info(
        `ProjectWorkspace: Removed ${superseded.length} superseded recovery snapshot(s)`,
      );
      return superseded.length;
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Recovery pruning failed", e);
      return 0;
    }
  }

  async exportProjectBundle(): Promise<ProjectBundle> {
    const bundle = this.createSnapshot();
    bundle.exportedAt = Date.now();
    // The download itself is the artist's file. The 30-day local cache is a
    // vault write, and guest clearance promises none of those.
    if (!this.isGuestSession) {
      await this.offlineSync.saveLocal(
        `export_${bundle.metadata.id}_${bundle.exportedAt}`,
        bundle,
        30 * 24 * 60 * 60 * 1000,
      );
    }
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
      if (this.isGuestSession) {
        // Open the bundle in this tab only. Writing a projects record, a
        // last-opened pointer or a cloud copy would contradict the clearance
        // page's "never written to a vault" promise.
        this.restoreFromSnapshot(bundle);
        this.persistenceError.set('');
        this.logger.info(
          "ProjectWorkspace: Guest import kept in tab; nothing persisted",
        );
        return true;
      }
      await this.requirePersistence();
      const importLease = this.readProjectLease(bundle.metadata.id);
      if (
        importLease &&
        importLease.ownerId !== this.leaseOwnerId &&
        importLease.expiresAt > Date.now()
      ) {
        throw new Error(this.leaseConflictFor(importLease).message);
      }
      // The archive's guide track is media, not project JSON: keep it out of
      // the stored record and let restoreFromSnapshot adopt it.
      const stored = this.toStoredBundle(
        this.withoutImportedMedia(bundle),
        "import",
      );
      await this.storage.saveItem("projects", stored);
      await this.projectService.refresh();
      await this.storage.saveItem("offline_local_cache", {
        id: "last_saved_project_id",
        payload: bundle.metadata.id,
        savedAt: stored.savedAt,
      });
      this.restoreFromSnapshot(bundle);
      await this.tryQueueCloudSync(bundle);
      this.markPersistenceClean(bundle, "import", stored.savedAt);
      await this.pruneRedundantRecoveryRecords();
      this.persistenceError.set('');
      this.logger.info("ProjectWorkspace: Imported " + bundle.metadata.name);
      return true;
    } catch (e) {
      this.persistenceError.set(e instanceof Error ? e.message : 'Invalid project bundle.');
      this.logger.warn("ProjectWorkspace: Import failed", e);
      return false;
    }
  }

  /** Re-run the audio-reference check against the project currently open. */
  inspectCurrentAudioIntegrity(): ProjectAudioIntegrityReport {
    const report = inspectProjectAudioIntegrity(this.createStoredSnapshot());
    this.audioIntegrity.set(report);
    this.clearResolvedRepairWarning(report);
    return report;
  }

  /**
   * Replace a missing take with audio decoded from a file the artist picks.
   * The clip keeps its id and arrangement position; only its audio reference
   * changes, and the update goes through the normal history command.
   */
  async relinkMissingTake(
    issue: AudioIntegrityIssue,
    file: File,
  ): Promise<boolean> {
    if (!issue?.trackId || !issue.clipId || !file) return false;
    const track = this.musicManager
      .tracks()
      .find((candidate) => candidate.id === issue.trackId);
    const clip = track?.clips?.find((candidate) => candidate.id === issue.clipId);
    if (!clip) return false;
    if (file.size > 256 * 1024 * 1024) {
      throw new Error('Audio file exceeds the 256 MiB project audio limit.');
    }
    const ctx = this.musicManager.engine?.ctx;
    if (!ctx?.decodeAudioData) {
      throw new Error('Audio decoding is unavailable in this browser.');
    }
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error(`Could not decode ${file.name}. Use a WAV, MP3, M4A or OGG file.`);
    }

    const refId = issue.clipId;
    this.musicManager.stemAudioCache.set(refId, buffer);
    this.musicManager.updateClip(issue.trackId, issue.clipId, {
      audioRefId: refId,
    } as any);

    const report = this.inspectCurrentAudioIntegrity();
    return !report.issues.some(
      (candidate) =>
        candidate.trackId === issue.trackId &&
        candidate.clipId === issue.clipId,
    );
  }

  /** Remove one silent clip whose take cannot be recovered. */
  removeMissingTake(issue: AudioIntegrityIssue): boolean {
    if (!issue?.trackId || !issue.clipId) return false;
    const track = this.musicManager
      .tracks()
      .find((candidate) => candidate.id === issue.trackId);
    const clip = track?.clips?.find((candidate) => candidate.id === issue.clipId);
    if (!clip) {
      this.inspectCurrentAudioIntegrity();
      return false;
    }
    this.musicManager.removeClip(issue.trackId, issue.clipId);
    this.inspectCurrentAudioIntegrity();
    return true;
  }

  private clearResolvedRepairWarning(report: ProjectAudioIntegrityReport): void {
    if (report.ok && this.persistenceError().includes('no matching take')) {
      this.persistenceError.set('');
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
    // The downloaded archive is the artist's own file. The 30-day local cache
    // is a vault write, and guest clearance promises none of those.
    if (!this.isGuestSession) {
      void this.offlineSync.saveLocal(
        `export_${bundle.metadata.id}_${bundle.exportedAt}`,
        bundle,
        30 * 24 * 60 * 60 * 1000,
      );
    }
    const blob = buildProjectArchive(
      bundle,
      this.backingTrack?.archiveFile() ?? null,
    );
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

  // ── Local version history (cloud fallback) ─────────────

  /**
   * Store a version of the set on this device.
   *
   * The cloud keeps the canonical history, but an unreachable sync service
   * used to leave the history panel empty and the artist with nothing to roll
   * back to. These snapshots are only read when the cloud cannot answer.
   */
  async saveLocalVersion(bundle?: ProjectBundle): Promise<boolean> {
    if (this.isGuestSession) return false;
    const snapshot = bundle ?? this.createStoredSnapshot();
    const projectId = snapshot.metadata?.id;
    if (!projectId) return false;

    const savedAt = Date.now();
    const record: LocalProjectVersion = {
      id: `${LOCAL_VERSION_PREFIX}${projectId}_${savedAt}`,
      projectId,
      savedAt,
      title: (snapshot.metadata.name || "Untitled Set").trim() || "Untitled Set",
      version: Number(snapshot.metadata.version) || 1,
      payload: this.toStoredBundle(snapshot, "recovery"),
    };
    try {
      // Keep room for the version just requested by dropping the oldest ones
      // first: a full disk must not swallow the save the artist asked for.
      const existing = await this.listAllLocalVersions(projectId);
      const stale = existing.slice(LOCAL_VERSION_LIMIT - 1);
      if (stale.length) {
        await this.storage.deleteItems(
          LOCAL_VERSION_STORE,
          stale.map((entry) => entry.id),
        );
      }
      await this.storage.saveItem(LOCAL_VERSION_STORE, record);
      return true;
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Local version snapshot failed", error);
      return false;
    }
  }

  /** Newest-first versions this device kept for one project. */
  async listLocalVersions(projectId: string): Promise<LocalProjectVersion[]> {
    return (await this.listAllLocalVersions(projectId)).slice(
      0,
      LOCAL_VERSION_LIMIT,
    );
  }

  /**
   * Make a device-kept version the open workspace, the way opening a set does.
   * The record was stored with the same shape a saved set has, so the normal
   * restore path applies and the workspace comes back clean.
   */
  restoreLocalVersion(version: LocalProjectVersion): boolean {
    if (!version?.payload) return false;
    try {
      this.restoreStoredRecord(version.payload);
      return true;
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Local version restore failed", error);
      return false;
    }
  }

  private async listAllLocalVersions(
    projectId: string,
  ): Promise<LocalProjectVersion[]> {
    return (await this.readLocalVersions()).filter(
      (version) => version.projectId === projectId,
    );
  }

  /** Every version this device kept, newest first, across all sets. */
  private async readLocalVersions(): Promise<LocalProjectVersion[]> {
    try {
      const stored = await this.storage.getAllItems(LOCAL_VERSION_STORE);
      return (Array.isArray(stored) ? stored : [])
        .filter(
          (item): item is LocalProjectVersion =>
            !!item &&
            typeof item.id === "string" &&
            item.id.startsWith(LOCAL_VERSION_PREFIX) &&
            !!item.projectId &&
            !!item.payload,
        )
        .sort((a, b) => b.savedAt - a.savedAt);
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Local version read failed", error);
      return [];
    }
  }

  /**
   * How much room each set takes on this device, split between the set's own
   * record and the versions kept for it. Estimated from the audio descriptors
   * rather than by serialising every sample: sizing a set must not cost what
   * saving it costs.
   */
  async measureStorageUsage(): Promise<{
    sets: LocalStorageUsage[];
    totalBytes: number;
    staleVersionBytes: number;
    staleVersionCount: number;
  }> {
    const usage = new Map<string, LocalStorageUsage>();
    const entryFor = (projectId: string): LocalStorageUsage => {
      const existing = usage.get(projectId);
      if (existing) return existing;
      const created: LocalStorageUsage = {
        projectId,
        setBytes: 0,
        versionBytes: 0,
        versionCount: 0,
        staleVersionBytes: 0,
        staleVersionCount: 0,
      };
      usage.set(projectId, created);
      return created;
    };
    let staleVersionBytes = 0;
    let staleVersionCount = 0;

    try {
      for (const record of await this.readStoredProjects()) {
        const projectId = record.metadata?.id;
        if (!projectId) continue;
        entryFor(projectId).setBytes += this.estimateBundleBytes(record);
      }
      // Newest first, so the first version seen for a set is the one clearing
      // would keep.
      const kept = new Set<string>();
      for (const version of await this.readLocalVersions()) {
        const target = entryFor(version.projectId);
        const bytes = this.estimateBundleBytes(version.payload);
        target.versionBytes += bytes;
        target.versionCount += 1;
        if (!kept.has(version.projectId)) {
          kept.add(version.projectId);
          continue;
        }
        target.staleVersionBytes += bytes;
        target.staleVersionCount += 1;
        staleVersionBytes += bytes;
        staleVersionCount += 1;
      }
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Storage measurement failed", error);
    }

    const sets = Array.from(usage.values());
    return {
      sets,
      totalBytes: sets.reduce(
        (total, item) => total + item.setBytes + item.versionBytes,
        0,
      ),
      staleVersionBytes,
      staleVersionCount,
    };
  }

  /** How full the device's storage is, for the shelf's warning. */
  async deviceStorageQuota(): Promise<DeviceStorageQuota> {
    try {
      const stats = await this.storage.getStorageStats();
      return {
        usedBytes: stats.usedBytes,
        totalBytes: stats.totalBytes,
        percentUsed: stats.percentUsed,
      };
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Storage quota read failed", error);
      return { usedBytes: 0, totalBytes: 0, percentUsed: 0 };
    }
  }

  /** Put a just-deleted version back, keeping its timestamp and title. */
  async restoreDeletedVersion(version: LocalProjectVersion): Promise<boolean> {
    if (!version?.payload || !version.id) return false;
    try {
      await this.storage.saveItem(LOCAL_VERSION_STORE, version);
      return true;
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Version restore failed", error);
      return false;
    }
  }

  /** Delete exactly one kept version, by its record id. */
  async deleteLocalVersion(versionId: string): Promise<boolean> {
    if (!versionId) return false;
    try {
      await this.storage.deleteItems(LOCAL_VERSION_STORE, [versionId]);
      return true;
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Version delete failed", error);
      return false;
    }
  }

  /**
   * Drop every version except the newest one per set — or, given a project id,
   * just that set's. Returns what went, so the shelf can say what it freed
   * instead of silently shrinking.
   */
  async clearOldLocalVersions(projectId?: string): Promise<{
    removed: number;
    freedBytes: number;
  }> {
    const versions = (await this.readLocalVersions()).filter(
      (version) => !projectId || version.projectId === projectId,
    );
    const kept = new Set<string>();
    const stale: LocalProjectVersion[] = [];
    for (const version of versions) {
      if (!kept.has(version.projectId)) {
        kept.add(version.projectId);
        continue;
      }
      stale.push(version);
    }
    if (!stale.length) return { removed: 0, freedBytes: 0 };

    const freedBytes = stale.reduce(
      (total, version) => total + this.estimateBundleBytes(version.payload),
      0,
    );
    try {
      await this.storage.deleteItems(
        LOCAL_VERSION_STORE,
        stale.map((version) => version.id),
      );
      return { removed: stale.length, freedBytes };
    } catch (error) {
      this.logger.warn("ProjectWorkspace: Clearing old versions failed", error);
      return { removed: 0, freedBytes: 0 };
    }
  }

  /** Rough IndexedDB footprint of one stored bundle, samples included. */
  private estimateBundleBytes(bundle: ProjectBundle | undefined): number {
    if (!bundle) return 0;
    let bytes = 0;
    for (const asset of bundle.audioAssets ?? []) {
      const frames = Number(asset.frameCount) || 0;
      const channels =
        Number(asset.channelCount) || asset.channels?.length || 1;
      bytes += frames * channels * 4;
    }
    try {
      // Notes, automation and metadata serialise cheaply; the samples the
      // count above already covers are the only part worth skipping.
      bytes += JSON.stringify(bundle, (key, value) =>
        key === "channels" ? undefined : value,
      ).length;
    } catch {
      bytes += 2_048;
    }
    return bytes;
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

      const normalized = this.withMeter(freshest);
      const source =
        normalized.source || this.detectPersistenceSource(normalized.id);
      const recoveredMeta = {
        ...normalized.metadata,
        lastOpenedAt: Date.now(),
      };
      const recoveredBundle: ProjectBundle = {
        ...normalized,
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

  /**
   * Take a cloud bundle's guide vocal onto this device: decode the shared
   * bytes into the vocal chain and store them with the set (memory-only
   * for guests, per the clearance promise).
   */
  private async adoptSharedGuide(
    projectId: string,
    guide: SharedGuideTrack,
  ): Promise<void> {
    if (!this.backingTrack) return;
    if (
      !guide?.dataBase64 ||
      typeof guide.byteSize !== "number" ||
      guide.byteSize <= 0 ||
      guide.byteSize > SHARED_GUIDE_MAX_BYTES
    ) {
      this.logger.warn(
        "ProjectWorkspace: shared guide track is missing or oversized; skipping",
      );
      return;
    }
    const bytes = decodeBase64ToBytes(guide.dataBase64);
    if (bytes.byteLength !== guide.byteSize) {
      this.logger.warn(
        "ProjectWorkspace: shared guide track failed its size check; skipping",
      );
      return;
    }
    await this.backingTrack.adoptProject(
      projectId,
      {
        name: guide.name || "Backing track",
        blob: new Blob([bytes], { type: guide.mimeType || "audio/mpeg" }),
      },
      { persist: !this.isGuestSession },
    );
  }

  /**
   * Queue the restorable bundle for versioned cloud history — the only
   * cloud contract this workspace writes. Binary channels are compact
   * base64 strings on the wire, never typed arrays that JSON would turn
   * into index-keyed objects; the local binary record is untouched.
   */
  private async queueCloudSync(
    bundle: ProjectBundle,
  ): Promise<ProjectCloudSizeBreakdown | null> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.cloudSyncQueued.set(false);
      return null;
    }

    // Refuse before `toCloudSafeBundle` allocates the base64 strings. The
    // estimate uses the already-built binary channels and the non-audio JSON
    // shape, so an oversized set never pays the conversion cost.
    const size = this.measureCloudBundle(bundle);
    if (size.totalBytes > MAX_CLOUD_BUNDLE_BYTES) {
      throw new CloudBundleTooLargeError(size);
    }

    // Name this exact upload so its confirmation can be matched to it. Two
    // queued saves of the same set are otherwise indistinguishable, and the
    // older upload finishing last would clear the newer save's badge.
    const uploadId = this.newUploadId();
    // Record the queued state before the queue starts. A fast replay can
    // confirm the push while we are still returning from queuePush(); writing
    // "queued" afterwards would overwrite that confirmed "synced" state.
    await this.recordSyncStatus(
      bundle.metadata.id,
      "queued",
      "Saved on this device. Waiting to upload this cloud version.",
      size,
      undefined,
      uploadId,
    );
    const syncId = await this.cloudSync.queuePush(
      bundle.metadata.id,
      bundle.metadata.name,
      this.withSharedGuide(this.toCloudSafeBundle(bundle)),
      uploadId,
    );
    this.lastQueuedSyncId.set(syncId);
    this.cloudSyncQueued.set(true);
    return size;
  }

  /**
   * Estimate the outbound JSON size from the binary bundle without building
   * the base64 strings, and split it into the parts an artist can act on.
   * Audio dominates a project snapshot; the rest of the bundle is measured
   * structurally by the cloud service.
   */
  private measureCloudBundle(bundle: ProjectBundle): ProjectCloudSizeBreakdown {
    let audioBytes = 0;
    for (const asset of bundle.audioAssets ?? []) {
      const channels = Array.isArray(asset.channels) ? asset.channels : [];
      const channelCount = Math.max(
        1,
        Number(asset.channelCount) || channels.length || 1,
      );
      let frameCount = Math.max(0, Number(asset.frameCount) || 0);
      let hasBinaryChannel = false;
      for (const channel of channels) {
        if (typeof channel === "string") {
          audioBytes += channel.length + 2;
        } else if (channel instanceof Float32Array) {
          hasBinaryChannel = true;
          frameCount = Math.max(frameCount, channel.length);
        } else if (Array.isArray(channel)) {
          // Legacy JSON snapshots keep numeric arrays instead of base64. They
          // are far larger per sample, so budget them as JSON numbers.
          audioBytes += Math.max(frameCount, channel.length) * 12 + 2;
        }
      }
      if (hasBinaryChannel) {
        const rawBytes = frameCount * 4 * channelCount;
        audioBytes +=
          Math.ceil(rawBytes / 3) * 4 +
          channels.length * (FLOAT32_CHANNEL_PREFIX.length + 2);
      }
    }

    let guideBytes = 0;
    if (bundle.guideTrack) {
      const guide = bundle.guideTrack;
      guideBytes = Math.max(
        guide.dataBase64?.length ?? 0,
        Math.ceil(Math.max(0, Number(guide.byteSize) || 0) / 3) * 4,
      ) + 1024;
    } else {
      try {
        const file = this.backingTrack?.archiveFile();
        if (
          file?.data?.byteLength &&
          file.data.byteLength <= SHARED_GUIDE_MAX_BYTES
        ) {
          guideBytes = Math.ceil(file.data.byteLength / 3) * 4 + 1024;
        }
      } catch {
        // A missing guide is not a reason to block the project snapshot.
      }
    }

    const projectBytes = this.cloudSync.payloadBytes({
      ...bundle,
      audioAssets: [],
      guideTrack: undefined,
    });
    return {
      totalBytes: projectBytes + audioBytes + guideBytes + 1024,
      audioBytes,
      guideBytes,
      projectBytes,
    };
  }

  /**
   * Normalise any binary bundle before it enters the JSON cloud queue. The
   * public snapshot path already emits base64 channels, but keeping this
   * guard means an internal caller cannot accidentally send a Float32Array
   * that JSON turns into `{"0":…}` index objects.
   */
  private toCloudSafeBundle(bundle: ProjectBundle): ProjectBundle {
    if (!bundle.audioAssets?.some((asset) =>
      asset.channels?.some((channel) => channel instanceof Float32Array),
    )) {
      return bundle;
    }
    return {
      ...bundle,
      audioAssets: bundle.audioAssets.map((asset) => ({
        ...asset,
        channels: asset.channels.map((channel) =>
          channel instanceof Float32Array
            ? encodeFloat32Channel(channel)
            : channel,
        ),
      })),
    };
  }

  /**
   * Fold the set's guide vocal into an outbound cloud bundle. The vocal
   * services own the bytes on-device; this only borrows the archived
   * upload for the trip. Oversized guides stay home with a warning
   * instead of stalling the push — the song must never wait on its guide.
   */
  private withSharedGuide(bundle: ProjectBundle): ProjectBundle {
    try {
      const file = this.backingTrack?.archiveFile();
      if (!file?.data?.byteLength) return bundle;
      if (file.data.byteLength > SHARED_GUIDE_MAX_BYTES) {
        this.logger.warn(
          `ProjectWorkspace: guide track (${file.data.byteLength} bytes) ` +
            `exceeds the ${SHARED_GUIDE_MAX_BYTES} byte share cap; ` +
            `the version pushes without it.`,
        );
        return bundle;
      }
      return {
        ...bundle,
        guideTrack: {
          name: file.name,
          mimeType: file.mimeType,
          dataBase64: encodeBytesToBase64(file.data),
          byteSize: file.data.byteLength,
        },
      };
    } catch (error) {
      this.logger.warn(
        "ProjectWorkspace: guide track could not be shared",
        error,
      );
      return bundle;
    }
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
      timeSignature: this.currentMeter(),
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
      meterMap: performance.meterMap,
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
        performance: this.captureLivePerformance(),
      },
      notes: this.projectNotes(),
      director: this.directorStateProvider?.(),
      exportedAt: Date.now(),
    };
  }

  /**
   * The live rig is engine state, not a copy: reading it here means a save made
   * after a transport-bar change still stores what the engine will actually do.
   */
  private captureLivePerformance(): LivePerformanceState {
    const stored = this.musicManager.livePerformance();
    return {
      smartChords: this.liveEngine.smartChords(),
      scaleLock: this.liveEngine.scaleLock(),
      scaleMode: this.liveEngine.scaleMode(),
      scaleRoot: this.liveEngine.scaleRoot(),
      arpEnabled: this.liveEngine.arpeggiatorEnabled(),
      arpRate: this.liveEngine.arpeggiatorRate(),
      arpPattern: this.liveEngine.arpeggiatorPattern(),
      arpLatch: this.liveEngine.arpeggiatorLatch(),
      arpSwing: this.liveEngine.arpeggiatorSwing(),
      octave: stored.octave,
      chordType: stored.chordType,
    };
  }

  private applyLivePerformanceState(
    state?: LivePerformanceState | null,
  ): void {
    // Bundles written before this block existed keep their current rig rather
    // than resetting it to defaults on open.
    if (!state) return;
    this.musicManager.setLivePerformance(state);
    this.liveEngine.restorePerformanceState(state);
  }

  restoreFromSnapshot(bundle: ProjectBundle) {
    // A size refusal belongs to the set that produced it; opening another set
    // must not carry that warning into the new workspace.
    this.cloudSyncRefusal.set('');
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
    this.acquireProjectLease(bundle.metadata.id);
    this.applyPersistedSyncWarning();
    if (bundle.tracks) {
      this.musicManager.tracks.set(bundle.tracks as any);
      this.isDirty.set(false);
    }
    if (bundle.metadata?.bpm) {
      this.musicManager.engine?.tempo?.set?.(bundle.metadata.bpm);
    }
    // The meter travels with the set: reopening a 3/4 song must not inherit
    // the previous set's 4/4 metronome and position readout.
    const meter = this.normalizeMeter(bundle.metadata?.timeSignature);
    this.musicManager.engine?.setTimeSignature?.(meter[0], meter[1]);
    // The structure effect that normally pushes song length runs after this
    // method, but the loop region is validated against it below. Set it now so
    // a saved loop near the end of the song is not rejected on restore.
    this.musicManager.engine.setSongLengthSteps(
      this.songLengthStepsFor(structure),
    );
    this.applyPerformanceState(bundle);
    this.applyLivePerformanceState(bundle.session?.performance);
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
    this.directorStateConsumer?.(bundle.director);
    this.isDirty.set(false);
    this.logger.info(
      "ProjectWorkspace: Restored project " +
        (bundle.metadata?.name ?? "Untitled"),
    );
    // The guide track lives beside the bundle, so it is fetched rather than
    // restored: a slow decode must not delay the project opening, and a set
    // without one simply keeps the artist where they are. An imported archive
    // carries its own file, which is adopted into this project's media first.
    const importedBacking = (bundle as ImportedProjectBundle)
      .importedBackingTrack;
    if (importedBacking) {
      // Drop the Blob from the in-memory bundle: every later snapshot would
      // otherwise drag the whole file into the project record.
      delete (bundle as { importedBackingTrack?: unknown })
        .importedBackingTrack;
    }
    void (importedBacking
      ? this.backingTrack?.adoptProject(bundle.metadata.id, importedBacking, {
          // A guest import is cleared to write nothing to this device.
          persist: !this.isGuestSession,
        })
      : this.backingTrack?.restoreProject(bundle.metadata.id)
    )?.catch((error: unknown) =>
      this.logger.warn("ProjectWorkspace: backing track restore failed", error),
    );
    // A cloud version's guide travels inside the bundle: adopt it so the
    // set opens on a device that never had the file. The archive's own
    // file (above) wins when both are present — it is the freshest copy.
    // Restoring a version restores its guide, so a present cloud guide
    // replaces whatever this device held.
    if (!importedBacking && bundle.guideTrack && this.backingTrack) {
      const guide = bundle.guideTrack;
      void this.adoptSharedGuide(bundle.metadata.id, guide).catch(
        (error: unknown) =>
          this.logger.warn(
            "ProjectWorkspace: shared guide track restore failed",
            error,
          ),
      );
    }
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
      meterMap: this.meterMap.markers().map((marker) => ({ ...marker })),
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
    const gain =
      typeof engine?.masterGainValue === 'function'
        ? engine.masterGainValue()
        : engine?.masterGain?.gain?.value;
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
    this.meterMap.replaceAll(bundle.meterMap ?? []);
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
    const gain = Math.max(0, Math.min(1, master.gain));
    if (typeof engine?.setMasterOutputLevel === 'function') {
      engine.setMasterOutputLevel(gain);
    } else if (engine?.masterGain?.gain) {
      engine.masterGain.gain.value = gain;
    }
    // A saved mute is not part of the mix; opening a project starts unmuted.
    engine?.setMasterMuted?.(false);
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
    this.meterMap.clear();
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
    if (this.isGuestSession) return;
    if (!this.metadata() || this.musicManager.tracks().length === 0) return;
    // A recovery snapshot exists to rescue work that is not on disk yet. Every
    // tab hide used to rewrite the whole (binary, multi-megabyte) bundle even
    // for a project that had just been saved, and each write added another
    // recovery row to that set's version history. A clean workspace already has
    // its state in the last save, so there is nothing to recover.
    if (!this.isDirty()) return;

    if (!this.ensureProjectLease()) {
      this.logger.warn('ProjectWorkspace: Recovery snapshot refused; another tab owns this set');
      return;
    }
    try {
      const snapshot = this.createStoredSnapshot();
      const integrity = inspectProjectAudioIntegrity(snapshot);
      this.audioIntegrity.set(integrity);
      if (!integrity.ok) {
        this.persistenceError.set(
          describeAudioIntegrityFailure(integrity, "autosave"),
        );
        this.logger.warn(
          "ProjectWorkspace: Recovery snapshot skipped; audio is incomplete",
        );
        return;
      }
      const bundle = this.toStoredBundle(snapshot, "recovery");
      await this.storage.saveItem("projects", bundle);
      await this.storage.saveItem("offline_local_cache", {
        id: "last_saved_project_id",
        payload: bundle.metadata.id,
        savedAt: bundle.savedAt,
      });
      await this.recordLocalSaveStatus(
        bundle.metadata.id,
        "Recovered changes are on this device only. Save to create a cloud version.",
        this.measureCloudBundle(bundle),
      );
    } catch (e) {
      this.logger.warn("ProjectWorkspace: Recovery snapshot failed", e);
    }
  }

  private currentSyncedMetadata(): ProjectMetadata {
    const meta = this.metadata() ?? this.createNewMetadata();
    return {
      ...meta,
      bpm: this.currentTempo() || meta.bpm,
      timeSignature: this.currentMeter(),
      updatedAt: Date.now(),
      lastOpenedAt: meta.lastOpenedAt || Date.now(),
    };
  }

  /** The engine is the live source of truth; the metadata is the fallback. */
  private currentMeter(): [number, number] {
    const sig = this.musicManager.engine?.timeSignature?.();
    if (sig) return this.normalizeMeter([sig.beats, sig.unit]);
    return this.normalizeMeter(this.metadata()?.timeSignature);
  }

  /** Clamp a stored meter to a supported, playable signature. */
  private normalizeMeter(value: unknown): [number, number] {
    const raw = Array.isArray(value) ? value : [];
    const beats = Math.min(16, Math.max(1, Math.round(Number(raw[0]) || 4)));
    const rawUnit = Math.round(Number(raw[1]) || 4);
    const unit = [2, 4, 8, 16].includes(rawUnit) ? rawUnit : 4;
    return [beats, unit];
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
    meter: [number, number] = this.currentMeter(),
  ): string {
    return JSON.stringify({
      metadata: metadata ? { ...metadata, bpm: tempo, updatedAt: undefined, lastOpenedAt: undefined } : null,
      tempo,
      meter,
      tracks,
      automation,
      structure,
      takeState,
      notes,
      // AudioParam.value is a float32 read-back: a master gain saved as 0.8
      // comes back as 0.800000011920929, so comparing it raw left every project
      // permanently dirty and the status strip could never say "Saved locally".
      masterGain: Number(Number(masterGain).toFixed(4)),
      monitorMono,
      sessionLaunchQuantize,
      sessionFollowEnabled,
      sessionFollowBars,
      sessionSceneFollowRules,
      // The master gain rides in the project state as well, straight off the
      // same float32 AudioParam; normalise it there too.
      projectState: {
        performance: projectState.performance,
        master: {
          ...projectState.master,
          gain: Number(Number(projectState.master.gain).toFixed(4)),
        },
      },
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
        meterMap: (bundle.meterMap ?? []).map((marker) => ({ ...marker })),
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
    return stored
      .filter(
        (item): item is StoredProjectBundle => this.isStoredProjectBundle(item),
      )
      // Sets saved before meters were stored carry no field; materialise the
      // 4/4 default on read so every export and the next save are explicit.
      .map((record) => this.withMeter(record));
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

  /**
   * Copy a stored record with an explicit meter. Records written before the
   * meter was saved get 4/4 without mutating the object the storage layer
   * returned; saves and exports built from it then carry the field.
   */
  private withMeter(record: StoredProjectBundle): StoredProjectBundle {
    return {
      ...record,
      metadata: {
        ...record.metadata,
        timeSignature: this.normalizeMeter(record.metadata?.timeSignature),
      },
    };
  }

  private detectPersistenceSource(id: string): ProjectPersistenceSource {
    if (id.startsWith("autosave_")) return "autosave";
    if (id.startsWith("recovery_")) return "recovery";
    if (id.startsWith("project_")) return "manual";
    return "manual";
  }

  private captureSnapshotTracks(audioAssetMode: AudioAssetSerializationMode): {
    tracks: any[];
    audioAssets: SerializedAudioAsset[];
  } {
    const audioAssets = new Map<string, SerializedAudioAsset>();

    // Drum one-shots use the same reference cache as audio clips. Capture the
    // PCM once per sample ref, then keep only that ref in the project tracks.
    // A pad's sample is captured from its imported pad state even when the
    // artist has not programmed a step yet.
    const rememberSample = (refId: unknown, inline: unknown): string | null => {
      const id = typeof refId === "string" && refId.trim() ? refId.trim() : "";
      if (!id) return null;
      if (!audioAssets.has(id)) {
        const buffer = this.isAudioBufferLike(inline)
          ? inline
          : this.musicManager.stemAudioCache?.get(id);
        if (this.isAudioBufferLike(buffer)) {
          audioAssets.set(
            id,
            this.serializeAudioAsset(id, buffer, audioAssetMode),
          );
        }
      }
      return id;
    };

    const tracks = this.musicManager.tracks().map((track) => {
      const persistedTrack: any = { ...track };

      for (const padSample of Array.isArray((track as any).drumPadSamples)
        ? (track as any).drumPadSamples
        : []) {
        rememberSample(padSample?.sampleRefId, undefined);
      }

      if (Array.isArray(track.clips)) {
        persistedTrack.clips = track.clips.map((clip: any) => {
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
        });
      }

      if (Array.isArray(track.notes)) {
        persistedTrack.notes = track.notes.map((note: any, noteIndex: number) => {
          const params = note?.params;
          if (!params) return note;
          const inline = params.sampleBuffer;
          const currentRef =
            typeof params.sampleRefId === "string"
              ? params.sampleRefId.trim()
              : "";
          const refId =
            currentRef ||
            (this.isAudioBufferLike(inline)
              ? `drum-sample-${track.id ?? "track"}-${note.id ?? noteIndex}`
              : "");
          if (!refId) return note;

          rememberSample(refId, inline);
          const persistedParams = { ...params, sampleRefId: refId };
          delete persistedParams.sampleBuffer;
          return { ...note, params: persistedParams };
        });
      }

      return JSON.parse(JSON.stringify(persistedTrack));
    });
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
    if (meta.timeSignature !== undefined &&
        (!Array.isArray(meta.timeSignature) ||
         meta.timeSignature.length !== 2 ||
         !Number.isFinite(meta.timeSignature[0]) ||
         !Number.isFinite(meta.timeSignature[1]) ||
         meta.timeSignature[0] < 1 || meta.timeSignature[0] > 16 ||
         ![2, 4, 8, 16].includes(meta.timeSignature[1]))) {
      throw new Error('Invalid time signature.');
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
    if (bundle.meterMap !== undefined) {
      if (!Array.isArray(bundle.meterMap) || bundle.meterMap.some((marker) =>
        !marker || typeof marker.id !== 'string' || !Number.isFinite(marker.step) ||
        marker.step < 0 || !Number.isFinite(marker.beats) ||
        marker.beats < 1 || marker.beats > 16 ||
        ![2, 4, 8, 16].includes(marker.unit)
      )) throw new Error('Invalid meter map.');
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
        const samples =
          typeof channel === 'string'
            ? decodeFloat32Channel(channel)
            : channel;
        if (!(Array.isArray(samples) || samples instanceof Float32Array) ||
            samples.length !== asset.frameCount ||
            !samples.every((sample) => typeof sample === 'number' && Number.isFinite(sample))) {
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
          : encodeFloat32Channel(buffer.getChannelData(channel)),
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
      if (typeof source === "string") {
        try {
          buffer.copyToChannel(Float32Array.from(decodeFloat32Channel(source)), channel);
        } catch {
          // A malformed channel stays silent; validateBundle rejects it before
          // this point on import/restore paths.
        }
        continue;
      }
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
