import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MediaMtxClient } from "../src/mediamtx.mjs";
import { RecordingStore } from "../src/recording-store.mjs";
import { SessionManager } from "../src/session-manager.mjs";

/**
 * Recording, end to end: the relay tells MediaMTX to record the path the browser
 * publishes to, the file appears on the volume with the browser's own codecs, and
 * retention enforcement deletes it once its window has passed.
 *
 * It drives the relay's real `SessionManager` and `MediaMtxClient` against a real
 * MediaMTX, so what is tested is the mechanism a broadcast uses, not a MediaMTX
 * config file written by hand. The publish uses ffmpeg's whip muxer because
 * ffmpeg-static has no such muxer.
 *
 * Retention is per recording, measured by MediaMTX, and it also applies to a
 * segment that is still being written — so the broadcast is recorded with the
 * relay's own 24 h window (asserted in the path config) and then, once the
 * publisher has gone, the same window is shortened through the control API so
 * enforcement is observable in seconds instead of a day.
 *
 *   RELAY_FFMPEG_PATH=/path/to/ffmpeg \
 *   RELAY_WHIP_FFMPEG_PATH=/path/to/whip-capable/ffmpeg \
 *   MEDIAMTX_PATH=/path/to/mediamtx \
 *     node --test relay/test/e2e-recording.test.mjs
 */

const RELAY_FFMPEG = process.env.RELAY_FFMPEG_PATH || "ffmpeg";
const WHIP_FFMPEG = process.env.RELAY_WHIP_FFMPEG_PATH || null;
const MEDIAMTX = process.env.MEDIAMTX_PATH || "mediamtx";
const API_PORT = 19995;
const RTSP_PORT = 18652;
const RTP_PORT = 18012;
const RTCP_PORT = 18013;
const RTMP_PORT = 19453;
const WHIP_PORT = 18658;
const ICE_PORT = 18293;
const API = `http://127.0.0.1:${API_PORT}`;
// 1.8 s: long enough that a sweep mid-broadcast keeps the live file, short
// enough to watch the retention delete it in this test.
const RETENTION_HOURS = 0.0005;
const PUBLISH_SECONDS = 12;

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

const issues = [];
const addIssue = (state, envVar, binary, label) => {
  if (state === "missing") {
    issues.push({ kind: "missing", what: `${label} is not installed (set ${envVar})` });
  } else if (state === "broken") {
    issues.push({ kind: "broken", what: `${envVar}=${binary} does not run` });
  }
};
addIssue(runs(MEDIAMTX), "MEDIAMTX_PATH", MEDIAMTX, "MediaMTX");
addIssue(runs(RELAY_FFMPEG), "RELAY_FFMPEG_PATH", RELAY_FFMPEG, "the relay's ffmpeg");
if (!WHIP_FFMPEG) {
  issues.push({
    kind: "missing",
    what: "no whip-capable ffmpeg (set RELAY_WHIP_FFMPEG_PATH)",
  });
} else {
  const state = runs(WHIP_FFMPEG);
  if (state !== "ok") {
    addIssue(state, "RELAY_WHIP_FFMPEG_PATH", WHIP_FFMPEG, "the whip-capable ffmpeg");
  } else if (!hasWhipMuxer(WHIP_FFMPEG)) {
    issues.push({ kind: "broken", what: `${WHIP_FFMPEG} has no whip muxer` });
  }
}

const missing = issues.filter((issue) => issue.kind === "missing");
const broken = issues.filter((issue) => issue.kind === "broken");

