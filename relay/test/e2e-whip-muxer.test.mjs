import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The same WHIP endpoint, driven by a different client.
 *
 * `e2e-media.test.mjs` proves the path end to end — publish, stall, recover,
 * RTMP egress — but always with the same publisher: werift. One client is one
 * set of SDP, ICE and DTLS choices, so that suite would also pass if MediaMTX
 * merely tolerated werift's particular choices. This test publishes with
 * ffmpeg's own `whip` muxer, an independent implementation, which is a real
 * (if smaller) step toward the browser that cannot be run here.
 *
 * The ffmpeg that `ffmpeg-static` ships does not carry the muxer — it reports
 * `Unknown format 'whip'` — so this runs only when a whip-capable ffmpeg is
 * pointed at, which the provisioning script does for linux-x64:
 *
 *   RELAY_WHIP_FFMPEG_PATH=/path/to/ffmpeg \
 *   MEDIAMTX_PATH=/path/to/mediamtx \
 *     node --test relay/test/e2e-whip-muxer.test.mjs
 *
 * A tool that is absent skips the test; a path that is set and does not work, or
 * a run that promised the tools (`RELAY_E2E_REQUIRE_TOOLS=1`, as CI sets),
 * fails. Ports differ from the other end-to-end test so both files can run at
 * the same time.
 */

const FFMPEG = process.env.RELAY_WHIP_FFMPEG_PATH || null;
const MEDIAMTX = process.env.MEDIAMTX_PATH || "mediamtx";
const RTSP_PORT = 18754;
const RTMP_PORT = 19455;
const API_PORT = 19998;
const WHIP_PORT = 18655;
const ICE_PORT = 18290;
const API = `http://127.0.0.1:${API_PORT}`;
const PATH_NAME = "live/whip_muxer_client";

const requireTools = process.env.RELAY_E2E_REQUIRE_TOOLS === "1";

/** Runs at all? A path that was set but does not execute is a misconfiguration. */
function runs(binary) {
  const attempts = ["-version", "--version"].map((flag) =>
    spawnSync(binary, [flag], { stdio: "ignore" }),
  );
  if (attempts.some((attempt) => attempt.status === 0)) return "ok";
  return attempts.every((attempt) => attempt.error?.code === "ENOENT")
    ? "missing"
    : "broken";
}

