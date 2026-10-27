import { MicPermissionState, micPermissionNotice } from "./mic-permission";

/**
 * The banner exists to send the artist to the right place. A single "check your
 * browser settings, then tap REC again" covers neither of the two states it has
 * to serve: a dismissed prompt needs no settings change, and a hard block cannot
 * be retried at all until it is cleared.
 */
describe("micPermissionNotice", () => {
  it("sends a hard block to browser settings, and says retrying alone will fail", () => {
    const notice = micPermissionNotice("denied");
    expect(notice.needsBrowserSettings).toBe(true);
    expect(notice.detail).toMatch(/will not prompt again/i);
    expect(notice.steps.join(" ")).toMatch(/Microphone to Allow/i);
    expect(notice.steps.join(" ")).toMatch(/Reload/i);
  });

  it("tells a dismissed prompt to simply ask again", () => {
    const notice = micPermissionNotice("prompt");
    expect(notice.needsBrowserSettings).toBe(false);
    expect(notice.detail).toMatch(/dismissed/i);
    expect(notice.steps.join(" ")).toMatch(/Tap REC again/i);
  });

  it("never asks for settings changes when nothing was denied", () => {
    for (const state of ["granted", "unknown"] as MicPermissionState[]) {
      const notice = micPermissionNotice(state);
      expect(notice.needsBrowserSettings).toBe(false);
      expect(notice.title.length).toBeGreaterThan(0);
    }
  });

  it("gives every state a distinct headline", () => {
    const states: MicPermissionState[] = ["granted", "prompt", "denied", "unknown"];
    const titles = states.map((state) => micPermissionNotice(state).title);
    expect(new Set(titles).size).toBe(states.length);
  });
});
