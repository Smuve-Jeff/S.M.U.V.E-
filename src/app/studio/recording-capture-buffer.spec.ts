import {
  RecordingCaptureBuffer,
  type CaptureSpillRecord,
  type CaptureSpillStore,
} from "./recording-capture-buffer";

class FakeSpillStore implements CaptureSpillStore {
  records: CaptureSpillRecord[] = [];
  writes = 0;
  removed: string[] = [];
  cleared: string[] = [];
  failWrites = 0;

  async write(record: CaptureSpillRecord): Promise<void> {
    this.writes++;
    if (this.failWrites > 0) {
      this.failWrites--;
      throw new Error("quota exceeded");
    }
    this.records.push(record);
  }

  async readAll(sessionId: string): Promise<CaptureSpillRecord[]> {
    return this.records.filter((record) => record.sessionId === sessionId);
  }

  async remove(id: string): Promise<void> {
    this.removed.push(id);
    this.records = this.records.filter((record) => record.id !== id);
  }

  async clear(sessionId: string): Promise<void> {
    this.cleared.push(sessionId);
    this.records = this.records.filter(
      (record) => record.sessionId !== sessionId,
    );
  }
}

const chunk = (...values: number[]) => Float32Array.from(values);

/** Flatten collected channels so ordering can be asserted frame by frame. */
const flatten = (chunks: Float32Array[]): number[] =>
  chunks.flatMap((c) => Array.from(c));

/**
 * Consume a take the way the WAV writer does (group by group, in order) and
 * hand back one channel pair, so ordering can be asserted frame by frame.
 */
