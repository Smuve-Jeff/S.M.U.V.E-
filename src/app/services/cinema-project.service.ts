import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CINEMA_SNAPSHOT_VERSION,
  CinemaRestoreReport,
  CinemaSnapshot,
  ProductionMode,
  VideoEngineService,
} from './video-engine.service';
import { LocalStorageService, PersistenceState } from './local-storage.service';
import { LoggingService } from './logging.service';

/**
 * A saved project as the project list needs it. The edit itself is deliberately
 * not included: listing every project should not pull every timeline, every
 * clip and every captured still into memory just to draw names and dates.
 */
export interface CinemaProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  productionMode: ProductionMode;
  presetName: string;
  clipCount: number;
  markerCount: number;
  /** Clips saved without media — they need re-ingesting when reopened. */
  needsMediaCount: number;
}

/** A stored project: its summary plus the full edit. */
interface CinemaProjectRecord extends CinemaProjectSummary {
  snapshot: CinemaSnapshot;
}

/** Outcome of a save, so the UI reports what happened instead of assuming. */
export interface CinemaSaveOutcome {
  ok: boolean;
  id: string | null;
  message: string;
}

export interface CinemaOpenOutcome {
  ok: boolean;
  message: string;
  report?: CinemaRestoreReport;
  /**
   * Footage that came back with the project, keyed by the clip's `mediaId`. The
   * caller mints object urls from these — the service deliberately does not, so
   * that whoever creates a url is also the one who revokes it.
   */
  media?: Map<string, Blob>;
}

/** Stored footage, addressed by `projectId::mediaId`. */
export interface CinemaMediaRecord {
  id: string;
  projectId: string;
  mediaId: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

const STORE = 'cinema_projects';
const MEDIA_STORE = 'cinema_media';
const MAX_NAME_LENGTH = 60;

/**
 * Persistence for the CinemaEngine.
 *
 * Long-form work is the whole point of the module — a film, a music video, a
 * broadcast rundown — and until now every edit died with the tab, because none
 * of the engine's state was ever written down. This saves the *edit*: the
 * timeline, the shots, the markers, the delivery preset and the broadcast
 * settings.
 *
 * Media is stored separately from the edit. Ingested files and camera takes
 * arrive as `blob:` object URLs, so the component collects their bytes before a
 * save and the reopen path returns fresh Blobs for the renderer to rehydrate.
 * `data:` URLs remain self-contained in the snapshot. If a source cannot be
 * read, the project is still saved and reports the missing footage honestly.
 *
 * Records live in their own IndexedDB store. The shared `projects` store is read
 * back whole by ProjectService as audio `Project`s, so a video timeline parked
 * there would surface in the Studio project list as a broken audio project.
 */
@Injectable({
  providedIn: 'root',
})
export class CinemaProjectService {
  private storage = inject(LocalStorageService);
  private logger = inject(LoggingService);
  private engine = inject(VideoEngineService);

  /** Saved projects, most recently updated first. */
  projects = signal<CinemaProjectSummary[]>([]);
  /** The project the current edit belongs to, or null before it is first saved. */
  activeProjectId = signal<string | null>(null);
  /** True while a write or read is in flight, so the UI can disable the controls. */
  isBusy = signal(false);
  /**
   * Why persistence is or is not usable. IndexedDB is missing on some hosts,
   * locked by another open tab on others, and `saveItem` treats every one of
   * those as a no-op — which would let the UI announce a save that never
   * happened.
   */
  storageState = signal<PersistenceState>('ready');
  lastError = signal<string | null>(null);

  activeProject = computed(() => {
    const id = this.activeProjectId();
    return id === null
      ? null
      : (this.projects().find((project) => project.id === id) ?? null);
  });

  hasProjects = computed(() => this.projects().length > 0);

  storageAvailable = computed(() => this.storageState() === 'ready');

