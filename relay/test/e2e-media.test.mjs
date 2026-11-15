import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { SessionManager } from "../src/session-manager.mjs";
import { createWhipPublisher } from "./helpers/whip-publisher.mjs";

/**
 * End-to-end media test: real ffmpeg, real MediaMTX, real WebRTC, no fakes.
 *
 * Everything else in this directory tests the relay's decisions. This test
 * tests the thing those decisions are about, along the same path a host takes:
 *
 *   WHIP (WebRTC, Node + werift) → MediaMTX → ffmpeg (relay) → RTMP ingest
 *
 * It covers the three states the watchdog and recovery path exist for: bytes
 * flowing, bytes stopping while the process stays alive, and bytes coming back
 * after the relay restarted ffmpeg itself. The WHIP publish stays connected
 * throughout, so it also proves that a relay restart does not disturb the
 * browser side.
 *
 * Needs ffmpeg, MediaMTX and werift. A tool that is simply absent skips the
 * suite, so the ordinary run stays possible on a machine that has none; a tool
 * that is configured but does not work, or a run that promised the tools and did
 * not get them (`RELAY_E2E_REQUIRE_TOOLS=1`, as CI sets), fails instead:
 *
 *   RELAY_FFMPEG_PATH=/path/to/ffmpeg \
 *   MEDIAMTX_PATH=/path/to/mediamtx \
 *   RELAY_WERIFT_PATH=/path/to/node_modules/werift \
 *     node --test relay/test/e2e-media.test.mjs
 *
 * Ports are deliberately unusual so a local dev server is unlikely to own them.
 */

const FFMPEG = process.env.RELAY_FFMPEG_PATH || "ffmpeg";
const MEDIAMTX = process.env.MEDIAMTX_PATH || "mediamtx";
const RTSP_PORT = 18554;
const RTMP_PORT = 19355;
const API_PORT = 19997;
const WHIP_PORT = 18889;
const ICE_PORT = 18189;
const API = `http://127.0.0.1:${API_PORT}`;
// Set by CI: the logs and last-known state are written here on every run, so a
// red job can be diagnosed from its own output instead of a local re-run.
const diagnosticDir = process.env.RELAY_E2E_LOGS_DIR || null;
const SINK_PATH = "live/e2e_key_123";

/**
 * Is a required binary usable?
 *
 * Absent tools may skip the suite; anything else is a failure, because a path
 * that was set and does not run is a misconfiguration, not an inapplicable test.
 */
function checkBinary(label, envVar, fallback) {
  const configured = process.env[envVar] || null;
  const binary = configured || fallback;
  const attempts = ["-version", "--version"].map((flag) =>
    spawnSync(binary, [flag], { stdio: "ignore" }),
  );
  if (attempts.some((attempt) => attempt.status === 0)) return null;
  const absent = attempts.every((attempt) => attempt.error?.code === "ENOENT");
  if (configured) {
    return {
      kind: "broken",
      what: `${envVar}=${configured} does not run${absent ? " (no such file)" : ""}`,
    };
  }
  return absent
    ? { kind: "missing", what: `${label} is not installed (set ${envVar})` }
    : { kind: "broken", what: `${label} is installed but does not run` };
}

/** werift is not a project dependency; a configured path that fails is broken. */
async function loadWerift() {
  const root = process.env.RELAY_WERIFT_PATH;
  const candidates = [
    root ? pathToFileURL(join(root, "lib/webrtc/src/index.js")).href : null,
    "werift",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return { module: await import(candidate) };
    } catch (error) {
      // A module that is present but cannot load is not the same as one that is
      // not installed: only "not found" may fall through to a skip.
      if (error?.code !== "ERR_MODULE_NOT_FOUND") {
        return {
          issue: {
            kind: "broken",
            what: `werift at ${candidate} cannot be loaded: ${error?.message ?? error}`,
          },
        };
      }
    }
  }
  return {
    issue: root
      ? {
          kind: "broken",
          what: `RELAY_WERIFT_PATH=${root} does not contain werift (expected lib/webrtc/src/index.js)`,
        }
      : { kind: "missing", what: "werift is not installed (set RELAY_WERIFT_PATH)" },
  };
}

const weriftResult = await loadWerift();
const issues = [
  checkBinary("ffmpeg", "RELAY_FFMPEG_PATH", "ffmpeg"),
  checkBinary("MediaMTX", "MEDIAMTX_PATH", "mediamtx"),
  weriftResult.issue,
].filter(Boolean);
const missing = issues.filter((issue) => issue.kind === "missing");
const broken = issues.filter((issue) => issue.kind === "broken");
// CI provisions every tool, so a gap there is a broken job, not a machine that
// happens not to have them.
const requireTools = process.env.RELAY_E2E_REQUIRE_TOOLS === "1";

if (broken.length > 0 || (requireTools && missing.length > 0)) {
  throw new Error(
    [
      "the media path cannot run here:",
      ...issues.map((issue) => `  - ${issue.what}`),
      ...(requireTools && missing.length > 0
        ? ["RELAY_E2E_REQUIRE_TOOLS=1 is set, so a missing tool fails instead of skipping."]
        : []),
    ].join("\n"),
  );
}

