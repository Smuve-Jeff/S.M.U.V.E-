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

@Injectable({ providedIn: 'root' })
export class QuantizationService {
  private logger = inject(LoggingService);

  // Predefined quantization presets (competitive with FL Studio Mobile, Cubasis)
  readonly presets: QuantizePreset[] = [
    // Straight presets
    { id: 'straight_1_4', name: 'Straight 1/4 Note', grid: 0.25, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_8', name: 'Straight 1/8 Note', grid: 0.125, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_16', name: 'Straight 1/16 Note', grid: 0.0625, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_32', name: 'Straight 1/32 Note', grid: 0.03125, swing: 0, humanize: 0, category: 'straight' },
    { id: 'straight_1_64', name: 'Straight 1/64 Note', grid: 0.015625, swing: 0, humanize: 0, category: 'straight' },

    // Swing presets
    // swing=0 → no delay (straight); swing=50 → moderate shuffle; swing=75 → heavy swing
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
    presetId: string
  ): QuantizeResult {
    const preset = this.getPreset(presetId);
    if (!preset) {
      this.logger.warn(`Unknown preset: ${presetId}`);
      return { quantized: notes, changedCount: 0, averageOffset: 0 };
    }

    let changedCount = 0;
    let totalOffset = 0;

    const quantized = notes.map(note => {
      const originalStep = note.step;

      // Step 1: Snap to grid
      let snappedStep = Math.round(note.step / preset.grid) * preset.grid;

      // Step 2: Apply swing
      // Swing delay is applied to odd-grid-indexed notes (the "offbeat" position
      // in each pair of subdivisions).  The delay amount is scaled so that:
      //   swing = 0   → no delay   (perfectly straight timing)
      //   swing = 50  → half a grid step added  (moderate shuffle)
      //   swing = 100 → one full grid step added (maximum triplet feel)
      // This matches industry-standard DAW behaviour where 0% = no swing and
      // higher values progressively push the offbeat later.
      if (preset.swing && preset.swing > 0) {
        const gridIndex = Math.round(note.step / preset.grid);
        // Apply swing delay to odd-numbered grid positions (the offbeat of each pair)
        if (gridIndex % 2 === 1) {
          // Maximum delay at swing=100 is one full grid interval; scale linearly.
          const swingAmount = preset.grid * (preset.swing / 100);
          snappedStep += swingAmount;
        }
      }

      // Step 3: Apply humanization (random jitter)
      if (preset.humanize && preset.humanize > 0) {
        const humanAmount = (preset.grid / 4) * (preset.humanize / 100);
        const jitter = (Math.random() - 0.5) * 2 * humanAmount;
        snappedStep += jitter;
      }

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
  retroactiveQuantize(notes: TrackNote[], presetId: string): QuantizeResult {
    // Same as quantizeNotes, but with extra logging
    const result = this.quantizeNotes(notes, presetId);
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
}
