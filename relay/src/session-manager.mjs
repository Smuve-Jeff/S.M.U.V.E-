import { randomUUID } from "node:crypto";
import { pushUrl, validateDestination, ValidationError } from "./destinations.mjs";

/** An ffmpeg that dies this fast never got a usable input: retry it. */
const RESTART_WINDOW_MS = 5_000;
const BASE_RESTART_DELAY_MS = 1_000;

/**
 * One session = one MediaMTX publish path + one ffmpeg pushing RTSP to RTMP.
 *
 * The WebRTC receiver (MediaMTX) and the RTMP sender (ffmpeg) are separate
 * processes, so this supervises the sender: an ffmpeg that starts before the
 * browser has connected fails instantly, which is exactly the case the retry
 * loop exists for. Once it has been running for a while, an exit means the
 * provider dropped us and the session is closed rather than silently retried.
 */
export class SessionManager {
  #sessions = new Map();
  #spawn;
  #mediamtx;
  #publicUrl;
  #rtspUrl;
  #ffmpegPath;
  #maxRestarts;
  #logger;
  #store;
  #onAlert;

  constructor({
    spawn,
    mediamtx,
    publicUrl,
    rtspUrl,
    ffmpegPath = "ffmpeg",
    maxRestarts = 5,
    logger = console,
    /** Optional SessionStore: keeps sessions across a relay restart. */
    store = null,
    /** Called when a session's egress stalls or recovers. */
    onAlert = null,
  }) {
    if (typeof spawn !== "function") throw new Error("spawn is required");
    if (!mediamtx) throw new Error("mediamtx client is required");
    if (!publicUrl) throw new Error("PUBLIC_RELAY_URL is required");
    this.#spawn = spawn;
    this.#mediamtx = mediamtx;
    this.#publicUrl = String(publicUrl).replace(/\/+$/, "");
    this.#rtspUrl = String(rtspUrl).replace(/\/+$/, "");
    this.#ffmpegPath = ffmpegPath;
    this.#maxRestarts = Math.max(0, Number(maxRestarts) || 0);
    this.#logger = logger;
    this.#store = store;
    this.#onAlert = typeof onAlert === "function" ? onAlert : null;
  }

  async create(input, { kind = "broadcast" } = {}) {
    const { rtmpUrl, streamKey } = validateDestination(input);
    const id = randomUUID().replace(/-/g, "");
    await this.#mediamtx.addPath(id);

    const session = {
      id,
      kind,
      destination: pushUrl(rtmpUrl, streamKey),
      createdAt: Date.now(),
      restarts: 0,
      stopped: false,
      child: null,
      timer: null,
      error: null,
      // Egress watchdog: bytes ffmpeg last reported writing to the provider.
      bytesOut: 0,
      lastBytesAt: null,
      stalled: false,
      alerts: 0,
      progressBuffer: "",
    };
    this.#sessions.set(id, session);
    this.#startFfmpeg(session);
    this.#logger.info?.(`[relay] session ${id} open`);
    await this.#persist();
    return { id, whipUrl: `${this.#publicUrl}/${id}/whip` };
  }