  /**
   * Operator-facing reason saving is impossible, or null when it is possible.
   *
   * Kept beside the state that produces it so the wording cannot drift from the
   * cause: a browser without IndexedDB and a browser whose database is held by
   * another tab need completely different actions from the operator.
   */
  storageNotice = computed(() => {
    const state = this.storageState();
    if (state === 'ready') return null;
    if (state === 'blocked') {
      return 'Project storage is locked by another open tab of this app. Close the other tabs and reload, then save again.';
    }
    if (state === 'unsupported') {
      return 'This browser cannot store projects (IndexedDB is unavailable), so this edit cannot be saved. Export the master instead.';
    }
    return 'Project storage could not be opened on this device, so this edit cannot be saved. Export the master instead.';
  });

  constructor() {
    void this.refresh();
  }

  /** Re-read the saved projects from storage. Safe to call at any time. */
  async refresh(): Promise<CinemaProjectSummary[]> {
    const state = await this.storage.persistenceStatus();
    this.storageState.set(state);
    if (state !== 'ready') {
      this.projects.set([]);
      return [];
    }

    try {
      const records = ((await this.storage.getAllItems(STORE)) ??
        []) as CinemaProjectRecord[];
      const summaries = records
        .filter((record) => !!record?.id)
        .map((record) => this.toSummary(record))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      this.projects.set(summaries);
      return summaries;
    } catch (error) {
      this.logger.error('CinemaProjectService: could not read projects', error);
      this.lastError.set('Saved projects could not be read on this device.');
      this.projects.set([]);
      return [];
    }
  }

  /**
   * Write the current edit. Passing `id` overwrites that project; otherwise a new
   * one is created and becomes the active project.
   */
  async save(
    name: string,
    id: string | null = this.activeProjectId(),
    media?: Map<string, Blob>
  ): Promise<CinemaSaveOutcome> {
    if (this.isBusy()) {
      return { ok: false, id, message: 'A save is already in progress.' };
    }

    const title = this.normalizeName(name);
    this.isBusy.set(true);
    this.lastError.set(null);

    try {
      const state = await this.storage.persistenceStatus();
      if (state !== 'ready') {
        // Deliberately not mirrored into `lastError`: the panel already shows
        // the storage notice for as long as the state lasts, and setting both
        // printed the same sentence twice on screen.
        this.storageState.set(state);
        const message = this.storageNotice() ?? 'This edit cannot be saved.';
        return { ok: false, id: null, message };
      }

      const snapshot = this.engine.snapshot();
      // Read the overwrite target back from storage instead of trusting the
      // in-memory list: after a failed refresh that list is empty while the
      // record is still on disk, and minting a fresh id there would fork a
      // duplicate and orphan the original.
      const existing = id
        ? ((await this.storage.getItem(STORE, id)) as CinemaProjectRecord | null)
        : null;
      const projectId = id ?? this.mintId();
      const supplied = new Set(media?.keys() ?? []);
      const now = Date.now();
      const record: CinemaProjectRecord = {
        id: projectId,
        name: title,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        productionMode: snapshot.productionMode,
        presetName: this.engine.deliveryPreset().name,
        clipCount: this.countClips(snapshot),
        markerCount: snapshot.markers.length,
        needsMediaCount: this.countClipsWithoutMedia(snapshot, supplied),
        snapshot,
      };

      // Footage first. If storage is full the record must not land either, or a
      // project would read as saved with its media quietly absent.
      const storedMedia = await this.persistMedia(
        projectId,
        this.referencedMediaIds(snapshot),
        media,
        snapshot
      );

      await this.storage.saveItem(STORE, record);
      this.activeProjectId.set(record.id);
      await this.refresh();

      const footage =
        storedMedia > 0 ? ` ${storedMedia} media file(s) stored.` : '';
      const stale =
        record.needsMediaCount > 0
          ? ` ${record.needsMediaCount} clip${record.needsMediaCount === 1 ? ' has' : 's have'} no footage attached.`
          : '';
      return {
        ok: true,
        id: record.id,
        message: `PROJECT SAVED: ${record.name.toUpperCase()} · ${record.clipCount} CLIP(S), ${record.markerCount} MARKER(S).${footage}${stale}`,
      };
    } catch (error) {
      this.logger.error('CinemaProjectService: save failed', error);
      const message =
        'This project could not be saved — storage rejected the write. Free up space and save again.';
      this.lastError.set(message);
      return { ok: false, id, message };
    } finally {
      this.isBusy.set(false);
    }
  }

