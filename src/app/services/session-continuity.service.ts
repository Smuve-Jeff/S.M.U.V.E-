import { Injectable, signal } from '@angular/core';

import { writeJsonStore } from './guarded-storage';

export type ContinuityKind =
  | 'route'
  | 'project'
  | 'chat'
  | 'release'
  | 'studio-view';

export interface ContinuityEntry {
  kind: ContinuityKind;
  id: string;
  label: string;
  at: number;
}

const STORAGE_KEY = 'smuve.session.continuity.v1';
const KINDS: ContinuityKind[] = [
  'route',
  'project',
  'chat',
  'release',
  'studio-view',
];

type ContinuityState = Partial<Record<ContinuityKind, ContinuityEntry>>;

function isEntry(value: unknown): value is ContinuityEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<ContinuityEntry>;
  return (
    typeof entry.kind === 'string' &&
    KINDS.includes(entry.kind as ContinuityKind) &&
    typeof entry.id === 'string' &&
    typeof entry.at === 'number'
  );
}

function load(): ContinuityState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const state: ContinuityState = {};
    for (const kind of KINDS) {
      const value = (parsed as Record<string, unknown>)[kind];
      if (isEntry(value) && value.kind === kind) state[kind] = value;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * One small record of where the artist was, so closing the app does not mean
 * losing the thread: last route, last project, last chat, last release step.
 *
 * It stores identifiers only — no content — and keeps the corrupt-store rule:
 * an unreadable record is never overwritten by this session's view.
 */
@Injectable({ providedIn: 'root' })
export class SessionContinuityService {
  private readonly loaded = load();
  /** False when the stored index could not be read; writes are then skipped. */
  readonly readable = this.loaded !== null;
  private readonly state = signal<ContinuityState>(this.loaded ?? {});

  /** Records where the artist is now; identical repeats are ignored. */
  record(kind: ContinuityKind, id: string, label = ''): void {
    if (!id) return;
    const current = this.state()[kind];
    if (current && current.id === id && current.label === label) return;
    const entry: ContinuityEntry = { kind, id, label, at: Date.now() };
    const next = { ...this.state(), [kind]: entry };
    this.state.set(next);
    if (this.readable) {
      writeJsonStore('Where you left off', STORAGE_KEY, next);
    }
  }

  /** Most recent record of one kind, if any. */
  latest(kind: ContinuityKind): ContinuityEntry | null {
    return this.state()[kind] ?? null;
  }

  /** Every recorded kind, newest first. */
  all(): ContinuityEntry[] {
    return Object.values(this.state())
      .filter((entry): entry is ContinuityEntry => !!entry)
      .sort((a, b) => b.at - a.at);
  }

  /** One line for a resume affordance; empty when nothing is recorded. */
  resumeLabel(): string {
    const latest = this.all()[0];
    if (!latest) return '';
    const label = latest.label || latest.id;
    switch (latest.kind) {
      case 'project':
        return `Resume project: ${label}`;
      case 'chat':
        return `Resume your conversation: ${label}`;
      case 'release':
        return `Resume release planning: ${label}`;
      case 'studio-view':
        return `Return to the studio ${label} view`;
      default:
        return `Return to ${label}`;
    }
  }

  clear(): void {
    this.state.set({});
    if (this.readable) {
      writeJsonStore('Where you left off', STORAGE_KEY, {});
    }
  }
}
