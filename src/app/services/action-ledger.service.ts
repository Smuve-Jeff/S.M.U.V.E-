import { Injectable, computed, signal } from '@angular/core';

import { writeJsonStore } from './guarded-storage';

export interface LedgerEntry {
  id: string;
  at: number;
  /** What S.M.U.V.E. did, in the artist's words. */
  action: string;
  detail: string;
  /** True when this session still holds the inverse and can undo it. */
  undoable: boolean;
}

const STORAGE_KEY = 'smuve.action.ledger.v1';
const MAX_ENTRIES = 100;

function isEntry(value: unknown): value is LedgerEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<LedgerEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'number' &&
    typeof entry.action === 'string' &&
    typeof entry.detail === 'string' &&
    typeof entry.undoable === 'boolean'
  );
}

function load(): LedgerEntry[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isEntry).slice(-MAX_ENTRIES);
  } catch {
    return null;
  }
}

/**
 * Append-only record of the actions Full Control executes, with an in-session
 * undo for the ones that can be reversed.
 *
 * Autonomy is only sellable if the artist can see what was done and take the
 * last step back. The metadata survives a reload; the inverse does not, so a
 * restored entry is honestly reported as no longer undoable.
 */
@Injectable({ providedIn: 'root' })
export class ActionLedgerService {
  private readonly loaded = load();
  /** False when the stored ledger could not be read; writes are then skipped. */
  readonly readable = this.loaded !== null;
  private readonly entries = signal<LedgerEntry[]>(this.loaded ?? []);
  private readonly inverses = new Map<string, () => void>();

  /** Newest last, as it happened. */
  readonly history = computed(() => this.entries());
  readonly canUndo = computed(
    () => this.entries().some((entry) => entry.undoable)
  );

  /**
   * Records one action. Pass `undo` when the caller can reverse it; without
   * an inverse the entry is still written, just not undoable.
   */
  record(action: string, detail = '', undo?: () => void): LedgerEntry {
    const entry: LedgerEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      action,
      detail,
      undoable: typeof undo === 'function',
    };
    if (undo) this.inverses.set(entry.id, undo);
    const next = [...this.entries(), entry].slice(-MAX_ENTRIES);
    this.entries.set(next);
    if (this.readable) writeJsonStore('Full Control history', STORAGE_KEY, next);
    return entry;
  }

  /** Undoes the newest action that still has an inverse and removes it. */
  undoLast(): LedgerEntry | null {
    const entries = this.entries();
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      const inverse = this.inverses.get(entry.id);
      if (!inverse) continue;
      try {
        inverse();
      } catch {
        return null;
      }
      this.inverses.delete(entry.id);
      const next = entries.filter((candidate) => candidate.id !== entry.id);
      this.entries.set(next);
      if (this.readable) {
        writeJsonStore('Full Control history', STORAGE_KEY, next);
      }
      return entry;
    }
    return null;
  }

  /** Empty the history; callbacks are per-session and go with it. */
  clear(): void {
    this.inverses.clear();
    this.entries.set([]);
    if (this.readable) writeJsonStore('Full Control history', STORAGE_KEY, []);
  }
}
