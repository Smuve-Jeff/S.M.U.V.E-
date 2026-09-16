import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CinemaRestoreReport,
  CinemaSnapshot,
  ProductionMode,
  VideoEngineService,
} from './video-engine.service';
import { LocalStorageService } from './local-storage.service';
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
}

const STORE = 'cinema_projects';
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
 * Media is not saved, and that is a deliberate limit rather than an oversight.
 * Ingested files and camera takes are `blob:` object URLs owned by the session
 * that created them, so their bytes are unreachable the moment that document
 * goes away; a `data:` url (a captured still, an AI frame) does carry its own
 * bytes and is kept. Whatever cannot be re-read is stored without a url, and the
 * reopen path says so plainly instead of presenting an empty frame as a bug.
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
   * Whether persistence actually works here. IndexedDB is missing on some hosts
   * and blocked in private modes, and `saveItem` treats both as a no-op — which
   * would let the UI announce a save that never happened.
   */
  storageAvailable = signal(true);
  lastError = signal<string | null>(null);

  activeProject = computed(() => {
    const id = this.activeProjectId();
    return id === null
      ? null
      : (this.projects().find((project) => project.id === id) ?? null);
  });

  hasProjects = computed(() => this.projects().length > 0);

  constructor() {
    void this.refresh();
  }

  /** Re-read the saved projects from storage. Safe to call at any time. */
  async refresh(): Promise<CinemaProjectSummary[]> {
    const available = await this.storage.isAvailable();
    this.storageAvailable.set(available);
    if (!available) {
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
    id: string | null = this.activeProjectId()
  ): Promise<CinemaSaveOutcome> {
    if (this.isBusy()) {
      return { ok: false, id, message: 'A save is already in progress.' };
    }

    const title = this.normalizeName(name);
    this.isBusy.set(true);
    this.lastError.set(null);

    try {
      if (!(await this.storage.isAvailable())) {
        this.storageAvailable.set(false);
        const message =
          'This browser cannot store projects (IndexedDB is unavailable), so this edit cannot be saved. Export the master instead.';
        this.lastError.set(message);
        return { ok: false, id: null, message };
      }

      const snapshot = this.engine.snapshot();
      const existing = id
        ? this.projects().find((project) => project.id === id)
        : undefined;
      const now = Date.now();
      const record: CinemaProjectRecord = {
        id: existing?.id ?? this.mintId(),
        name: title,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        productionMode: snapshot.productionMode,
        presetName: this.engine.deliveryPreset().name,
        clipCount: this.countClips(snapshot),
        markerCount: snapshot.markers.length,
        needsMediaCount: this.countClipsWithoutMedia(snapshot),
        snapshot,
      };

      await this.storage.saveItem(STORE, record);
      this.activeProjectId.set(record.id);
      await this.refresh();

      const stale =
        record.needsMediaCount > 0
          ? ` ${record.needsMediaCount} clip${record.needsMediaCount === 1 ? '' : 's'} will need media re-ingested.`
          : '';
      return {
        ok: true,
        id: record.id,
        message: `PROJECT SAVED: ${record.name.toUpperCase()} · ${record.clipCount} CLIP(S), ${record.markerCount} MARKER(S).${stale}`,
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

      const report = this.engine.restore(record.snapshot);
      this.activeProjectId.set(record.id);

      const missing =
        report.clipsMissingMedia > 0
          ? ` ${report.clipsMissingMedia} clip${report.clipsMissingMedia === 1 ? '' : 's'} lost their media with the last session and must be ingested again.`
          : '';
      return {
        ok: true,
        report,
        message: `PROJECT OPENED: ${record.name.toUpperCase()} · ${report.clips} CLIP(S), ${report.markers} MARKER(S).${missing}`,
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

  private countClipsWithoutMedia(snapshot: CinemaSnapshot): number {
    return (snapshot.tracks ?? []).reduce(
      (total, track) =>
        total + (track.clips ?? []).filter((clip) => !clip.url).length,
      0
    );
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
