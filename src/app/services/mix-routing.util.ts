/** Minimal track shape needed to resolve mixer solo routing. */
export interface SoloRoutingTrack {
  id: string;
  type?: string;
  muted?: boolean;
  soloed?: boolean;
  soloSafe?: boolean;
  busId?: string;
}

/**
 * Whether a channel's source should be audible under the project's solo state.
 *
 * A group bus is a summing path, not a source: it must stay open so the soloed
 * channel feeding it can reach the master. Soloing the bus itself (or marking
 * it solo-safe) therefore also opens the channels routed into it. Without this,
 * a soloed group bus muted every member and produced silence.
 */
export function isTrackAudibleUnderSolo(
  track: SoloRoutingTrack,
  tracks: readonly SoloRoutingTrack[],
): boolean {
  if (track.muted) return false;
  // Bus channels carry no source of their own; source channels are gated below.
  if (track.type === 'bus') return true;
  if (!tracks.some((candidate) => candidate.soloed)) return true;
  if (track.soloed || track.soloSafe) return true;
  return hasSoloedBusAncestor(track, tracks);
}

function hasSoloedBusAncestor(
  track: SoloRoutingTrack,
  tracks: readonly SoloRoutingTrack[],
): boolean {
  const byId = new Map(tracks.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  let busId = track.busId;
  while (busId && !seen.has(busId)) {
    seen.add(busId);
    const bus = byId.get(busId);
    if (!bus || bus.type !== 'bus') return false;
    if (bus.soloed || bus.soloSafe) return true;
    busId = bus.busId;
  }
  return false;
}
