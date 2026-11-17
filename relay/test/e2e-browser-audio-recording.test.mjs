import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MediaMtxClient } from "../src/mediamtx.mjs";
import { RecordingStore } from "../src/recording-store.mjs";
import { SessionManager } from "../src/session-manager.mjs";

/**
 * The browser audio path, end to end.
 *
 * This is the test the relay-only checks could not write: Chromium itself builds
 * two distinct synthetic audio tracks (a 440 Hz "mic" and a 2 kHz "game"), hands
 * them to the real `WhipPublisher`, and publishes the mixed result through
 * MediaMTX. The recording is then decoded and both tones must be present. A
 * regression that drops either source, or that creates a suspended AudioContext
 * after the user gesture, leaves one tone missing or produces silence.
 *
 * The page deliberately primes the mixer on the click, waits 750 ms to stand in
 * for the API session request, and only then starts WHIP. That is the same
 * ordering as `BroadcastIngestService.start`, and the test asserts the primed
 * context is still the one the mix used.
 *
 * Needs Playwright Chromium, esbuild, an ffmpeg, and MediaMTX:
 *
 *   npx playwright install chromium
 *   RELAY_FFMPEG_PATH=/path/to/ffmpeg \
 *   MEDIAMTX_PATH=/path/to/mediamtx \
 *     node --test relay/test/e2e-browser-audio-recording.test.mjs
 *
 * Absent tools skip; configured-but-broken tools fail. A Chromium that cannot
 * launch because its OS libraries are missing also skips locally, but fails
 * when `RELAY_E2E_REQUIRE_TOOLS=1` (CI) promises the dependencies are installed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "../..");
const RELAY_FFMPEG = process.env.RELAY_FFMPEG_PATH || "ffmpeg";
const MEDIAMTX = process.env.MEDIAMTX_PATH || "mediamtx";
const API_PORT = 19996;
const PAGE_PORT = 19993;
const RTSP_PORT = 18653;
const RTP_PORT = 18022;
const RTCP_PORT = 18023;
const RTMP_PORT = 19454;
const WHIP_PORT = 18659;
const ICE_PORT = 18294;
const API = `http://127.0.0.1:${API_PORT}`;
const PAGE_URL = `http://127.0.0.1:${PAGE_PORT}`;
const SAMPLE_RATE = 48_000;
/** Two exact seconds: both 440 Hz and 2 kHz land on integer DFT bins. */
const TONE_WINDOW_SAMPLES = SAMPLE_RATE * 2;

let chromium = null;
let esbuild = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  // The test reports the missing dependency instead of failing the suite.
}
try {
  esbuild = await import("esbuild");
} catch {
  // Same: a checkout without esbuild skips this browser check.
}

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

if (!chromium) {
  issues.push({
    kind: "missing",
    what: "Playwright is not installed (run npm install, then npx playwright install chromium)",
  });
} else {
  let executable = "";
  try {
    executable = chromium.executablePath();
  } catch {
    executable = "";
  }
  if (!executable || !existsSync(executable)) {
    issues.push({
      kind: "missing",
      what: "Playwright Chromium is not installed (run npx playwright install chromium)",
    });
  }
}
if (!esbuild) {
  issues.push({ kind: "missing", what: "esbuild is not installed (run npm install)" });
}

const missing = issues.filter((issue) => issue.kind === "missing");
const broken = issues.filter((issue) => issue.kind === "broken");

