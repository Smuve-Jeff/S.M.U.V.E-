import { spawn as spawnProcess } from "node:child_process";
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { readMp4DurationSeconds } from "./mp4.mjs";

/**
 * The recording volume, as the relay sees it.
 *
 * MediaMTX can delete its own recordings with `recordDeleteAfter`, but two
 * things make that the wrong tool here:
 *
 *  - the relay closes (and deletes) a session's path as soon as its ffmpeg
 *    exits, so a recorder — and with it the deletion — stops the moment the
 *    broadcast ends, leaving the file on the volume forever;
 *  - MediaMTX counts the window against the segment being written, so a window
 *    shorter than the broadcast deletes a live recording.
 *
 * This sweeper only ever removes files whose last write is older than the
 * window, which by definition means no broadcast is still writing them. The
 * same class lists what is on the volume, opens one file, reports a recording's
 * duration from its own header, and caches a JPEG frame beside it.
 */

/** Plain file names only: no separators, no hidden files, no traversal. */
const RECORDING_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** A recording is an MP4; its thumbnail sidecar is not a show of its own. */
const isRecordingName = (name) => /\.mp4$/i.test(name) && RECORDING_NAME.test(name);

const thumbnailName = (name) => `${name.replace(/\.mp4$/i, "")}.jpg`;

/** Where a host's "keep this one longer" request is remembered. */
const retentionName = (name) =>
  `${name.replace(/\.mp4$/i, "")}.retention.json`;

/** A show can be kept for up to 90 days; beyond that, ask for more disk. */
const MAX_KEEP_HOURS = 90 * 24;

/** The recording a `.jpg` or `.retention.json` belongs to, if it is one. */
function sidecarOwner(name) {
  const stem = name.replace(/\.retention\.json$|\.jpg$/i, "");
  return stem === name ? null : `${stem}.mp4`;
}

class RecordingStore {
  #logger;
  #clock;
  #spawn;
  #ffmpegPath;

  constructor({
    dir,
    retentionHours = 24,
    logger = console,
    clock = Date.now,
    /** ffmpeg used for thumbnails; null means durations only. */
    ffmpegPath = null,
    spawn = spawnProcess,
  }) {
    if (typeof dir !== "string" || !dir.trim()) {
      throw new Error("RecordingStore needs a recording directory");
    }
    const retention = Number(retentionHours);
    if (!Number.isFinite(retention) || retention < 0) {
      throw new Error(
        `RECORDING_RETENTION_HOURS must be a number of hours, got "${retentionHours}"`,
      );
    }
    this.dir = dir.trim().replace(/\/+$/, "");
    this.retentionHours = retention;
    this.#logger = logger;
    this.#clock = clock;
    this.#spawn = spawn;
    this.#ffmpegPath =
      typeof ffmpegPath === "string" && ffmpegPath.trim()
        ? ffmpegPath.trim()
        : null;
  }

  /** True when this volume has a retention policy at all (0 keeps everything). */
  get enabled() {
    return this.retentionHours > 0;
  }