  /** Public view — the destination (and its key) never leaves this process. */
  list() {
    return [...this.#sessions.values()].map((session) => ({
      id: session.id,
      createdAt: new Date(session.createdAt).toISOString(),
      restarts: session.restarts,
      running: !!session.child,
      error: session.error,
      bytesOut: session.bytesOut,
      stalled: session.stalled,
    }));
  }

  has(id) {
    return this.#sessions.has(id);
  }

  /**
   * Re-attach to sessions that were pushing before this process started.
   *
   * MediaMTX outlives the relay, so the browser's WHIP publish is usually still
   * live and its path still exists: only the RTSP→RTMP half disappeared. A
   * stored session whose path is gone has no publisher and is dropped, which
   * keeps the store honest without needing a shutdown hook to run.
   */
  async restore() {
    if (!this.#store) return 0;
    let records;
    try {
      records = await this.#store.load();
    } catch (error) {
      this.#logger.error?.(
        `[relay] could not read stored sessions: ${error?.message ?? error}`,
      );
      return 0;
    }

    let restored = 0;
    for (const record of records) {
      const id = typeof record?.id === "string" ? record.id : "";
      const destination =
        typeof record?.destination === "string" ? record.destination : "";
      if (!id || !destination) continue;

      const path =
        typeof this.#mediamtx.getPath === "function"
          ? await this.#mediamtx.getPath(id).catch(() => null)
          : null;
      if (!path) {
        this.#logger.info?.(
          `[relay] dropping stored session ${id}: its publisher is gone`,
        );
        continue;
      }

      this.#sessions.set(id, {
        id,
        kind: record.kind === "selftest" ? "selftest" : "broadcast",
        destination,
        createdAt: Number(record.createdAt) || Date.now(),
        restarts: 0,
        stopped: false,
        child: null,
        timer: null,
        error: null,
        bytesOut: 0,
        lastBytesAt: null,
        stalled: false,
        alerts: 0,
        progressBuffer: "",
      });
      this.#startFfmpeg(this.#sessions.get(id));
      restored += 1;
      this.#logger.info?.(`[relay] restored session ${id}`);
    }

    await this.#persist();
    return restored;
  }

  async #persist() {
    if (!this.#store) return;
    const records = [...this.#sessions.values()].map((session) => ({
      id: session.id,
      kind: session.kind,
      destination: session.destination,
      createdAt: session.createdAt,
    }));
    try {
      await this.#store.save(records);
    } catch (error) {
      // Persistence is best effort: a full disk must not drop a live push.
      this.#logger.error?.(
        `[relay] could not persist sessions: ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Is the media server this relay depends on actually there? A relay that can
   * open sessions but cannot reach MediaMTX fails every publish silently, so
   * the app's boot check asks this before a host goes live.
   */
  async health() {
    if (typeof this.#mediamtx.ping !== "function") {
      return { mediamtx: "unknown", detail: null };
    }
    const reachable = await this.#mediamtx.ping().catch(() => false);
    return reachable
      ? { mediamtx: "reachable", detail: null }
      : {
          mediamtx: "unreachable",
          detail: "MediaMTX did not answer its control API",
        };
  }

  /**
   * Live view of one session for a self-test: MediaMTX reports whether the
   * browser's publish became readable and how many bytes it carried, which is
   * the difference between "the URL was accepted" and "media arrived".
   */
  async status(id) {
    const session = this.#sessions.get(id);
    if (!session) return null;
    const path =
      typeof this.#mediamtx.getPath === "function"
        ? await this.#mediamtx.getPath(id).catch(() => null)
        : null;
    const tracks = Array.isArray(path?.tracks) ? path.tracks : [];
    return {
      id,
      kind: session.kind,
      createdAt: new Date(session.createdAt).toISOString(),
      running: !!session.child,
      restarts: session.restarts,
      error: session.error,
      ready: !!path?.ready,
      bytesReceived: Number(path?.bytesReceived ?? 0),
      tracks,
      // Egress (relay → provider), as opposed to bytesReceived above
      // (browser → MediaMTX). A session can be receiving fine and pushing
      // nothing, which is exactly what the watchdog watches for.
      bytesOut: session.bytesOut,
      stalled: session.stalled,
      stalledForMs: session.stalledForMs ?? 0,
    };
  }

  async delete(id, { reason = "requested" } = {}) {
    const session = this.#sessions.get(id);
    if (!session) return false;
    session.stopped = true;
    if (session.timer) clearTimeout(session.timer);
    session.child?.kill?.("SIGTERM");
    this.#sessions.delete(id);
    try {
      await this.#mediamtx.deletePath(id);
    } catch (error) {
      this.#logger.error?.(
        `[relay] could not delete path ${id}: ${error?.message ?? error}`,
      );
    }
    this.#logger.info?.(`[relay] session ${id} closed (${reason})`);
    await this.#persist();
    return true;
  }

  async stopAll() {
    await Promise.all(
      [...this.#sessions.keys()].map((id) =>
        this.delete(id, { reason: "shutdown" }),
      ),
    );
  }

  /**
   * Flag sessions that were pushing and then went silent.
   *
   * `bytesReceived` proves the browser is still sending to MediaMTX; it says
   * nothing about whether the provider is getting anything, because ffmpeg can
   * sit connected and write nothing after the RTMP side dies. ffmpeg's own
   * `-progress` output is the only honest egress signal, so a session that has
   * reported bytes and then stopped for a full window is alerted once, and
   * alerted again when it recovers.
   *
   * A session that has never reported bytes is left alone: it is either still
   * connecting or ffmpeg's own retry loop is already handling it.
   */
  async watchdog(stallMs, now = Date.now()) {
    const windowMs = Number(stallMs);
    if (!Number.isFinite(windowMs) || windowMs <= 0) return [];
    const flagged = [];
    for (const session of this.#sessions.values()) {
      if (!session.child || session.stalled) continue;
      if (!session.lastBytesAt || session.bytesOut <= 0) continue;
      const silentFor = now - session.lastBytesAt;
      if (silentFor < windowMs) continue;

      session.stalled = true;
      session.stalledForMs = silentFor;
      session.alerts += 1;
      flagged.push(session.id);
      this.#logger.error?.(
        `[relay] ALERT session ${session.id} has sent nothing to the provider for ${Math.round(
          silentFor / 1000,
        )}s (last total_size ${session.bytesOut})`,
      );
      this.#alert({
        event: "session.stalled",
        sessionId: session.id,
        kind: session.kind,
        bytesOut: session.bytesOut,
        stalledForMs: silentFor,
      });
    }
    return flagged;
  }

  #alert(payload) {
    if (!this.#onAlert) return;
    try {
      const result = this.#onAlert({ ...payload, at: new Date().toISOString() });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (error) {
      this.#logger.error?.(`[relay] alert handler failed: ${error?.message ?? error}`);
    }
  }

  /**
   * ffmpeg writes `key=value` blocks to stdout every ~0.5s when started with
   * `-progress pipe:1`; `total_size` is what it has written to the FLV muxer,
   * i.e. the provider side. Chunks split lines, so keep the remainder.
   */
  #readProgress(session, chunk) {
    session.progressBuffer = (session.progressBuffer + String(chunk)).slice(-4096);
    const lines = session.progressBuffer.split("\n");
    session.progressBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const match = /^total_size=(\d+)\s*$/.exec(line.trim());
      if (!match) continue;
      const size = Number(match[1]);
      if (!Number.isFinite(size) || size <= session.bytesOut) continue;
      session.bytesOut = size;
      session.lastBytesAt = Date.now();
      if (session.stalled) {
        const silentFor = session.stalledForMs ?? 0;
        session.stalled = false;
        session.stalledForMs = 0;
        this.#logger.warn?.(
          `[relay] session ${session.id} egress recovered at ${size} bytes (was silent for ${Math.round(
            silentFor / 1000,
          )}s)`,
        );
        this.#alert({
          event: "session.recovered",
          sessionId: session.id,
          kind: session.kind,
          bytesOut: size,
          stalledForMs: silentFor,
        });
      }
    }
  }

  /** Close sessions that have been open longer than the configured lifetime. */
  async sweep(maxAgeMs) {
    if (!Number.isFinite(maxAgeMs)) return;
    for (const [id, session] of this.#sessions) {
      if (Date.now() - session.createdAt > maxAgeMs) {
        await this.delete(id, { reason: "aged-out" });
      }
    }
  }

  #startFfmpeg(session) {
    const startedAt = Date.now();
    const child = this.#spawn(
      this.#ffmpegPath,
      [
        "-nostdin",
        "-loglevel",
        "error",
        "-nostats",
        "-progress",
        "pipe:1",
        "-rtsp_transport",
        "tcp",
        "-i",
        `${this.#rtspUrl}/${session.id}`,
        "-c",
        "copy",
        "-f",
        "flv",
        session.destination,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    session.child = child;

    child.stdout?.on?.("data", (chunk) => this.#readProgress(session, chunk));
    child.stderr?.on?.("data", (chunk) => {
      // Keep the last line for the session list instead of flooding logs.
      session.error = String(chunk).trim().slice(0, 300) || session.error;
    });
    child.once?.("error", (error) => {
      session.error = error?.message ?? "ffmpeg failed to start";
    });

    child.once("exit", (code, signal) => {
      session.child = null;
      if (session.stopped) return;
      const lived = Date.now() - startedAt;
      if (lived < RESTART_WINDOW_MS && session.restarts < this.#maxRestarts) {
        session.restarts += 1;
        const delay = BASE_RESTART_DELAY_MS * session.restarts;
        this.#logger.warn?.(
          `[relay] ffmpeg for ${session.id} exited early; retry ${session.restarts}/${this.#maxRestarts} in ${delay}ms`,
        );
        session.timer = setTimeout(() => {
          if (!session.stopped) this.#startFfmpeg(session);
        }, delay);
        session.timer.unref?.();
        return;
      }
      this.#logger.error?.(
        `[relay] ffmpeg for ${session.id} exited (code ${code}${
          signal ? `, ${signal}` : ""
        }); closing the session`,
      );
      void this.delete(session.id, { reason: "ffmpeg-exited" });
    });
  }
}

export { ValidationError };