if (broken.length > 0 || (requireTools && missing.length > 0)) {
  throw new Error(
    [
      "the browser audio check cannot run here:",
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

/** A whole number of two-second windows is what makes the tone bins exact. */
function toneMagnitude(samples, sampleRate, frequency) {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let previous = 0;
  let beforePrevious = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index] + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return (
    Math.sqrt(
      previous * previous +
        beforePrevious * beforePrevious -
        coefficient * previous * beforePrevious,
    ) / samples.length
  );
}

function decodeAudio(file, ffmpegPath) {
  const probe = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "f32le",
      "pipe:1",
    ],
    { encoding: null, maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(probe.status, 0, `could not decode ${file}: ${String(probe.stderr)}`);
  const bytes = probe.stdout;
  assert.ok(bytes.length >= TONE_WINDOW_SAMPLES * 4, "the recording has less than two seconds of audio");
  const samples = new Float32Array(bytes.length / 4);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = bytes.readFloatLE(index * 4);
  }
  return samples;
}

const pageHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>WHIP audio mix</title></head>
<body>
  <button id="start" type="button">START BROADCAST</button>
  <pre id="status">idle</pre>
  <script src="/whip-publisher.js"></script>
  <script>
    document.getElementById('start').addEventListener('click', async function () {
      const status = document.getElementById('status');
      const say = function (value) { status.textContent = JSON.stringify(value); };
      try {
        const whipUrl = new URLSearchParams(location.search).get('whip');
        const publisher = new SmuveWhip.WhipPublisher();
        window.publisher = publisher;

        // The click primes the mixer before the API/session wait begins.
        publisher.primeAudioContext();
        window.primedContext = publisher.audioContext;
        window.primedState = publisher.audioContext ? publisher.audioContext.state : 'none';

        // Synthetic mic and game audio: two separate tracks, two frequencies.
        const source = new AudioContext();
        await source.resume();
        const micDestination = source.createMediaStreamDestination();
        const gameDestination = source.createMediaStreamDestination();
        const micGain = source.createGain();
        const gameGain = source.createGain();
        micGain.gain.value = 0.2;
        gameGain.gain.value = 0.2;
        micGain.connect(micDestination);
        gameGain.connect(gameDestination);
        const mic = source.createOscillator();
        const game = source.createOscillator();
        mic.frequency.value = 440;
        game.frequency.value = 2000;
        mic.connect(micGain);
        game.connect(gameGain);
        mic.start();
        game.start();

        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const context = canvas.getContext('2d');
        let frame = 0;
        const paint = function () {
          frame += 1;
          context.fillStyle = frame % 2 === 0 ? '#123456' : '#654321';
          context.fillRect(0, 0, canvas.width, canvas.height);
          requestAnimationFrame(paint);
        };
        paint();
        const video = canvas.captureStream(30).getVideoTracks()[0];
        const stream = new MediaStream([
          video,
          micDestination.stream.getAudioTracks()[0],
          gameDestination.stream.getAudioTracks()[0],
        ]);

        // Stand in for BroadcastIngestService.start(): the API creates the relay
        // session first, so WHIP starts well after the original user gesture.
        await new Promise(function (resolve) { setTimeout(resolve, 750); });
        const ok = await publisher.start(whipUrl, stream);

        window.broadcast = {
          ok: ok,
          state: publisher.state(),
          error: publisher.error(),
          primedState: window.primedState,
          audioState: publisher.audioContext ? publisher.audioContext.state : 'none',
          sameContext: publisher.audioContext === window.primedContext,
          audioTracks: stream.getAudioTracks().length,
          sourceState: source.state,
        };
        window.stopBroadcast = async function () {
          await publisher.stop();
          stream.getTracks().forEach(function (track) { track.stop(); });
          await source.close();
        };
        say(window.broadcast);
      } catch (error) {
        window.broadcast = { ok: false, error: String(error) };
        say(window.broadcast);
      }
    });
  </script>
</body>
</html>
`;

test(
  "Chromium publishes synthetic mic and game audio, and the relay recording keeps both tones",
  { skip, timeout: 180_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "relay-browser-audio-"));
    const configPath = join(root, "mediamtx.yml");
    const recordingDir = join(root, "recordings");
    const bundlePath = join(root, "whip-publisher.js");
    await writeFile(configPath, mediaMtxConfig());

    let media = null;
    let browser = null;
    let server = null;
    let manager = null;
    let session = null;
    const logs = [];

    t.after(async () => {
      await browser?.close().catch(() => {});
      if (session && manager) {
        await manager.delete(session.id, { reason: "test-finished" }).catch(() => {});
      }
      await new Promise((resolveClose) => {
        if (!server) return resolveClose();
        server.close(() => resolveClose());
      });
      media?.kill("SIGKILL");
      await sleep(300);
      await rm(root, { recursive: true, force: true });
    });

    await esbuild.build({
      absWorkingDir: PROJECT_ROOT,
      entryPoints: [join(PROJECT_ROOT, "src/app/services/whip-publisher.ts")],
      bundle: true,
      format: "iife",
      globalName: "SmuveWhip",
      platform: "browser",
      target: ["chrome120"],
      outfile: bundlePath,
      tsconfig: join(PROJECT_ROOT, "tsconfig.json"),
      define: { ngDevMode: "false" },
      logLevel: "silent",
    });
    const bundle = await readFile(bundlePath);

    server = createServer((request, response) => {
      const pathname = new URL(request.url || "/", PAGE_URL).pathname;
      if (pathname === "/whip-publisher.js") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(bundle);
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(pageHtml);
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(PAGE_PORT, "127.0.0.1", () => {
        server.off("error", rejectListen);
        resolveListen();
      });
    });

    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
    } catch (error) {
      const detail = String(error?.message ?? error);
      if (
        /loading shared libraries|Host system is missing dependencies|Executable doesn't exist/i.test(
          detail,
        )
      ) {
        const message =
          "Playwright Chromium cannot run here; install its OS libraries (for example: npx playwright install --with-deps chromium)";
        if (requireTools) throw new Error(`${message}: ${detail}`);
        t.skip(message);
        return;
      }
      throw error;
    }

    media = spawn(MEDIAMTX, [configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    media.stdout.on("data", (chunk) => logs.push(String(chunk)));
    media.stderr.on("data", (chunk) => logs.push(String(chunk)));

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

    manager = new SessionManager({
      spawn,
      mediamtx: new MediaMtxClient({ apiUrl: API }),
      publicUrl: `http://127.0.0.1:${WHIP_PORT}`,
      rtspUrl: `rtsp://127.0.0.1:${RTSP_PORT}`,
      ffmpegPath: RELAY_FFMPEG,
      recordingDir,
      recordingRetentionHours: 0,
      logger: {
        info: (line) => logs.push(String(line)),
        warn: (line) => logs.push(String(line)),
        error: (line) => logs.push(String(line)),
      },
    });
    session = await manager.create({
      rtmpUrl: `rtmp://127.0.0.1:${RTMP_PORT}/egress`,
      streamKey: "browser-audio",
    });

    const page = await browser.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.goto(`${PAGE_URL}/?whip=${encodeURIComponent(session.whipUrl)}`);
    await page.click("#start");
    await page.waitForFunction(
      () => window.broadcast !== undefined,
      undefined,
      { timeout: 30_000 },
    );
    const broadcast = await page.evaluate(() => window.broadcast);
    assert.equal(
      broadcast.ok,
      true,
      `the browser publish failed: ${broadcast.error}${browserErrors.length ? ` (${browserErrors.join("; ")})` : ""}`,
    );
    assert.equal(broadcast.audioTracks, 2, "the test did not build two audio tracks");
    assert.equal(broadcast.primedState, "running", "the click did not start the primed AudioContext");
    assert.equal(broadcast.audioState, "running", "the mixer's AudioContext is not running");
    assert.equal(
      broadcast.sameContext,
      true,
      "WHIP start replaced the AudioContext primed by the click",
    );

    const received = await until(
      async () => {
        const status = await manager.status(session.id);
        const tracks = Array.isArray(status?.tracks) ? status.tracks : [];
        return status?.ready && Number(status.bytesReceived) > 0 && tracks.includes("H264") && tracks.includes("Opus")
          ? status
          : null;
      },
      { timeoutMs: 30_000, label: "the browser's H.264 + Opus WHIP publish" },
    );
    assert.ok(Number(received.bytesReceived) > 0, "MediaMTX received no bytes");

    // Give the relay and MediaMTX enough audio to write several seconds of
    // recording, then prove the RTMP half is being fed too.
    await sleep(6_000);
    const egress = await until(
      async () => {
        const status = await manager.status(session.id);
        return Number(status?.bytesOut) > 0 ? status : null;
      },
      { timeoutMs: 20_000, label: "the relay's RTMP egress" },
    );
    assert.ok(Number(egress.bytesOut) > 0, "the relay pushed no bytes to the RTMP sink");

    await page.evaluate(() => window.stopBroadcast());
    await browser.close();
    browser = null;

    let stableSize = -1;
    let recording = null;
    try {
      recording = await until(
        async () => {
          const names = (await readdir(recordingDir).catch(() => []))
            .filter((name) => name.endsWith(".mp4"));
          if (names.length === 0) return null;
          const candidate = join(recordingDir, names[0]);
          const info = await stat(candidate).catch(() => null);
          if (!info || info.size < 20_000 || info.size !== stableSize) {
            stableSize = info?.size ?? -1;
            return null;
          }
          return candidate;
        },
        { timeoutMs: 30_000, everyMs: 750, label: "a stable recording with both audio sources" },
      );
    } catch (error) {
      const listing = await Promise.all(
        (await readdir(recordingDir).catch(() => [])).map(async (name) => {
          const info = await stat(join(recordingDir, name)).catch(() => null);
          return `${name}:${info?.size ?? "missing"}`;
        }),
      );
      throw new Error(
        `${error.message}; recording dir contains [${listing.join(", ")}]; relay log: ${logs.slice(-8).join("").trim()}`,
      );
    }

    const samples = decodeAudio(recording, RELAY_FFMPEG);
    const windowStart = Math.floor((samples.length - TONE_WINDOW_SAMPLES) / 2);
    const toneWindow = samples.subarray(windowStart, windowStart + TONE_WINDOW_SAMPLES);
    const micTone = toneMagnitude(toneWindow, SAMPLE_RATE, 440);
    const gameTone = toneMagnitude(toneWindow, SAMPLE_RATE, 2000);
    const micFloor = toneMagnitude(toneWindow, SAMPLE_RATE, 300);
    const gameFloor = toneMagnitude(toneWindow, SAMPLE_RATE, 2500);

    assert.ok(
      micTone > 0.01 && micTone > micFloor * 8,
      `the mic tone is missing from the recording (440 Hz ${micTone.toFixed(4)}, floor ${micFloor.toFixed(4)})`,
    );
    assert.ok(
      gameTone > 0.01 && gameTone > gameFloor * 8,
      `the game tone is missing from the recording (2 kHz ${gameTone.toFixed(4)}, floor ${gameFloor.toFixed(4)})`,
    );

    // The recording is owned by the relay's store; make the cleanup assert the
    // same file the tones came from.
    const listed = await new RecordingStore({
      dir: recordingDir,
      retentionHours: 0,
    }).list();
    assert.ok(
      listed.some((row) => join(recordingDir, row.name) === recording),
      "the relay's recording store does not list the file that was decoded",
    );
  },
);
