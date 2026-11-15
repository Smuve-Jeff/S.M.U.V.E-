import { spawn } from "node:child_process";
import { pushUrl } from "./destinations.mjs";
import { MediaMtxClient } from "./mediamtx.mjs";
import { RecordingStore } from "./recording-store.mjs";
import { SessionStore } from "./state-store.mjs";
import { createRelayServer } from "./server.mjs";
import { SessionManager } from "./session-manager.mjs";

const port = Number(process.env.RELAY_PORT || 8080);
const token = process.env.RELAY_TOKEN || "";
const publicUrl = (process.env.PUBLIC_RELAY_URL || "").trim().replace(/\/+$/, "");

if (!publicUrl) {
  console.error(
    "[relay] PUBLIC_RELAY_URL is required — it is the origin the browser publishes WHIP to, e.g. https://relay.example.com",
  );
  process.exit(1);
}
if (!token) {
  console.warn(
    "[relay] RELAY_TOKEN is not set: the control API accepts unauthenticated session creation. Set it, or keep this port off the public internet.",
  );
}

const selftestRtmpUrl = (process.env.SELFTEST_RTMP_URL || "").trim();
const selftestDestination = selftestRtmpUrl
  ? {
      rtmpUrl: selftestRtmpUrl,
      streamKey: process.env.SELFTEST_STREAM_KEY || "selftest",
    }
  : null;

/**
 * A self-test sink that is this relay's own MediaMTX can be inspected: the same
 * control API reports what the sink received, including the re-encoded audio.
 * With a provider sink (Twitch's bandwidth-test ingest, say) there is nothing to
 * ask, so the relay says so instead of guessing.
 */
const selftestIngestPath = (() => {
  if (!selftestDestination) return null;
  try {
    const sink = new URL(
      pushUrl(selftestDestination.rtmpUrl, selftestDestination.streamKey),
    );
    const api = new URL(process.env.MEDIAMTX_API_URL || "http://127.0.0.1:9997");
    if (sink.hostname !== api.hostname) return null;
    return sink.pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
})();

const stateFile = (process.env.RELAY_STATE_FILE || "").trim();
const stateKey = (process.env.RELAY_STATE_KEY || "").trim();
let store = null;
if (stateFile) {
  if (!stateKey) {
    console.error(
      "[relay] RELAY_STATE_FILE is set without RELAY_STATE_KEY: stored sessions contain stream keys, so persistence stays off.",
    );
  } else {
    store = new SessionStore({ path: stateFile, key: stateKey });
  }
}

const alertWebhook = (process.env.ALERT_WEBHOOK_URL || "").trim();
const onAlert = alertWebhook
  ? async (alert) => {
      try {
        const response = await fetch(alertWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alert),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          console.error(`[relay] alert webhook answered ${response.status}`);
        }
      } catch (error) {
        console.error(`[relay] alert webhook failed: ${error?.message ?? error}`);
      }
    }
  : null;

const recordingDir = (process.env.RECORDING_DIR || "").trim() || null;
const recordings = recordingDir
  ? new RecordingStore({
      dir: recordingDir,
      retentionHours: Number(process.env.RECORDING_RETENTION_HOURS ?? 24),
    })
  : null;

const manager = new SessionManager({
  spawn,
  mediamtx: new MediaMtxClient({
    apiUrl: process.env.MEDIAMTX_API_URL || "http://127.0.0.1:9997",
    token: process.env.MEDIAMTX_API_TOKEN || "",
  }),
  publicUrl,
  rtspUrl: process.env.MEDIAMTX_RTSP_URL || "rtsp://127.0.0.1:8554",
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  maxRestarts: Number(process.env.FFMPEG_MAX_RESTARTS ?? 5),
  maxRecoveries: Number(process.env.EGRESS_MAX_RECOVERIES ?? 2),
  audioBitrate: (process.env.EGRESS_AUDIO_BITRATE || "").trim() || "128k",
  audioChannels: Number(process.env.EGRESS_AUDIO_CHANNELS ?? 2),
  ingestPath: selftestIngestPath,
  recordingDir,
  recordingRetentionHours: recordings?.retentionHours ?? 0,
  store,
  onAlert,
});

const restored = await manager.restore();
if (store) console.log(`[relay] restored ${restored} session(s) from ${stateFile}`);

// Recordings outlive their sessions: this deletes what the volume has kept for
// longer than the window, including anything left by a previous run.
const retention = recordings?.enabled
  ? setInterval(() => void recordings.sweep(), 60_000)
  : null;
retention?.unref?.();
if (recordings?.enabled) void recordings.sweep();

const ttlMs = Number(process.env.SESSION_TTL_MINUTES || 360) * 60_000;
const sweeper = setInterval(() => void manager.sweep(ttlMs), 60_000);
sweeper.unref();

// Egress watchdog: a session that was pushing and then went silent is the one
// failure nobody notices until the show is over.
const stallMs = Math.max(0, Number(process.env.EGRESS_STALL_SECONDS ?? 15)) * 1_000;
const recoverMs =
  Math.max(0, Number(process.env.EGRESS_RECOVER_AFTER_SECONDS ?? 45)) * 1_000;
const watchdog = stallMs
  ? setInterval(() => {
      void manager.watchdog(stallMs);
      if (recoverMs > 0) void manager.recover(recoverMs);
    }, Math.max(1_000, Math.min(5_000, stallMs / 3)))
  : null;
watchdog?.unref?.();

const server = createRelayServer({
  manager,
  token,
  selftestDestination,
  selftestTtlMs: Number(process.env.SELFTEST_TTL_SECONDS || 180) * 1_000,
});
server.listen(port, () => {
  console.log(`[relay] control API on :${port}`);
  console.log(`[relay] publishing under ${publicUrl}/<session>/whip`);
  console.log(
    selftestDestination
      ? `[relay] self-test sink: ${selftestDestination.rtmpUrl}` +
        (selftestIngestPath ? ` (ingest inspected at path '${selftestIngestPath}')` : "")
      : "[relay] self-test disabled (SELFTEST_RTMP_URL is not set)",
  );
  console.log(manager.recordingSummary());
  console.log(
    stallMs > 0
      ? `[relay] egress watchdog: ${stallMs / 1_000}s of silence${
          recoverMs > 0
            ? `, restarting ffmpeg after ${recoverMs / 1_000}s`
            : ", reporting only"
        }${alertWebhook ? `, alerting ${alertWebhook}` : ""}`
      : "[relay] egress watchdog disabled (EGRESS_STALL_SECONDS=0)",
  );
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[relay] ${signal} received — closing sessions`);
  clearInterval(sweeper);
  if (retention) clearInterval(retention);
  if (watchdog) clearInterval(watchdog);
  server.close();
  await manager.stopAll();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
