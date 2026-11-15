import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pushUrl,
  validateDestination,
  ValidationError,
} from "../src/destinations.mjs";

test("accepts both provider ingest shapes", () => {
  assert.deepEqual(
    validateDestination({
      rtmpUrl: "rtmp://live.twitch.tv/app",
      streamKey: "live_123456789_abcdef",
    }),
    { rtmpUrl: "rtmp://live.twitch.tv/app", streamKey: "live_123456789_abcdef" },
  );

  const kick = {
    rtmpUrl: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app",
    streamKey: "sk_us_kick_123456",
  };
  assert.deepEqual(validateDestination(kick), kick);
});

test("trims what the host pasted", () => {
  assert.deepEqual(
    validateDestination({
      rtmpUrl: "  rtmp://live.twitch.tv/app  ",
      streamKey: "  live_123456789_abcdef  ",
    }),
    { rtmpUrl: "rtmp://live.twitch.tv/app", streamKey: "live_123456789_abcdef" },
  );
});

test("rejects a destination that is not RTMP", () => {
  assert.throws(
    () => validateDestination({ rtmpUrl: "https://twitch.tv/app", streamKey: "abcdefghij" }),
    ValidationError,
  );
  assert.throws(
    () => validateDestination({ rtmpUrl: "", streamKey: "abcdefghij" }),
    ValidationError,
  );
});

test("rejects a key that cannot be a stream key", () => {
  for (const streamKey of ["short", "has space here", "slash/key/here", ""]) {
    assert.throws(
      () => validateDestination({ rtmpUrl: "rtmp://live.twitch.tv/app", streamKey }),
      ValidationError,
      `expected ${JSON.stringify(streamKey)} to be refused`,
    );
  }
});

test("appends the key to the ingest base without doubling the slash", () => {
  assert.equal(
    pushUrl("rtmp://live.twitch.tv/app/", "live_123456789_abcdef"),
    "rtmp://live.twitch.tv/app/live_123456789_abcdef",
  );
  assert.equal(
    pushUrl("rtmps://host:443/app", "sk_us_kick_123456"),
    "rtmps://host:443/app/sk_us_kick_123456",
  );
});
