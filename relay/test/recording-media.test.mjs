import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { readMp4DurationSeconds } from "../src/mp4.mjs";
import { RecordingStore } from "../src/recording-store.mjs";
import { mp4Header } from "./helpers/mp4-fixture.mjs";

const dirs = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "recording-media-"));
  dirs.push(dir);
  return dir;
}

after(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** A spawn that writes the thumbnail and reports exit, like ffmpeg would. */
function fakeSpawn({ write = true, code = 0 } = {}) {
  const calls = [];
  const spawn = (command, args) => {
    calls.push({ command, args });
    const child = new EventEmitter();
    setTimeout(async () => {
      if (write) await writeFile(args[args.length - 1], "jpeg-bytes");
      child.emit("exit", code);
    }, 0);
    return child;
  };
  return { spawn, calls };
}

test("reads a duration out of the MVHD box", async () => {
  const dir = await tempDir();
  const file = join(dir, "show.mp4");
  await writeFile(file, mp4Header(7));

  assert.equal(await readMp4DurationSeconds(file), 7);
});

test("reads a 64-bit MVHD box too", async () => {
  const dir = await tempDir();
  const file = join(dir, "show64.mp4");
  await writeFile(file, mp4Header(65.5, { version: 1, timescale: 1000 }));

  assert.equal(await readMp4DurationSeconds(file), 65.5);
});

test("a file without a usable MVHD has no duration instead of guessing", async () => {
  const dir = await tempDir();
  const text = join(dir, "notes.mp4");
  await writeFile(text, "definitely not a video");
  assert.equal(await readMp4DurationSeconds(text), null);

  const zero = join(dir, "zero.mp4");
  await writeFile(zero, mp4Header(0));
  assert.equal(await readMp4DurationSeconds(zero), null);

  assert.equal(await readMp4DurationSeconds(join(dir, "missing.mp4")), null);
});

test("lists recordings with their duration, and the thumbnail sidecar is not a show", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  await writeFile(join(dir, "show.jpg"), "jpeg-bytes");
  await writeFile(join(dir, "older.mp4"), mp4Header(3));
  await writeFile(join(dir, "notes.txt"), "not a recording");
  const older = new Date(Date.now() - 60_000);
  await utimes(join(dir, "older.mp4"), older, older);

  const rows = await new RecordingStore({ dir, retentionHours: 24 }).list();

  assert.deepEqual(
    rows.map((row) => row.name),
    ["show.mp4", "older.mp4"],
  );
  assert.equal(rows[0].durationSeconds, 7);
  assert.equal(rows[1].durationSeconds, 3);
  assert.ok(rows[0].bytes > 0);
});

test("a thumbnail is generated once and then reused", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  const { spawn, calls } = fakeSpawn();
  const store = new RecordingStore({
    dir,
    retentionHours: 24,
    ffmpegPath: "/opt/ffmpeg",
    spawn,
  });

  const first = await store.thumbnail("show.mp4");
  assert.ok(first.endsWith("show.jpg"));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 2), ["-hide_banner", "-loglevel"]);
  assert.ok(calls[0].args.some((arg) => arg.endsWith("show.mp4")));
  assert.equal(await stat(first).then((info) => info.size), "jpeg-bytes".length);

  const second = await store.thumbnail("show.mp4");
  assert.equal(second, first);
  assert.equal(calls.length, 1, "a cached frame must not spawn ffmpeg again");
});

test("a stale frame is regenerated, and a stale one replaces the old file", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  await writeFile(join(dir, "show.jpg"), "old-frame");
  const old = new Date(Date.now() - 3_600_000);
  await utimes(join(dir, "show.jpg"), old, old);
  const { spawn, calls } = fakeSpawn();
  const store = new RecordingStore({ dir, retentionHours: 24, ffmpegPath: "ffmpeg", spawn });

  const target = await store.thumbnail("show.mp4");

  assert.equal(calls.length, 1);
  assert.equal(await stat(target).then((info) => info.size), "jpeg-bytes".length);
});

test("falls back to the first frame when the offset lands past a short recording", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "short.mp4"), mp4Header(0.4));
  const calls = [];
  const spawn = (command, args) => {
    calls.push(args);
    const child = new EventEmitter();
    setTimeout(async () => {
      // The first attempt (offset 1s) produces nothing at all.
      if (calls.length > 1) await writeFile(args[args.length - 1], "jpeg-bytes");
      child.emit("exit", 0);
    }, 0);
    return child;
  };
  const store = new RecordingStore({ dir, retentionHours: 24, ffmpegPath: "ffmpeg", spawn });

  const target = await store.thumbnail("short.mp4");

  assert.ok(target.endsWith("short.jpg"));
  assert.equal(calls.length, 2);
  const offsetOf = (args) => args[args.indexOf("-ss") + 1];
  assert.equal(offsetOf(calls[0]), "1");
  assert.equal(offsetOf(calls[1]), "0");
});

test("without ffmpeg only a frame already on the volume is served", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  await writeFile(join(dir, "frame.mp4"), mp4Header(7));
  await writeFile(join(dir, "show.jpg"), "jpeg-bytes");

  const store = new RecordingStore({ dir, retentionHours: 24 });
  assert.equal(await store.thumbnail("frame.mp4"), null);
  assert.ok((await store.thumbnail("show.mp4"))?.endsWith("show.jpg"));
});

