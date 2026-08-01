import { Injectable, Injector, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
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
    this.loadProjects();

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
      const projects =
        (await this.storage.getAllItems('studio_projects')) || [];
      this._list.next(projects);
    } catch (e) {
      this.logger.error(
        'ProjectService: Failed to load projects from storage',
        e
      );
    }
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

  public async add(project: Project) {
    const updatedList = [...this._list.getValue(), project];
    this._list.next(updatedList);
    await this.saveAll(updatedList);
    await this.autoRecordCheckpoint(project);
  }

  public async update(project: Project) {
    const list = this._list.getValue();
    const index = list.findIndex((p) => p.id === project.id);
    if (index !== -1) {
      list[index] = { ...project, updatedAt: Date.now() };
      this._list.next([...list]);
      await this.saveAll(list);
      const updated = { ...project, updatedAt: Date.now() };
      const updatedList = [
        ...list.slice(0, index),
        updated,
        ...list.slice(index + 1),
      ];
      this._list.next(updatedList);
      await this.saveAll(updatedList);
      await this.autoRecordCheckpoint(updated);
    }
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

  private async saveAll(projects: Project[]) {
    await this.storage.saveItem('studio_projects', projects);
    this.logger.info('ProjectService: All projects synced to local storage.');
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