const drainAll = async (buffer: RecordingCaptureBuffer) => {
  const left: Float32Array[] = [];
  const right: Float32Array[] = [];
  let frames = 0;
  for await (const group of buffer.drainGroups()) {
    left.push(...group.left);
    right.push(...group.right);
    frames += group.frames;
  }
  return { left, right, frames };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RecordingCaptureBuffer", () => {
  it("keeps everything resident while the take is under budget", async () => {
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 64 * 1024 * 1024,
      spill: new FakeSpillStore(),
    });

    const frames = buffer.append([chunk(1, 2, 3, 4)], [chunk(5, 6, 7, 8)]);

    expect(frames).toBe(4);
    expect(buffer.frames).toBe(4);
    expect(buffer.residentBytes).toBe(32);
    expect(buffer.spilledFrames).toBe(0);
    expect(buffer.spilledRecords).toBe(0);
    expect(buffer.overBudget).toBe(false);

    const collected = await drainAll(buffer);
    expect(collected.frames).toBe(4);
    expect(flatten(collected.left)).toEqual([1, 2, 3, 4]);
    expect(flatten(collected.right)).toEqual([5, 6, 7, 8]);
  });

  it("spills the oldest chunks once the resident window is over budget", async () => {
    const store = new FakeSpillStore();
    // 512 frames of stereo PCM = 4096 bytes of budget.
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 4096,
      spill: store,
    });

    for (let i = 0; i < 3; i++) {
      buffer.append(
        [chunk(...Array(256).fill(i))],
        [chunk(...Array(256).fill(i))],
      );
    }

    expect(buffer.overBudget).toBe(false);
    expect(buffer.residentBytes).toBeLessThanOrEqual(4096);
    expect(store.writes).toBe(1);
    await flush();
    expect(buffer.spilledRecords).toBe(1);
    expect(buffer.spilledFrames).toBe(256);
    // The newest chunk stays resident so an in-progress read still works.
    expect(buffer.resident().left).toHaveLength(2);
  });

  it("reassembles spilled and resident chunks in capture order", async () => {
    const store = new FakeSpillStore();
    // Each two-frame stereo chunk is 16 bytes, so 32 bytes holds two chunks.
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 32,
      spill: store,
    });

    for (let i = 0; i < 6; i++) {
      buffer.append(
        [Float32Array.from([i * 10, i * 10 + 1])],
        [Float32Array.from([i * 10 + 2, i * 10 + 3])],
      );
    }

    const collected = await drainAll(buffer);

    expect(store.writes).toBeGreaterThan(0);
    expect(collected.frames).toBe(12);
    expect(flatten(collected.left)).toEqual([
      0, 1, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51,
    ]);
    expect(flatten(collected.right)).toEqual([
      2, 3, 12, 13, 22, 23, 32, 33, 42, 43, 52, 53,
    ]);
  });

  it("never drops audio when a spill write fails", async () => {
    const store = new FakeSpillStore();
    store.failWrites = 1;
    // One one-frame stereo chunk is 8 bytes; 16 bytes holds two of them.
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 16,
      spill: store,
    });

    for (let i = 0; i < 4; i++) {
      buffer.append([Float32Array.from([i])], [Float32Array.from([i])]);
    }
    await flush();

    expect(buffer.spillUnavailable).toBe(true);
    expect(buffer.spillError).toBeInstanceOf(Error);
    // The rejected group went back in front of the resident queue.
    expect(buffer.resident().left).toHaveLength(4);

    const collected = await drainAll(buffer);
    expect(collected.frames).toBe(4);
    expect(flatten(collected.left)).toEqual([0, 1, 2, 3]);

    // Spilling stops for the rest of the take instead of retrying a failing
    // store on every worklet payload.
    buffer.append([Float32Array.from([4])], [Float32Array.from([4])]);
    await flush();
    expect(store.writes).toBe(1);
    expect(buffer.resident().left).toHaveLength(5);
  });

  it("reports over budget but keeps the take intact without a spill store", async () => {
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 16,
    });

    for (let i = 0; i < 5; i++) {
      buffer.append([Float32Array.from([i])], [Float32Array.from([i])]);
    }

    expect(buffer.overBudget).toBe(true);
    expect(buffer.spillUnavailable).toBe(true);
    const collected = await drainAll(buffer);
    expect(collected.frames).toBe(5);
    expect(flatten(collected.left)).toEqual([0, 1, 2, 3, 4]);
  });

  it("mirrors a missing right channel instead of losing frames", () => {
    const buffer = new RecordingCaptureBuffer({ sampleRate: 48000 });
    buffer.append(
      [Float32Array.from([1, 2]), Float32Array.from([3, 4])],
      [Float32Array.from([9, 9])],
    );

    const resident = buffer.resident();
    expect(buffer.frames).toBe(4);
    expect(flatten(resident.right)).toEqual([9, 9, 3, 4]);
  });

  it("starts a fresh session and unlinks the previous take", async () => {
    const store = new FakeSpillStore();
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 16,
      spill: store,
    });
    for (let i = 0; i < 4; i++) {
      buffer.append([Float32Array.from([i])], [Float32Array.from([i])]);
    }
    await flush();
    const firstSession = buffer.currentSessionId;
    expect(store.records).toHaveLength(1);

    const nextSession = buffer.beginSession();
    await flush();

    expect(nextSession).not.toBe(firstSession);
    expect(buffer.frames).toBe(0);
    expect(buffer.residentBytes).toBe(0);
    expect(store.cleared).toContain(firstSession);
    expect(store.records).toHaveLength(0);
  });

  it("releases resident and spilled audio", async () => {
    const store = new FakeSpillStore();
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 16,
      spill: store,
    });
    for (let i = 0; i < 4; i++) {
      buffer.append([Float32Array.from([i])], [Float32Array.from([i])]);
    }
    await flush();
    const session = buffer.currentSessionId;

    await buffer.release();

    expect(buffer.frames).toBe(0);
    expect(buffer.residentBytes).toBe(0);
    expect(store.cleared).toContain(session);
    expect(store.records).toHaveLength(0);
  });

  it("streams the take out of the spill store, unlinking each group as it goes", async () => {
    const store = new FakeSpillStore();
    const buffer = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 16,
      spill: store,
    });
    for (let i = 0; i < 4; i++) {
      buffer.append([Float32Array.from([i])], [Float32Array.from([i])]);
    }
    await flush();
    expect(store.records).toHaveLength(1);
    const spilledId = store.records[0].id;

    const first = await drainAll(buffer);

    // Capture order is the take: the spilled group is older than the window.
    expect(flatten(first.left)).toEqual([0, 1, 2, 3]);
    expect(first.frames).toBe(4);
    // The group's PCM is unlinked the moment its consumer has taken it, so the
    // finished take no longer lives on disk (or twice) after the encode.
    expect(store.removed).toEqual([spilledId]);
    expect(store.records).toHaveLength(0);
    expect(buffer.spilledFrames).toBe(0);
    expect(buffer.spilledRecords).toBe(0);

    // The bounded resident window is what stays resident — exactly the design —
    // and a second drain cannot duplicate the groups it already handed over.
    const second = await drainAll(buffer);
    expect(flatten(second.left)).toEqual([1, 2, 3]);
  });

  it("reports the captured duration from the frames it accepted", () => {
    const buffer = new RecordingCaptureBuffer({ sampleRate: 48000 });
    buffer.append([new Float32Array(48000)], [new Float32Array(48000)]);
    expect(buffer.durationMs).toBe(1000);
  });
});
