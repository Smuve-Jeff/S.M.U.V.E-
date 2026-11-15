import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The audio half of egress, which the video-only media test could not see.
 *
 * A browser publishes Opus; the relay used to run one `-c copy` for both streams.
 * FLV cannot carry Opus, so the muxer refused to write a header — `Audio codec
 * opus not compatible with flv` — and a push from a host with a microphone never
 * reached the provider at all. Every automated test published video only, so
 * nothing caught it.
 *
 * This test reproduces the browser's track layout (H.264 + Opus) with ffmpeg's
 * whip muxer, then runs the relay's own command twice against that live path:
 * `-c copy` must fail, and `-c:v copy -c:a aac` must put both tracks on an RTMP
 * ingest. The first half pins the reason the second exists.
 *
 * Needs a whip-capable ffmpeg (ffmpeg-static has no muxer), an ffmpeg for the
 * relay side, and MediaMTX:
 *
 *   RELAY_WHIP_FFMPEG_PATH=/path/to/ffmpeg \
 *   RELAY_FFMPEG_PATH=/path/to/ffmpeg \
 *   MEDIAMTX_PATH=/path/to/mediamtx \
 *     node --test relay/test/e2e-audio-egress.test.mjs
 *
 * Absent tools skip; configured-but-broken tools fail; `RELAY_E2E_REQUIRE_TOOLS=1`
 * turns a skip into a failure. Ports are disjoint from the other end-to-end files.
 */

const RELAY_FFMPEG = process.env.RELAY_FFMPEG_PATH || "ffmpeg";
const WHIP_FFMPEG = process.env.RELAY_WHIP_FFMPEG_PATH || null;
const MEDIAMTX = process.env.MEDIAMTX_PATH || "mediamtx";
const RTSP_PORT = 18764;
const RTMP_PORT = 19545;
const API_PORT = 19990;
const WHIP_PORT = 18855;
const ICE_PORT = 18390;
const API = `http://127.0.0.1:${API_PORT}`;
const SOURCE_PATH = "live/audio_source";
const COPY_SINK = "egress_copy";
const AAC_SINK = "egress_aac";

const requireTools = process.env.RELAY_E2E_REQUIRE_TOOLS === "1";

function runs(binary) {
  const attempts = ["-version", "--version"].map((flag) =>
    spawnSync(binary, [flag], { stdio: "ignore" }),
  );
  if (attempts.some((attempt) => attempt.status === 0)) return "ok";
  return attempts.every((attempt) => attempt.error?.code === "ENOENT")
    ? "missing"
    : "broken";
}