const werift = weriftResult.module;

const skip =
  missing.length > 0 ? issues.map((issue) => issue.what).join("; ") : false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TEARDOWN_LIMIT_MS = 10_000;

/**
 * Teardown must never outlast the test. A child that ignores SIGTERM (or a
 * socket that never closes) would otherwise hold the job open until CI kills it,
 * turning an obvious failure into a twenty-minute wait with no logs. Returns the
 * value, or undefined if it gave up — teardown results are never asserted on.
 */
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
    console.warn(`[relay-e2e] ${label} did not finish within ${ms} ms; giving up`);
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

/** What the ingest has actually received, straight from MediaMTX. */
async function sinkBytes() {
  const response = await fetch(
    `${API}/v3/paths/get/${encodeURIComponent(SINK_PATH)}`,
  );
  if (!response.ok) return 0;
  const body = await response.json();
  return Number(body?.bytesReceived ?? 0);
}

test(
  "a WHIP publish reaches a real RTMP ingest, stalls, and recovers",
  { skip, timeout: 150_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "relay-e2e-"));
    const configPath = join(dir, "mediamtx.yml");
    await writeFile(configPath, mediaMtxConfig());

    const media = spawn(MEDIAMTX, [configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let mediaLog = "";
    // The test itself polls a path that does not exist yet, and MediaMTX logs an
    // ERR per 404. Keeping those would bury the lines a failed run is read for.
    const keepMediaLine = (chunk) =>
      String(chunk)
        .split("\n")
        .filter((line) => !/\[API\] path not found/.test(line))
        .join("\n");
    media.stdout.on("data", (chunk) => (mediaLog += keepMediaLine(chunk)));
    media.stderr.on("data", (chunk) => (mediaLog += keepMediaLine(chunk)));

    const alerts = [];
    const relayLog = [];
    const relayLogger = {
      info: (line) => relayLog.push(`info ${line}`),
      warn: (line) => relayLog.push(`warn ${line}`),
      error: (line) => relayLog.push(`error ${line}`),
    };
    const manager = new SessionManager({
      spawn,
      mediamtx: {
        addPath: async () => {},
        deletePath: async () => {},
        getPath: async (id) => {
          const response = await fetch(
            `${API}/v3/paths/get/${encodeURIComponent(id)}`,
          );
          if (!response.ok) return null;
          return response.json();
        },
      },
      publicUrl: "http://127.0.0.1:8080",
      // The relay appends the session id, which is the path the WHIP publisher
      // below publishes to.
      rtspUrl: `rtsp://127.0.0.1:${RTSP_PORT}`,
      ffmpegPath: FFMPEG,
      maxRecoveries: 1,
      onAlert: (alert) => alerts.push(alert),
      logger: relayLogger,
    });

    let whip = null;
    let session = null;
    // Read the state before teardown: evidence that only exists mid-run is
    // exactly what a failed job needs to explain itself.
    const writeDiagnostics = async (status) => {
      const files = {
        "mediamtx.log": mediaLog || "(no output)\n",
        "relay.log": relayLog.join("\n") || "(no output)\n",
        "session.json": `${JSON.stringify(status ?? null, null, 2)}\n`,
        "alerts.json": `${JSON.stringify(alerts, null, 2)}\n`,
        "ingest-bytes.txt": `${await sinkBytes().catch(() => "unavailable")}\n`,
      };
      await mkdir(diagnosticDir, { recursive: true });
      for (const [name, body] of Object.entries(files)) {
        await writeFile(join(diagnosticDir, name), body);
      }
    };

    t.after(async () => {
      // Every step is bounded so a wedged child costs seconds, not the job.
      const status = session
        ? await bounded(manager.status(session.id), "reading the session status")
        : null;

      // Diagnostics were asked for, so they have to arrive: a job that goes red
      // with an empty log directory is worse than one that says why it is empty.
      let diagnosticsError = null;
      if (diagnosticDir) {
        const written = Symbol("written");
        const outcome = await bounded(
          writeDiagnostics(status).then(
            () => written,
            (error) => {
              diagnosticsError = error;
              return written;
            },
          ),
          "writing diagnostics",
        );
        // `bounded` returns undefined only when it gave up, which is its own
        // reason to fail: the logs are as missing as if writing had thrown.
        if (outcome !== written && !diagnosticsError) {
          diagnosticsError = new Error(
            `did not finish within ${TEARDOWN_LIMIT_MS} ms`,
          );
        }
      }

      await bounded(manager.stopAll(), "stopping the relay sessions");
      await bounded(whip?.stop(), "closing the WHIP publish");
      media.kill("SIGKILL");
      // Backstop for a child that ignored every polite request above.
      if (status?.pid) {
        try {
          process.kill(status.pid, "SIGKILL");
        } catch {
          // Already gone, which is the usual case.
        }
      }
      await bounded(rm(dir, { recursive: true, force: true }), "removing the temp directory");

      if (diagnosticsError) {
        throw new Error(
          `could not write this run's diagnostics to ${diagnosticDir}: ` +
            `${diagnosticsError.message}\n` +
            "The media path itself may have passed; this failure is only about " +
            "the logs, because a red job with no evidence cannot be diagnosed.",
        );
      }
    });

    await until(
      async () => {
        try {
          return (await fetch(`${API}/v3/config/global/get`)).ok;
        } catch {
          return false;
        }
      },
      { label: `MediaMTX on :${RTSP_PORT}/:${WHIP_PORT}/:${API_PORT}` },
    );

    session = await manager.create({
      rtmpUrl: `rtmp://127.0.0.1:${RTMP_PORT}/live`,
      streamKey: "e2e_key_123",
    });

    // The browser hop: negotiate WHIP, then send H.264 RTP over the connection.
    whip = await createWhipPublisher({
      werift,
      whipUrl: `http://127.0.0.1:${WHIP_PORT}/${session.id}/whip`,
      ffmpegPath: FFMPEG,
      logger: relayLogger,
    });
    await whip.start();

    // 0. The publish itself is what the relay's RTSP pull depends on.
    const published = await until(
      async () => {
        const response = await fetch(
          `${API}/v3/paths/get/${encodeURIComponent(session.id)}`,
        );
        if (!response.ok) return null;
        const body = await response.json();
        return body?.ready ? body : null;
      },
      { label: `the WHIP publish to reach MediaMTX (${mediaLog.slice(-300)})` },
    );
    assert.ok(published.tracks.includes("H264"), "H.264 reached the server");
    assert.ok(published.bytesReceived > 0, "RTP bytes arrived over WebRTC");
    assert.ok(whip.accessUnits > 0, "the publisher sent encoded frames");

    // 1. Egress: the relay's ffmpeg is really writing to the provider ingest.
    const flowing = await until(
      async () => {
        const status = await manager.status(session.id);
        return status && status.bytesOut > 0 && status.bitrateKbps > 0
          ? status
          : null;
      },
      { timeoutMs: 30_000, label: "egress bytes" },
    );
    assert.ok(flowing.ready);
    assert.ok(flowing.bitrateKbps > 0);

    const received = await until(
      async () => {
        const bytes = await sinkBytes();
        return bytes > 1_000 ? bytes : 0;
      },
      { label: `bytes at the RTMP ingest (${mediaLog.slice(-300)})` },
    );
    assert.ok(received > 1_000, `ingest received ${received} bytes`);

    // 2. Stall: the relay's own ffmpeg freezes while the WHIP publish keeps
    // running, which is the real failure the watchdog exists for — a process
    // alive and holding its connections but writing nothing out.
    const { pid } = await manager.status(session.id);
    assert.ok(pid > 0, "the session reports its ffmpeg pid");
    process.kill(pid, "SIGSTOP");
    await sleep(2_000);

    assert.deepEqual(await manager.watchdog(1_000), [session.id]);
    const frozen = (await manager.status(session.id)).bytesOut;
    await sleep(1_000);
    const stalled = await manager.status(session.id);
    assert.equal(stalled.stalled, true);
    assert.equal(
      stalled.bytesOut,
      frozen,
      "the real ffmpeg wrote nothing while it was stopped",
    );

    // 3. Recovery: the relay kills and re-spawns ffmpeg on its own; the browser
    // side never stopped, so egress resumes without anyone else acting.
    const receivedBeforeRestart = await sinkBytes();
    assert.deepEqual(await manager.recover(1), [session.id]);
    assert.ok(
      alerts.some((alert) => alert.event === "session.recovering"),
      `alerts: ${alerts.map((alert) => alert.event).join(", ")}`,
    );

    let resumed;
    try {
      resumed = await until(
        async () => {
          const status = await manager.status(session.id);
          return status && status.bytesOut > 0 && !status.stalled
            ? status
            : null;
        },
        { timeoutMs: 30_000, label: "egress after the restart" },
      );
    } catch (error) {
      const status = await manager.status(session.id);
      const receivedNow = await sinkBytes().catch(() => 0);
      throw new Error(
        `${error.message}\nstatus: ${JSON.stringify(status)}\n` +
          `sink bytes: ${receivedNow}\n` +
          `mediamtx: ${mediaLog.slice(-400) || "none"}\n` +
          `relay log:\n${relayLog.slice(-15).join("\n")}`,
      );
    }
    assert.equal(resumed.recoveries, 1);
    assert.ok(resumed.pid > 0, "a replacement ffmpeg is running");
    assert.notEqual(resumed.pid, pid, "the replacement is a new process");
    assert.ok(
      alerts.some((alert) => alert.event === "session.reconnected"),
      `alerts: ${alerts.map((alert) => alert.event).join(", ")}`,
    );

    // And the provider ingest keeps receiving after the swap, from the same
    // WHIP publish that never had to reconnect.
    const receivedAfter = await until(
      async () => {
        const bytes = await sinkBytes();
        return bytes > receivedBeforeRestart ? bytes : 0;
      },
      { label: "bytes still arriving at the RTMP ingest" },
    );
    assert.ok(receivedAfter > receivedBeforeRestart);
  },
);
