import * as fs from "fs";
import * as path from "path";

import { WORKSPACE_REGISTRY } from "../services/workspace-registry";
import {
  STUDIO_SURFACES,
  STUDIO_SURFACE_GROUPS,
  isStudioSurfaceId,
  studioSurface,
  studioSurfacesNotIn,
} from "./studio-surfaces";

/**
 * The catalogue is only worth having if it cannot drift from the shell that
 * renders it. These assertions read the classic shell's own template, so a view
 * added to the switch without a catalogue entry — the exact failure that left a
 * dozen surfaces unreachable from `/studio` — fails here instead of shipping.
 */
describe("studio surface catalogue", () => {
  const classicTemplate = fs.readFileSync(
    path.join(__dirname, "studio.component.html"),
    "utf8",
  );
  const renderedViews = [
    ...classicTemplate.matchAll(/\*ngSwitchCase="'([a-z0-9-]+)'"/g),
  ].map((match) => match[1]);

  it("names every view the classic shell can render, and only those", () => {
    expect(renderedViews.length).toBeGreaterThan(15);
    expect([...new Set(renderedViews)].sort()).toEqual(
      STUDIO_SURFACES.map((surface) => surface.id).sort(),
    );
  });

  it("keeps ids unique and every entry navigable", () => {
    const ids = STUDIO_SURFACES.map((surface) => surface.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const surface of STUDIO_SURFACES) {
      expect(surface.label.trim().length).toBeGreaterThan(2);
      // Material Symbols ligature names are lowercase snake_case.
      expect(surface.icon).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("groups every surface exactly once", () => {
    const grouped = STUDIO_SURFACE_GROUPS.flatMap((group) => group.views);
    expect(grouped.map((view) => view.id).sort()).toEqual(
      STUDIO_SURFACES.map((surface) => surface.id).sort(),
    );
    expect(STUDIO_SURFACE_GROUPS.every((group) => group.views.length > 0)).toBe(
      true,
    );
  });

  it("adds only the surfaces the command palette cannot already reach", () => {
    const registryModes = WORKSPACE_REGISTRY.map((workspace) => workspace.mode);
    const added = studioSurfacesNotIn(registryModes);

    // No destination appears twice in the palette: everything registered as a
    // "Studio: X" action is absent from the palette's own workspace actions.
    for (const surface of added) {
      expect(registryModes).not.toContain(surface.id);
    }

    // And nothing is lost in the other direction: every catalogued surface is
    // reachable from one list or the other.
    const covered = new Set([...registryModes, ...added.map((s) => s.id)]);
    for (const surface of STUDIO_SURFACES) {
      expect(covered.has(surface.id)).toBe(true);
    }

    // The gap this closed was real, not theoretical.
    expect(added.length).toBeGreaterThan(6);
  });

  it("recognises catalogued ids and rejects anything else", () => {
    expect(isStudioSurfaceId("drum-machine")).toBe(true);
    expect(isStudioSurfaceId("not-a-view")).toBe(false);
    expect(studioSurface("mixer")?.label).toBe("Mixer");
    expect(studioSurface("not-a-view")).toBeUndefined();
  });
});