test("only recordings get a thumbnail", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  await writeFile(join(dir, "show.jpg"), "jpeg-bytes");

  const { spawn, calls } = fakeSpawn();
  const store = new RecordingStore({ dir, retentionHours: 24, ffmpegPath: "ffmpeg", spawn });
  assert.equal(await store.thumbnail("show.jpg"), null);
  assert.equal(await store.thumbnail("../show.mp4"), null);
  assert.equal(await store.thumbnail("missing.mp4"), null);
  assert.deepEqual(calls, []);
});

test("opening a recording still refuses anything outside the volume", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  const store = new RecordingStore({ dir, retentionHours: 24 });

  assert.equal((await store.open("show.mp4")).bytes, mp4Header(7).length);
  assert.equal(await store.open("../show.mp4"), null);
  assert.equal(await store.open("missing.mp4"), null);
  assert.deepEqual(await readdir(dir), ["show.mp4"]);
});

test("deleting a recording removes its frame too, and repeating it is harmless", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  await writeFile(join(dir, "show.jpg"), "jpeg-bytes");
  await writeFile(join(dir, "other.mp4"), mp4Header(3));
  const store = new RecordingStore({ dir, retentionHours: 24 });

  assert.equal(await store.remove("show.mp4"), true);
  assert.deepEqual((await readdir(dir)).sort(), ["other.mp4"]);
  assert.equal(await store.remove("show.mp4"), false);
  assert.equal(await store.remove("../show.mp4"), false);
  assert.deepEqual((await readdir(dir)).sort(), ["other.mp4"]);
});

const HOUR = 3_600_000;

test("a pinned recording outlives the window, then goes when the pin ends", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "old.mp4"), mp4Header(7));
  const old = new Date(Date.now() - 25 * HOUR);
  await utimes(join(dir, "old.mp4"), old, old);
  let now = Date.now();
  const store = new RecordingStore({
    dir,
    retentionHours: 24,
    clock: () => now,
  });

  const pin = await store.setRetention("old.mp4", 48);
  assert.equal(pin.hours, 48);

  assert.deepEqual(await store.sweep(), []);
  assert.deepEqual(await readdir(dir).then((names) => names.sort()), [
    "old.mp4",
    "old.retention.json",
  ]);
  const [listed] = await store.list();
  assert.equal(listed.keepHours, 48);
  assert.equal(listed.keepUntil, pin.until);

  now += 49 * HOUR;
  assert.deepEqual(await store.sweep(), ["old.mp4"]);
  assert.deepEqual(await readdir(dir), []);
});

test("clearing a pin puts the recording back on the default window", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "old.mp4"), mp4Header(7));
  const old = new Date(Date.now() - 25 * HOUR);
  await utimes(join(dir, "old.mp4"), old, old);
  const store = new RecordingStore({ dir, retentionHours: 24 });

  await store.setRetention("old.mp4", 168);
  assert.deepEqual(await store.sweep(), []);

  const cleared = await store.setRetention("old.mp4", 0);
  assert.deepEqual(cleared, { hours: 0, until: null });
  assert.deepEqual(await store.sweep(), ["old.mp4"]);
});

test("a pin is not swept away just because it is older than the window", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "old.mp4"), mp4Header(7));
  const store = new RecordingStore({ dir, retentionHours: 24 });
  await store.setRetention("old.mp4", 168);

  // The pin was written a week ago, the promise still stands: only the
  // recording's own fate may remove it.
  const week = new Date(Date.now() - 7 * 24 * HOUR);
  await utimes(join(dir, "old.retention.json"), week, week);
  const aged = new Date(Date.now() - 25 * HOUR);
  await utimes(join(dir, "old.mp4"), aged, aged);

  await store.sweep();

  assert.equal((await store.retention("old.mp4"))?.hours, 168);
  assert.deepEqual((await readdir(dir)).sort(), [
    "old.mp4",
    "old.retention.json",
  ]);
});

test("rejects a keep duration it cannot honour", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  const store = new RecordingStore({ dir, retentionHours: 24 });

  for (const hours of [-1, 1.5, 90 * 24 + 1, Number.NaN]) {
    await assert.rejects(() => store.setRetention("show.mp4", hours), RangeError);
  }
  await assert.rejects(() => store.setRetention("../show.mp4", 24), RangeError);
  assert.equal(await store.setRetention("missing.mp4", 24), null);
  assert.deepEqual(await readdir(dir), ["show.mp4"]);
});

test("deleting a recording takes its pin with it", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "show.mp4"), mp4Header(7));
  const store = new RecordingStore({ dir, retentionHours: 24 });
  await store.setRetention("show.mp4", 168);
  await writeFile(join(dir, "show.jpg"), "jpeg-bytes");

  assert.equal(await store.remove("show.mp4"), true);
  assert.deepEqual(await readdir(dir), []);
});

test("an orphaned sidecar is cleaned up once its recording is gone", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "gone.jpg"), "jpeg-bytes");
  await writeFile(join(dir, "gone.retention.json"), JSON.stringify({ hours: 1, until: "2000-01-01T00:00:00Z" }));
  const old = new Date(Date.now() - 25 * HOUR);
  await utimes(join(dir, "gone.jpg"), old, old);
  await utimes(join(dir, "gone.retention.json"), old, old);
  const store = new RecordingStore({ dir, retentionHours: 24 });

  await store.sweep();

  assert.deepEqual(await readdir(dir), []);
});
