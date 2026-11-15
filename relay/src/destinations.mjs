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
  if (!STREAM_KEY.test(streamKey)) {
    throw new ValidationError(
      "streamKey must be 8-200 characters of letters, digits, _ or -.",
    );
  }
  return { rtmpUrl, streamKey };
}

/**
 * Append the key to the ingest base. Twitch gives `rtmp://live.twitch.tv/app`,
 * Kick gives `rtmps://<id>.global-contribute.live-video.net:443/app`; both take
 * the key as the final path segment.
 */
export function pushUrl(rtmpUrl, streamKey) {
  return `${String(rtmpUrl).trim().replace(/\/+$/, "")}/${String(streamKey).trim()}`;
}