  /**
   * Prove the volume can hold a recording: make the directory, write a file
   * into it and take it away again. Null means it can; otherwise why not.
   *
   * A volume that cannot be written looks exactly like a working one until
   * MediaMTX first tries to write, which is during the show. Asking at startup
   * is the difference between a warning before a broadcast and a missing show
   * after it.
   */
  async probe() {
    const file = join(this.dir, `.relay-probe-${process.pid}`);
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(file, "");
      await unlink(file);
      return null;
    } catch (error) {
      await unlink(file).catch(() => {});
      // A Node fs error already leads with its code ("ENOTDIR: …").
      return `${error?.message ?? error}`;
    }
  }

  /** Deletes recordings older than the window; returns the names it removed. */
  async sweep() {
    const retentionMs = this.retentionHours * 3_600_000;
    if (!(retentionMs > 0)) return [];

    let names;
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      this.#logger.warn?.(
        `[relay] recording retention: cannot read ${this.dir}: ${error?.message ?? error}`,
      );
      return [];
    }

    const now = this.#clock();
    const cutoff = now - retentionMs;
    const recordingNames = new Set(names.filter(isRecordingName));
    const deleted = [];
    for (const name of names) {
      const file = join(this.dir, name);
      let info;
      try {
        info = await stat(file);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;

      if (isRecordingName(name)) {
        if (info.mtimeMs > cutoff) continue;
        // A host may keep one show past the default window; the pin is the
        // promise, so an unexpired one wins over the window.
        const pin = await this.retention(name);
        if (pin && pin.until > now) continue;
        if (await this.#unlinkRecording(name)) deleted.push(name);
        continue;
      }

      // Sidecars follow their recording, not their own age: sweeping a pin by
      // mtime would silently drop a promise that outlives the window.
      const owner = sidecarOwner(name);
      if (!owner || recordingNames.has(owner)) continue;
      if (info.mtimeMs > cutoff) continue;
      await unlink(file).catch(() => {});
    }

    if (deleted.length > 0) {
      this.#logger.info?.(
        `[relay] recording retention: deleted ${deleted.length} recording(s) older than ${this.retentionHours}h`,
      );
    }
    return deleted;
  }

  /** Recordings on the volume, newest first, each with its own duration. */
  async list() {
    let names;
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const rows = await Promise.all(
      names.filter(isRecordingName).map(async (name) => {
        const file = join(this.dir, name);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) return null;
        const pin = await this.retention(name);
        return {
          name,
          bytes: info.size,
          modifiedAt: new Date(info.mtimeMs).toISOString(),
          durationSeconds: await readMp4DurationSeconds(file),
          keepHours: pin?.hours ?? null,
          keepUntil: pin ? new Date(pin.until).toISOString() : null,
        };
      }),
    );
    return rows
      .filter(Boolean)
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  }

  /**
   * How long a host asked to keep this recording for, and until when. Null
   * means the default window applies.
   */
  async retention(name) {
    if (!isRecordingName(name)) return null;
    const raw = await readFile(join(this.dir, retentionName(name)), "utf8").catch(
      () => null,
    );
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const hours = Number(parsed?.hours);
      const until = Date.parse(String(parsed?.until ?? ""));
      if (!Number.isInteger(hours) || hours <= 0 || Number.isNaN(until)) {
        return null;
      }
      return { hours, until };
    } catch {
      return null;
    }
  }

  /**
   * Keep a recording past the default window, or put it back on the default
   * policy with 0. Returns the pin; null when there is no such recording.
   */
  async setRetention(name, hours) {
    if (!isRecordingName(name)) {
      throw new RangeError("that is not a recording");
    }
    const value = Number(hours);
    if (!Number.isInteger(value) || value < 0 || value > MAX_KEEP_HOURS) {
      throw new RangeError(
        `retention must be whole hours between 0 and ${MAX_KEEP_HOURS}`,
      );
    }
    const info = await stat(join(this.dir, name)).catch(() => null);
    if (!info?.isFile()) return null;
    const file = join(this.dir, retentionName(name));
    if (value === 0) {
      await unlink(file).catch(() => {});
      return { hours: 0, until: null };
    }
    const until = new Date(this.#clock() + value * 3_600_000).toISOString();
    await writeFile(file, JSON.stringify({ hours: value, until }));
    return { hours: value, until };
  }

  /**
   * Delete a recording with its frame and its pin, so a host can free the space
   * now instead of waiting for retention. False means it was already gone.
   */
  async remove(name) {
    if (!isRecordingName(name)) return false;
    const source = join(this.dir, name);
    const info = await stat(source).catch(() => null);
    if (!info?.isFile()) return false;
    const removed = await this.#unlinkRecording(name);
    if (removed) this.#logger.info?.(`[relay] deleted recording ${name}`);
    return removed;
  }

  /** Unlink a recording and everything cached beside it. */
  async #unlinkRecording(name) {
    try {
      await unlink(join(this.dir, name));
    } catch (error) {
      this.#logger.warn?.(
        `[relay] cannot delete ${join(this.dir, name)}: ${error?.message ?? error}`,
      );
      return false;
    }
    // The frame and the pin are only meaningful while the recording exists.
    await unlink(join(this.dir, thumbnailName(name))).catch(() => {});
    await unlink(join(this.dir, retentionName(name))).catch(() => {});
    return true;
  }

  /** One file on the volume, resolved inside it. Null means "not there". */
  async open(name) {
    if (!RECORDING_NAME.test(name)) return null;
    const file = join(this.dir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return null;
    return { file, bytes: info.size };
  }

  /**
   * A JPEG frame beside the recording, generated once and reused. Thumbnails
   * are worth the ffmpeg run: a host telling two shows apart is exactly what
   * duration and a still frame are for.
   */
  async thumbnail(name) {
    if (!isRecordingName(name)) return null;
    const source = join(this.dir, name);
    const target = join(this.dir, thumbnailName(name));
    const sourceInfo = await stat(source).catch(() => null);
    if (!sourceInfo?.isFile()) return null;

    const existing = await stat(target).catch(() => null);
    if (existing?.isFile() && existing.mtimeMs >= sourceInfo.mtimeMs) {
      return target;
    }
    // Nothing cached and no ffmpeg to make one.
    if (!this.#ffmpegPath) return null;

    // A show can be shorter than the offset that usually frames something
    // interesting, so fall back to the first frame.
    for (const offset of ["1", "0"]) {
      const ok = await this.#grab(source, target, offset);
      if (ok) {
        const written = await stat(target).catch(() => null);
        if (written?.isFile() && written.size > 0) return target;
      }
    }
    return null;
  }

  #grab(source, target, offsetSeconds) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const child = this.#spawn(
        this.#ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          offsetSeconds,
          "-i",
          source,
          "-frames:v",
          "1",
          "-vf",
          "scale=320:-2",
          "-q:v",
          "5",
          target,
        ],
        { stdio: "ignore" },
      );
      child.on?.("error", () => done(false));
      child.on?.("exit", (code) => done(code === 0));
    });
  }
}

export { RecordingStore };