  /** Load a saved project into the engine, replacing the current edit. */
  async open(id: string): Promise<CinemaOpenOutcome> {
    if (this.isBusy()) {
      return { ok: false, message: 'A project operation is already in progress.' };
    }

    this.isBusy.set(true);
    this.lastError.set(null);

    try {
      const record = (await this.storage.getItem(STORE, id)) as
        | CinemaProjectRecord
        | null;
      if (!record?.snapshot) {
        const message = 'That project is no longer in storage.';
        this.lastError.set(message);
        return { ok: false, message };
      }

      if (record.snapshot.version !== CINEMA_SNAPSHOT_VERSION) {
        // Checked rather than ignored: a record from another build can carry
        // fields this one does not understand, and reading it as if it were the
        // current shape would drop them without ever saying so.
        const message = `That project was saved by a different version of the app (format ${
          record.snapshot.version ?? 'unknown'
        }), so it cannot be opened here.`;
        this.lastError.set(message);
        return { ok: false, message };
      }

      const report = this.engine.restore(record.snapshot);
      this.activeProjectId.set(record.id);

      const media = await this.loadMedia(
        record.id,
        this.referencedMediaIds(record.snapshot)
      );
      // Recounted with the footage in hand: a clip with no url that has a stored
      // blob is not missing anything.
      report.clipsMissingMedia = this.countClipsWithoutMedia(
        record.snapshot,
        new Set(media.keys())
      );

      const footage =
        media.size > 0
          ? ` ${media.size} clip${media.size === 1 ? '' : 's'} restored with stored footage.`
          : '';
      const missing =
        report.clipsMissingMedia > 0
          ? ` ${report.clipsMissingMedia} clip${report.clipsMissingMedia === 1 ? '' : 's'} still need footage.`
          : '';
      return {
        ok: true,
        report,
        media,
        message: `PROJECT OPENED: ${record.name.toUpperCase()} · ${report.clips} CLIP(S), ${report.markers} MARKER(S).${footage}${missing}`,
      };
    } catch (error) {
      this.logger.error('CinemaProjectService: open failed', error);
      const message = 'That project could not be opened.';
      this.lastError.set(message);
      return { ok: false, message };
    } finally {
      this.isBusy.set(false);
    }
  }

  /** Delete a stored project. Clears the active pointer when it was the one. */
  async remove(id: string): Promise<boolean> {
    if (this.isBusy()) return false;

    this.isBusy.set(true);
    this.lastError.set(null);

    try {
      await this.storage.deleteItem(STORE, id);
      // Take the footage with it — nothing else can reference those keys.
      const mediaKeys = await this.storage.getAllKeys(MEDIA_STORE);
      for (const key of mediaKeys) {
        if (typeof key === 'string' && key.startsWith(`${id}::`)) {
          await this.storage.deleteItem(MEDIA_STORE, key);
        }
      }
      if (this.activeProjectId() === id) this.activeProjectId.set(null);
      await this.refresh();
      return true;
    } catch (error) {
      this.logger.error('CinemaProjectService: delete failed', error);
      this.lastError.set('That project could not be deleted.');
      return false;
    } finally {
      this.isBusy.set(false);
    }
  }

  /** Detach the current edit from its stored project without deleting it. */
  startNew(): void {
    this.activeProjectId.set(null);
    this.lastError.set(null);
  }

  /** Record a summary for the given preset name, so the list can show it. */
  private toSummary(record: CinemaProjectRecord): CinemaProjectSummary {
    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      productionMode: record.productionMode,
      presetName: record.presetName,
      clipCount: record.clipCount ?? 0,
      markerCount: record.markerCount ?? 0,
      needsMediaCount: record.needsMediaCount ?? 0,
    };
  }

