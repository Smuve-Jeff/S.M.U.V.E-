import { randomUUID } from "node:crypto";
import { pushUrl, validateDestination, ValidationError } from "./destinations.mjs";

/** An ffmpeg that dies this fast never got a usable input: retry it. */
const RESTART_WINDOW_MS = 5_000;
const BASE_RESTART_DELAY_MS = 1_000;
/** Pause before re-spawning ffmpeg after a silent-egress recovery. */
const RECOVERY_DELAY_MS = 1_000;

/**
 * One session = one MediaMTX publish path + one ffmpeg pushing RTSP to RTMP.
 *
 * The WebRTC receiver (MediaMTX) and the RTMP sender (ffmpeg) are separate
 * processes, so this supervises the sender: an ffmpeg that starts before the
 * browser has connected fails instantly, which is exactly the case the retry
 * loop exists for. Once it has been running for a while, an exit means the
 * provider dropped us and the session is closed rather than silently retried.
 */
/** MediaMTX track names for audio, and what an operator calls those codecs. */
const AUDIO_TRACK = /audio|opus|g722|pcmu|pcma/i;
const AUDIO_CODEC_NAMES = {
  "MPEG-4 Audio": "AAC",
  "MPEG-1/2 Audio": "MP3",
  Opus: "Opus",
  G722: "G722",
  PCMU: "PCMU",
  PCMA: "PCMA",
};

