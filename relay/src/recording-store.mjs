import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Retention for broadcast recordings.
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
 * window, which by definition means no broadcast is still writing them.
 */
class RecordingStore {
  #logger;
  #clock;

  constructor({ dir, retentionHours = 24, logger = console, clock = Date.now }) {
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
}

export { RecordingStore };
