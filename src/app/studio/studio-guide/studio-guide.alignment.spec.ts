import {
  ALL_GUIDE_LESSONS,
  GUIDE_SHORTCUTS,
  GUIDE_SURFACE_ATLAS,
} from "./studio-guide.data";
import {
  STUDIO_SURFACE_GROUPS,
  STUDIO_SURFACES,
} from "../studio-surfaces";
import { WORKSPACE_REGISTRY } from "../../services/workspace-registry";
import { CommandPaletteService } from "../../services/command-palette.service";
import { StudioComponent } from "../studio.component";

/**
 * The Masterclass mirrors the application, so the app is the source of truth.
 *
 * `studio-guide.data.spec.ts` already proves every surface *id* is documented.
 * These assertions cover the parts that drift silently when the application is
 * renamed or re-keyed: the workflow groups the atlas files surfaces under, the
 * order they appear in, and the keyboard shortcuts the guide promises.
 */

/** Build the keydown a real user would send for a guide `keys` label. */
function keydownFor(keys: string): KeyboardEvent {
  const parts = keys.split("+").map((part) => part.trim());
  const label = parts[parts.length - 1];
  const key =
    label === "Esc"
      ? "Escape"
      : label === "Space"
        ? " "
        : label === "?"
          ? "?"
          : label.toLowerCase();
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: parts.includes("Ctrl / Cmd"),
    shiftKey: parts.includes("Shift"),
    altKey: parts.includes("Alt"),
    cancelable: true,
  });
}

/** A palette whose only real work is recorded; the key routing is real. */
function paletteHarness() {
  const palette = Object.create(
    CommandPaletteService.prototype,
  ) as CommandPaletteService & {
    togglePalette: jest.Mock;
    openGuide: jest.Mock;
    triggerById: jest.Mock;
  };
  Object.assign(palette, {
    isOpen: () => false,
    isEditableTarget: () => false,
    ownsSpaceKey: () => false,
    togglePalette: jest.fn(),
    openGuide: jest.fn(),
    triggerById: jest.fn(),
  });
  return palette;
}

