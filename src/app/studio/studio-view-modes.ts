/**
 * `?view=` values the studio page renders, and the mode each opens.
 *
 * Single source of truth: `studioViewGuard` uses it to decide whether a deep
 * link belongs to the page or the classic shell, and `StudioPageComponent`
 * uses it to pick the initial mode. Keeping one table stops the two from
 * drifting apart (a view allowed by the guard but unmapped by the page would
 * silently show Arrange).
 */
export type StudioPageMode = "create" | "arrange" | "keys" | "mix" | "export";

export const STUDIO_VIEW_MODES: Readonly<Record<string, StudioPageMode>> = {
  create: "create",
  recording: "create",
  arrange: "arrange",
  arrangement: "arrange",
  "piano-roll": "keys",
  keys: "keys",
  mix: "mix",
  mixer: "mix",
  export: "export",
};

/** The mode a `?view=` value opens, or null when the page cannot render it. */
export function studioModeForView(
  view: string | null | undefined,
): StudioPageMode | null {
  return STUDIO_VIEW_MODES[(view ?? "").toLowerCase()] ?? null;
}