/** ffmpeg only counts if it actually built the muxer this test is about. */
function hasWhipMuxer(binary) {
  const result = spawnSync(binary, ["-hide_banner", "-muxers"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && /\bwhip\b/.test(result.stdout ?? "");
}

function collectIssues() {
  const issues = [];
  if (!FFMPEG) {
    issues.push({
      kind: "missing",
      what: "no whip-capable ffmpeg (set RELAY_WHIP_FFMPEG_PATH)",
    });
  } else {
    const state = runs(FFMPEG);
    if (state === "missing") {
      issues.push({
        kind: "missing",
        what: `RELAY_WHIP_FFMPEG_PATH=${FFMPEG} does not exist`,
      });
    } else if (state === "broken") {
      issues.push({
        kind: "broken",
        what: `RELAY_WHIP_FFMPEG_PATH=${FFMPEG} does not run`,
      });
    } else if (!hasWhipMuxer(FFMPEG)) {
      issues.push({
        kind: "broken",
        what: `${FFMPEG} has no whip muxer (ffmpeg-static builds do not include it)`,
      });
    }
  }
  const mediaState = runs(MEDIAMTX);
  if (mediaState === "missing") {
    issues.push({
      kind: "missing",
      what: "MediaMTX is not installed (set MEDIAMTX_PATH)",
    });
  } else if (mediaState === "broken") {
    issues.push({
      kind: "broken",
      what: "MediaMTX is installed but does not run",
    });
  }
  return issues;
}

const issues = collectIssues();
const missing = issues.filter((issue) => issue.kind === "missing");
const broken = issues.filter((issue) => issue.kind === "broken");

if (broken.length > 0 || (requireTools && missing.length > 0)) {
  throw new Error(
    [
      "the second WHIP client cannot run here:",
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

/** Teardown must never outlast the test; see e2e-media.test.mjs. */
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
    console.warn(`[relay-whip] ${label} did not finish within ${ms} ms; giving up`);
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

/** What MediaMTX says it received on the published path. */
async function pathState() {
  const response = await fetch(`${API}/v3/paths/get/${encodeURIComponent(PATH_NAME)}`);
  if (!response.ok) return null;
  return response.json();
}

test(
  "ffmpeg's whip muxer publishes to the same endpoint werift uses",
  { skip, timeout: 120_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "relay-whip-"));
    const configPath = join(dir, "mediamtx.yml");
    await writeFile(configPath, mediaMtxConfig());

    const media = spawn(MEDIAMTX, [configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let mediaLog = "";
    const keepMediaLine = (chunk) =>
      String(chunk)
        .split("\n")
        .filter((line) => !/\[API\] path not found/.test(line))
        .join("\n");
    media.stdout.on("data", (chunk) => (mediaLog += keepMediaLine(chunk)));
    media.stderr.on("data", (chunk) => (mediaLog += keepMediaLine(chunk)));

    let publisher = null;
    let publisherLog = "";
    const finish = async () => {
      await bounded(
        new Promise((resolve) => {
          if (!publisher || publisher.exitCode !== null) return resolve();
          publisher.once("close", resolve);
          publisher.kill("SIGKILL");
        }),
        "stopping ffmpeg",
      );
      await bounded(
        new Promise((resolve) => {
          media.once("close", resolve);
          media.kill("SIGKILL");
        }),
        "stopping MediaMTX",
      );
      await rm(dir, { recursive: true, force: true });
    };
    t.after(finish);

    try {
      await until(
        async () => {
          try {
            const response = await fetch(`${API}/v3/config/global/get`);
            return response.ok;
          } catch {
            return false;
          }
        },
        { label: "MediaMTX's API" },
      );

      publisher = spawn(
        FFMPEG,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-re",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x360:rate=30",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "zerolatency",
          "-t",
          "10",
          "-f",
          "whip",
          `http://127.0.0.1:${WHIP_PORT}/${PATH_NAME}/whip`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      publisher.stdout.on("data", (chunk) => (publisherLog += chunk));
      publisher.stderr.on("data", (chunk) => (publisherLog += chunk));

      const state = await until(
        async () => {
          const body = await pathState();
          return body?.ready ? body : null;
        },
        { label: "the path to become ready from an ffmpeg whip publish" },
      );

      assert.ok(
        (state.tracks ?? []).includes("H264"),
        `expected an H264 track, got ${JSON.stringify(state.tracks)}`,
      );
      const firstSample = Number(state.bytesReceived ?? 0);
      assert.ok(
        firstSample > 0,
        `MediaMTX reported no bytes for the ffmpeg publish: ${JSON.stringify(state)}`,
      );

      // A path can report ready on the handshake alone, so bytes have to keep
      // arriving before this counts as media rather than a successful connect.
      const grew = await until(
        async () => {
          const body = await pathState();
          return Number(body?.bytesReceived ?? 0) > firstSample ? body : null;
        },
        { timeoutMs: 10_000, label: "bytes to keep arriving from ffmpeg" },
      );
      assert.ok(
        Number(grew.bytesReceived) > firstSample,
        `bytes did not grow: ${firstSample} → ${grew.bytesReceived}`,
      );

      const exitCode = await bounded(
        new Promise((resolve) => publisher.once("close", resolve)),
        "ffmpeg finishing its ten seconds",
        30_000,
      );
      assert.equal(
        exitCode,
        0,
        `ffmpeg's whip publish ended badly${publisherLog ? `:\n${publisherLog}` : ""}`,
      );
    } catch (error) {
      const context = [
        publisherLog ? `ffmpeg:\n${publisherLog}` : "",
        mediaLog ? `MediaMTX:\n${mediaLog}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      if (context) console.error(`[relay-whip] failure context\n${context}`);
      throw error;
    }
  },
);
