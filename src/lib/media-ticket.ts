import { createHmac, timingSafeEqual } from "node:crypto";
import { JWT_SECRET } from "@/config/env";

/**
 * Short-lived tickets for streaming a recording.
 *
 * A `<video>` element cannot send the bearer token, and putting the JWT in a
 * media URL would leak it into access logs and browser history. Instead the app
 * asks for one ticket per recording, and the media route accepts only that
 * ticket: it names one user, one relay session and one file, and it expires.
 *
 * The key is derived from `JWT_SECRET` under its own label, so there is no
 * extra secret to configure and rotating the JWT secret invalidates any
 * outstanding playback links.
 */
const VERSION = "v1";
/** Long enough for an hour-long show to be watched without re-minting. */
export const PLAYBACK_TICKET_TTL_MS = 2 * 60 * 60 * 1_000;

/**
 * A ticket otherwise names one file, and an archive is not a file. A recording
 * name can never contain `@`, so this can only ever mean "the whole show": a
 * single-file ticket cannot be replayed as an archive, or the other way round.
 */
export const ARCHIVE_TICKET_NAME = "@archive";

export interface PlaybackTicket {
  userId: number;
  relayId: string;
  name: string;
  expiresAt: number;
  signature: string;
}

function key(): Buffer {
  return createHmac("sha256", `smuve:broadcast-playback:${JWT_SECRET}`)
    .update(VERSION)
    .digest();
}

function payload(ticket: {
  userId: number;
  relayId: string;
  name: string;
  expiresAt: number;
}): string {
  return [ticket.relayId, ticket.name, ticket.userId, ticket.expiresAt].join(
    "\n",
  );
}

function sign(ticket: {
  userId: number;
  relayId: string;
  name: string;
  expiresAt: number;
}): string {
  return createHmac("sha256", key()).update(payload(ticket)).digest("hex");
}

export function mintPlaybackTicket(input: {
  userId: number;
  relayId: string;
  name: string;
  ttlMs?: number;
  now?: number;
}): PlaybackTicket {
  const expiresAt =
    (input.now ?? Date.now()) + (input.ttlMs ?? PLAYBACK_TICKET_TTL_MS);
  const claims = {
    userId: Number(input.userId),
    relayId: String(input.relayId),
    name: String(input.name),
    expiresAt,
  };
  return { ...claims, signature: sign(claims) };
}

/** True only for an unexpired ticket whose signature covers every claim. */
export function verifyPlaybackTicket(input: {
  userId: unknown;
  relayId: unknown;
  name: unknown;
  expiresAt: unknown;
  signature: unknown;
  now?: number;
}): boolean {
  const userId = Number(input.userId);
  const relayId = typeof input.relayId === "string" ? input.relayId : "";
  const name = typeof input.name === "string" ? input.name : "";
  const expiresAt = Number(input.expiresAt);
  const signature = typeof input.signature === "string" ? input.signature : "";

  if (!Number.isFinite(userId) || !relayId || !name) return false;
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? Date.now())) {
    return false;
  }

  const expected = Buffer.from(
    sign({ userId, relayId, name, expiresAt }),
    "hex",
  );
  const provided = Buffer.from(signature, "hex");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

/** The ticket as query parameters, relative to the API base. */
export function playbackPath(ticket: PlaybackTicket): string {
  return ticketPath(ticket, "stream");
}

/** The same ticket, addressed at the whole-show archive instead of one file. */
export function archivePath(ticket: PlaybackTicket): string {
  return ticketPath(ticket, "archive");
}

function ticketPath(ticket: PlaybackTicket, route: string): string {
  const query = new URLSearchParams({
    name: ticket.name,
    u: String(ticket.userId),
    exp: String(ticket.expiresAt),
    sig: ticket.signature,
  });
  return `/broadcast/recordings/${encodeURIComponent(
    ticket.relayId,
  )}/${route}?${query.toString()}`;
}
