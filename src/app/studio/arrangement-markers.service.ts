import { Injectable, computed, signal } from "@angular/core";

/** A named arrangement location. `time` is in bars, like the arrangement ruler. */
export interface ArrangementMarker {
  id: string;
  name: string;
  time: number;
  color: string;
}

const STORAGE_KEY = "smuve_arrangement_markers_v1";

/**
 * Arrangement markers used to live inside the ArrangementView component, so
 * they vanished whenever the workspace switched views — and they were never
 * part of a project. Keeping them in a root service makes the list survive
 * view changes and lets ProjectWorkspace save/restore it with everything else.
 *
 * The localStorage copy is only a crash-recovery default for a brand-new
 * session; opening a project overwrites it with that project's markers.
 */
@Injectable({ providedIn: "root" })
export class ArrangementMarkersService {
  readonly markers = signal<ArrangementMarker[]>(this.load());
  readonly markerCount = computed(() => this.markers().length);

  add(name: string, time: number, color = "#facc15"): ArrangementMarker | null {
    const safeTime = Number.isFinite(time) ? Math.max(0, time) : null;
    const label = String(name ?? "").trim();
    if (safeTime === null || !label) return null;
    const marker: ArrangementMarker = {
      id: `marker_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
      name: label,
      time: safeTime,
      color,
    };
    this.markers.update((list) =>
      [...list, marker].sort((a, b) => a.time - b.time),
    );
    this.persist();
    return marker;
  }

  remove(id: string): void {
    this.markers.update((list) => list.filter((marker) => marker.id !== id));
    this.persist();
  }

  clear(): void {
    this.markers.set([]);
    this.persist();
  }

  /** Replace the list from a saved project, dropping malformed entries. */
  replaceAll(markers: readonly ArrangementMarker[]): void {
    const next = Array.isArray(markers)
      ? markers
          .filter(
            (marker) =>
              marker &&
              typeof marker.name === "string" &&
              marker.name.trim().length > 0 &&
              Number.isFinite(marker.time) &&
              marker.time >= 0,
          )
          .map((marker, index) => ({
            id: String(marker.id || `marker_restored_${index}`),
            name: marker.name.trim(),
            time: marker.time,
            color:
              typeof marker.color === "string" && marker.color
                ? marker.color
                : "#facc15",
          }))
          .sort((a, b) => a.time - b.time)
      : [];
    this.markers.set(next);
    this.persist();
  }

  private load(): ArrangementMarker[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ArrangementMarker[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (marker) =>
            marker &&
            typeof marker.name === "string" &&
            Number.isFinite(marker.time) &&
            marker.time >= 0,
        )
        .map((marker, index) => ({
          id: String(marker.id || `marker_${index}`),
          name: marker.name,
          time: marker.time,
          color: marker.color || "#facc15",
        }))
        .sort((a, b) => a.time - b.time);
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.markers()));
    } catch {
      // Storage unavailable: markers still work for this session.
    }
  }
}