export class SessionManager {
  #sessions = new Map();
  #spawn;
  #mediamtx;
  #publicUrl;
  #rtspUrl;
  #ffmpegPath;
  #maxRestarts;
  #audioBitrate;
  #audioChannels;
  #ingestPath;
  #recordingDir;
  #recordingRetentionHours;
  #logger;
  #store;
  #onAlert;
  #maxRecoveries;

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
    /** How many times the relay may restart ffmpeg for a stalled session. */
    maxRecoveries = 2,
    /**
     * Audio settings for the Opus → AAC re-encode. Twitch accepts AAC up to
     * 320 kbps and expects stereo, but the right value depends on the material
     * and the host's uplink, so both are settings rather than constants.
     */
    audioBitrate = "128k",
    audioChannels = 2,
    /**
     * MediaMTX path a self-test pushes into, when the sink is this relay's own
     * media server. Its `/v3/paths/get` then reports what the ingest actually
     * received — the audio codec in particular, which is invisible otherwise.
     * Null when the sink is a real provider: that cannot be inspected.
     */
    ingestPath = null,
    /**
     * Where MediaMTX writes broadcast recordings, from a volume mounted into
     * the media server. Null disables recording: a relay without that volume
     * must not ask MediaMTX to write into its own ephemeral filesystem.
     */
    recordingDir = null,
    /** Hours a recording is kept before MediaMTX deletes it; 0 keeps it. */
    recordingRetentionHours = 24,
  }) {
    if (typeof spawn !== "function") throw new Error("spawn is required");
    if (!mediamtx) throw new Error("mediamtx client is required");
    if (!publicUrl) throw new Error("PUBLIC_RELAY_URL is required");
    const bitrate = String(audioBitrate).trim();
    if (!/^\d{1,3}k$/.test(bitrate) || Number(bitrate.slice(0, -1)) < 32) {
      throw new Error(
        `EGRESS_AUDIO_BITRATE must look like 128k, got "${audioBitrate}"`,
      );
    }
    const channels = Number(audioChannels);
    if (channels !== 1 && channels !== 2) {
      throw new Error(
        `EGRESS_AUDIO_CHANNELS must be 1 or 2, got "${audioChannels}"`,
      );
    }
    this.#spawn = spawn;
    this.#mediamtx = mediamtx;
    this.#publicUrl = String(publicUrl).replace(/\/+$/, "");
    this.#rtspUrl = String(rtspUrl).replace(/\/+$/, "");
    this.#ffmpegPath = ffmpegPath;
    this.#maxRestarts = Math.max(0, Number(maxRestarts) || 0);
    this.#audioBitrate = bitrate;
    this.#audioChannels = channels;
    this.#ingestPath =
      typeof ingestPath === "string" && ingestPath.trim()
        ? ingestPath.trim().replace(/^\/+/, "")
        : null;
    this.#recordingDir =
      typeof recordingDir === "string" && recordingDir.trim()
        ? recordingDir.trim().replace(/\/+$/, "")
        : null;
    const retention = Number(recordingRetentionHours);
    if (!Number.isFinite(retention) || retention < 0) {
      throw new Error(
        `RECORDING_RETENTION_HOURS must be a number of hours, got "${recordingRetentionHours}"`,
      );
    }
    this.#recordingRetentionHours = retention;
    this.#logger = logger;
    this.#store = store;
    this.#onAlert = typeof onAlert === "function" ? onAlert : null;
    this.#maxRecoveries = Math.max(0, Number(maxRecoveries) || 0);
  }

  async create(input, { kind = "broadcast" } = {}) {
    const { rtmpUrl, streamKey } = validateDestination(input);
    const id = randomUUID().replace(/-/g, "");
    const recording = this.#recordingOptions(kind);
    await this.#mediamtx.addPath(id, recording?.config);
    if (recording) {
      this.#logger.info?.(
        `[relay] recording ${id} into ${recording.dir}` +
          (this.#recordingRetentionHours > 0
            ? ` (kept ${this.#recordingRetentionHours}h)`
            : " (kept until deleted)"),
      );
    }

    const session = {
      id,
      kind,
      destination: pushUrl(rtmpUrl, streamKey),
      // The file itself is named after the path (`<dir>/<id>.mp4`), and
      // segmentation may add a timestamp, so what is reported is the directory
      // MediaMTX writes into.
      recording: recording
        ? { dir: recording.dir, retentionHours: this.#recordingRetentionHours }
        : null,
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
      stalledSince: null,
      alerts: 0,
      progressBuffer: "",
      // Quality readout: kbit/s from ffmpeg's own byte deltas, and the history
      // of egress drops this session has already survived.
      bitrateKbps: 0,
      lastSampleAt: null,
      drops: [],
      silentMs: 0,
      recoveries: 0,
      recovering: false,
      lastRecoveryAt: null,
      awaitingFirstByte: false,
      recoveryGaveUp: false,
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
      pid: session.child?.pid ?? null,
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
        stalledSince: null,
        alerts: 0,
        progressBuffer: "",
        bitrateKbps: 0,
        lastSampleAt: null,
        drops: [],
        silentMs: 0,
        recoveries: 0,
        recovering: false,
        lastRecoveryAt: null,
        awaitingFirstByte: false,
        recoveryGaveUp: false,
      });
      this.#startFfmpeg(this.#sessions.get(id));
      restored += 1;
      this.#logger.info?.(`[relay] restored session ${id}`);
    }

    await this.#persist();
    return restored;
  }

  /**
   * MediaMTX records the path the browser publishes to, so a broadcast is
   * recorded as it is sent — before any relay egress. Self-tests are excluded:
   * they exist to prove the path, not to fill the disk.
   */
  #recordingOptions(kind) {
    if (!this.#recordingDir || kind === "selftest") return null;
    return {
      dir: this.#recordingDir,
      config: {
        record: true,
        recordPath: `${this.#recordingDir}/%path`,
        // fMP4 because a browser can play it and it survives a kill -9 without
        // the trailing moov atom a plain MP4 needs.
        recordFormat: "fmp4",
        recordSegmentDuration: "1h",
        // Explicitly off, because MediaMTX defaults to 1d: its window counts
        // against the segment still being written (so a short window deletes a
        // live recording) and its sweeper stops once the relay deletes the
        // session's path. Retention is enforced by RecordingStore instead.
        recordDeleteAfter: "0s",
      },
    };
  }

  /** One line for the startup log: where recordings go and how long they stay. */
  recordingSummary() {
    if (!this.#recordingDir) {
      return "[relay] recording disabled (RECORDING_DIR is not set)";
    }
    return (
      `[relay] recording broadcasts to ${this.#recordingDir}` +
      (this.#recordingRetentionHours > 0
        ? ` (kept ${this.#recordingRetentionHours}h)`
        : " (kept until deleted)")
    );
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
   * What the ingest received, rather than what the browser sent.
   *
   * A self-test publishes into this relay's own MediaMTX, so the control API that
   * reports the source path reports the sink path too. That is the only place the
   * re-encoded audio is visible: the sink's `tracks` read "MPEG-4 Audio" when the
   * AAC arrived, and stay empty when the muxer or the encode produced nothing an
   * ingest could use. A provider ingest has no such API, so this returns null.
   */
  async #ingestStatus(session, sourceTracks) {
    if (!this.#ingestPath || session.kind !== "selftest") return null;
    const sink =
      typeof this.#mediamtx.getPath === "function"
        ? await this.#mediamtx.getPath(this.#ingestPath).catch(() => null)
        : null;
    const tracks = Array.isArray(sink?.tracks) ? sink.tracks.map(String) : [];
    const bytesReceived = Number(sink?.bytesReceived ?? 0);
    const audioTrack = tracks.find((track) => AUDIO_TRACK.test(track)) ?? null;
    const audio = audioTrack
      ? { track: audioTrack, codec: AUDIO_CODEC_NAMES[audioTrack] ?? audioTrack }
      : null;
    const sourceHadAudio = sourceTracks.some((track) => AUDIO_TRACK.test(String(track)));

    let problem = null;
    if (!sink) problem = "the ingest has not received the stream yet";
    else if (tracks.length === 0) problem = "the ingest has no tracks yet";
    else if (!audio && sourceHadAudio) problem = "video reached the ingest but audio did not";

    // Said once per session, so a failed self-test reads from the relay log
    // without anyone watching the channel.
    if (!session.ingestLogged && bytesReceived > 0) {
      session.ingestLogged = true;
      const summary = tracks.join(" + ") || "no tracks";
      const kb = Math.round(bytesReceived / 1024);
      this.#logger.info?.(
        `[relay] selftest ingest: ${summary}${audio ? ` (${audio.codec})` : ""}, ${kb} KB` +
          (problem ? ` — ${problem}` : ""),
      );
    }

    return {
      path: this.#ingestPath,
      reachable: !!sink,
      tracks,
      bytesReceived,
      audio,
      problem,
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
    const ingest = await this.#ingestStatus(session, tracks);
    return {
      id,
      kind: session.kind,
      createdAt: new Date(session.createdAt).toISOString(),
      running: !!session.child,
      pid: session.child?.pid ?? null,
      restarts: session.restarts,
      error: session.error,
      ready: !!path?.ready,
      bytesReceived: Number(path?.bytesReceived ?? 0),
      ingest,
      recording: session.recording ?? null,
      tracks,
      // Egress (relay → provider), as opposed to bytesReceived above
      // (browser → MediaMTX). A session can be receiving fine and pushing
      // nothing, which is exactly what the watchdog watches for.
      bytesOut: session.bytesOut,
      stalled: session.stalled,
      stalledForMs: session.stalledForMs ?? 0,
      bitrateKbps: session.bitrateKbps ?? 0,
      drops: session.drops?.length ?? 0,
      silentMs: session.silentMs ?? 0,
      lastDropAt: session.drops?.at(-1)?.at ?? null,
      // Recovery: the relay restarts ffmpeg itself once the silence outlasts
      // the grace period, so the panel can say it is reconnecting.
      recoveries: session.recoveries ?? 0,
      recovering: session.recovering === true,
      lastRecoveryAt: session.lastRecoveryAt ?? null,
      recoveryGaveUp: session.recoveryGaveUp === true,
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
      if (session.lastBytesAt === null || session.bytesOut <= 0) continue;
      const silentFor = now - session.lastBytesAt;
      if (silentFor < windowMs) continue;

      session.stalled = true;
      session.stalledForMs = silentFor;
      // Silence started at the last byte, not at the moment we noticed.
      session.stalledSince = session.lastBytesAt;
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

  /**
   * Restart a stalled session's ffmpeg once the silence has lasted a grace
   * period, so a dead RTMP connection recovers without the host watching logs.
   *
   * This is the deliberate follow-up to `watchdog`: alert early, act later.
   * Attempts are capped per session, because a provider that keeps dropping us
   * is not something a restart loop can fix, and after the cap the session stays
   * up and flagged instead of thrashing.
   */
  async recover(graceMs, now = Date.now()) {
    const grace = Number(graceMs);
    if (!Number.isFinite(grace) || grace <= 0) return [];
    const restarted = [];
    for (const session of this.#sessions.values()) {
      if (!session.stalled || !session.child || session.recovering) continue;
      const silentFor = now - (session.stalledSince ?? now);
      if (silentFor < grace) continue;

      if ((session.recoveries ?? 0) >= this.#maxRecoveries) {
        if (!session.recoveryGaveUp) {
          session.recoveryGaveUp = true;
          this.#logger.error?.(
            `[relay] session ${session.id} is still silent and out of recovery attempts (${session.recoveries}/${this.#maxRecoveries}); leaving it up for the host`,
          );
          this.#alert({
            event: "session.recovery-failed",
            sessionId: session.id,
            kind: session.kind,
            silentForMs: silentFor,
            attempt: session.recoveries,
          });
        }
        continue;
      }

      session.recovering = true;
      session.recoveries = (session.recoveries ?? 0) + 1;
      session.lastRecoveryAt = new Date(now).toISOString();
      restarted.push(session.id);
      this.#logger.warn?.(
        `[relay] restarting ffmpeg for ${session.id} after ${Math.round(
          silentFor / 1000,
        )}s of silent egress (attempt ${session.recoveries}/${this.#maxRecoveries})`,
      );
      this.#alert({
        event: "session.recovering",
        sessionId: session.id,
        kind: session.kind,
        silentForMs: silentFor,
        attempt: session.recoveries,
      });
      // SIGKILL, not SIGTERM: a stalled ffmpeg can be wedged or stopped, and a
      // graceful stop that never happens is the failure we are fixing. There is
      // nothing to flush — the stream is already not going out.
      session.child.kill?.("SIGKILL");
    }
    return restarted;
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
      const now = Date.now();
      const deltaBytes = size - session.bytesOut;
      // ffmpeg emits a block every ~0.5s. Anything faster is buffered chunks
      // arriving together, which would read as a fake bitrate spike.
      if (session.lastSampleAt !== null && now - session.lastSampleAt >= 250) {
        const instant = (deltaBytes * 8) / (now - session.lastSampleAt);
        session.bitrateKbps = Math.round(
          session.bitrateKbps ? session.bitrateKbps * 0.4 + instant * 0.6 : instant,
        );
        session.lastSampleAt = now;
      } else if (session.lastSampleAt === null) {
        session.lastSampleAt = now;
      }
      session.bytesOut = size;
      session.lastBytesAt = now;
      if (session.awaitingFirstByte) {
        session.awaitingFirstByte = false;
        this.#logger.info?.(
          `[relay] session ${session.id} is pushing again after a reconnect`,
        );
        this.#alert({
          event: "session.reconnected",
          sessionId: session.id,
          kind: session.kind,
          bytesOut: size,
          attempt: session.recoveries ?? 0,
        });
      }
      if (session.stalled) {
        // One completed drop, kept as history: a push that hiccuped twice is a
        // different story from one that has been clean.
        const durationMs = Math.max(
          0,
          now - (session.stalledSince ?? now - (session.stalledForMs ?? 0)),
        );
        session.drops.push({ at: new Date(now).toISOString(), durationMs });
        if (session.drops.length > 20) session.drops.shift();
        session.silentMs = (session.silentMs ?? 0) + durationMs;
        session.stalledSince = null;
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
        // The browser sends Opus, and FLV cannot carry it: with `-c copy` the
        // muxer refuses to write a header at all ("Audio codec opus not
        // compatible with flv"), so a push from a host with a microphone never
        // reaches the provider. Video is still copied — H.264 is what WebRTC
        // negotiates and what the ingest expects — and only audio is encoded.
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        this.#audioBitrate,
        "-ac",
        String(this.#audioChannels),
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

      // A restart we asked for: ffmpeg's byte counter starts over, so reset the
      // egress baseline while keeping the drop history that led here.
      if (session.recovering) {
        session.recovering = false;
        session.awaitingFirstByte = true;
        session.bytesOut = 0;
        session.lastBytesAt = null;
        session.lastSampleAt = null;
        session.bitrateKbps = 0;
        session.stalled = false;
        session.stalledForMs = 0;
        session.stalledSince = null;
        session.timer = setTimeout(() => {
          if (!session.stopped) this.#startFfmpeg(session);
        }, RECOVERY_DELAY_MS);
        session.timer.unref?.();
        return;
      }

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
