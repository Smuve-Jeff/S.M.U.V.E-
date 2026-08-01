import { Injectable, signal, computed } from '@angular/core';
import type { TrackNote } from './music-manager.service';

/**
 * A single take for one track. Sprint A3 Phase 2 added the region snapshot
 * (`noteCount`, `startStep`, `endStep`); Phase 4 adds the note snapshot so
 * the active take can drive playback and comp stacks can be merged back into
 * the working track.
 */
export interface Take {
  id: string;
  trackId: string;
  label: string;
  createdAt: number;
  /** Number of MIDI notes captured in this take (0 = audio-only/empty pass). */
  noteCount?: number;
  /** First captured step in the take region. */
  startStep?: number;
  /** Last captured step (exclusive end) in the take region. */
  endStep?: number;
  /** Deep-cloned note snapshot captured at stamp time (playback + comp source). */
  notes?: TrackNote[];
}

/**
 * Take-lane manager for Sprint A3 (loop record + comping). Keeps all state in
 * `Map<trackId, ...>`-shaped signals so callers never touch the Track model or
 * its renderer.
 *
 * Punch-in is per-track (the toggle to *create* a new take), not per-take.
 * The comp stack is an ordered take-id list; `applyComp` merges the stacked
 * takes' note snapshots back into the working track (later takes win overlaps).
 */
@Injectable({ providedIn: 'root' })
export class TakeManagerService {
  private readonly takesByTrack = signal<Record<string, Take[]>>({});
  private readonly activeByTrack = signal<Record<string, string>>({});
  private readonly punchInByTrack = signal<Record<string, boolean>>({});
  private readonly compStackByTrack = signal<Record<string, string[]>>({});

  /**
   * Append a new take to the track and return it so the caller can persist
   * the id immediately. IDs are stable across reloads because they embed a
   * millisecond timestamp + random suffix.
   *
   * @param meta Optional region + note snapshot captured by the caller at
   *   record stop — drives take-lane labels, active-take playback + comp merges.
   */
  addTake(
    trackId: string,
    label: string,
    meta?: Pick<
      Take,
      'noteCount' | 'startStep' | 'endStep' | 'notes'
    >
  ): Take {
    const take: Take = {
      id: `tk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      trackId,
      label,
      createdAt: Date.now(),
      ...meta,
    };
    this.takesByTrack.update((m) => ({
      ...m,
      [trackId]: [...(m[trackId] ?? []), take],
    }));
    return take;
  }

  /**
   * Snapshot the current note region of a track as a new take and make it the
   * active selection. Centralizes the region math (min/max step bounds, with
   * playhead fallback for empty passes) so the transport bar and the take-lane
   * panel stamp identically.
   *
   * @param notes Track note list — cloned into the take for playback/comp.
   * @param playhead Current song position, used when the track has no notes.
   */
  stampTake(
    trackId: string,
    label: string,
    notes: TrackNote[],
    playhead: number
  ): Take {
    let startStep = Number.MAX_SAFE_INTEGER;
    let endStep = 0;
    for (const n of notes) {
      if (n.step < startStep) startStep = n.step;
      const nEnd = n.step + (n.length ?? 1);
      if (nEnd > endStep) endStep = nEnd;
    }
    if (notes.length === 0) {
      startStep = playhead;
      endStep = playhead + 1;
    }
    // Region is always persisted (empty passes still record the playhead
    // span); noteCount only when the pass captured actual notes.
    const take = this.addTake(trackId, label, {
      noteCount: notes.length ? notes.length : undefined,
      startStep,
      endStep,
      notes: notes.map((n) => ({ ...n })),
    });
    this.setActiveTake(trackId, take.id);
    return take;
  }

  /**
   * Delete a single take by id. If the deleted take was the active selection,
   * the active selection for that track is cleared so UI never points at a
   * dangling id.
   */
  removeTake(trackId: string, takeId: string): void {
    this.takesByTrack.update((m) => ({
      ...m,
      [trackId]: (m[trackId] ?? []).filter((t) => t.id !== takeId),
    }));
    this.activeByTrack.update((m) => {
      if (m[trackId] !== takeId) return m;
      const copy = { ...m };
      delete copy[trackId];
      return copy;
    });
    // Drop the take from any comp stack that references it.
    this.compStackByTrack.update((m) => {
      const stack = (m[trackId] ?? []).filter((id) => id !== takeId);
      return { ...m, [trackId]: stack };
    });
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

  /**
   * Reactive note snapshot of the active take — playback source for comping.
   * Returns [] when there is no active take or the take captured no notes, so
   * callers can fall back to the working track notes.
   */
  getActiveTakeNotes(trackId: string) {
    return computed<TrackNote[]>(() => {
      const active = this.getActiveTake(trackId)();
      return active?.notes?.length ? active.notes : [];
    });
  }

  /**
   * Non-reactive active-take note read for hot paths (audio tick). Reads the
   * underlying signals directly so `MusicManagerService.playStep` never
   * allocates computeds per track per step.
   */
  getActiveTakeNotesNow(trackId: string): TrackNote[] {
    const id = this.activeByTrack()[trackId];
    if (!id) return [];
    const take = (this.takesByTrack()[trackId] ?? []).find((t) => t.id === id);
    return take?.notes?.length ? take.notes : [];
  }

  /** Toggle punch-in recording on/off for a track. */
  setPunchIn(trackId: string, enabled: boolean): void {
    this.punchInByTrack.update((m) => ({ ...m, [trackId]: enabled }));
  }

  /** Reactive punch-in state for the given track (false if never set). */
  isPunchIn(trackId: string) {
    return computed(() => !!this.punchInByTrack()[trackId]);
  }

  // ── Sprint A3 Phase 4 — comp stack ──────────────────────────────────

  /**
   * Add/remove a take from the track's comp stack. Stack order = the order
   * chips were tapped; later takes win overlapping notes on `applyComp`.
   */
  toggleCompTake(trackId: string, takeId: string): void {
    this.compStackByTrack.update((m) => {
      const cur = m[trackId] ?? [];
      if (cur.includes(takeId)) {
        return { ...m, [trackId]: cur.filter((id) => id !== takeId) };
      }
      return { ...m, [trackId]: [...cur, takeId] };
    });
  }

  /** Reactive ordered comp stack (take ids) for a track. */
  compStack(trackId: string) {
    return computed(() => this.compStackByTrack()[trackId] ?? []);
  }

  /** Clear the comp stack without touching the takes themselves. */
  clearCompStack(trackId: string): void {
    this.compStackByTrack.update((m) => {
      const copy = { ...m };
      delete copy[trackId];
      return copy;
    });
  }

  /**
   * Merge the comp stack's take snapshots into one note list, ready to write
   * back to the working track. Later takes in the stack override earlier ones
   * on the same (step, midi) cell — the standard "top layer wins" comp rule.
   */
  applyComp(trackId: string): TrackNote[] {
    const stack = this.compStackByTrack()[trackId] ?? [];
    const takes = this.takesByTrack()[trackId] ?? [];
    const merged = new Map<string, TrackNote>();
    for (const takeId of stack) {
      const take = takes.find((t) => t.id === takeId);
      for (const n of take?.notes ?? []) {
        merged.set(`${n.step}:${n.midi}`, { ...n });
      }
    }
    return [...merged.values()];
  }

  /**
   * Wipe all takes + active + punch-in + comp state for a track. Useful when
   * the user resets a project or assigns a fresh instrument to the track.
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
    this.compStackByTrack.update((m) => {
      const copy = { ...m };
      delete copy[trackId];
      return copy;
    });
  }
}
