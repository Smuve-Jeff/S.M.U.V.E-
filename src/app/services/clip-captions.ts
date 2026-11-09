/**
 * Caption cues — timed text drawn over the picture, the way CapCut/VN auto
 * captions and broadcast lower-thirds work.
 *
 * A cue is timeline-global (seconds on the edit, not per-clip), so one
 * caption track covers dialogue across cuts. Cues come from three places:
 * live speech capture (the lab's SpeechRecognitionService while the
 * timeline plays), the voiceover lane (each line becomes a cue over its
 * clip), and manual entry in the toolbar.
 */

export interface CaptionCue {
  id: string;
  /** Timeline seconds. */
  start: number;
  end: number;
  text: string;
}

export function mintCaptionId(): string {
  return `cap-${Math.random().toString(36).slice(2, 9)}`;
}

export function sortCaptions(cues: CaptionCue[]): CaptionCue[] {
  return [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function sanitizeCaptions(value: unknown): CaptionCue[] {
  if (!Array.isArray(value)) return [];
  const out: CaptionCue[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const cue = entry as Partial<CaptionCue>;
    if (typeof cue.text !== 'string' || !cue.text.trim()) continue;
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)) continue;
    const start = Math.max(0, cue.start as number);
    const end = Math.max(start + 0.1, cue.end as number);
    out.push({
      id: typeof cue.id === 'string' && cue.id ? cue.id : mintCaptionId(),
      start,
      end,
      text: cue.text.trim().slice(0, 280),
    });
  }
  return sortCaptions(out);
}

/** The cue active at a timeline instant, if any. */
export function captionAt(cues: CaptionCue[] | undefined, time: number): CaptionCue | null {
  if (!cues?.length) return null;
  return cues.find((cue) => time >= cue.start && time < cue.end) ?? null;
}

/**
 * Estimate a cue's duration from its text at a readable pace (~17 chars/sec,
 * min 1.2s, max 7s) — used when speech capture ends a phrase.
 */
export function estimateCaptionDuration(text: string): number {
  return Math.max(1.2, Math.min(7, text.length / 17));
}
