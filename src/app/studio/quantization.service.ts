import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from '../services/logging.service';
import type { TrackNote } from '../services/music-manager.service';

export interface QuantizePreset {
  id: string;
  name: string;
  grid: number; // 1/4 = 0.25, 1/8 = 0.125, 1/16 = 0.0625, 1/32 = 0.03125, 1/64 = 0.015625
  swing?: number; // 0-100% swing amount (affects every 2nd note)
  humanize?: number; // 0-100% randomization
  groove?: string; // optional groove template name
  category: 'straight' | 'swing' | 'triplet' | 'dotted' | 'custom';
}

export interface QuantizeResult {
  quantized: TrackNote[];
  changedCount: number;
  averageOffset: number; // average movement in steps
}

export interface QuantizeOptions {
  /**
   * Optional deterministic seed for humanize jitter.
   * Uses a tiny Mulberry32 PRNG so tests can assert exact output.
   */
  seed?: number;
  /**
   * Optional groove offsets (normalized to grid units).
   * Example: [0, 0.08, -0.03, 0.05] repeats every 4 grid positions.
   */
  grooveOffsets?: number[];
}

@Injectable({ providedIn: 'root' })
export class QuantizationService {
  private logger = inject(LoggingService);
  private readonly grooveTemplates: Record<string, number[]> = {
    mpc_16_light: [0, 0.06, -0.02, 0.03],
    mpc_16_heavy: [0, 0.1, -0.04, 0.06],
    laid_back: [0, 0.08, 0.04, 0.1],
    push_pull: [0, -0.04, 0.05, -0.02],
  };

  // Predefined quantization presets (competitive with FL Studio Mobile, Cubasis)
  readonly presets: QuantizePreset[] = [
    // Straight presets
    { id: 'straight_1_4', name: 'Straight 1/4 Note', grid: 0.25, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_8', name: 'Straight 1/8 Note', grid: 0.125, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_16', name: 'Straight 1/16 Note', grid: 0.0625, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_32', name: 'Straight 1/32 Note', grid: 0.03125, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_64', name: 'Straight 1/64 Note', grid: 0.015625, swing: 0, humanize: 0, category: 'straight' },

    // Swing presets
    { id: 'swing_1_8_50', name: 'Swing 1/8 (50%)', grid: 0.125, swing: 50, humanize: 0, category: 'swing' },
    { id: 'swing_1_8_66', name: 'Swing 1/8 (66%)', grid: 0.125, swing: 66, humanize: 0, category: 'swing' },
    { id: 'swing_1_8_75', name: 'Swing 1/8 (75%)', grid: 0.125, swing: 75, humanize: 0, category: 'swing' },
    { id: 'swing_1_16_50', name: 'Swing 1/16 (50%)', grid: 0.0625, swing: 50, humanize: 0, category: 'swing' },
    { id: 'swing_1_16_66', name: 'Swing 1/16 (66%)', grid: 0.0625, swing: 66, humanize: 0, category: 'swing' },
    { id: 'swing_1_16_75', name: 'Swing 1/16 (75%)', grid: 0.0625, swing: 75, humanize: 0, category: 'swing' },

    // Shuffle (triplet-based swing)
    { id: 'shuffle_1_16', name: 'Shuffle 1/16', grid: 0.0625, swing: 33, humanize: 0, category: 'swing' },
    { id: 'shuffle_1_8', name: 'Shuffle 1/8', grid: 0.125, swing: 33, humanize: 0, category: 'swing' },

    // Triplet presets
    { id: 'triplet_1_4', name: 'Triplet 1/4', grid: 0.333, swing: 0, humanize: 0, category: 'triplet' },
    { id: 'triplet_1_8', name: 'Triplet 1/8', grid: 0.1665, swing: 0, humanize: 0, category: 'triplet' },
    { id: 'triplet_1_16', name: 'Triplet 1/16', grid: 0.08325, swing: 0, humanize: 0, category: 'triplet' },

    // Dotted presets
    { id: 'dotted_1_8', name: 'Dotted 1/8', grid: 0.1875, swing: 0, humanize: 0, category: 'dotted' },
    { id: 'dotted_1_16', name: 'Dotted 1/16', grid: 0.09375, swing: 0, humanize: 0, category: 'dotted' },

    // Humanized presets (add randomization)
    { id: 'human_tight', name: 'Humanized (Tight)', grid: 0.0625, swing: 0, humanize: 5, category: 'custom' },
    { id: 'human_medium', name: 'Humanized (Medium)', grid: 0.0625, swing: 0, humanize: 15, category: 'custom' },
    { id: 'human_loose', name: 'Humanized (Loose)', grid: 0.0625, swing: 0, humanize: 30, category: 'custom' },
  ];

  // User-selected preset (stored in UI)
  selectedPresetId = signal<string>('straight_1_16');

  constructor() {
    this.logger.info('QuantizationService initialized with 20+ presets');
  }

