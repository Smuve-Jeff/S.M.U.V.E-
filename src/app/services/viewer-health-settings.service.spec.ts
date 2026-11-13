import {
  VIEWER_HEALTH_STORAGE_KEY,
  VIEWER_HEALTH_UNDO_STORAGE_KEY,
  VIEWER_HEALTH_UNDO_TTL_MS,
  ViewerHealthSettingsService,
} from "./viewer-health-settings.service";
import type { ViewerHealthThresholds } from "./viewer-health";

const preset = {
  id: "stream-live-landscape",
  health: {
    rttFairMs: 100,
    rttPoorMs: 200,
    kbpsFair: 1500,
    kbpsPoor: 500,
  },
};

const tuned: ViewerHealthThresholds = {
  rttFairMs: 120,
  rttPoorMs: 240,
  kbpsFair: 1800,
  kbpsPoor: 600,
};

describe("ViewerHealthSettingsService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.removeItem(VIEWER_HEALTH_STORAGE_KEY);
    sessionStorage.removeItem(VIEWER_HEALTH_UNDO_STORAGE_KEY);
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.removeItem(VIEWER_HEALTH_STORAGE_KEY);
    sessionStorage.removeItem(VIEWER_HEALTH_UNDO_STORAGE_KEY);
  });

  it("uses the preset's own limits until an override is saved", () => {
    const service = new ViewerHealthSettingsService();

    expect(service.thresholdsFor(preset)).toEqual(preset.health);
    expect(service.isCustomized(preset.id)).toBe(false);
    expect(service.overrideCount()).toBe(0);
    expect(service.clearAll()).toBeNull();
  });

  it("saves an override and reloads it from storage", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);

    expect(service.thresholdsFor(preset)).toEqual(tuned);
    expect(service.isCustomized(preset.id)).toBe(true);
    expect(service.overrideCount()).toBe(1);

    // A fresh instance models a page reload: it must read the saved value.
    const reloaded = new ViewerHealthSettingsService();
    expect(reloaded.thresholdsFor(preset)).toEqual(tuned);
    expect(reloaded.isCustomized(preset.id)).toBe(true);
  });

  it("scopes overrides to their preset and clears only that preset", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);
    service.setOverride("other-preset", tuned);

    expect(service.isCustomized(preset.id)).toBe(true);
    expect(service.isCustomized("other-preset")).toBe(true);
    expect(service.overrideCount()).toBe(2);

    service.clearOverride(preset.id);

    expect(service.isCustomized(preset.id)).toBe(false);
    expect(service.thresholdsFor(preset)).toEqual(preset.health);
    expect(service.isCustomized("other-preset")).toBe(true);

    const reloaded = new ViewerHealthSettingsService();
    expect(reloaded.isCustomized(preset.id)).toBe(false);
    expect(reloaded.isCustomized("other-preset")).toBe(true);
  });

  it("ignores a write whose limits are not ordered fair-before-poor", () => {
    const service = new ViewerHealthSettingsService();

    service.setOverride(preset.id, {
      rttFairMs: 400,
      rttPoorMs: 200,
      kbpsFair: 500,
      kbpsPoor: 1500,
    });

    expect(service.isCustomized(preset.id)).toBe(false);
    expect(service.hasOverrides()).toBe(false);
    expect(service.thresholdsFor(preset)).toEqual(preset.health);
    expect(localStorage.getItem(VIEWER_HEALTH_STORAGE_KEY)).toBeNull();
  });

  it("clears every preset override at once", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);
    service.setOverride("other-preset", tuned);
    expect(service.hasOverrides()).toBe(true);
    expect(service.overrideCount()).toBe(2);

    const snapshot = service.clearAll();

    expect(snapshot).not.toBeNull();
    expect(service.hasOverrides()).toBe(false);
    expect(service.overrideCount()).toBe(0);
    expect(service.canUndoClearAll()).toBe(true);
    expect(service.isCustomized(preset.id)).toBe(false);
    expect(service.isCustomized("other-preset")).toBe(false);
    expect(service.thresholdsFor(preset)).toEqual(preset.health);

    const reloaded = new ViewerHealthSettingsService();
    expect(reloaded.hasOverrides()).toBe(false);
    expect(reloaded.isCustomized(preset.id)).toBe(false);
  });

  it("restores a snapshot after clearing every override", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);
    service.setOverride("other-preset", tuned);

    const snapshot = service.clearAll();
    expect(snapshot).not.toBeNull();

    service.restore(snapshot!);

    expect(service.overrideCount()).toBe(2);
    expect(service.canUndoClearAll()).toBe(false);
    expect(service.thresholdsFor(preset)).toEqual(tuned);
    expect(service.isCustomized("other-preset")).toBe(true);

    const reloaded = new ViewerHealthSettingsService();
    expect(reloaded.isCustomized(preset.id)).toBe(true);
    expect(reloaded.isCustomized("other-preset")).toBe(true);
  });

  it("keeps reset-all undo across service instances for the session", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);
    service.setOverride("other-preset", tuned);
    service.clearAll();
    expect(service.canUndoClearAll()).toBe(true);

    // A new instance models reopening the lab or reloading the tab.
    const reopened = new ViewerHealthSettingsService();
    expect(reopened.canUndoClearAll()).toBe(true);
    expect(reopened.overrideCount()).toBe(0);

    expect(reopened.undoClearAll()).toBe(true);
    expect(reopened.overrideCount()).toBe(2);
    expect(reopened.thresholdsFor(preset)).toEqual(tuned);
    expect(reopened.canUndoClearAll()).toBe(false);
    expect(reopened.undoClearAll()).toBe(false);

    const afterUndo = new ViewerHealthSettingsService();
    expect(afterUndo.overrideCount()).toBe(2);
    expect(afterUndo.canUndoClearAll()).toBe(false);
    expect(sessionStorage.getItem(VIEWER_HEALTH_UNDO_STORAGE_KEY)).toBeNull();
  });

  it("expires the reset-all undo after the session window", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);
    service.clearAll();
    expect(service.canUndoClearAll()).toBe(true);

    jest.advanceTimersByTime(VIEWER_HEALTH_UNDO_TTL_MS + 1);

    expect(service.canUndoClearAll()).toBe(false);
    expect(service.undoClearAll()).toBe(false);
    expect(sessionStorage.getItem(VIEWER_HEALTH_UNDO_STORAGE_KEY)).toBeNull();
  });

  it("discards an already-expired saved undo on load", () => {
    sessionStorage.setItem(
      VIEWER_HEALTH_UNDO_STORAGE_KEY,
      JSON.stringify({
        overrides: { [preset.id]: tuned },
        expiresAt: Date.now() - 1,
      }),
    );

    const service = new ViewerHealthSettingsService();

    expect(service.canUndoClearAll()).toBe(false);
    expect(sessionStorage.getItem(VIEWER_HEALTH_UNDO_STORAGE_KEY)).toBeNull();
  });

  it("drops a pending undo when an override changes again", () => {
    const service = new ViewerHealthSettingsService();
    service.setOverride(preset.id, tuned);
    service.clearAll();
    expect(service.canUndoClearAll()).toBe(true);

    service.setOverride(preset.id, tuned);

    expect(service.canUndoClearAll()).toBe(false);
    expect(sessionStorage.getItem(VIEWER_HEALTH_UNDO_STORAGE_KEY)).toBeNull();
  });

  it("does not expose its stored objects for mutation", () => {
    const service = new ViewerHealthSettingsService();
    const limits = service.thresholdsFor(preset);
    limits.rttFairMs = 999;

    expect(service.thresholdsFor(preset).rttFairMs).toBe(
      preset.health.rttFairMs,
    );
  });

  it("drops corrupted or invalid saved entries", () => {
    localStorage.setItem(
      VIEWER_HEALTH_STORAGE_KEY,
      JSON.stringify({
        valid: tuned,
        reversed: {
          rttFairMs: 300,
          rttPoorMs: 100,
          kbpsFair: 500,
          kbpsPoor: 1500,
        },
        negative: {
          rttFairMs: -1,
          rttPoorMs: 200,
          kbpsFair: 1500,
          kbpsPoor: 500,
        },
        missing: { rttFairMs: 100 },
      }),
    );

    const service = new ViewerHealthSettingsService();
    expect(service.isCustomized("valid")).toBe(true);
    expect(service.isCustomized("reversed")).toBe(false);
    expect(service.isCustomized("negative")).toBe(false);
    expect(service.isCustomized("missing")).toBe(false);

    localStorage.setItem(VIEWER_HEALTH_STORAGE_KEY, "{not json");
    expect(new ViewerHealthSettingsService().isCustomized("valid")).toBe(false);

    localStorage.setItem(VIEWER_HEALTH_STORAGE_KEY, "[]");
    expect(new ViewerHealthSettingsService().isCustomized("valid")).toBe(false);
  });
});
