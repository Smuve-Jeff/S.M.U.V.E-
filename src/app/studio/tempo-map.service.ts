import { Injectable, computed, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";

/** A tempo change pinned to an absolute song step (16 steps = one 4/4 bar). */
export interface TempoMarker {
  /** Stable id for the marker list UI. */
  id: string;
  /** Absolute song step the new tempo takes effect on. */
  step: number;
  /** Beats per minute from this step onward. */
  bpm: number;
}

export const STEPS_PER_BAR = 16;
const STORAGE_KEY = "smuve_tempo_map_v1";
const MIN_BPM = 20;
const MAX_BPM = 300;

/**
 * Tempo map — multiple tempo changes across a song.
 *
 * FL Mobile, Cubasis and Logic all let a song speed up or slow down: a
 * half-time chorus, a ritardando outro, a double-time breakdown. The engine
 * had one global tempo, so none of that was expressible and every export
 * rendered at a single BPM.
 *
 * The map stores absolute steps rather than bars so a marker stays put if the
 * grid ever grows, and lookups are "the last marker at or before this step".
 * Both schedulers read it: the AudioWorklet gets the map pushed to it (it owns
 * the tick clock) and the setInterval fallback asks `tempoAtStep()` per step.
 */
@Injectable({ providedIn: "root" })
export class TempoMapService {
  /** Lazy: the engine injects a lot of graph; keep this service cheap to build. */
  private readonly engine = inject(AudioEngineService);

  readonly markers = signal<TempoMarker[]>(this.load());
  readonly markerCount = computed(() => this.markers().length);
  readonly hasMap = computed(() => this.markers().length > 0);

  constructor() {
    // A restored map must reach the transport before the first play press.
    this.syncToEngine();
  }

  /**
   * Push the current map to the engine and the durable store. Called from the
   * constructor and after every mutation, so the transport never runs one
   * edit behind the panel.
   */
  private syncToEngine(): void {
    const map = this.markers().map(({ step, bpm }) => ({ step, bpm }));
    const apply = (this.engine as Partial<AudioEngineService>).setTempoMap;
    if (typeof apply === "function") {
      apply.call(this.engine, map);
    }
    this.persist();
  }

  /** Tempo in force at an absolute step. Falls back to the global tempo. */
  bpmAtStep(step: number): number {
    let bpm = this.engine.tempo();
    for (const marker of this.markers()) {
      if (marker.step <= step) bpm = marker.bpm;
      else break;
    }
    return bpm;
  }

  /** Bar label for a marker, 1-based like the arrangement ruler. */
  barOf(marker: TempoMarker): number {
    return Math.floor(marker.step / STEPS_PER_BAR) + 1;
  }

  /**
   * Add a marker. A second marker on the same step would be ambiguous — the
   * later one would silently win — so an existing marker is retuned instead.
   */
  addMarker(step: number, bpm: number): TempoMarker | null {
    const safeStep = Math.max(0, Math.round(step));
    const safeBpm = this.clampBpm(bpm);
    if (safeBpm === null) return null;
    const existing = this.markers().find((marker) => marker.step === safeStep);
    if (existing) {
      this.updateMarker(existing.id, { bpm: safeBpm });
      return { ...existing, bpm: safeBpm };
    }
    const marker: TempoMarker = {
      id: `tempo_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
      step: safeStep,
      bpm: safeBpm,
    };
    this.markers.update((list) => this.sorted([...list, marker]));
    this.syncToEngine();
    return marker;
  }

  updateMarker(id: string, patch: Partial<Pick<TempoMarker, "step" | "bpm">>) {
    const next: Partial<TempoMarker> = {};
    if (patch.bpm !== undefined) {
      const bpm = this.clampBpm(patch.bpm);
      if (bpm !== null) next.bpm = bpm;
    }
    if (patch.step !== undefined) next.step = Math.max(0, Math.round(patch.step));
    if (Object.keys(next).length === 0) return;
    this.markers.update((list) =>
      this.sorted(list.map((marker) => (marker.id === id ? { ...marker, ...next } : marker))),
    );
    this.syncToEngine();
  }

  removeMarker(id: string) {
    this.markers.update((list) => list.filter((marker) => marker.id !== id));
    this.syncToEngine();
  }

  /**
   * Replace the whole map from a saved project. Invalid entries are dropped
   * rather than failing the load, and the engine is re-synced exactly once so
   * a reopened song runs the saved tempo changes from the first play press.
   */
  replaceAll(markers: readonly TempoMarker[]): void {
    const next = Array.isArray(markers)
      ? this.sorted(
          markers
            .filter(
              (marker) =>
                marker &&
                Number.isFinite(marker.step) &&
                Number.isFinite(marker.bpm) &&
                this.clampBpm(marker.bpm) !== null,
            )
            .map((marker, index) => ({
              id: String(marker.id || `tempo_restored_${index}`),
              step: Math.max(0, Math.round(marker.step)),
              bpm: this.clampBpm(marker.bpm)!,
            })),
        )
      : [];
    this.markers.set(next);
    this.syncToEngine();
  }

  /** Drop the whole map — the song returns to one tempo. */
  clear() {
    this.markers.set([]);
    this.syncToEngine();
  }

  private clampBpm(value: number): number | null {
    if (!Number.isFinite(value)) return null;
    const bpm = Math.round(value * 10) / 10;
    if (bpm < MIN_BPM || bpm > MAX_BPM) return null;
    return bpm;
  }

  private sorted(list: TempoMarker[]): TempoMarker[] {
    return [...list].sort((a, b) => a.step - b.step || a.bpm - b.bpm);
  }

  private load(): TempoMarker[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as TempoMarker[];
      if (!Array.isArray(parsed)) return [];
      return this.sorted(
        parsed
          .filter(
            (marker) =>
              marker &&
              Number.isFinite(marker.step) &&
              Number.isFinite(marker.bpm),
          )
          .map((marker) => ({
            id: String(marker.id ?? `tempo_${marker.step}`),
            step: Math.max(0, Math.round(marker.step)),
            bpm: marker.bpm,
          })),
      );
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.markers()));
    } catch {}
  }
}
