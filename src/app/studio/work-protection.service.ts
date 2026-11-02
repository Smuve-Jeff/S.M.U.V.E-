import { Injectable, inject } from "@angular/core";
import { AuthService } from "../services/auth.service";
import { InteractionDialogService } from "../services/interaction-dialog.service";
import { SnackbarService } from "../services/snackbar.service";
import { StudioTelemetryService } from "./studio-telemetry.service";
import { ProjectWorkspaceService } from "./project-workspace.service";

/**
 * One gate in front of everything that replaces the open sketch.
 *
 * The rule is simple: a convenience (a starter recipe, a template, an import,
 * another set) must never win over unsaved work this device cannot recover.
 * Signed-in artists get a snapshot first and are stopped when it fails; guest
 * sessions have nowhere to store one, so they are asked before losing it —
 * unless the artist already confirmed via an explicit dialog.
 */
@Injectable({ providedIn: "root" })
export class WorkProtectionService {
  private readonly workspace = inject(ProjectWorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly snackbar = inject(SnackbarService);
  private readonly telemetry = inject(StudioTelemetryService);

  /**
   * @param action telemetry suffix naming the replacement that was attempted.
   * @param alreadyConfirmed true when an explicit dialog just got a yes, so a
   *   guest is not asked twice for the same decision.
   */
  async preserveBeforeReplace(
    action: string,
    alreadyConfirmed = false,
  ): Promise<boolean> {
    if (!this.workspace.isDirty()) return true;

    if (this.auth.isGuest?.()) {
      if (alreadyConfirmed) return true;
      return this.dialog.confirm({
        title: "Replace this sketch?",
        message:
          "Guest sessions are not saved on this device. This sketch will be replaced and cannot be recovered. Create an account to keep your work.",
        confirmLabel: "Replace it",
        cancelLabel: "Keep my sketch",
      });
    }

    if (await this.workspace.autoSave()) return true;

    const reason =
      typeof this.workspace.persistenceError === "function"
        ? this.workspace.persistenceError()
        : "";
    this.snackbar.error(
      reason
        ? `Nothing was replaced — your current idea could not be saved. ${reason}`
        : "Nothing was replaced — your current idea could not be saved on this device. Save it first, then try again.",
    );
    this.telemetry.trackEvent(
      "studio_error",
      {
        action: `preserve_before_${action}`,
        error: reason || "autosave_unavailable",
      },
      false,
    );
    return false;
  }
}
