import { Injectable, signal } from "@angular/core";

/**
 * Which Studio view the artist last touched.
 *
 * The shell mounts the arrangement and the piano roll at once, and both map
 * Ctrl+D to a duplicate. `claimKeyEvent` guarantees only one runs, but not the
 * *right* one — listener order decides that, which is not the same as the view
 * the artist is looking at. Each view records its own pointer activity here and
 * the shortcut handlers defer to it: once you have touched the arrangement,
 * Ctrl+D belongs to the arrangement until you touch the editor again.
 */
@Injectable({ providedIn: "root" })
export class StudioFocusService {
  private readonly lastView = signal<string | null>(null);

  /** Called by each view on pointer activity inside itself. */
  noteActivity(view: string): void {
    if (this.lastView() !== view) this.lastView.set(view);
  }

  /**
   * True when `view` may take a shortcut: either nothing has been touched yet,
   * which keeps the previous first-come behaviour, or this view was the last
   * one touched.
   */
  ownsShortcuts(view: string): boolean {
    const last = this.lastView();
    return last === null || last === view;
  }
}
