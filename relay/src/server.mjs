import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename } from "node:path";
import { ValidationError } from "./destinations.mjs";
import { RecordingStore } from "./recording-store.mjs";

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

/**
 * `Range: bytes=…` for one file. A browser's `<video>` seeks by asking for
 * byte ranges, so serving recordings without this makes playback impossible.
 * Returns null for an absent or unsatisfiable range; the caller tells the two
 * apart by looking at the header it passed in.
 */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (!Number.isFinite(size) || size <= 0) return null;

  let start;
  let end;
  if (rawStart === "") {
    // `bytes=-N` is the last N bytes.
    const wanted = Number(rawEnd);
    if (!Number.isFinite(wanted) || wanted <= 0) return null;
    start = Math.max(0, size - wanted);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
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
 *   GET    /recordings     -> 200 { retentionHours, recordings: [{ name, bytes, modifiedAt, durationSeconds, keepHours, keepUntil }] }
 *   GET    /recordings/:name -> the file itself, byte ranges included
 *   GET    /recordings/:name/thumbnail -> a cached JPEG frame of that file
 *   DELETE /recordings/:name -> 204, freeing the recording and its frame now
 *   PUT    /recordings/:name/retention { hours } -> keep it past the window
 *   GET    /health         -> 200 { status, sessions, recordingEnabled, recordingRetentionHours } (open)
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
  /**
   * The store that owns `recordingDir`. Pass it in so one instance serves the
   * list, the files and the thumbnails; the directory alone is enough for a
   * server that never generates a thumbnail.
   */
  recordings = null,
}) {
  const store =
    recordings ??
    (recordingDir
      ? new RecordingStore({ dir: recordingDir, retentionHours: 0 })
      : null);

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
          // Config, not a secret: callers that show a retention deadline need
          // to notice when the window they read last is no longer the one in
          // force. Health is the cheapest place to ask.
          recordingEnabled: Boolean(store),
          recordingRetentionHours: store?.retentionHours ?? 0,
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
        if (!store) {
          return send(res, 503, {
            error: "recording is not configured on this relay",
          });
        }
        // The window travels with the list so a caller can say when an unpinned
        // show will go, instead of guessing the operator's policy.
        return send(res, 200, {
          retentionHours: store.retentionHours ?? 0,
          recordings: await store.list(),
        });
      }
      const thumbnail = /^\/recordings\/([^/]{1,128})\/thumbnail$/.exec(
        url.pathname,
      );
      if (req.method === "GET" && thumbnail) {
        if (!store) {
          return send(res, 503, {
            error: "recording is not configured on this relay",
          });
        }
        let name;
        try {
          name = decodeURIComponent(thumbnail[1]);
        } catch {
          return send(res, 400, { error: "bad recording name" });
        }
        const target = await store.thumbnail(name);
        const info = target ? await stat(target).catch(() => null) : null;
        if (!info?.isFile()) {
          return send(res, 404, { error: "no thumbnail for that recording" });
        }
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": info.size,
          // A finished recording never changes, so the frame will not either.
          "Cache-Control": "private, max-age=86400",
        });
        createReadStream(target).pipe(res);
        return;
      }
      const retention = /^\/recordings\/([^/]{1,128})\/retention$/.exec(
        url.pathname,
      );
      if (req.method === "PUT" && retention) {
        if (!store) {
          return send(res, 503, {
            error: "recording is not configured on this relay",
          });
        }
        let name;
        try {
          name = decodeURIComponent(retention[1]);
        } catch {
          return send(res, 400, { error: "bad recording name" });
        }
        const body = await readJson(req);
        const hours = body?.hours;
        // A JSON number only: `null` happily becomes 0, and 0 means "forget the
        // pin", which a caller asking for nothing must not be able to trigger.
        if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 0) {
          return send(res, 400, { error: "hours must be whole hours, 0 to clear" });
        }
        let pin;
        try {
          pin = await store.setRetention(name, hours);
        } catch (error) {
          if (error instanceof RangeError) {
            return send(res, 400, { error: error.message });
          }
          throw error;
        }
        if (!pin) return send(res, 404, { error: "no such recording" });
        return send(res, 200, { keepHours: pin.hours, keepUntil: pin.until });
      }

      const recording = /^\/recordings\/([^/]{1,128})$/.exec(url.pathname);
      if (req.method === "DELETE" && recording) {
        if (!store) {
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
        // Idempotent by answer: a file that is already gone is the outcome the
        // caller asked for, so a repeated delete is not an error.
        await store.remove(name);
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "GET" && recording) {
        if (!store) {
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
        const found = await store.open(name);
        if (!found) return send(res, 404, { error: "no such recording" });
        const rangeHeader = req.headers.range;
        const range = parseRange(rangeHeader, found.bytes);
        const headers = {
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Content-Disposition": `attachment; filename="${basename(found.file)}"`,
          "Cache-Control": "private, no-store",
        };
        if (rangeHeader && !range) {
          res.writeHead(416, {
            ...headers,
            "Content-Range": `bytes */${found.bytes}`,
          });
          res.end();
          return;
        }
        if (range) {
          res.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${range.start}-${range.end}/${found.bytes}`,
            "Content-Length": range.end - range.start + 1,
          });
          createReadStream(found.file, {
            start: range.start,
            end: range.end,
          }).pipe(res);
          return;
        }
        res.writeHead(200, { ...headers, "Content-Length": found.bytes });
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
