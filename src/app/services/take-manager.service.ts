import { Injectable, signal, computed } from '@angular/core';

/**
 * A single take for one track. Sprint A3 starter slice is metadata-only;
 * `midiEvents` and audio buffer capture land in A3 Phase 2.
 */
export interface Take {
  id: string;
  trackId: string;
  label: string;
  createdAt: number;
}

/**
 * Minimal take-lane manager for Sprint A3 (loop record + comping). Keeps
 * all state in a `Map<trackId, ...>` so callers never touch the Track model
 * or its renderer — Phase 2 can add take-lane UI without re-architecting.
 *
 * Punch-in is per-track (the toggle to *create* a new take), not per-take.
 */
@Injectable({ providedIn: 'root' })
export class TakeManagerService {
  private readonly takesByTrack = signal<Record<string, Take[]>>({});
  private readonly activeByTrack = signal<Record<string, string>>({});
  private readonly punchInByTrack = signal<Record<string, boolean>>({});

  /**
   * Append a new take to the track and return it so the caller can persist
   * the id immediately. IDs are stable across reloads because they embed a
   * millisecond timestamp + random suffix.
   */
  addTake(trackId: string, label: string): Take {
    const take: Take = {
      id: `tk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      trackId,
      label,
      createdAt: Date.now(),
    };
    this.takesByTrack.update((m) => ({
      ...m,
      [trackId]: [...(m[trackId] ?? []), take],
    }));
    return take;
  }

  /** Reactive list of takes for a track — never throws on unknown tracks. */
  getTakes(trackId: string) {
    return computed(() => this.takesByTrack()[trackId] ?? []);
  }

  /** Mark a take as active for playback (comp selection happens here too). */
  setActiveTake(trackId: string, takeId: string): void {
    this.activeByTrack.update((m) => ({ ...m, [trackId]: takeId }));
  }

  /** Reactive active-take lookup; undefined when no take is selected. */
  getActiveTake(trackId: string) {
    return computed(() => {
      const id = this.activeByTrack()[trackId];
      if (!id) return undefined;
      return (this.takesByTrack()[trackId] ?? []).find((t) => t.id === id);
    });
  }

  /** Toggle punch-in recording on/off for a track. */
  setPunchIn(trackId: string, enabled: boolean): void {
    this.punchInByTrack.update((m) => ({ ...m, [trackId]: enabled }));
  }

  /** Reactive punch-in state for the given track (false if never set). */
  isPunchIn(trackId: string) {
    return computed(() => !!this.punchInByTrack()[trackId]);
  }

  /**
   * Wipe all takes + active + punch-in state for a track. Useful when the
   * user resets a project or assigns a fresh instrument to the track.
   */
  clearTakesForTrack(trackId: string): void {
    this.takesByTrack.update((m) => {
      const copy = { ...m };
      delete copy[trackId];
      return copy;
    });
    this.activeByTrack.update((m) => {
      const copy = { ...m };
      delete copy[trackId];
      return copy;
    });
    this.punchInByTrack.update((m) => {
      const copy = { ...m };
      delete copy[trackId];
      return copy;
    });
  }
}
