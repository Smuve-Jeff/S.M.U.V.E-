import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
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
 *   GET    /health         -> 200 (unauthenticated, for liveness probes)
 */
export function createRelayServer({
  manager,
  token = "",
  logger = console,
  /** Fixed RTMP sink the self-test publishes to; null disables the endpoint. */
  selftestDestination = null,
  selftestTtlMs = 180_000,
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
