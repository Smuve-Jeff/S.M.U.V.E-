import { Injectable } from '@angular/core';
import type { FinetuneRole } from './artist-profile-finetune.service';
import { reportUnreadableStore } from './storage-notice';

export type DeskTelemetryEvent = 'opened' | 'answered' | 'fallback';

type DeskCounters = Record<DeskTelemetryEvent, number>;

const STORAGE_KEY = 'smuve.desk.telemetry.v1';

/**
 * Category-level desk counters only: how often a desk is opened, how often the
 * live model answers, and how often the local brief has to carry the turn.
 *
 * No questions, replies or profile details are stored — this exists to decide
 * which desks deserve the next round of work, not to keep a transcript.
 */
@Injectable({ providedIn: 'root' })
export class DeskTelemetryService {
  private readonly storedCounts = this.read();
  private readonly countsReadable = this.storedCounts !== null;
  private counts: Partial<Record<FinetuneRole, DeskCounters>> =
    this.storedCounts ?? {};

  record(role: FinetuneRole, event: DeskTelemetryEvent): void {
    const current = this.counts[role] ?? {
      opened: 0,
      answered: 0,
      fallback: 0,
    };
    this.counts = {
      ...this.counts,
      [role]: { ...current, [event]: current[event] + 1 },
    };
    this.write();
  }

  snapshot(): Partial<Record<FinetuneRole, DeskCounters>> {
    return JSON.parse(JSON.stringify(this.counts)) as Partial<
      Record<FinetuneRole, DeskCounters>
    >;
  }

  reset(): void {
    this.counts = {};
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage is optional; counters simply stay in memory.
    }
  }

  private read(): Partial<Record<FinetuneRole, DeskCounters>> | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Partial<Record<FinetuneRole, DeskCounters>>)
        : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    if (!this.countsReadable) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.counts));
    } catch {
      // A blocked store costs telemetry, never the desk.
    }
  }
}