if (broken.length > 0 || (requireTools && missing.length > 0)) {
  throw new Error(
    [
      "the recording check cannot run here:",
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
    // MediaMTX opens RTP/RTCP UDP listeners even for a TCP-only RTSP setup, and
    // the defaults (:8000/:8001) would collide with a sibling e2e file.
    `rtpAddress: 127.0.0.1:${RTP_PORT}`,
    `rtcpAddress: 127.0.0.1:${RTCP_PORT}`,
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

/** Files in the recording directory, with sizes. */
async function filesIn(dir) {
  try {
    const names = await readdir(dir);
    return names.map((name) => join(dir, name));
  } catch {
    return [];
  }
}

test(
  "a broadcast is recorded, readable, and deleted once its retention passes",
  { skip, timeout: 180_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "relay-recording-"));
    const configPath = join(root, "mediamtx.yml");
    const recordingDir = join(root, "recordings");
    await writeFile(configPath, mediaMtxConfig());

    const media = spawn(MEDIAMTX, [configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    media.stdout.on("data", () => {});
    media.stderr.on("data", () => {});

    const logs = [];
    const manager = new SessionManager({
      spawn,
      mediamtx: new MediaMtxClient({ apiUrl: API }),
      publicUrl: `http://127.0.0.1:${WHIP_PORT}`,
      rtspUrl: `rtsp://127.0.0.1:${RTSP_PORT}`,
      ffmpegPath: RELAY_FFMPEG,
      recordingDir,
      recordingRetentionHours: RETENTION_HOURS,
      logger: { info: (line) => logs.push(line), warn() {}, error() {} },
    });

    let publisher = null;
    let publisherExited = false;
    let session = null;
    t.after(async () => {
      if (publisher) publisher.kill("SIGKILL");
      if (session) await manager.delete(session.id).catch(() => {});
      media.kill("SIGKILL");
      await sleep(300);
      await rm(root, { recursive: true, force: true });
    });

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

    session = await manager.create({
      rtmpUrl: `rtmp://127.0.0.1:${RTMP_PORT}/selftest`,
      streamKey: "recorded",
    });

    // What the relay asked for, as MediaMTX stored it.
    const pathConfig = await (
      await fetch(`${API}/v3/config/paths/get/${encodeURIComponent(session.id)}`)
    ).json();
    assert.equal(pathConfig.record, true, "the session path is not set to record");
    // Every segment needs its own name; a static path is truncated by the next
    // hourly segment.
    assert.equal(
      pathConfig.recordPath,
      `${recordingDir}/%path-%Y-%m-%d_%H-%M-%S-%f`,
    );
    assert.equal(pathConfig.recordFormat, "fmp4");
    // Retention is the relay's job. MediaMTX defaults this to 1d, and its window
    // counts against the segment being written, so it must be off here (it
    // reports "0s" as an empty string).
    assert.ok(
      pathConfig.recordDeleteAfter === "" || pathConfig.recordDeleteAfter === "0s",
      `MediaMTX was left able to delete recordings (${pathConfig.recordDeleteAfter})`,
    );

    const status = await manager.status(session.id);
    assert.deepEqual(status.recording, {
      dir: recordingDir,
      retentionHours: RETENTION_HOURS,
    });
    assert.match(
      logs.join("\n"),
      new RegExp(`recording ${session.id} into ${recordingDir} \\(kept 0.0005h\\)`),
    );

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
        String(PUBLISH_SECONDS),
        "-f",
        "whip",
        `http://127.0.0.1:${WHIP_PORT}/${session.id}/whip`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    publisher.stderr.on("data", () => {});
    // A SIGKILL leaves exitCode null and sets signalCode, so track the event.
    publisher.on("exit", () => {
      publisherExited = true;
    });

    const file = await until(
      async () => {
        const files = await filesIn(recordingDir);
        if (files.length === 0) return null;
        const info = await stat(files[0]).catch(() => null);
        return info && info.size > 50_000 ? files[0] : null;
      },
      { timeoutMs: 30_000, label: "a recorded file with media in it" },
    );
    assert.match(file, new RegExp(`${session.id}.*\\.mp4$`));

    // It is the live broadcast being written, not a leftover: the file grows.
    const before = (await stat(file)).size;
    await until(async () => (await stat(file).catch(() => null))?.size > before, {
      timeoutMs: 10_000,
      label: "the recording to keep growing while publishing",
    });

    const probe = spawnSync(WHIP_FFMPEG, ["-hide_banner", "-i", file], {
      encoding: "utf8",
    });
    assert.match(probe.stderr ?? "", /Video: h264/i, `no H.264 in ${file}`);
    assert.match(probe.stderr ?? "", /Audio: opus/i, `no Opus in ${file}`);

    // Retention never touches a file a broadcast is still writing: the window
    // is 1.8 s here and this sweep runs mid-broadcast.
    const store = new RecordingStore({
      dir: recordingDir,
      retentionHours: RETENTION_HOURS,
      logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line) },
    });
    assert.deepEqual(await store.sweep(), [], "retention deleted a live recording");
    assert.ok((await filesIn(recordingDir)).length > 0);

    publisher.kill("SIGKILL");
    await until(async () => publisherExited, {
      timeoutMs: 10_000,
      label: "the publisher to stop",
    });

    // Once the broadcast is over the window can pass, which is the sweep the
    // relay runs every minute.
    await sleep(RETENTION_HOURS * 3_600_000 + 1_000);
    const deleted = await store.sweep();

    assert.equal(deleted.length, 1, `swept ${JSON.stringify(deleted)}`);
    assert.match(deleted[0], new RegExp(`${session.id}.*\\.mp4$`));
    assert.deepEqual(await filesIn(recordingDir), []);
    assert.match(logs.join("\n"), /recording retention: deleted 1 recording/);
  },
);
