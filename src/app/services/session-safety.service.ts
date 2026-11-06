import { Injectable, signal } from '@angular/core';

/** Outcome of a shell-requested save; the message reaches the artist verbatim. */
export interface ProjectSaveResult {
  ok: boolean;
  message?: string;
}

/** Outcome of a shell-requested backup download. */
export interface ProjectExportResult {
  ok: boolean;
  message?: string;
}

/**
 * The shell's view of session-critical state.
 *
 * An update must never reload the app over a live take, a take that is armed,
 * or work the project store has not persisted. But the shell cannot import
 * `RecordingStatusService` or `ProjectWorkspaceService`: they pull in the audio
 * engine and the whole project graph at boot. Those owners mirror what they
 * already know into these signals; the shell only reads them, so this file
 * stays dependency-free.
 *
 * Every writer also resets what it owns when it goes away, so a stale `true`
 * cannot pin the reload action forever.
 */
@Injectable({ providedIn: 'root' })
export class SessionSafetyService {
  /** Any live capture: transport, mic, performer, DJ deck, component recorder. */
  readonly isRecording = signal(false);

  /** Tracks armed for the next take. */
  readonly armedTakeCount = signal(0);

  /** Edits the project store has not persisted yet. */
  readonly hasUnsavedChanges = signal(false);

  /** A project write is in flight and reloading would cut it off. */
  readonly isProjectSaving = signal(false);

  /**
   * What makes ending this session unsafe right now, in the artist's words,
   * or null when nothing is at risk. Shared by the update gate and every
   * sign-out surface so the two cannot describe the same session differently.
   */
  exitRisk(): string | null {
    const risks: string[] = [];
    if (this.isRecording()) {
      risks.push('A take is recording.');
    }
    if (this.isProjectSaving()) {
      risks.push('A save is still finishing.');
    } else if (this.hasUnsavedChanges()) {
      risks.push('This set has unsaved changes.');
    }
    if (this.armedTakeCount() > 0) {
      risks.push('A track is armed for recording.');
    }
    return risks.length ? risks.join(' ') : null;
  }

  /**
   * The Studio's real save path, registered by the project store. Kept as a
   * callback so the shell can save before reloading without importing the
   * project graph (or duplicating its integrity and guest rules).
   */
  private saveHandler: (() => Promise<ProjectSaveResult>) | null = null;

  /** The Studio's real backup export, for sessions that cannot save at all. */
  private exportHandler: (() => ProjectExportResult) | null = null;

  registerSaveHandler(
    handler: (() => Promise<ProjectSaveResult>) | null,
  ): void {
    this.saveHandler = handler;
  }

  registerExportHandler(
    handler: (() => ProjectExportResult) | null,
  ): void {
    this.exportHandler = handler;
  }

  /**
   * Download the open set as a .smuve bundle. Synchronous because the export
   * path is: the handler validates, builds the archive and starts the download
   * before returning, so a caller can decide whether the session is safe to
   * end on the spot.
   */
  exportBackup(): ProjectExportResult {
    const handler = this.exportHandler;
    if (!handler) {
      return {
        ok: false,
        message: 'Open the Studio and export this set before leaving.',
      };
    }
    try {
      return handler();
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error && error.message
            ? error.message
            : 'This set could not be exported.',
      };
    }
  }

  /**
   * Persist the open set now. Returns the store's own failure message (guest
   * refusing to save, incomplete audio, storage not ready) instead of a
   * generic one, so the banner can explain what actually blocked the reload.
   */
  async saveForUpdate(): Promise<ProjectSaveResult> {
    const handler = this.saveHandler;
    if (!handler) {
      return {
        ok: false,
        message:
          'Open the Studio and save this set before applying the update.',
      };
    }
    try {
      return await handler();
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error && error.message
            ? error.message
            : 'This set could not be saved.',
      };
    }
  }
}
