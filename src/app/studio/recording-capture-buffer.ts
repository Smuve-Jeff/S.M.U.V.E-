/**
 * Bounded capture buffer for the recording engine.
 *
 * Why this exists: a 48 kHz stereo take costs ~23 MB per minute of Float32 PCM,
 * and `StudioRecordingEngineService` used to hold *every* chunk until the artist
 * pressed stop. A 30-minute session on a 3–4 GB phone is a crashed WebView, and
 * the performance goes with it. This buffer keeps a bounded resident window in
 * memory and spills the overflow to a store (IndexedDB in the app), so a take
 * can be arbitrarily long without being either truncated or unbounded.
 *
 * Ordering rule that makes reassembly safe: chunks are only ever spilled
 * **oldest first**, and the spill of one group completes before the next group
 * is handed to the store. So spilled records are contiguous, ordered by
 * `index`, and always older than anything still resident — `collect()` can
 * simply concatenate records (sorted) followed by the resident chunks.
 *
 * Failure rule: a spill write that rejects puts its chunks **back in front of**
 * the resident queue and disables further spilling for the session. Nothing is
 * ever dropped — the worst case is that the resident window grows again, which
 * is exactly the old behaviour.
 */

export interface CaptureSpillRecord {
  id: string;
  sessionId: string;
  /** Monotonic sequence within the session; lower = older audio. */
  index: number;
  left: Float32Array[];
  right: Float32Array[];
}

export interface CaptureSpillStore {
  write(record: CaptureSpillRecord): Promise<void>;
  /** Every record for one session, in any order (the buffer sorts by index). */
  readAll(sessionId: string): Promise<CaptureSpillRecord[]>;
  /** Drop one session's records. Must not touch another session's audio. */
  clear(sessionId: string): Promise<void>;
}

export interface RecordingCaptureBufferOptions {
  sampleRate: number;
  /**
   * Resident PCM ceiling before overflow is spilled. 64 MB ≈ 2.8 minutes of
   * 48 kHz stereo, which comfortably covers a comping pass while staying well
   * inside a mobile WebView heap.
   */
  maxResidentBytes?: number;
  spill?: CaptureSpillStore;
  /** Overridable for tests / diagnostics; generated when omitted. */
  sessionId?: string;
}

export const DEFAULT_MAX_RESIDENT_CAPTURE_BYTES = 64 * 1024 * 1024;

export interface CollectedCapture {
  left: Float32Array[];
  right: Float32Array[];
  frames: number;
}

export class RecordingCaptureBuffer {
  private readonly sampleRate: number;
  private readonly maxResidentBytes: number;
  private readonly spill?: CaptureSpillStore;

  private sessionId: string;
  /** Sessions whose spilled chunks still need unlinking. */
  private retiredSessions: string[] = [];

  private residentLeft: Float32Array[] = [];
  private residentRight: Float32Array[] = [];
  private residentByteCount = 0;

  private appendedFrames = 0;
  private spilledFrameCount = 0;
  private recordCount = 0;
  private nextRecordIndex = 0;
  /** The single in-flight spill write, or null when idle. */
  private spillTask: Promise<void> | null = null;
  private spillDisabled = false;
  /** True once collect() has pulled every spilled chunk back into memory. */
  private recordsDrained = false;
  private lastSpillError: unknown = null;

  constructor(options: RecordingCaptureBufferOptions) {
    this.sampleRate = options.sampleRate > 0 ? options.sampleRate : 48000;
    this.maxResidentBytes =
      options.maxResidentBytes ?? DEFAULT_MAX_RESIDENT_CAPTURE_BYTES;
    this.spill = options.spill;
    this.sessionId = options.sessionId ?? RecordingCaptureBuffer.newSessionId();
  }

  static newSessionId(): string {
    return `cap_${Date.now().toString(36)}_${Math.floor(
      Math.random() * 1e9
    ).toString(36)}`;
  }

  get currentSessionId(): string {
    return this.sessionId;
  }

  /** Total frames captured since `beginSession()`, resident + spilled. */
  get frames(): number {
    return this.appendedFrames;
  }

  /** Frames handed to the spill store but not yet resident. */
  get spilledFrames(): number {
    return this.spilledFrameCount;
  }

  get residentBytes(): number {
    return this.residentByteCount;
  }

