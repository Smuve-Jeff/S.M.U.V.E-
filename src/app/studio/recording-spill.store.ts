import { LocalStorageService } from "../services/local-storage.service";
import type {
  CaptureSpillRecord,
  CaptureSpillStore,
} from "./recording-capture-buffer";

/** Object store holding spilled capture chunks (see LocalStorageService). */
export const RECORDING_CHUNK_STORE = "recording_chunks";

/**
 * IndexedDB-backed spill store for `RecordingCaptureBuffer`.
 *
 * Two integrity rules matter here, and both exist to protect a performance that
 * cannot be re-recorded:
 *
 *  1. `saveItem()` is deliberately a silent no-op when persistence is
 *     unavailable (no IndexedDB, blocked by another tab, quota). A no-op that
 *     resolves looks exactly like a successful spill, which would let the
 *     buffer throw the chunks away and hand back a truncated take. So the write
 *     path checks `persistenceStatus()` first and **verifies the record** after
 *     writing, then throws — the buffer puts the chunks back in memory and
 *     stops spilling.
 *  2. `clear()` filters by `sessionId`, so finishing one take can never unlink
 *     another take's audio.
 */
export class IdbRecordingSpillStore implements CaptureSpillStore {
  constructor(private readonly storage: LocalStorageService) {}

  async write(record: CaptureSpillRecord): Promise<void> {
    const status = await this.storage.persistenceStatus();
    if (status !== "ready") {
      throw new Error(`Recording spill unavailable (${status}).`);
    }
    await this.storage.saveItem(RECORDING_CHUNK_STORE, record);
    const stored = await this.storage.getItem(RECORDING_CHUNK_STORE, record.id);
    if (!stored) {
      throw new Error("Recording spill did not persist.");
    }
  }

  async readAll(sessionId: string): Promise<CaptureSpillRecord[]> {
    const all = await this.storage.getAllItems(RECORDING_CHUNK_STORE);
    return (all as CaptureSpillRecord[]).filter(
      (record) => record?.sessionId === sessionId,
    );
  }

  async clear(sessionId: string): Promise<void> {
    const records = await this.readAll(sessionId);
    if (records.length === 0) return;
    await this.storage.deleteItems(
      RECORDING_CHUNK_STORE,
      records.map((record) => record.id),
    );
  }

  /**
   * Unlink one record whose audio the caller has already consumed. Targeted by
   * id rather than by session, so streaming a take out frees its storage as it
   * goes without a full read of the store per group.
   */
  async remove(id: string): Promise<void> {
    await this.storage.deleteItems(RECORDING_CHUNK_STORE, [id]);
  }
}
