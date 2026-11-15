import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SessionManager } from "../src/session-manager.mjs";

/**
 * End-to-end media test: real ffmpeg, real MediaMTX, no fakes.
 *
 * Everything else in this directory tests the relay's decisions. This test
 * tests the thing those decisions are about: an ffmpeg process actually
 * pulling RTSP and writing FLV to an RTMP ingest. It covers the three states
 * the watchdog and recovery path exist for — bytes flowing, bytes stopping
 * while the process stays alive, and bytes coming back after the relay
 * restarted ffmpeg on its own.
 *
 * Needs both binaries; without them the test is skipped, so the ordinary suite
 * stays runnable on a machine that has neither:
 *
 *   RELAY_FFMPEG_PATH=/path/to/ffmpeg MEDIAMTX_PATH=/path/to/mediamtx \
 *     node --test relay/test/e2e-media.test.mjs
 *
 * Ports are deliberately unusual so a local dev server is unlikely to own them.
 */

const FFMPEG = process.env.RELAY_FFMPEG_PATH || "ffmpeg";
const MEDIAMTX = process.env.MEDIAMTX_PATH || "mediamtx";
const RTSP_PORT = 18554;
const RTMP_PORT = 19355;
const API_PORT = 19997;
const API = `http://127.0.0.1:${API_PORT}`;
const SINK_PATH = "live/e2e_key_123";

// ffmpeg answers `-version`, MediaMTX answers `--version`.
const installed = (binary) =>
  spawnSync(binary, ["-version"], { stdio: "ignore" }).status === 0 ||
  spawnSync(binary, ["--version"], { stdio: "ignore" }).status === 0;

const skip = !installed(FFMPEG)
  ? "ffmpeg is not installed (set RELAY_FFMPEG_PATH)"
  : !installed(MEDIAMTX)
    ? "mediamtx is not installed (set MEDIAMTX_PATH)"
    : false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, { timeoutMs = 20_000, everyMs = 250, label }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(everyMs);
  }
}

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
  "real ffmpeg pushes to a real RTMP ingest, stalls, and recovers",
  { skip, timeout: 120_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "relay-e2e-"));
    const configPath = join(dir, "mediamtx.yml");
    await writeFile(
      configPath,
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
        "webrtc: no",
        "hls: no",
        "srt: no",
        "paths:",
        "  all_others:",
        "",
      ].join("\n"),
    );

    const media = spawn(MEDIAMTX, [configPath], { stdio: ["ignore", "pipe", "pipe"] });
    let mediaLog = "";
    media.stdout.on("data", (chunk) => (mediaLog += chunk));
    media.stderr.on("data", (chunk) => (mediaLog += chunk));

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
      // The relay appends the session id, which is the RTSP path the publisher
      // below pushes to.
      rtspUrl: `rtsp://127.0.0.1:${RTSP_PORT}`,
      ffmpegPath: FFMPEG,
      maxRecoveries: 1,
      onAlert: (alert) => alerts.push(alert),
      logger: relayLogger,
    });

    let publisher = null;
    t.after(async () => {
      await manager.stopAll().catch(() => {});
      if (publisher && publisher.exitCode === null) {
        publisher.kill("SIGCONT");
        publisher.kill("SIGKILL");
      }
      media.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    });

    await until(
      async () => {
        try {
          return (await fetch(`${API}/v3/config/global/get`)).ok;
        } catch {
          return false;
        }
      },
      { label: `MediaMTX on :${RTSP_PORT}/:${API_PORT}` },
    );

    const session = await manager.create({
      rtmpUrl: `rtmp://127.0.0.1:${RTMP_PORT}/live`,
      streamKey: "e2e_key_123",
    });

    // A live source: colour bars encoded once here, copied end to end by the
    // relay. Starts after the session, which is the real ordering too.
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
        "testsrc2=size=320x240:rate=15",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-g",
        "15",
        "-pix_fmt",
        "yuv420p",
        "-f",
        "rtsp",
        "-rtsp_transport",
        "tcp",
        `rtsp://127.0.0.1:${RTSP_PORT}/${session.id}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let publisherLog = "";
    publisher.stderr.on("data", (chunk) => (publisherLog += chunk));

    // 1. Egress: the relay's ffmpeg is really writing to the provider ingest.
    const flowing = await until(
      async () => {
        const status = await manager.status(session.id);
        return status && status.bytesOut > 0 && status.bitrateKbps > 0
          ? status
          : null;
      },
      {
        timeoutMs: 30_000,
        label: `egress bytes (publisher log: ${publisherLog.slice(-300)})`,
      },
    );
    assert.ok(flowing.ready, "the browser-side publish is readable");
    assert.ok(flowing.bytesOut > 0);
    assert.ok(
      flowing.bitrateKbps > 0,
      `bitrate should be measured, got ${flowing.bitrateKbps}`,
    );

    const received = await until(
      async () => {
        const bytes = await sinkBytes();
        return bytes > 1_000 ? bytes : 0;
      },
      { label: `bytes at the RTMP ingest (${mediaLog.slice(-300)})` },
    );
    assert.ok(received > 1_000, `ingest received ${received} bytes`);

    // 2. Stall: the relay's own ffmpeg freezes. The publisher keeps sending to
    // MediaMTX, so this is the real failure the watchdog exists for — a process
    // that is alive and holding its connection but writing nothing out.
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

    // 3. Recovery: the relay kills and re-spawns ffmpeg on its own, the source
    // never stopped flowing, so egress resumes without anyone else acting.
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
          `sink bytes: ${receivedNow}\npublisher alive: ${
            publisher.exitCode === null
          } (log: ${publisherLog.slice(-400) || "none"})\n` +
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

    // And the provider ingest keeps receiving after the swap.
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
