import { Injectable } from '@angular/core';
import { combineLatest, BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Project } from '../types';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private _list = new BehaviorSubject<Project[]>([]);
  private _currentId = new BehaviorSubject<string | undefined>(undefined);
  private _current = new BehaviorSubject<Project | undefined>(undefined);

  constructor() {
    combineLatest([this._list, this._currentId])
      .pipe(
        map(([list, currentId]) => list.find((item) => item.id === currentId))
      )
      .subscribe(this._current);
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

  public add(project: Project) {
    this._list.next([...this._list.getValue(), project]);
  }

  public select(id: string) {
    this._currentId.next(id);
  }
}
