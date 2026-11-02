import { Injectable, signal } from '@angular/core';

/**
 * The shell-visible half of auto-save.
 *
 * `AutoSaveService` owns the project graph and is loaded after first paint.
 * The sync-center chrome only needs these signals, so keeping them in this
 * dependency-free store avoids pulling the entire Studio persistence graph
 * into the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class AutoSaveStatusService {
  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);
  /** True when the project is saved locally and safe offline. */
  readonly isLocalSaved = signal(false);
}
