/**
 * Where a vocal take starts on the arrangement, in bars.
 *
 * "Trim Silence" removes leading silence from the take, so the surviving audio
 * now begins `headTrimSeconds` into the performance. Every routed take used to
 * be added at bar 0, which slid the vocal earlier against the backing track by
 * exactly the amount of silence that was trimmed. Keeping the first kept sample
 * at the bar it was sung on is what makes a trimmed vocal stay behind its
 * backing track.
 *
 * The value is intentionally not snapped: the arrangement stores fractional bar
 * starts (see `takePlacementFor`), and rounding to a 16th would move a take by
 * up to half a step.
 */
/** Length of one bar in seconds at `tempo` (4/4 unless told otherwise). */
export function secondsPerBarForTempo(tempo: number, beatsPerBar = 4): number {
  const beats =
    Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : 4;
  const bpm = Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
  return (60 / bpm) * beats;
}

export function clipStartBarForHeadTrim(options: {
  /** Seconds of leading audio removed from the take by an edit. */
  headTrimSeconds: number;
  /** Project tempo in BPM. */
  tempo: number;
  /** Beats in a bar (4 for 4/4). */
  beatsPerBar?: number;
}): number {
  const trim = Number.isFinite(options.headTrimSeconds)
    ? Math.max(0, options.headTrimSeconds)
    : 0;
  return trim / secondsPerBarForTempo(options.tempo, options.beatsPerBar);
}
