import { Injectable, OnDestroy } from '@angular/core';

export interface StudioVisualTaskOptions {
  /** Maximum refresh rate for this task. Values are clamped to 8–60 Hz. */
  fps?: number;
  /** Run once immediately when the task is registered. */
  immediate?: boolean;
}

type VisualTask = {
  callback: (timestamp: number) => void;
  intervalMs: number;
  lastRun: number;
};

/**
 * Shared visual clock for Studio surfaces.
 *
 * Audio scheduling remains in AudioEngineService; this service is only for
 * inexpensive UI sampling. Components register a task and receive one
 * unsubscribe function. The loop stops when the final task is removed, which
 * keeps hidden/lazy workspaces from burning frames in the background.
 */
@Injectable({ providedIn: 'root' })
export class StudioVisualSchedulerService implements OnDestroy {
  private readonly tasks = new Map<number, VisualTask>();
  private nextId = 1;
  private frame: number | null = null;

  register(
    callback: (timestamp: number) => void,
    options: StudioVisualTaskOptions = {},
  ): () => void {
    const id = this.nextId++;
    const fps = Math.max(8, Math.min(60, options.fps ?? 30));
    const task: VisualTask = {
      callback,
      intervalMs: 1000 / fps,
      lastRun: 0,
    };
    this.tasks.set(id, task);

    if (options.immediate !== false) {
      const now = this.now();
      task.lastRun = now;
      callback(now);
    }
    this.ensureLoop();
    return () => this.unregister(id);
  }

  /** Alias that reads naturally at call sites which are not long-lived. */
  schedule(
    callback: (timestamp: number) => void,
    options?: StudioVisualTaskOptions,
  ): () => void {
    return this.register(callback, options);
  }

  unregister(id: number): void {
    this.tasks.delete(id);
    if (this.tasks.size === 0) this.stopLoop();
  }

  get activeTaskCount(): number {
    return this.tasks.size;
  }

  ngOnDestroy(): void {
    this.tasks.clear();
    this.stopLoop();
  }

  private ensureLoop(): void {
    if (this.frame !== null || this.tasks.size === 0) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') return;
    this.frame = raf.call(globalThis, (timestamp: number) => {
      this.frame = null;
      this.runDueTasks(timestamp);
      this.ensureLoop();
    });
  }

  private runDueTasks(timestamp: number): void {
    for (const task of this.tasks.values()) {
      if (timestamp - task.lastRun < task.intervalMs) continue;
      task.lastRun = timestamp;
      try {
        task.callback(timestamp);
      } catch {
        // A visual failure must not stop the shared clock for other tasks.
      }
    }
  }

  private stopLoop(): void {
    if (this.frame === null) return;
    const cancel = globalThis.cancelAnimationFrame;
    if (typeof cancel === 'function') cancel.call(globalThis, this.frame);
    this.frame = null;
  }

  private now(): number {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }
}
