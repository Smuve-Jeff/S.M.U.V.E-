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

/**
 * The classic view id each page mode stands in for.
 *
 * The Compose Assistant is context-aware: its quick actions are keyed by the
 * classic shell's view ids (`arrangement`, `piano-roll`, `mixer`, …), not by
 * page modes. This is the mapping the page hands it so the actions on the
 * composed `/studio` follow the mode the user is actually working in.
 *
 * It is deliberately *not* the exact inverse of `STUDIO_VIEW_MODES`: that table
 * lists every `?view=` alias, while the assistant knows a fixed set of context
 * ids and falls back to its global actions for anything it does not recognise.
 * `create` maps to `recording` (its own alias) and therefore gets the global
 * set; `keys` maps to `piano-roll`, which shares Arrange's note-editing set;
 * `export` maps to `mastering`, the closest finalising context.
 */
export const STUDIO_MODE_ASSISTANT_CONTEXT: Readonly<
  Record<StudioPageMode, string>
> = {
  create: "recording",
  arrange: "arrangement",
  keys: "piano-roll",
  mix: "mixer",
  export: "mastering",
};

/** The assistant context id for a page mode. */
export function studioAssistantContextForMode(mode: StudioPageMode): string {
  return STUDIO_MODE_ASSISTANT_CONTEXT[mode] ?? "arrangement";
}
