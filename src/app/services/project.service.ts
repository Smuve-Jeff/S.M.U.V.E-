import { Injectable, Injector, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { Project } from '../types';
import { SessionHistoryService } from './session-history.service';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private storage = inject(LocalStorageService);
  private logger = inject(LoggingService);
  private injector = inject(Injector);

  private _list = new BehaviorSubject<Project[]>([]);
  private _currentId = new BehaviorSubject<string | undefined>(undefined);
  private _current = new BehaviorSubject<Project | undefined>(undefined);

  currentProject = signal<Project | null>(null);
  readonly projectDeleted$ = new Subject<string>();
  private storedRecords = new Map<string, any>();
  private readonly loaded: Promise<void>;

  /**
   * Sprint D4 — lazy session-history accessor. SessionHistoryService is
   * providedIn root and depends on CloudSyncService; we resolve it lazily
   * through the Injector to keep the module graph acyclic even if
   * SessionHistoryService ever grows a ProjectService dependency.
   */
  private get sessionHistory(): SessionHistoryService {
    return this.injector.get(SessionHistoryService);
  }

  constructor() {
    this.loaded = this.loadProjects();

    combineLatest([this._list, this._currentId])
      .pipe(
        map(([list, currentId]) => list.find((item) => item.id === currentId))
      )
      .subscribe((project) => {
        this._current.next(project);
        this.currentProject.set(project ?? null);
      });
  }

  private async loadProjects() {
    try {
      const records = (await this.storage.getAllItems('projects')) || [];
      this.storedRecords = new Map(records.filter((record) => record?.id).map((record) => [record.id, record]));
      const projects = records
        // Recovery/auto-save bundles are versions, not extra projects.
        .filter((record) => !record?.metadata || !/^(autosave|recovery)_/.test(record.id))
        .map((record) => this.normalizeProject(record))
        .filter((project): project is Project => project !== null);
      this._list.next(projects);
    } catch (e) {
      this.logger.error(
        'ProjectService: Failed to load projects from storage',
        e
      );
    }
  }

  public async refresh(): Promise<void> {
    await this.loaded;
    await this.loadProjects();
  }

  public get list$(): Observable<Project[]> {
    return this._list.asObservable();
  }

  public get current$(): Observable<Project | undefined> {
    return this._current.asObservable();
  }

  public get currentId$(): Observable<string | undefined> {
    return this._currentId.asObservable();
  }

  public async add(project: Project): Promise<void> {
    await this.loaded;
    const normalized = this.normalizeProject(project);
    if (!normalized) throw new Error('Project must have a valid id and name.');
    if (this._list.getValue().some((item) => item.id === normalized.id)) {
      throw new Error('A project with this id already exists.');
    }
    await this.requirePersistence();
    await this.storage.saveItem('projects', normalized);
    this.storedRecords.set(normalized.id, normalized);
    this._list.next([...this._list.getValue(), normalized]);
    await this.autoRecordCheckpoint(normalized);
  }

  public async update(project: Project): Promise<void> {
    await this.loaded;
    const existing = this.storedRecords.get(project.id);
    if (!existing) return;
    const updated = { ...project, updatedAt: Date.now() };
    // Preserve Studio bundles and legacy database envelopes instead of
    // overwriting their metadata/audio assets with a release-page projection.
    const record = existing.metadata
      ? { ...existing, metadata: { ...existing.metadata, name: updated.name, bpm: updated.bpm, updatedAt: updated.updatedAt }, tracks: updated.tracks, tasks: updated.tasks, status: updated.status }
      : existing.data
        ? { ...existing, title: updated.name, data: updated, updatedAt: updated.updatedAt }
        : updated;
    await this.requirePersistence();
    await this.storage.saveItem('projects', record);
    this.storedRecords.set(project.id, record);
    this._list.next(this._list.getValue().map((item) => item.id === project.id ? updated : item));
    await this.autoRecordCheckpoint(updated);
  }

  /** Delete the stored project and its local recovery/autosave versions. */
  public async remove(id: string): Promise<boolean> {
    await this.loaded;
    const record = this.storedRecords.get(id);
    if (!record) return false;
    await this.requirePersistence();
    const logicalId = record.metadata?.id || record.data?.metadata?.id || record.data?.id || id;
    const records = await this.storage.getAllItems('projects');
    const ids = records.filter((item) => item?.id === id ||
      (item?.metadata?.id === logicalId) ||
      (item?.data?.metadata?.id === logicalId) ||
      (item?.data?.id === logicalId)
    ).map((item) => item.id);
    if (!ids.length) return false;
    await this.storage.deleteItems('projects', ids);
    ids.forEach((key) => this.storedRecords.delete(key));
    if (ids.includes(this._currentId.getValue())) this._currentId.next(undefined);
    this._list.next(this._list.getValue().filter((item) => !ids.includes(item.id)));
    this.projectDeleted$.next(logicalId);
    return true;
  }

  private async requirePersistence(): Promise<void> {
    const status = await this.storage.persistenceStatus();
    if (status !== 'ready') throw new Error(`Project storage is ${status}. Changes were not saved.`);
  }

  /** The projects store contains release rows, Studio bundles and API envelopes. */
  private normalizeProject(record: any): Project | null {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) return null;
    const data = record.data && typeof record.data === 'object' ? record.data : record;
    const metadata = data.metadata;
    const name = data.name || metadata?.name || record.title;
    if (typeof name !== 'string' || !name.trim()) return null;
    const deadline = data.deadline ? new Date(data.deadline) : undefined;
    return {
      ...data,
      id: record.id,
      name,
      bpm: data.bpm || metadata?.bpm || 120,
      timeSignature: Array.isArray(data.timeSignature) ? data.timeSignature : [4, 4],
      status: data.status || 'Draft',
      createdAt: data.createdAt || metadata?.createdAt || 0,
      updatedAt: data.updatedAt || metadata?.updatedAt || record.updatedAt || 0,
      tracks: Array.isArray(data.tracks) ? data.tracks : [],
      masterChain: Array.isArray(data.masterChain) ? data.masterChain : [],
      tasks: Array.isArray(data.tasks) ? data.tasks.filter((task) => task && typeof task.description === 'string') : [],
      deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : undefined,
    };
  }

  public select(id: string) {
    this._currentId.next(id);
  }

  /**
   * Sprint D4 — fire-and-forget auto-record of a project save into
   * the session graph. Canonical-hash dedup in SessionHistoryService
   * swallows no-op saves (identical payloads) automatically, so the
   * graph only grows when the project actually changed.
   */
  private async autoRecordCheckpoint(project: Project): Promise<void> {
    try {
      await this.sessionHistory.autoRecord(
        project.id,
        `save: ${project.name || 'project'}`,
        { ...(project as unknown as Record<string, unknown>) }
      );
    } catch (err) {
      this.logger.warn('ProjectService: auto-record checkpoint failed', err);
    }
  }

  createEmpty(name: string = 'Untitled Project'): Project {
    return {
      id: 'proj_' + Date.now(),
      name,
      bpm: 120,
      timeSignature: [4, 4],
      status: 'Draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tracks: [],
      masterChain: [],
      tasks: [],
    };
  }
}
