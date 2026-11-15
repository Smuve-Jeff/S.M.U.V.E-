import { InjectionToken } from "@angular/core";

/**
 * The guide track a set was sung against.
 *
 * Audio bytes cannot ride in the JSON project bundle — an instrumental is far
 * larger than the song snapshot — so the vocal services own that storage and
 * the workspace only asks them to keep it in step with the open project.
 *
 * A token rather than the concrete service keeps the workspace usable on hosts
 * that never load the vocal chain, and in tests that provide neither.
 */
export interface ProjectBackingTrackPort {
  /** Store the loaded guide with `projectId` (removes it when cleared). */
  persistProject(projectId?: string | null): Promise<void>;
  /** Reopen the guide stored with `projectId`. */
  restoreProject(projectId: string): Promise<boolean>;
  /** Drop the stored guide for a set that is being deleted. */
  forgetProject(projectId?: string | null): Promise<void>;
  /** The uploaded file as it should travel inside an exported archive. */
  archiveFile(): { name: string; data: Uint8Array; mimeType: string } | null;
  /**
   * Take the guide out of an imported archive into `projectId`.
   *
   * `persist: false` keeps it in memory only — a guest import is cleared to
   * write nothing to this device's vault.
   */
  adoptProject(
    projectId: string,
    file: { name: string; blob: Blob },
    options?: { persist?: boolean },
  ): Promise<boolean>;
}

export const PROJECT_BACKING_TRACK = new InjectionToken<ProjectBackingTrackPort>(
  "PROJECT_BACKING_TRACK",
);
