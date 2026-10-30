import { StudioFocusService } from "./studio-focus.service";

describe("StudioFocusService", () => {
  it("lets any view take shortcuts before anything is touched", () => {
    const focus = new StudioFocusService();
    expect(focus.ownsShortcuts("arrangement")).toBe(true);
    expect(focus.ownsShortcuts("piano-roll")).toBe(true);
  });

  it("hands shortcuts to the last view touched", () => {
    const focus = new StudioFocusService();
    focus.noteActivity("arrangement");

    expect(focus.ownsShortcuts("arrangement")).toBe(true);
    expect(focus.ownsShortcuts("piano-roll")).toBe(false);
  });

  it("hands them back when the other view is touched", () => {
    const focus = new StudioFocusService();
    focus.noteActivity("arrangement");
    focus.noteActivity("piano-roll");

    expect(focus.ownsShortcuts("piano-roll")).toBe(true);
    expect(focus.ownsShortcuts("arrangement")).toBe(false);
  });
});