function hasWhipMuxer(binary) {
  const result = spawnSync(binary, ["-hide_banner", "-muxers"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && /\bwhip\b/.test(result.stdout ?? "");
}

function collectIssues() {
  const issues = [];
  const add = (state, envVar, binary, label) => {
    if (state === "missing") {
      issues.push({ kind: "missing", what: `${label} is not installed (set ${envVar})` });
    } else if (state === "broken") {
      issues.push({ kind: "broken", what: `${envVar}=${binary} does not run` });
    }
  };

  add(runs(MEDIAMTX), "MEDIAMTX_PATH", MEDIAMTX, "MediaMTX");
  add(runs(RELAY_FFMPEG), "RELAY_FFMPEG_PATH", RELAY_FFMPEG, "the relay's ffmpeg");

  if (!WHIP_FFMPEG) {
    issues.push({
      kind: "missing",
      what: "no whip-capable ffmpeg (set RELAY_WHIP_FFMPEG_PATH)",
    });
  } else {
    const state = runs(WHIP_FFMPEG);
    if (state !== "ok") {
      add(state, "RELAY_WHIP_FFMPEG_PATH", WHIP_FFMPEG, "the whip-capable ffmpeg");
    } else if (!hasWhipMuxer(WHIP_FFMPEG)) {
      issues.push({
        kind: "broken",
        what: `${WHIP_FFMPEG} has no whip muxer`,
      });
    }
  }
  return issues;
}

const issues = collectIssues();
const missing = issues.filter((issue) => issue.kind === "missing");
const broken = issues.filter((issue) => issue.kind === "broken");

if (broken.length > 0 || (requireTools && missing.length > 0)) {
  throw new Error(
    [
      "the audio egress check cannot run here:",
      ...issues.map((issue) => `  - ${issue.what}`),
      ...(requireTools && missing.length > 0
        ? ["RELAY_E2E_REQUIRE_TOOLS=1 is set, so a missing tool fails instead of skipping."]
        : []),
    ].join("\n"),
  );
}

const skip =
  missing.length > 0 ? issues.map((issue) => issue.what).join("; ") : false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TEARDOWN_LIMIT_MS = 10_000;

async function bounded(work, label, ms = TEARDOWN_LIMIT_MS) {
  let timer;
  const givingUp = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
    timer.unref?.();
  });
  const settled = Promise.resolve(work).then(
    (value) => ({ value }),
    () => ({ value: undefined }),
  );
  const winner = await Promise.race([settled, givingUp]);
  clearTimeout(timer);
  if (winner === "timeout") {
    console.warn(`[relay-audio] ${label} did not finish within ${ms} ms; giving up`);
    return undefined;
  }
  return winner.value;
}

async function until(check, { timeoutMs = 20_000, everyMs = 250, label }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(everyMs);
  }
}

const mediaMtxConfig = () =>
  [
    "logLevel: error",
    "logDestinations: [stdout]",
    "api: yes",
    `apiAddress: 127.0.0.1:${API_PORT}`,
    "rtsp: yes",
    `rtspAddress: 127.0.0.1:${RTSP_PORT}`,
    "rtspTransports: [tcp]",
    "rtmp: yes",
    `rtmpAddress: 127.0.0.1:${RTMP_PORT}`,
    "webrtc: yes",
    `webrtcAddress: 127.0.0.1:${WHIP_PORT}`,
    `webrtcLocalUDPAddress: 127.0.0.1:${ICE_PORT}`,
    "webrtcAllowOrigin: '*'",
    "webrtcIPsFromInterfaces: no",
    "webrtcAdditionalHosts: [127.0.0.1]",
    "webrtcHandshakeTimeout: 30s",
    "hls: no",
    "srt: no",
    "paths:",
    "  all_others:",
    "",
  ].join("\n");

async function pathState(name) {
  const response = await fetch(`${API}/v3/paths/get/${encodeURIComponent(name)}`);
  if (!response.ok) return null;
  return response.json();
}