  get spilledRecords(): number {
    return this.recordCount;
  }

  /**
   * True when the resident window is over budget and could not be relieved
   * (no spill store, or spilling failed). The take is still complete; it is
   * only living in memory, as it did before this buffer existed.
   */
  get overBudget(): boolean {
    return this.residentByteCount > this.maxResidentBytes;
  }

  get spillUnavailable(): boolean {
    return this.spillDisabled || !this.spill;
  }

  /** True while a spill write is in flight (exposed for diagnostics/tests). */
  get spillInFlight(): boolean {
    return this.spillTask !== null;
  }

  get spillError(): unknown {
    return this.lastSpillError;
  }

  /**
   * Append one worklet payload. Trailing frames without a right-channel
   * counterpart are mirrored, matching the worklet's mono→stereo duplication.
   * Returns the frames appended (per channel).
   */
  append(left: Float32Array[], right: Float32Array[]): number {
    let frames = 0;
    for (let i = 0; i < left.length; i++) {
      const leftChunk = left[i];
      if (!leftChunk || leftChunk.length === 0) continue;
      const rightChunk = right[i] ?? leftChunk;
      this.residentLeft.push(leftChunk);
      this.residentRight.push(rightChunk);
      frames += leftChunk.length;
      this.residentByteCount += (leftChunk.length + rightChunk.length) * 4;
    }
    this.appendedFrames += frames;
    this.enforceBudget();
    return frames;
  }

  /** Synchronous snapshot of the resident window, in capture order. */
  resident(): { left: Float32Array[]; right: Float32Array[] } {
    return { left: [...this.residentLeft], right: [...this.residentRight] };
  }

  /**
   * Every chunk of the take in capture order: the spilled records (ordered by
   * their index) followed by the resident window. Only call this once capture
   * has stopped (`FLUSHED` received) — it waits for an in-flight spill write.
   */
  async collect(): Promise<CollectedCapture> {
    await this.awaitSpill();
    if (!this.spill || this.recordsDrained) {
      return {
        left: [...this.residentLeft],
        right: [...this.residentRight],
        frames: this.appendedFrames,
      };
    }
    let records: CaptureSpillRecord[] = [];
    try {
      records = await this.spill.readAll(this.sessionId);
    } catch (error) {
      // The take must still come back with whatever is resident.
      this.lastSpillError = error;
      records = [];
    }
    const ordered = [...records].sort((a, b) => a.index - b.index);
    const left: Float32Array[] = [];
    const right: Float32Array[] = [];
    for (const record of ordered) {
      for (let i = 0; i < record.left.length; i++) {
        const leftChunk = record.left[i];
        if (!leftChunk) continue;
        left.push(leftChunk);
        right.push(record.right[i] ?? leftChunk);
      }
    }
    left.push(...this.residentLeft);
    right.push(...this.residentRight);

    // Drain the spill store into the resident window. The take is finished, so
    // the whole of it belongs in memory now: callers that read the channels
    // synchronously after stop (comp takes) see the complete performance
    // instead of just the window, and a second collect() cannot duplicate the
    // chunks because the store is emptied and marked drained.
    this.residentLeft = left;
    this.residentRight = right;
    this.residentByteCount = left.reduce(
      (sum, chunk, index) =>
        sum + (chunk.length + (right[index] ?? chunk).length) * 4,
      0
    );
    this.recordsDrained = true;
    this.spilledFrameCount = 0;
    // Nothing left to spill for this take.
    this.spillDisabled = true;
    await this.clearSpilledRecords();

    return { left: [...left], right: [...right], frames: this.appendedFrames };
  }

  /**
   * Start a new take. The previous take's audio is dropped from memory here and
   * its spilled records are unlinked in the background — the WAV for it has
   * already been encoded and persisted by then.
   */
  beginSession(): string {
    this.retireSession();
    // Unlink the previous take's chunks in the background: its WAV has already
    // been encoded and persisted by the caller.
    void this.clearRetired();
    this.residentLeft = [];
    this.residentRight = [];
    this.residentByteCount = 0;
    this.appendedFrames = 0;
    this.spilledFrameCount = 0;
    this.recordCount = 0;
    this.nextRecordIndex = 0;
    this.spillDisabled = false;
    this.recordsDrained = false;
    this.lastSpillError = null;
    this.sessionId = RecordingCaptureBuffer.newSessionId();
    return this.sessionId;
  }

