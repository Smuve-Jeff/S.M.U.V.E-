import { Injectable } from '@angular/core';

import { writeJsonStore } from './guarded-storage';

/**
 * Bump when a locally-stored shape changes. The version is stamped only after
 * every registered migration has run, so a failed migration retries next boot
 * instead of being remembered as done.
 */
export const LOCAL_SCHEMA_VERSION = 1;

export interface StoreMigration {
  key: string;
  /** Shape version this migration upgrades FROM. */
  from: number;
  /** Returns the upgraded value, or null to leave the record untouched. */
  migrate: (value: unknown) => unknown | null;
}

interface SchemaStamp {
  version: number;
  migratedAt: string;
}

const STAMP_KEY = 'smuve.local.schema.v1';

/**
 * Versioned migrations for the stores that live on the artist's device.
 *
 * Corruption guards catch unreadable JSON; this catches the other silent loss:
 * a shape change that a sanitizer quietly drops because the record still
 * parses. Migrations receive the parsed value and decide whether it is theirs,
 * and the caller supplies a backup callback so the pre-migration data exists
 * outside the app.
 */
@Injectable({ providedIn: 'root' })
export class LocalSchemaService {
  /** Stored schema version; 0 when nothing has been stamped yet. */
  currentVersion(): number {
    try {
      if (typeof localStorage === 'undefined') return 0;
      const raw = localStorage.getItem(STAMP_KEY);
      if (!raw) return 0;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return 0;
      }
      const version = (parsed as Partial<SchemaStamp>).version;
      return typeof version === 'number' ? version : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Runs the migrations whose stored shape predates `LOCAL_SCHEMA_VERSION`.
   * Records that cannot be parsed or upgraded are reported as `skipped` and
   * left exactly as they are.
   */
  run(
    migrations: StoreMigration[],
    options?: { beforeMigrate?: () => void }
  ): { from: number; to: number; migrated: string[]; skipped: string[] } {
    const from = this.currentVersion();
    if (from >= LOCAL_SCHEMA_VERSION) {
      return { from, to: from, migrated: [], skipped: [] };
    }

    const pending = migrations.filter((migration) => migration.from >= from);
    const result = {
      from,
      to: LOCAL_SCHEMA_VERSION,
      migrated: [] as string[],
      skipped: [] as string[],
    };
    if (pending.length > 0) options?.beforeMigrate?.();

    for (const migration of pending) {
      try {
        if (typeof localStorage === 'undefined') break;
        const raw = localStorage.getItem(migration.key);
        if (raw === null) continue;
        const next = migration.migrate(JSON.parse(raw));
        if (next === null) {
          result.skipped.push(migration.key);
          continue;
        }
        if (
          writeJsonStore('Local data migration', migration.key, next)
        ) {
          result.migrated.push(migration.key);
        } else {
          result.skipped.push(migration.key);
        }
      } catch {
        // Unreadable record: leave it for the corruption guards to report.
        result.skipped.push(migration.key);
      }
    }

    const stamp: SchemaStamp = {
      version: LOCAL_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
    };
    writeJsonStore('Local schema version', STAMP_KEY, stamp);
    return result;
  }
}
