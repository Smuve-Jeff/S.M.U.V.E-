import type { Command, HistoryService } from "./history.service";

/**
 * Record a BPM change on the project history stack.
 *
 * Tempo is not stored in a track: it lives on the engine's shared signal, so
 * unlike a note or a clip edit every BPM control used to write that signal
 * directly and Ctrl+Z skipped it. Surfaces call this instead, which keeps the
 * undo label, the no-op check and the coalescing rule in one place.
 *
 * `mergeKey` is for typed entry: a number field fires on every keystroke, so
 * one typing burst has to collapse into a single step whose undo returns the
 * BPM the artist started from. Nudges, presets and tap tempo pass no key —
 * each press is its own intent and its own step.
 *
 * The caller applies the change first and passes the value the transport
 * actually accepted (after clamping), so a no-op nudge at the ceiling records
 * nothing and the stack cannot fill with empty steps.
 */
export function recordTempoChange(
  history: Pick<HistoryService, "execute" | "coalesce">,
  before: number,
  after: number,
  apply: (bpm: number) => void,
  mergeKey?: string,
): void {
  if (!Number.isFinite(after) || after === before) return;
  const label = Number.isInteger(after) ? String(after) : after.toFixed(1);
  const command: Command = {
    // HistoryService keeps the first label of a coalesced step, so a merged
    // entry has to stay tempo-agnostic instead of echoing one keystroke's BPM.
    name: mergeKey ? "Set tempo" : `Set tempo · ${label} BPM`,
    execute: () => apply(after),
    undo: () => apply(before),
    ...(mergeKey ? { mergeKey } : {}),
  };
  if (mergeKey) history.coalesce(command);
  else history.execute(command);
}