  /**
   * Get a preset by ID
   */
  getPreset(id: string): QuantizePreset | undefined {
    return this.presets.find(p => p.id === id);
  }

  /**
   * Quantize a collection of notes to a specific preset.
   * Returns new quantized notes + statistics.
   */
  quantizeNotes(
    notes: TrackNote[],
    presetId: string,
    options: QuantizeOptions = {}
  ): QuantizeResult {
    const preset = this.getPreset(presetId);
    if (!preset) {
      this.logger.warn(`Unknown preset: ${presetId}`);
      return { quantized: notes, changedCount: 0, averageOffset: 0 };
    }

    let changedCount = 0;
    let totalOffset = 0;

    const random = this.createRandomSource(options.seed);

    const quantized = notes.map((note, index) => {
      const originalStep = note.step;

      // Step 1: Snap to grid
      let snappedStep = Math.round(note.step / preset.grid) * preset.grid;

      const gridIndex = Math.round(note.step / preset.grid);

      // Step 2: Apply swing
      // Swing delay is applied to odd-grid-indexed notes (the offbeat position
      // in each pair of subdivisions). Higher swing values push those notes later.
      if (preset.swing && preset.swing > 0) {
        // Apply swing delay to odd-numbered grid positions (the offbeat of each pair)
        if (gridIndex % 2 === 1) {
          // Maximum delay at swing=100 is one full grid interval; scale linearly.
          const swingAmount = preset.grid * (preset.swing / 100);
          snappedStep += swingAmount;
        }
      }

      // Step 2.5: Optional groove template
      const groovePattern =
        options.grooveOffsets ??
        (preset.groove ? this.grooveTemplates[preset.groove] : undefined);
      if (groovePattern && groovePattern.length > 0) {
        const groove = groovePattern[Math.abs(gridIndex) % groovePattern.length] ?? 0;
        snappedStep += groove * preset.grid;
      }

      // Step 3: Apply humanization (random jitter)
      if (preset.humanize && preset.humanize > 0) {
        const humanAmount = (preset.grid / 4) * (preset.humanize / 100);
        const jitter = (random(index) - 0.5) * 2 * humanAmount;
        snappedStep += jitter;
      }

      snappedStep = Math.max(0, snappedStep);

      // Track changes
      const offset = Math.abs(snappedStep - originalStep);
      if (offset > 0.001) {
        changedCount++;
        totalOffset += offset;
      }

      return {
        ...note,
        step: snappedStep,
      };
    });

    const averageOffset = changedCount > 0 ? totalOffset / changedCount : 0;

    this.logger.info(
      `Quantized ${quantized.length} notes (${changedCount} moved) with preset "${preset.name}", avg offset: ${averageOffset.toFixed(4)} steps`
    );

    return { quantized, changedCount, averageOffset };
  }

  /**
   * Quantize to the currently selected preset
   */
  quantizeWithSelected(notes: TrackNote[]): QuantizeResult {
    return this.quantizeNotes(notes, this.selectedPresetId());
  }

  /**
   * Create a custom preset (user-defined)
   */
  createCustomPreset(config: Omit<QuantizePreset, 'id' | 'category'>): QuantizePreset {
    const id = `custom_${Date.now()}`;
    const preset: QuantizePreset = {
      ...config,
      id,
      category: 'custom',
    };
    this.presets.push(preset);
    this.logger.info(`Created custom preset: ${config.name}`);
    return preset;
  }

  /**
   * Get presets by category
   */
  getPresetsByCategory(category: QuantizePreset['category']): QuantizePreset[] {
    return this.presets.filter(p => p.category === category);
  }

  /**
   * Retroactive quantize: quantize already-recorded notes
   * (as opposed to quantizing during input)
   */
  retroactiveQuantize(
    notes: TrackNote[],
    presetId: string,
    options: QuantizeOptions = {}
  ): QuantizeResult {
    // Same as quantizeNotes, but with extra logging
    const result = this.quantizeNotes(notes, presetId, options);
    this.logger.info(
      `Retroactive quantize: ${result.changedCount}/${notes.length} notes adjusted`
    );
    return result;
  }

  /**
   * Get grid snapping position (for UI visualization)
   */
  getSnappedPosition(step: number, presetId: string): number {
    const preset = this.getPreset(presetId);
    if (!preset) return step;
    return Math.round(step / preset.grid) * preset.grid;
  }

  /**
   * Calculate how many grid divisions fit in a measure (16 steps = 1 bar)
   */
  getGridDivisionsPerBar(presetId: string): number {
    const preset = this.getPreset(presetId);
    if (!preset) return 16;
    return Math.round(1 / preset.grid);
  }

  private createRandomSource(seed?: number): (index: number) => number {
    if (!Number.isFinite(seed)) {
      return () => Math.random();
    }
    return (index: number) => {
      let t = (((seed as number) >>> 0) ^ ((index + 1) * 0x9e3779b9)) >>> 0;
      t = (t + 0x6d2b79f5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
