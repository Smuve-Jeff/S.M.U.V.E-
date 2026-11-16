import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { RecordingStore } from "../src/recording-store.mjs";

const HOUR = 3_600_000;
const dirs = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "recording-store-"));
  dirs.push(dir);
  return dir;
}

async function recording(dir, name, ageMs) {
  const file = join(dir, name);
  await writeFile(file, "not really a video");
  const when = new Date(Date.now() - ageMs);
  await utimes(file, when, when);
  return file;
}

after(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

test("deletes recordings past the window and keeps the rest", async () => {
  const dir = await tempDir();
  await recording(dir, "old.mp4", 25 * HOUR);
  await recording(dir, "yesterday.mp4", 23 * HOUR);

  const deleted = await new RecordingStore({ dir, retentionHours: 24 }).sweep();

  assert.deepEqual(deleted, ["old.mp4"]);
  assert.deepEqual(await readdir(dir), ["yesterday.mp4"]);
});

test("a window shorter than the broadcast still keeps a live recording", async () => {
  const dir = await tempDir();
  // Writing updates the mtime, so a file being recorded right now is never old.
  await recording(dir, "live.mp4", 0);

  const store = new RecordingStore({ dir, retentionHours: 0.0005 });
  assert.deepEqual(await store.sweep(), []);
  assert.deepEqual(await readdir(dir), ["live.mp4"]);
});

test("a window of 0 keeps everything", async () => {
  const dir = await tempDir();
  await recording(dir, "ancient.mp4", 400 * 24 * HOUR);

  const store = new RecordingStore({ dir, retentionHours: 0 });
  assert.equal(store.enabled, false);
  assert.deepEqual(await store.sweep(), []);
  assert.deepEqual(await readdir(dir), ["ancient.mp4"]);
});

test("a missing volume is not an error", async () => {
  const dir = join(await tempDir(), "not-mounted-yet");
  const store = new RecordingStore({ dir, retentionHours: 24 });
  assert.deepEqual(await store.sweep(), []);
});

test("only files are swept, and a sweep says what it did", async () => {
  const dir = await tempDir();
  const nested = join(dir, "some-directory");
  await mkdir(nested);
  await recording(dir, "gone.mp4", 30 * HOUR);
  const logs = [];

  const deleted = await new RecordingStore({
    dir,
    retentionHours: 24,
    logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line) },
  }).sweep();

  assert.deepEqual(deleted, ["gone.mp4"]);
  assert.deepEqual(await readdir(dir), ["some-directory"]);
  assert.match(logs.join("\n"), /deleted 1 recording\(s\) older than 24h/);
});

test("refuses to be built without a directory or a sane window", () => {
  assert.throws(() => new RecordingStore({ dir: "" }), /needs a recording directory/);
  assert.throws(
    () => new RecordingStore({ dir: "/recordings", retentionHours: -1 }),
    /RECORDING_RETENTION_HOURS must be a number of hours/,
  );
  assert.throws(
    () => new RecordingStore({ dir: "/recordings", retentionHours: "soon" }),
    /RECORDING_RETENTION_HOURS must be a number of hours/,
  );
});

test("probe makes the volume and leaves nothing behind", async () => {
  const dir = join(await tempDir(), "recordings", "nested");

  assert.equal(await new RecordingStore({ dir }).probe(), null);
  assert.deepEqual(await readdir(dir), []);
});

test("probe reports a volume it cannot write to", async () => {
  const dir = await tempDir();
  const file = join(dir, "not-a-directory");
  await writeFile(file, "not a volume");

  const reason = await new RecordingStore({
    dir: join(file, "recordings"),
  }).probe();

  assert.match(reason, /ENOTDIR|EEXIST/);
  assert.deepEqual(await readdir(dir), ["not-a-directory"]);
});
