/**
 * Pure helpers for the pattern-slot workflow (the Channel Rack's pattern
 * manager). Kept out of MusicManagerService so the rules — naming, clip usage,
 * and what a delete has to repoint — are testable without an AudioContext or a
 * history stack.
 */

/** Minimum shape both a slot and a version need here. */
export interface NamedSlot {
  id: string;
  name: string;
}

export interface PatternMaterial {
  steps: boolean[];
  notes: unknown[];
}

/** Clips are only interesting to this module for the pattern they play. */
export interface PatternClipRef {
  patternSlotId?: string | null;
}

/** The amount of pattern material a snapshot would duplicate. */
export function isSamePattern(
  a: PatternMaterial | null | undefined,
  b: PatternMaterial | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.steps.length !== b.steps.length) return false;
  for (let i = 0; i < a.steps.length; i++) {
    if (a.steps[i] !== b.steps[i]) return false;
  }
  return JSON.stringify(a.notes ?? []) === JSON.stringify(b.notes ?? []);
}

/**
 * Next free default name. Uses the highest existing `Pattern N` rather than
 * the slot count, so deleting "Pattern 2" does not make the next new slot
 * collide with the surviving "Pattern 3".
 */
export function nextPatternName(slots: NamedSlot[]): string {
  let highest = 0;
  for (const slot of slots) {
    const match = /^pattern\s+(\d+)$/i.exec(slot.name.trim());
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return `Pattern ${Math.max(highest + 1, slots.length + 1)}`;
}

/** "Verse" → "Verse copy", "Verse copy" → "Verse copy 2". */
export function copyPatternName(name: string, existing: NamedSlot[]): string {
  const base = `${(name || "Pattern").trim()} copy`;
  const taken = new Set(existing.map((slot) => slot.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/** How many arrangement clips play this pattern. */
export function countClipsUsingPattern(
  clips: PatternClipRef[] | undefined,
  slotId: string,
): number {
  if (!clips?.length) return 0;
  return clips.filter((clip) => clip.patternSlotId === slotId).length;
}

export interface PatternDeletePlan {
  /** Set when the delete must be refused; the message is user-facing. */
  error?: string;
  /** Slots that remain after the delete. */
  slots: NamedSlot[];
  /** The slot that should become active (and receive repointed clips). */
  fallbackSlotId: string | null;
  /** How many clips were re-pointed at the fallback. */
  repointedClips: number;
}

/**
 * Deleting a pattern must never leave a clip pointing at nothing (it would fall
 * silent with no way to see why), so clips that played the deleted slot are
 * re-pointed at the slot that takes its place. The last remaining pattern is
 * never deletable: a MIDI/drum track always edits *some* pattern.
 *
 * The clips themselves are not rewritten here — the caller applies
 * `fallbackSlotId` to them, which keeps this pure and undoable in one step.
 */
export function planPatternDelete(
  slots: NamedSlot[],
  clips: PatternClipRef[] | undefined,
  activeSlotId: string | null | undefined,
  slotId: string,
): PatternDeletePlan {
  const remaining = slots.filter((slot) => slot.id !== slotId);
  if (remaining.length === slots.length) {
    return {
      error: "That pattern is no longer in this track.",
      slots,
      fallbackSlotId: activeSlotId ?? null,
      repointedClips: 0,
    };
  }
  if (remaining.length === 0) {
    return {
      error: "A track keeps at least one pattern — create another first.",
      slots,
      fallbackSlotId: activeSlotId ?? null,
      repointedClips: 0,
    };
  }
  const stillActive = remaining.some((slot) => slot.id === activeSlotId);
  const fallbackSlotId = stillActive
    ? (activeSlotId as string)
    : remaining[0].id;
  return {
    slots: remaining,
    fallbackSlotId,
    repointedClips: countClipsUsingPattern(clips, slotId),
  };
}
