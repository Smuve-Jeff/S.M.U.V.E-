/**
 * Destination validation and RTMP URL assembly.
 *
 * Everything here is pure so the rules can be tested without a media server:
 * a malformed destination must fail at session creation, not after the host has
 * already announced they are live.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const RTMP_URL = /^rtmps?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/i;
const STREAM_KEY = /^[A-Za-z0-9_-]{8,200}$/;
export const MAX_DESTINATIONS = 4;

/**
 * Validated destination. Twitch and Kick both want `rtmp(s)://host/app/KEY`,
 * so a base URL without the key is what the API sends.
 */
export function validateDestination(input) {
  const rtmpUrl = typeof input?.rtmpUrl === "string" ? input.rtmpUrl.trim() : "";
  const streamKey =
    typeof input?.streamKey === "string" ? input.streamKey.trim() : "";

  if (!RTMP_URL.test(rtmpUrl)) {
    throw new ValidationError(
      "rtmpUrl must be an rtmp:// or rtmps:// ingest URL.",
    );
  }
  // The relay joins multiple destinations into one ffmpeg tee spec. These
  // characters would change that spec instead of naming an ingest path.
  if (/[|\[\]]/.test(rtmpUrl)) {
    throw new ValidationError("rtmpUrl contains characters the relay cannot fan out.");
  }
  if (!STREAM_KEY.test(streamKey)) {
    throw new ValidationError(
      "streamKey must be 8-200 characters of letters, digits, _ or -.",
    );
  }
  return { rtmpUrl, streamKey };
}

/**
 * Accept the multi-destination contract while keeping the legacy single
 * destination request working. Validation happens before MediaMTX is touched.
 */
export function validateDestinations(input) {
  const list = Array.isArray(input?.destinations)
    ? input.destinations
    : [input];
  if (list.length === 0) {
    throw new ValidationError("at least one destination is required.");
  }
  if (list.length > MAX_DESTINATIONS) {
    throw new ValidationError(
      `at most ${MAX_DESTINATIONS} destinations are allowed per session.`,
    );
  }
  const destinations = list.map(validateDestination);
  const seen = new Set();
  for (const destination of destinations) {
    const url = pushUrl(destination.rtmpUrl, destination.streamKey);
    if (seen.has(url)) {
      throw new ValidationError("the same destination cannot be added twice.");
    }
    seen.add(url);
  }
  return destinations;
}

/**
 * Append the key to the ingest base. Twitch gives `rtmp://live.twitch.tv/app`,
 * Kick gives `rtmps://<id>.global-contribute.live-video.net:443/app`; both take
 * the key as the final path segment.
 *
 * Query flags stay on the end where the provider expects them, which is what
 * makes Twitch's bandwidth test (`.../app?bandwidthtest=true`) work: the key
 * goes in as the path segment and the flag follows it. Appending naively would
 * produce `.../app?bandwidthtest=true/live_...`, which Twitch reads as a key of
 * `true/live_...`.
 */
export function pushUrl(rtmpUrl, streamKey) {
  const trimmed = String(rtmpUrl).trim().replace(/\/+$/, "");
  const queryAt = trimmed.indexOf("?");
  const base = queryAt === -1 ? trimmed : trimmed.slice(0, queryAt);
  const query = queryAt === -1 ? "" : trimmed.slice(queryAt);
  return `${base.replace(/\/+$/, "")}/${String(streamKey).trim()}${query}`;
}
