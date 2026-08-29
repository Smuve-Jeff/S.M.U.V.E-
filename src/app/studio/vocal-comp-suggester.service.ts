import { Injectable, inject, signal } from '@angular/core';
import { SmartRecordingService, CompTake } from './smart-recording.service';
import { LoggingService } from '../services/logging.service';

/** A ranked recommendation for the "best" take in a comp group. */
export interface CompSuggestion {
  takeId: string;
  takeNumber: number;
  /** 0-100 composite score — higher is better. */
  score: number;
  /** Human-readable drivers behind the ranking. */
  reasons: string[];
  /** Was this ranked using the live-muted set (excludes muted takes)? */
  excludedMuted: number;
}

/**
 * VocalCompSuggesterService — automatic vocal comp suggestion.
 * Ranks the takes of a comp group by an offline, deterministic heuristic
 * (dynamics consistency toward a target peak, timing consistency to the median
 * take length, and region coverage), so a "use this take" suggestion is
 * instant, explainable and testable — no network round-trip required while the
 * artist comps.
 *
 * Exposes the pure ranking ({@link suggestBestTake}) plus a convenience that
 * applies the pick straight to the comp's selection
 * ({@link applySuggestion}).
 */
@Injectable({ providedIn: 'root' })
export class VocalCompSuggesterService {
  private readonly smartRecording = inject(SmartRecordingService);
  private readonly logger = inject(LoggingService);

  /** Target dynamics (dBFS) we consider "healthiest" for a vocal take. */
  private readonly targetDb = -6;
  /** Active load-balance halfway between crossfade and pure dynamics. */
  private readonly compressionRatio = 50;
  /** Whether the suggester is currently computing (kept for UI affordance). */
  computing = signal(false);

  /**
   * Rank the takes of a comp group and return the best non-muted pick.
   * Returns null when the group is missing or has no usable (non-muted) takes.
   */
  suggestBestTake(groupId: string): CompSuggestion | null {
    const group = this.smartRecording.compGroups().find((g) => g.id === groupId);
    if (!group || group.takes.length === 0) return null;

    const usable = group.takes.filter((t) => !t.isMuted && t.blob !== null);
    if (usable.length === 0) return null;

    const durations = usable.map((t) => t.durationMs);
    const median = this.median(durations);

    const ranked = usable
      .map((take) => this.scoreTake(take, median))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    return {
      takeId: best.take.id,
      takeNumber: best.take.takeNumber,
      score: best.score,
      reasons: best.reasons,
      excludedMuted: group.takes.length - usable.length,
    };
  }

  /** Suggest for the currently-active comp group, if any. */
  suggestActiveGroup(): CompSuggestion | null {
    const id = this.smartRecording.activeCompGroupId();
    if (!id) return null;
    return this.suggestBestTake(id);
  }

  /**
   * Rank then immediately select the winner as the group's comp.
   * Returns the suggestion that was applied, or null.
   */
  applySuggestion(groupId: string): CompSuggestion | null {
    const suggestion = this.suggestBestTake(groupId);
    if (!suggestion) return null;
    this.smartRecording.selectCompTake(groupId, suggestion.takeId);
    this.logger.debug(
      `VocalCompSuggester: applied take ${suggestion.takeNumber} ` +
        `(score ${suggestion.score}) to ${groupId}`
    );
    return suggestion;
  }

  private scoreTake(
    take: CompTake,
    medianDurationMs: number
  ): { take: CompTake; score: number; reasons: string[] } {
    const reasons: string[] = [];

    // Guard against sparse/missing take metadata so a comp decision is never
    // corrupted by NaN (tests and older persisted takes may omit region bars).
    const peakL = isFinite(take.peakDbL) ? take.peakDbL : -60;
    const peakR = isFinite(take.peakDbR) ? take.peakDbR : -60;
    const durationMs =
      isFinite(take.durationMs) && take.durationMs > 0
        ? take.durationMs
        : medianDurationMs;
    const regionStart = isFinite(take.regionStartBar) ? take.regionStartBar : 1;
    const regionEnd = isFinite(take.regionEndBar)
      ? take.regionEndBar
      : regionStart;

    // ── Dynamics consistency — favor ~targetDb peak, penalize extremes ──
    const peak = Math.max(peakL, peakR);
    const peakDelta = Math.abs(peak - this.targetDb);
    const dynamicsScore = this.clamp(100 - peakDelta * 8, 0, 100);
    if (peakDelta <= 2) {
      reasons.push(`Clean headroom around ${this.targetDb} dB`);
    } else if (peak > this.targetDb) {
      reasons.push(`Hot take (${peak.toFixed(0)} dB) — near clipping`);
    } else {
      reasons.push(`Quiet take (${peak.toFixed(0)} dB)`);
    }

    // ── Timing consistency — prefer lengths near the group median ──
    const median = Math.max(1, medianDurationMs);
    const timingDrift = Math.abs(durationMs - median) / median;
    const timingScore = this.clamp(100 - timingDrift * 100, 0, 100);
    if (timingDrift <= 0.05) {
      reasons.push('Length matches the median take');
    } else if (timingDrift > 0.3) {
      reasons.push(`Much ${take.durationMs > median ? 'longer' : 'shorter'} than the median`);
    }

    // ── Region coverage — prefer takes spanning the whole comp region ──
    const regionSpan = Math.max(0, regionEnd - regionStart);
    const regionScore = this.clamp(regionSpan * 10, 0, 100);
    if (regionSpan >= 4) {
      reasons.push('Covers the full section');
    }

    const score =
      dynamicsScore * 0.5 + timingScore * 0.35 + regionScore * 0.15;

    return { take, score: Math.round(score), reasons };
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}