test(
  "the relay transcodes the browser's Opus to AAC, because FLV cannot copy it",
  { skip, timeout: 150_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "relay-audio-"));
    const configPath = join(dir, "mediamtx.yml");
    await writeFile(configPath, mediaMtxConfig());

    const media = spawn(MEDIAMTX, [configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let mediaLog = "";
    const keep = (chunk) =>
      String(chunk)
        .split("\n")
        .filter((line) => !/\[API\] path not found/.test(line))
        .join("\n");
    media.stdout.on("data", (chunk) => (mediaLog += keep(chunk)));
    media.stderr.on("data", (chunk) => (mediaLog += keep(chunk)));

    let publisher = null;
    const children = new Set();
    // Teardown only has to stop things: waiting for a close event from every
    // child can hang on a pipe a grandchild still holds, and a wedged teardown
    // is how an obvious failure becomes a twenty-minute job instead.
    t.after(async () => {
      for (const child of children) child.kill("SIGKILL");
      media.kill("SIGKILL");
      await sleep(300);
      await rm(dir, { recursive: true, force: true });
    });

    try {
      await until(
        async () => {
          try {
            return (await fetch(`${API}/v3/config/global/get`)).ok;
          } catch {
            return false;
          }
        },
        { label: "MediaMTX's API" },
      );

      // The browser's layout: H.264 video and Opus audio. Stereo is not a
      // preference here — the whip muxer rejects mono ("choose stereo").
      publisher = spawn(
        WHIP_FFMPEG,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-re",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x360:rate=30",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=48000",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "zerolatency",
          "-c:a",
          "libopus",
          "-b:a",
          "96k",
          "-ac",
          "2",
          "-t",
          "60",
          "-f",
          "whip",
          `http://127.0.0.1:${WHIP_PORT}/${SOURCE_PATH}/whip`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      children.add(publisher);
      publisher.stderr.on("data", (chunk) => (mediaLog += keep(chunk)));

      const source = await until(
        async () => {
          const state = await pathState(SOURCE_PATH);
          const tracks = state?.tracks ?? [];
          return state?.ready && tracks.includes("Opus") && tracks.includes("H264")
            ? state
            : null;
        },
        { label: "a WHIP publish with H.264 and Opus" },
      );
      assert.deepEqual(
        [...(source.tracks ?? [])].sort(),
        ["H264", "Opus"],
        `unexpected source tracks: ${JSON.stringify(source.tracks)}`,
      );

      const relayArgs = (codecArgs, sink) => [
        "-nostdin",
        "-loglevel",
        "error",
        "-nostats",
        "-rtsp_transport",
        "tcp",
        "-i",
        `rtsp://127.0.0.1:${RTSP_PORT}/${SOURCE_PATH}`,
        ...codecArgs,
        "-f",
        "flv",
        `rtmp://127.0.0.1:${RTMP_PORT}/${sink}`,
      ];

      // What the relay used to do: one copy for both streams.
      const copier = spawn(RELAY_FFMPEG, relayArgs(["-c", "copy"], COPY_SINK), {
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.add(copier);
      let copyLog = "";
      copier.stderr.on("data", (chunk) => (copyLog += chunk));
      const copyExit = await bounded(
        new Promise((resolve) => {
          copier.once("close", (code) => resolve(code));
          setTimeout(() => copier.kill("SIGKILL"), 15_000);
        }),
        "the copying ffmpeg",
        20_000,
      );
      assert.notEqual(
        copyExit,
        0,
        "copying Opus into FLV unexpectedly succeeded: the premise of this test is gone",
      );
      assert.match(
        copyLog,
        /not compatible with flv|Could not write header/i,
        `expected the FLV muxer to refuse Opus, got:\n${copyLog}`,
      );
      assert.equal(
        await pathState(COPY_SINK),
        null,
        "a refusing muxer must not have published anything",
      );

      // What the relay does now: copy video, encode audio.
      const encoder = spawn(
        RELAY_FFMPEG,
        relayArgs(["-c:v", "copy", "-c:a", "aac", "-b:a", "128k"], AAC_SINK),
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      children.add(encoder);
      let encodeLog = "";
      encoder.stderr.on("data", (chunk) => (encodeLog += chunk));

      const sink = await until(
        async () => {
          const state = await pathState(AAC_SINK);
          const tracks = state?.tracks ?? [];
          return tracks.includes("MPEG-4 Audio") && tracks.includes("H264")
            ? state
            : null;
        },
        { timeoutMs: 25_000, label: "H.264 and AAC on the RTMP ingest" },
      );
      assert.ok(
        Number(sink.bytesReceived ?? 0) > 0,
        `the ingest reported no bytes: ${JSON.stringify(sink)}`,
      );

      await bounded(
        new Promise((resolve) => {
          encoder.once("close", resolve);
          encoder.kill("SIGKILL");
        }),
        "stopping the encoding ffmpeg",
      );
      assert.ok(
        !/Could not write header/i.test(encodeLog),
        `transcoded audio still failed to mux:\n${encodeLog}`,
      );
    } catch (error) {
      if (mediaLog) console.error(`[relay-audio] failure context\n${mediaLog}`);
      throw error;
    }
  },
);
