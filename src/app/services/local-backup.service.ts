import { Injectable } from '@angular/core';

import { reportUnwritableStore } from './storage-notice';

/** Marker + schema version so an old file is refused instead of half-applied. */
export const BACKUP_FORMAT = 'smuve-local-backup';
export const BACKUP_VERSION = 1;

export type BackupStorage = 'localStorage' | 'sessionStorage';

export interface BackupStoreEntry {
  key: string;
  storage: BackupStorage;
  value: string;
  checksum: string;
}

export interface SmuveBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  stores: BackupStoreEntry[];
}

export interface RestoreReport {
  /** Entries written back. */
  restored: number;
  /** Entries that failed validation or could not be written. */
  unreadable: string[];
  /** Entries whose backend does not exist in this shell. */
  skipped: string[];
  /** True when the file is not a backup this version understands. */
  invalid: boolean;
}

const STORAGE_KINDS: BackupStorage[] = ['localStorage', 'sessionStorage'];

function resolve(kind: BackupStorage): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return (window as unknown as Record<string, Storage | undefined>)[kind] ?? null;
  } catch {
    return null;
  }
}

/** FNV-1a over key+value: a corruption check, not a security boundary. */
function checksum(key: string, value: string): string {
  const text = `${key}\u0000${value}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Whole-app backup for data that exists nowhere else.
 *
 * Business records, presets, projects and S.M.U.V.E.'s memory live in this
 * origin's storage, so clearing site data destroys them. This writes one file
 * with a per-entry checksum and restores it entry by entry, reporting what was
 * damaged rather than aborting the whole file.
 */
@Injectable({ providedIn: 'root' })
export class LocalBackupService {
  /** Every local and session key this app can see, as a restorable envelope. */
  exportAll(now = new Date()): SmuveBackup {
    const stores: BackupStoreEntry[] = [];
    for (const kind of STORAGE_KINDS) {
      const storage = resolve(kind);
      if (!storage) continue;
      try {
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key) continue;
          const value = storage.getItem(key);
          if (value === null) continue;
          stores.push({ key, storage: kind, value, checksum: checksum(key, value) });
        }
      } catch {
        // A blocked snapshot is better than no snapshot at all.
      }
    }
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: now.toISOString(),
      stores,
    };
  }

  toJson(backup: SmuveBackup = this.exportAll()): string {
    return JSON.stringify(backup, null, 2);
  }

  /**
   * What is on this device right now, for the diagnostics panel: size and
   * whether the record still parses. `parseable: false` is the same class of
   * damage the guards report, shown before it bites.
   */
  inventory(): {
    key: string;
    storage: BackupStorage;
    bytes: number;
    parseable: boolean;
  }[] {
    const rows: {
      key: string;
      storage: BackupStorage;
      bytes: number;
      parseable: boolean;
    }[] = [];
    for (const kind of STORAGE_KINDS) {
      const source = resolve(kind);
      if (!source) continue;
      try {
        for (let index = 0; index < source.length; index++) {
          const key = source.key(index);
          if (!key) continue;
          const value = source.getItem(key);
          if (value === null) continue;
          let parseable = true;
          try {
            JSON.parse(value);
          } catch {
            parseable = false;
          }
          rows.push({
            key,
            storage: kind,
            bytes: new Blob([value]).size,
            parseable,
          });
        }
      } catch {
        // A blocked inventory is better than a broken settings page.
      }
    }
    return rows.sort((a, b) => b.bytes - a.bytes);
  }

  /**
   * Restores a backup file. Entries with a failed checksum are left alone —
   * writing them would replace good data with the corruption being restored.
   */
  restore(json: string): RestoreReport {
    const report: RestoreReport = {
      restored: 0,
      unreadable: [],
      skipped: [],
      invalid: false,
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      report.invalid = true;
      return report;
    }
    if (!this.isBackup(parsed)) {
      report.invalid = true;
      return report;
    }

    for (const entry of parsed.stores) {
      const storage = resolve(entry.storage);
      if (!storage) {
        report.skipped.push(entry.key);
        continue;
      }
      if (typeof entry.value !== 'string') {
        report.unreadable.push(entry.key);
        continue;
      }
      if (checksum(entry.key, entry.value) !== entry.checksum) {
        report.unreadable.push(entry.key);
        continue;
      }
      try {
        storage.setItem(entry.key, entry.value);
        report.restored += 1;
      } catch (error) {
        report.unreadable.push(entry.key);
        reportUnwritableStore('This backup', error);
      }
    }

    return report;
  }

  /** One line an artist can act on, for a toast or the diagnostics panel. */
  describe(report: RestoreReport): string {
    if (report.invalid) {
      return 'That file is not a S.M.U.V.E. backup this version can read. Nothing was changed.';
    }
    const parts = [`${report.restored} store${report.restored === 1 ? '' : 's'} restored`];
    if (report.unreadable.length) {
      parts.push(
        `${report.unreadable.length} could not be restored (damaged entry or storage full)`
      );
    }
    if (report.skipped.length) {
      parts.push(`${report.skipped.length} not available in this shell`);
    }
    return `${parts.join(' · ')}.`;
  }

  /** Triggers the browser download; a no-op outside a document. */
  download(fileName?: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    const name =
      fileName ??
      `smuve-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([this.toJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private isBackup(value: unknown): value is SmuveBackup {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const backup = value as Partial<SmuveBackup>;
    if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
      return false;
    }
    if (!Array.isArray(backup.stores)) return false;
    return backup.stores.every((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<BackupStoreEntry>;
      return (
        typeof candidate.key === 'string' &&
        candidate.key.length > 0 &&
        STORAGE_KINDS.includes(candidate.storage as BackupStorage) &&
        typeof candidate.checksum === 'string'
      );
    });
  }
}
