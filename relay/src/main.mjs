import { spawn } from "node:child_process";
import { MediaMtxClient } from "./mediamtx.mjs";
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
});

const ttlMs = Number(process.env.SESSION_TTL_MINUTES || 360) * 60_000;
const sweeper = setInterval(() => void manager.sweep(ttlMs), 60_000);
sweeper.unref();

const server = createRelayServer({ manager, token });
server.listen(port, () => {
  console.log(`[relay] control API on :${port}`);
  console.log(`[relay] publishing under ${publicUrl}/<session>/whip`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[relay] ${signal} received — closing sessions`);
  clearInterval(sweeper);
  server.close();
  await manager.stopAll();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
