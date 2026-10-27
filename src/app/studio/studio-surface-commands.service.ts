import { Injectable, inject } from "@angular/core";
import { Router } from "@angular/router";

import { CommandPaletteService } from "../services/command-palette.service";
import { UIService } from "../services/ui.service";
import {
  studioSurfacesNotIn,
  type StudioSurfaceId,
  type StudioSurface,
} from "./studio-surfaces";

/**
 * Every studio surface, reachable from the command palette.
 *
 * The palette could already jump to a top-level workspace, but the Studio's own
 * twenty-two surfaces — drum machine, mixer, performer, mastering — were only
 * reachable by opening the Studio and then its Tools panel. That is three
 * gestures and a scroll for "open the drum machine".
 *
 * The actions are generated from the shared catalogue rather than written out,
 * so a surface cannot appear in one list and not the other — and only the
 * surfaces the palette cannot already reach are added (see below). Each one runs
 * the app's existing `?view=` route, which the studio shell switches on. No new
 * routing contract, and no component imported into the palette.
 */
@Injectable({ providedIn: "root" })
export class StudioSurfaceCommandsService {
  private readonly palette = inject(CommandPaletteService);
  private readonly router = inject(Router);
  private readonly ui = inject(UIService);

  constructor() {
    // The palette already builds an "Open X" action for every workspace in
    // `WORKSPACE_REGISTRY`, and seven studio surfaces live there. Registering
    // those again would put two commands for one destination in the list, so
    // this adds only the surfaces the palette cannot already reach.
    const covered = this.ui
      .getViewConfigs()
      .map((view) => view.mode as string);

    this.palette.setExtensionActions(
      "studio-surfaces",
      studioSurfacesNotIn(covered).map((surface: StudioSurface) => ({
        id: `studio-surface-${surface.id}`,
        label: `Studio: ${surface.label}`,
        description: surface.description ?? "Open this studio surface",
        category: "Studio",
        // `keywords` is what the palette's filter searches, so the surface id
        // ("piano-roll") and the plain word "studio" both find it.
        keywords: [surface.id, surface.label.toLowerCase(), "studio", "surface"],
        run: () => {
          void this.open(surface.id);
        },
      })),
    );
  }

  /** `?view=` is the app's own contract for naming a studio surface. */
  private open(id: StudioSurfaceId): Promise<boolean> {
    return this.router.navigate(["/studio"], { queryParams: { view: id } });
  }
}