  private countClips(snapshot: CinemaSnapshot): number {
    return (snapshot.tracks ?? []).reduce(
      (total, track) => total + (track.clips?.length ?? 0),
      0
    );
  }

  /**
   * Clips that will have nothing to draw when this project is reopened: no
   * inline `data:` url of their own, and no stored footage to mint one from.
   *
   * `storedIds` is the set of media ids that will be (or were) available, so a
   * clip whose footage is in the library is not counted as missing.
   */
  private countClipsWithoutMedia(
    snapshot: CinemaSnapshot,
    storedIds: Set<string> = new Set()
  ): number {
    return (snapshot.tracks ?? []).reduce(
      (total, track) =>
        total +
        (track.clips ?? []).filter(
          (clip) => !clip.url && !(clip.mediaId && storedIds.has(clip.mediaId))
        ).length,
      0
    );
  }

  /** Every media id the snapshot's clips point at. */
  private referencedMediaIds(snapshot: CinemaSnapshot): Set<string> {
    const ids = new Set<string>();
    (snapshot.tracks ?? []).forEach((track) =>
      (track.clips ?? []).forEach((clip) => {
        if (clip.mediaId) ids.add(clip.mediaId);
      })
    );
    return ids;
  }

  private mediaKey(projectId: string, mediaId: string): string {
    return `${projectId}::${mediaId}`;
  }

  /**
   * Write the footage the timeline references, and release what it no longer
   * does — a re-cut that dropped a take should not leave its bytes behind.
   *
   * Media is addressed as `projectId::mediaId` so a project's library can be
   * pruned and deleted by key prefix, without reading a single blob back.
   */
  private async persistMedia(
    projectId: string,
    referenced: Set<string>,
    media: Map<string, Blob> | undefined,
    snapshot: CinemaSnapshot
  ): Promise<number> {
    const keys = await this.storage.getAllKeys(MEDIA_STORE);
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith(`${projectId}::`)) continue;
      if (referenced.has(key.slice(projectId.length + 2))) continue;
      await this.storage.deleteItem(MEDIA_STORE, key);
    }

    if (!media || media.size === 0) return 0;

    const names = new Map<string, string>();
    (snapshot.tracks ?? []).forEach((track) =>
      (track.clips ?? []).forEach((clip) => {
        if (clip.mediaId) names.set(clip.mediaId, clip.name);
      })
    );

    let stored = 0;
    for (const [mediaId, blob] of media) {
      if (!referenced.has(mediaId) || !blob || blob.size === 0) continue;
      const record: CinemaMediaRecord = {
        id: this.mediaKey(projectId, mediaId),
        projectId,
        mediaId,
        name: names.get(mediaId) ?? 'Footage',
        type: blob.type || 'application/octet-stream',
        size: blob.size,
        blob,
      };
      await this.storage.saveItem(MEDIA_STORE, record);
      stored += 1;
    }
    return stored;
  }

  /** Read back the footage a snapshot references, one key at a time. */
  private async loadMedia(
    projectId: string,
    referenced: Set<string>
  ): Promise<Map<string, Blob>> {
    const found = new Map<string, Blob>();
    for (const mediaId of referenced) {
      try {
        const record = (await this.storage.getItem(
          MEDIA_STORE,
          this.mediaKey(projectId, mediaId)
        )) as CinemaMediaRecord | null;
        if (record?.blob) found.set(mediaId, record.blob);
      } catch (error) {
        this.logger.warn('CinemaProjectService: stored media unreadable', error);
      }
    }
    return found;
  }

  private normalizeName(name: string): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return 'Untitled Cinema Project';
    return trimmed.slice(0, MAX_NAME_LENGTH);
  }

  private mintId(): string {
    const random =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return `cinema-${Date.now().toString(36)}-${random}`;
  }
}
