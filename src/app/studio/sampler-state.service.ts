import { Injectable, inject, signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { Sampler } from "./sampler";

/**
 * The one shared Sampler engine for the Studio.
 *
 * The Sampler surface used to construct a private Sampler on mount, which
 * made the pads unreachable from any other layer. The Director now needs to
 * route sliced pads into that same visible sampler, so ownership moved here:
 * the component binds to this instance, and lifecycle cleanup is intentionally
 * absent — the service is a root singleton, so the engine can survive the
 * surface unmounting.
 *
 * Pad edits bump `padVersion` so a mounted Sampler surface can re-render its
 * zone list without polling.
 */
@Injectable({ providedIn: "root" })
export class SamplerStateService {
  private audio = inject(AudioEngineService);

  private sampler: Sampler | null = null;
  private initPromise: Promise<Sampler> | null = null;

  /** Bumped whenever pads change so the visible Sampler surface reacts. */
  readonly padVersion = signal(0);

  /**
   * Lazily create and initialize the shared engine. Safe to call repeatedly;
   * concurrent callers share the same in-flight promise.
   */
  async ensureSampler(): Promise<Sampler> {
    if (this.sampler) return this.sampler;
    if (this.initPromise) return this.initPromise;

    const ctx = this.audio.ctx as AudioContext | undefined;
    if (!ctx) throw new Error("The audio context is not available yet.");

    const sampler = new Sampler(ctx);
    this.initPromise = sampler
      .init()
      .then(() => {
        sampler.connect(ctx.destination);
        this.sampler = sampler;
        return sampler;
      })
      .catch((error) => {
        this.initPromise = null;
        throw error;
      });
    return this.initPromise;
  }

  /** Current shared engine, if it has been initialized. */
  current(): Sampler | null {
    return this.sampler;
  }

  /** Pitches currently loaded in the shared pads. */
  getLoadedPitches(): number[] {
    return this.sampler?.getLoadedPitches() ?? [];
  }

  /**
   * Load slices onto consecutive pads starting from `basePitch`, skipping any
   * pitch that already holds a sample. Returns the MIDI pitches actually used.
   */
  async loadSlices(
    slices: AudioBuffer[],
    basePitch = 60,
  ): Promise<number[]> {
    if (slices.length === 0) return [];
    const sampler = await this.ensureSampler();
    const used = new Set(this.getLoadedPitches());
    const loadedPitches: number[] = [];
    let pitch = Math.max(0, Math.min(127, basePitch));

    for (const slice of slices) {
      while (pitch <= 127 && used.has(pitch)) pitch++;
      if (pitch > 127) break;
      sampler.loadSampleToSlot(pitch, slice, 0);
      used.add(pitch);
      loadedPitches.push(pitch);
      pitch++;
    }

    if (loadedPitches.length > 0) {
      this.padVersion.update((version) => version + 1);
    }
    return loadedPitches;
  }
}
