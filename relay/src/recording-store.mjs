import { spawn as spawnProcess } from "node:child_process";
import { readdir, stat, unlink } from "node:fs/promises";
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

    const cutoff = this.#clock() - retentionMs;
    const deleted = [];
    for (const name of names) {
      const file = join(this.dir, name);
      let info;
      try {
        info = await stat(file);
      } catch {
        continue;
      }
      if (!info.isFile() || info.mtimeMs > cutoff) continue;
      try {
        await unlink(file);
        deleted.push(name);
      } catch (error) {
        this.#logger.warn?.(
          `[relay] recording retention: cannot delete ${file}: ${error?.message ?? error}`,
        );
      }
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
        return {
          name,
          bytes: info.size,
          modifiedAt: new Date(info.mtimeMs).toISOString(),
          durationSeconds: await readMp4DurationSeconds(file),
        };
      }),
    );
    return rows
      .filter(Boolean)
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
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
