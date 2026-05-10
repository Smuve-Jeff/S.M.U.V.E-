import { Injectable } from '@angular/core';
import { combineLatest, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { Project } from '../types';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {

  private list = new BehaviorSubject<Project[]>([]);
  private currentId = new BehaviorSubject<string | undefined>(undefined);
  private current = new BehaviorSubject<Project | undefined>(undefined);

  constructor(
  ) {
    combineLatest([
      this.list,
      this.currentId,
    ]).pipe(
      map(([list, currentId]) => list.find(item => item.id === currentId))
    ).subscribe(this.current);
  }

  public get list() {
    return this.list.asObservable();
  }

  public get current() {
    return this.current.asObservable();
  }

  public get currentId() {
    return this.currentId.asObservable();
  }

  public add(project: Project) {
    this.list.next([
      ...this.list.getValue(),
      project
    ]);
  }

  public select(id: string) {
    this.currentId.next(id);
  }
}
