import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { ValidationError } from "./destinations.mjs";

const MAX_BODY_BYTES = 8 * 1024;

function send(res, status, payload) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Constant-time compare, so the token is not guessable by timing a 401. */
function authorized(req, token) {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

/** Plain file names only: no separators, no hidden files, no traversal. */
const RECORDING_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Files in the recording volume, newest first. */
async function listRecordings(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const rows = await Promise.all(
    names.map(async (name) => {
      if (!RECORDING_NAME.test(name)) return null;
      const info = await stat(join(dir, name)).catch(() => null);
      if (!info?.isFile()) return null;
      return {
        name,
        bytes: info.size,
        modifiedAt: new Date(info.mtimeMs).toISOString(),
      };
    }),
  );
  return rows
    .filter(Boolean)
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

/** One recording, resolved inside the volume. Null means "not there". */
async function openRecording(dir, name) {
  if (!RECORDING_NAME.test(name)) return null;
  const file = join(dir, name);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  return { file, bytes: info.size };
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ValidationError("body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("body must be JSON");
  }
}

/**
 * The control API is exactly what the S.M.U.V.E server calls:
 *   POST   /sessions       { rtmpUrl, streamKey } -> 201 { id, whipUrl }
 *   DELETE /sessions/:id   -> 204
 *   GET    /recordings     -> 200 { recordings: [{ name, bytes, modifiedAt }] }
 *   GET    /recordings/:name -> the file itself
 *   GET    /health         -> 200 (unauthenticated, for liveness probes)
 */
export function createRelayServer({
  manager,
  token = "",
  logger = console,
  /** Fixed RTMP sink the self-test publishes to; null disables the endpoint. */
  selftestDestination = null,
  selftestTtlMs = 180_000,
  /** Volume MediaMTX records broadcasts into; null means recording is off. */
  recordingDir = null,
}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://relay.local");

      if (req.method === "GET" && url.pathname === "/health") {
        const health = await manager.health?.();
        const degraded = health?.mediamtx === "unreachable";
        const sessions = manager.list();
        return send(res, degraded ? 503 : 200, {
          status: degraded ? "degraded" : "ok",
          sessions: sessions.length,
          // A stalled session is not degraded: new broadcasts still work, but
          // an operator's probe can see that one is silent.
          stalled: sessions.filter((session) => session.stalled).length,
          mediamtx: health?.mediamtx ?? "unknown",
          detail: health?.detail ?? null,
        });
      }

      if (!authorized(req, token)) {
        return send(res, 401, { error: "unauthorized" });
      }

      if (req.method === "POST" && url.pathname === "/sessions") {
        const session = await manager.create(await readJson(req));
        return send(res, 201, session);
      }

      // A self-test proves WHIP → MediaMTX → ffmpeg → RTMP without a real
      // host or provider key, so it may only target the configured sink.
      if (req.method === "POST" && url.pathname === "/selftest") {
        if (!selftestDestination) {
          return send(res, 503, {
            error: "SELFTEST_RTMP_URL is not configured on this relay",
          });
        }
        const session = await manager.create(selftestDestination, {
          kind: "selftest",
        });
        const timer = setTimeout(
          () => void manager.delete(session.id, { reason: "selftest-timeout" }),
          selftestTtlMs,
        );
        timer.unref?.();
        return send(res, 201, session);
      }

      // Recordings: the relay owns the volume, so it is also the only thing
      // that may hand a file out. Names are validated, never joined blindly.
      if (req.method === "GET" && url.pathname === "/recordings") {
        if (!recordingDir) {
          return send(res, 503, {
            error: "recording is not configured on this relay",
          });
        }
        return send(res, 200, { recordings: await listRecordings(recordingDir) });
      }
      const recording = /^\/recordings\/([^/]{1,128})$/.exec(url.pathname);
      if (req.method === "GET" && recording) {
        if (!recordingDir) {
          return send(res, 503, {
            error: "recording is not configured on this relay",
          });
        }
        let name;
        try {
          name = decodeURIComponent(recording[1]);
        } catch {
          return send(res, 400, { error: "bad recording name" });
        }
        const found = await openRecording(recordingDir, name);
        if (!found) return send(res, 404, { error: "no such recording" });
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": found.bytes,
          "Content-Disposition": `attachment; filename="${basename(found.file)}"`,
          "Cache-Control": "private, no-store",
        });
        createReadStream(found.file).pipe(res);
        return;
      }

      const match = /^\/sessions\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
      if (req.method === "GET" && match) {
        const status = await manager.status(match[1]);
        if (!status) return send(res, 404, { error: "no such session" });
        return send(res, 200, status);
      }
      if (req.method === "DELETE" && match) {
        await manager.delete(match[1], { reason: "requested" });
        res.writeHead(204);
        res.end();
        return;
      }

      return send(res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof ValidationError) {
        return send(res, 400, { error: error.message });
      }
      logger.error?.(`[relay] ${error?.stack ?? error}`);
      return send(res, 502, { error: "relay failure" });
    }
  });
}
