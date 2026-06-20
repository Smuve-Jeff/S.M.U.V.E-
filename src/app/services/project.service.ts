import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { Project } from '../types';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private storage = inject(LocalStorageService);
  private logger = inject(LoggingService);

  private _list = new BehaviorSubject<Project[]>([]);
  private _currentId = new BehaviorSubject<string | undefined>(undefined);
  private _current = new BehaviorSubject<Project | undefined>(undefined);

  currentProject = signal<Project | null>(null);

  constructor() {
    this.loadProjects();

    combineLatest([this._list, this._currentId])
      .pipe(
        map(([list, currentId]) => list.find((item) => item.id === currentId))
      )
      .subscribe(project => {
        this._current.next(project);
        if (project) this.currentProject.set(project);
      });
  }

  private async loadProjects() {
    try {
      const projects = await this.storage.getItem<Project[]>('studio_projects') || [];
      this._list.next(projects);
    } catch (e) {
      this.logger.error('ProjectService: Failed to load projects from storage', e);
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
  }

  public async update(project: Project) {
    const list = this._list.getValue();
    const index = list.findIndex(p => p.id === project.id);
    if (index !== -1) {
      list[index] = { ...project, updatedAt: Date.now() };
      this._list.next([...list]);
      await this.saveAll(list);
    }
  }

  public select(id: string) {
    this._currentId.next(id);
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
      tasks: []
    };
  }
}