  /** Drop everything, including any spilled records still on disk. */
  async release(): Promise<void> {
    await this.awaitSpill();
    this.retireSession();
    await this.clearRetired();
    this.residentLeft = [];
    this.residentRight = [];
    this.residentByteCount = 0;
    this.appendedFrames = 0;
    this.spilledFrameCount = 0;
    this.recordCount = 0;
    this.nextRecordIndex = 0;
  }

  /** Milliseconds of audio captured so far (resident + spilled). */
  get durationMs(): number {
    return Math.round((this.appendedFrames / this.sampleRate) * 1000);
  }

  private enforceBudget(): void {
    if (
      !this.spill ||
      this.spillDisabled ||
      this.spillTask !== null ||
      this.residentByteCount <= this.maxResidentBytes
    ) {
      return;
    }
    const left: Float32Array[] = [];
    const right: Float32Array[] = [];
    // Always keep the newest chunk resident: an in-progress read (comping)
    // keeps working, and one chunk is never the memory problem.
    while (
      this.residentLeft.length > 1 &&
      this.residentByteCount > this.maxResidentBytes
    ) {
      const leftChunk = this.residentLeft.shift()!;
      const rightChunk = this.residentRight.shift()!;
      left.push(leftChunk);
      right.push(rightChunk);
      const chunkBytes = (leftChunk.length + rightChunk.length) * 4;
      this.residentByteCount -= chunkBytes;
      this.spilledFrameCount += leftChunk.length;
    }
    if (left.length === 0) return;

    const record: CaptureSpillRecord = {
      id: `${this.sessionId}:${this.nextRecordIndex}`,
      sessionId: this.sessionId,
      index: this.nextRecordIndex++,
      left,
      right,
    };
    this.recordCount++;
    const task = this.spill
      .write(record)
      .catch((error) => {
        // Never lose audio: the group goes back in front of the resident queue
        // (it is older than everything there) and spilling stops for the take.
        // Only one write is ever in flight, so no later record can already be
        // on disk behind this group — order stays intact.
        this.restoreResident(record.left, record.right);
        this.spilledFrameCount -= this.spillFramesOf([record]);
        this.recordCount--;
        this.nextRecordIndex--;
        this.spillDisabled = true;
        this.lastSpillError = error;
      })
      .finally(() => {
        if (this.spillTask === task) this.spillTask = null;
      });
    this.spillTask = task;
  }

  private spillFramesOf(records: CaptureSpillRecord[]): number {
    return records.reduce(
      (sum, record) =>
        sum + record.left.reduce((chunks, chunk) => chunks + chunk.length, 0),
      0
    );
  }

  private restoreResident(left: Float32Array[], right: Float32Array[]): void {
    this.residentLeft.unshift(...left);
    this.residentRight.unshift(...right);
    for (let i = 0; i < left.length; i++) {
      this.residentByteCount += (left[i].length + (right[i] ?? left[i]).length) * 4;
    }
  }

  /** Waits out any in-flight spill so its failure handler runs first. */
  private async awaitSpill(): Promise<void> {
    while (this.spillTask) {
      await this.spillTask;
    }
  }

  private async clearSpilledRecords(): Promise<void> {
    if (!this.spill) return;
    try {
      await this.spill.clear(this.sessionId);
    } catch (error) {
      // Orphaned records only cost disk space; the take is already in memory.
      this.lastSpillError = error;
    }
  }

  private retireSession(): void {
    if (!this.spill) return;
    if (this.recordCount > 0 || this.spilledFrameCount > 0) {
      this.retiredSessions.push(this.sessionId);
    }
  }

  private async clearRetired(): Promise<void> {
    if (!this.spill || this.retiredSessions.length === 0) return;
    // Never unlink ahead of an in-flight write: it would land after the clear
    // and orphan itself on disk (harmless, but it leaks storage silently).
    await this.awaitSpill();
    const pending = this.retiredSessions;
    this.retiredSessions = [];
    for (const sessionId of pending) {
      try {
        await this.spill.clear(sessionId);
      } catch (error) {
        // Orphaned chunks only cost disk space; never break the take.
        this.lastSpillError = error;
      }
    }
  }
}
