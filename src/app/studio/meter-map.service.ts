import { Injectable, computed, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";

/** A time-signature change pinned to an absolute song step. */
export interface MeterMarker {
  id: string;
  step: number;
  beats: number;
  unit: number;
}

export const METER_OPTIONS = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "12/8"];
const STORAGE_KEY = "smuve_meter_map_v1";

/**
 * Song meter map — time-signature changes across the arrangement.
 *
 * The sequencer grid remains sixteenth-note based. A meter marker changes the
 * beat grouping, count-in length and metronome accents from its step onward;
 * it does not silently re-time existing clips. As with tempo, markers store
 * absolute steps so they stay put when the timeline grows.
 */
@Injectable({ providedIn: "root" })
export class MeterMapService {
  private readonly engine = inject(AudioEngineService);

  readonly markers = signal<MeterMarker[]>(this.load());
  readonly markerCount = computed(() => this.markers().length);

  constructor() {
    this.ensureBaseMarker();
    this.syncToEngine();
  }

  /** The marker governing a step, or the transport's global meter. */
  meterAtStep(step: number): MeterMarker | null {
    let found: MeterMarker | null = null;
    for (const marker of this.markers()) {
      if (marker.step <= step) found = marker;
      else break;
    }
    return found;
  }

  addMarker(
    step: number,
    beats: number,
    unit: number,
  ): MeterMarker | null {
    const safe = this.normalize(beats, unit);
    if (!safe) return null;
    const safeStep = Math.max(0, Math.round(step));
    if (this.markers().length === 0 && safeStep > 0) {
      this.markers.set([
        {
          id: `meter_base_${Date.now()}`,
          step: 0,
          ...this.currentMeter(),
        },
      ]);
    }
    const existing = this.markers().find((marker) => marker.step === safeStep);
    if (existing) {
      this.updateMarker(existing.id, safe);
      return { ...existing, ...safe };
    }
    const marker: MeterMarker = {
      id: `meter_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
      step: safeStep,
      ...safe,
    };
    this.markers.update((list) => this.sorted([...list, marker]));
    this.syncToEngine();
    return marker;
  }

  updateMarker(
    id: string,
    patch: Partial<Pick<MeterMarker, "step" | "beats" | "unit">>,
  ): void {
    const current = this.markers().find((marker) => marker.id === id);
    if (!current) return;
    const safe = this.normalize(
      patch.beats ?? current.beats,
      patch.unit ?? current.unit,
    );
    if (!safe) return;
    const step =
      patch.step === undefined
        ? current.step
        : Math.max(0, Math.round(patch.step));
    if (
      step !== current.step &&
      this.markers().some((marker) => marker.id !== id && marker.step === step)
    ) {
      return;
    }
    this.markers.update((list) =>
      this.sorted(
        list.map((marker) =>
          marker.id === id ? { ...marker, ...safe, step } : marker,
        ),
      ),
    );
    this.syncToEngine();
  }

  removeMarker(id: string): void {
    this.markers.update((list) => list.filter((marker) => marker.id !== id));
    this.syncToEngine();
  }

  /** Replace the map from a saved project. Invalid entries are dropped. */
  replaceAll(markers: readonly MeterMarker[]): void {
    let next = Array.isArray(markers)
      ? this.sorted(
          markers
            .filter(
              (marker) =>
                marker &&
                Number.isFinite(marker.step) &&
                Number.isFinite(marker.beats) &&
                Number.isFinite(marker.unit) &&
                this.normalize(marker.beats, marker.unit) !== null,
            )
            .map((marker, index) => ({
              id: String(marker.id || `meter_restored_${index}`),
              step: Math.max(0, Math.round(marker.step)),
              ...this.normalize(marker.beats, marker.unit)!,
            })),
        )
      : [];
    if (next.length > 0 && next[0].step > 0) {
      next = [
        {
          id: `meter_base_${Date.now()}`,
          step: 0,
          ...this.currentMeter(),
        },
        ...next,
      ];
    }
    this.markers.set(next);
    this.syncToEngine();
  }

  clear(): void {
    this.markers.set([]);
    this.syncToEngine();
  }

  private ensureBaseMarker(): void {
    const list = this.markers();
    if (list.length === 0 || list[0].step === 0) return;
    this.markers.set([
      {
        id: `meter_base_${Date.now()}`,
        step: 0,
        ...this.currentMeter(),
      },
      ...list,
    ]);
  }

  private currentMeter(): { beats: number; unit: number } {
    const signature = this.engine.timeSignature?.() ?? { beats: 4, unit: 4 };
    return {
      beats: Math.max(1, Math.min(16, Math.round(signature.beats))),
      unit: [2, 4, 8, 16].includes(signature.unit) ? signature.unit : 4,
    };
  }

  private normalize(
    beats: number,
    unit: number,
  ): { beats: number; unit: number } | null {
    if (!Number.isFinite(beats) || !Number.isFinite(unit)) return null;
    const safeBeats = Math.round(beats);
    const safeUnit = Math.round(unit);
    if (safeBeats < 1 || safeBeats > 16) return null;
    if (![2, 4, 8, 16].includes(safeUnit)) return null;
    return { beats: safeBeats, unit: safeUnit };
  }

  private sorted(list: MeterMarker[]): MeterMarker[] {
    return [...list].sort((a, b) => a.step - b.step || a.beats - b.beats);
  }

  private syncToEngine(): void {
    const map = this.markers().map(({ step, beats, unit }) => ({
      step,
      beats,
      unit,
    }));
    const apply = (this.engine as Partial<AudioEngineService>).setMeterMap;
    if (typeof apply === "function") {
      apply.call(this.engine, map);
    }
    this.persist();
  }

  private load(): MeterMarker[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as MeterMarker[];
      if (!Array.isArray(parsed)) return [];
      return this.sorted(
        parsed
          .filter(
            (marker) =>
              marker &&
              Number.isFinite(marker.step) &&
              Number.isFinite(marker.beats) &&
              Number.isFinite(marker.unit) &&
              this.normalize(marker.beats, marker.unit) !== null,
          )
          .map((marker, index) => ({
            id: String(marker.id || `meter_${index}`),
            step: Math.max(0, Math.round(marker.step)),
            ...this.normalize(marker.beats, marker.unit)!,
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
