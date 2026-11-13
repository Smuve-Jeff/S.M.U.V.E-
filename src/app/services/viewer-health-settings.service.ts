import { Injectable, OnDestroy, computed, signal } from "@angular/core";
import { isValidViewerHealth } from "./viewer-health";
import type { ViewerHealthThresholds } from "./viewer-health";

export const VIEWER_HEALTH_STORAGE_KEY = "smuve.cinema.viewer-health.v1";
export const VIEWER_HEALTH_UNDO_STORAGE_KEY =
  "smuve.cinema.viewer-health.undo.v1";
/** How long a reset-all can be reversed before the snapshot is discarded. */
export const VIEWER_HEALTH_UNDO_TTL_MS = 5 * 60_000;

export type ViewerHealthOverrides = Record<string, ViewerHealthThresholds>;

interface UndoSnapshot {
  overrides: ViewerHealthOverrides;
  expiresAt: number;
}

/**
 * Broadcaster overrides for a delivery preset's viewer-health limits. The
 * preset itself stays immutable, and surfaces without an override keep using
 * the preset defaults. Stored per browser so a tuned show survives a reload.
 *
 * Clearing every override leaves a time-limited undo snapshot in
 * sessionStorage, so leaving the lab or reloading the tab does not lose it.
 */
@Injectable({ providedIn: "root" })
export class ViewerHealthSettingsService implements OnDestroy {
  private readonly overrides = signal<ViewerHealthOverrides>(loadOverrides());
  private readonly undo = signal<UndoSnapshot | null>(loadUndo());
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  readonly canUndoClearAll = computed(() => this.undo() !== null);

  constructor() {
    this.scheduleUndoExpiry();
  }

  thresholdsFor(preset: {
    id: string;
    health: ViewerHealthThresholds;
  }): ViewerHealthThresholds {
    const override = this.overrides()[preset.id];
    return override ? { ...override } : { ...preset.health };
  }

  isCustomized(presetId: string): boolean {
    return this.overrides()[presetId] !== undefined;
  }

  hasOverrides(): boolean {
    return this.overrideCount() > 0;
  }

  overrideCount(): number {
    return Object.keys(this.overrides()).length;
  }

  setOverride(presetId: string, thresholds: ViewerHealthThresholds): void {
    if (!isValidViewerHealth(thresholds)) return;
    this.clearUndo();
    this.overrides.update((current) => ({
      ...current,
      [presetId]: { ...thresholds },
    }));
    persist(this.overrides());
  }

  clearOverride(presetId: string): void {
    this.clearUndo();
    this.overrides.update((current) => {
      if (!(presetId in current)) return current;
      const next = { ...current };
      delete next[presetId];
      return next;
    });
    persist(this.overrides());
  }

  /** Drop every preset override, remembering the map for a short undo. */
  clearAll(): ViewerHealthOverrides | null {
    if (!this.hasOverrides()) return null;
    const previous = this.snapshot();
    this.overrides.set({});
    persist(this.overrides());
    this.setUndo(previous);
    return previous;
  }

  /** Put the map cleared by reset-all back, if it has not expired. */
  undoClearAll(): boolean {
    const pending = this.undo();
    if (!pending) return false;
    if (pending.expiresAt <= Date.now()) {
      this.clearUndo();
      return false;
    }
    this.restore(pending.overrides);
    return true;
  }

  /** A detached copy of every override, safe to hold for undo. */
  snapshot(): ViewerHealthOverrides {
    const copy: ViewerHealthOverrides = {};
    for (const [presetId, limits] of Object.entries(this.overrides())) {
      copy[presetId] = { ...limits };
    }
    return copy;
  }

  /** Reinstate a snapshot, dropping any entry that is no longer valid. */
  restore(overrides: ViewerHealthOverrides): void {
    const next = sanitizeOverrides(overrides) ?? {};
    this.clearUndo();
    this.overrides.set(next);
    persist(next);
  }

  ngOnDestroy(): void {
    this.clearUndoTimer();
  }

  private setUndo(overrides: ViewerHealthOverrides): void {
    const snapshot: UndoSnapshot = {
      overrides,
      expiresAt: Date.now() + VIEWER_HEALTH_UNDO_TTL_MS,
    };
    this.undo.set(snapshot);
    persistUndo(snapshot);
    this.scheduleUndoExpiry();
  }

  private scheduleUndoExpiry(): void {
    this.clearUndoTimer();
    const pending = this.undo();
    if (!pending) return;
    const delay = Math.max(0, pending.expiresAt - Date.now());
    this.undoTimer = setTimeout(() => this.clearUndo(), delay);
  }

  private clearUndoTimer(): void {
    if (this.undoTimer !== null) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
  }

  private clearUndo(): void {
    this.clearUndoTimer();
    this.undo.set(null);
    persistUndo(null);
  }
}

function sanitizeOverrides(value: unknown): ViewerHealthOverrides | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const overrides: ViewerHealthOverrides = {};
  for (const [presetId, valueAtPreset] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (isValidViewerHealth(valueAtPreset as ViewerHealthThresholds)) {
      overrides[presetId] = {
        ...(valueAtPreset as ViewerHealthThresholds),
      };
    }
  }
  return overrides;
}

function loadOverrides(): ViewerHealthOverrides {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(VIEWER_HEALTH_STORAGE_KEY);
    return raw ? (sanitizeOverrides(JSON.parse(raw)) ?? {}) : {};
  } catch {
    return {};
  }
}

function persist(overrides: ViewerHealthOverrides): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VIEWER_HEALTH_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage can be blocked or full; the in-memory override still applies.
  }
}

function loadUndo(): UndoSnapshot | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(VIEWER_HEALTH_UNDO_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as { overrides?: unknown; expiresAt?: unknown };
    if (
      typeof record.expiresAt !== "number" ||
      record.expiresAt <= Date.now()
    ) {
      sessionStorage.removeItem(VIEWER_HEALTH_UNDO_STORAGE_KEY);
      return null;
    }
    const overrides = sanitizeOverrides(record.overrides);
    if (!overrides || !Object.keys(overrides).length) return null;
    return { overrides, expiresAt: record.expiresAt };
  } catch {
    return null;
  }
}

function persistUndo(snapshot: UndoSnapshot | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (snapshot) {
      sessionStorage.setItem(
        VIEWER_HEALTH_UNDO_STORAGE_KEY,
        JSON.stringify(snapshot),
      );
    } else {
      sessionStorage.removeItem(VIEWER_HEALTH_UNDO_STORAGE_KEY);
    }
  } catch {
    // Session storage can be blocked; undo then only lasts for this instance.
  }
}
