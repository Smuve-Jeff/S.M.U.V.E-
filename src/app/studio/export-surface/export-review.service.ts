import { Injectable, signal } from "@angular/core";

import type { ExportAnalysisVerdict } from "./export-analysis.util";

/** A rendered, measured mixdown waiting for the artist's delivery decision. */
export interface PendingMixdown {
  /**
   * Mix bus before the master chain. The master is applied to this buffer at
   * review and delivery time, so only one full-length mix is retained.
   */
  preMaster: AudioBuffer;
  format: string;
  bitrate: number;
  supportsBitrate: boolean;
  formatLabel: string;
  sampleRate: 44100 | 48000;
}

interface StoredReview {
  pending: PendingMixdown;
  analysis: ExportAnalysisVerdict | null;
  /** The project the render was made from, so it cannot leak into another. */
  project: string;
  /** True once the artist left for Mastering and may have changed the chain. */
  needsRefresh: boolean;
}

/**
 * Holds the reviewed render across a view swap.
 *
 * Export and Mastering are separate `*ngSwitch` views, so leaving Export
 * destroyed the measured file and the artist had to render the whole project
 * again just to download what they had already reviewed. The review lives
 * here instead: discarding, downloading, or switching projects still clears
 * it, but visiting Mastering does not.
 */
@Injectable({ providedIn: "root" })
export class ExportReviewService {
  private readonly review = signal<StoredReview | null>(null);

  /** Park a freshly measured render, replacing any earlier one. */
  keep(
    pending: PendingMixdown,
    analysis: ExportAnalysisVerdict | null,
    project: string,
  ): void {
    this.review.set({ pending, analysis, project, needsRefresh: false });
  }

  /**
   * Return the review only if it belongs to the project that is open now.
   * A render from another project is cleared rather than shown beside a
   * different arrangement.
   */
  restore(project: string): StoredReview | null {
    const review = this.review();
    if (!review) return null;
    if (review.project !== project) {
      this.review.set(null);
      return null;
    }
    return review;
  }

  /**
   * Note that the chain may have changed since the render. The bytes cannot
   * be corrected after the fact, so the surface offers a refresh instead of
   * implying the retained file already includes the new master.
   */
  markNeedsRefresh(): void {
    const review = this.review();
    if (review) this.review.set({ ...review, needsRefresh: true });
  }

  clear(): void {
    this.review.set(null);
  }
}