describe("Masterclass alignment with the application", () => {
  it("files every atlas entry under its catalogue's workflow group", () => {
    for (const group of STUDIO_SURFACE_GROUPS) {
      for (const surface of group.views) {
        const entry = GUIDE_SURFACE_ATLAS.find(
          (candidate) => candidate.id === surface.id,
        );
        expect(entry).toBeDefined();
        // Renaming a group in the catalogue must reach the Masterclass.
        expect(entry!.group).toBe(group.label);
      }
    }
  });

  it("keeps the atlas in the catalogue's workflow order", () => {
    expect(GUIDE_SURFACE_ATLAS.map((entry) => entry.id)).toEqual(
      STUDIO_SURFACES.map((surface) => surface.id),
    );
  });

  it("advertises only shortcuts the application really handles", () => {
    const studio = StudioComponent.prototype;
    const audioHistory = { undo: jest.fn(), redo: jest.fn() };
    const shell = {
      saveProject: jest.fn(),
      exportProject: jest.fn(),
      toggleAiMixAssistant: jest.fn(),
      toggleStageFx: jest.fn(),
      dismissTopOverlay: jest.fn(() => true),
      history: audioHistory,
    };
    /** The handlers only touch the collaborators above. */
    const self = shell as unknown as StudioComponent;

    for (const entry of GUIDE_SHORTCUTS) {
      const event = keydownFor(entry.keys);
      const palette = paletteHarness();
      let handled = false;

      switch (entry.keys) {
        case "Space":
          handled = palette.handleGlobalKey(event);
          expect(palette.triggerById).toHaveBeenCalledWith("toggle-playback");
          break;
        case "Ctrl / Cmd + K":
          handled = palette.handleGlobalKey(event);
          expect(palette.togglePalette).toHaveBeenCalled();
          break;
        case "?":
          handled = palette.handleGlobalKey(event);
          expect(palette.openGuide).toHaveBeenCalled();
          break;
        case "Ctrl / Cmd + S":
          handled = studio.handleKeyboardShortcut.call(self, event);
          expect(shell.saveProject).toHaveBeenCalled();
          break;
        case "Ctrl / Cmd + E":
          handled = studio.handleKeyboardShortcut.call(self, event);
          expect(shell.exportProject).toHaveBeenCalled();
          break;
        case "Ctrl / Cmd + Z":
          handled = studio.handleKeyboardShortcut.call(self, event);
          expect(audioHistory.undo).toHaveBeenCalled();
          break;
        case "Ctrl / Cmd + Shift + Z":
          handled = studio.handleKeyboardShortcut.call(self, event);
          expect(audioHistory.redo).toHaveBeenCalled();
          break;
        case "Ctrl / Cmd + I":
          handled = studio.handleKeyboardShortcut.call(self, event);
          expect(shell.toggleAiMixAssistant).toHaveBeenCalled();
          break;
        case "Shift + F":
          studio.onStageFxShortcut.call(self, event);
          handled = shell.toggleStageFx.mock.calls.length > 0;
          break;
        case "Esc":
          studio.onShellKeydown.call(self, event);
          handled = shell.dismissTopOverlay.mock.calls.length > 0;
          break;
        default: {
          // The Alt-modified global keys all dispatch a palette command.
          handled = palette.handleGlobalKey(event);
          expect(palette.triggerById).toHaveBeenCalled();
        }
      }

      // A shortcut the guide promises but the app ignores would fail here.
      expect({ keys: entry.keys, handled }).toEqual({
        keys: entry.keys,
        handled: true,
      });
    }
  });

  it("names every whole-app room the way the registry names it", () => {
    const labelsByRoute = new Map<string, Set<string>>();
    for (const workspace of WORKSPACE_REGISTRY) {
      const labels = labelsByRoute.get(workspace.routePath) ?? new Set();
      labels.add(workspace.label);
      labelsByRoute.set(workspace.routePath, labels);
    }

    const chapters = ALL_GUIDE_LESSONS.filter(
      (lesson) => lesson.track === "whole-app" && lesson.workspace,
    );
    expect(chapters.length).toBeGreaterThanOrEqual(12);

    for (const chapter of chapters) {
      const workspace = chapter.workspace!;
      const registryLabels = labelsByRoute.get(workspace.path);
      // A chapter may not invent a room name or route the shell does not ship.
      expect({ path: workspace.path, routed: !!registryLabels }).toEqual({
        path: workspace.path,
        routed: true,
      });
      expect({
        path: workspace.path,
        label: workspace.label,
        known: registryLabels!.has(workspace.label),
      }).toEqual({
        path: workspace.path,
        label: workspace.label,
        known: true,
      });
      // The action must open the room it names, not a paraphrase of it.
      expect(chapter.action).toBe(`Open ${workspace.label}`);
      expect(chapter.title.trim().length).toBeGreaterThan(3);
    }
  });

  it("only sends a chapter to a room the rail actually offers", () => {
    // Several routes have both a visible entry and hidden aliases, so the test
    // asks whether the room is reachable at all, not whether any entry hides it.
    const visible = new Set(
      WORKSPACE_REGISTRY.filter((workspace) => !workspace.hidden).map(
        (workspace) => workspace.routePath,
      ),
    );
    const unreachable = ALL_GUIDE_LESSONS.filter(
      (lesson) => lesson.workspace && !visible.has(lesson.workspace.path),
    ).map((lesson) => lesson.workspace!.path);
    expect(unreachable).toEqual([]);
  });

  it("lists each shortcut once", () => {
    const keys = GUIDE_SHORTCUTS.map((entry) => entry.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of GUIDE_SHORTCUTS) {
      expect(entry.action.trim().length).toBeGreaterThan(3);
    }
  });

  it("keeps every Alt shortcut distinct in the guide and the palette", () => {
    const altKeys = GUIDE_SHORTCUTS.map((entry) => entry.keys).filter((keys) =>
      keys.startsWith("Alt"),
    );
    expect(altKeys.length).toBeGreaterThan(0);
    expect(new Set(altKeys).size).toBe(altKeys.length);
  });
});
