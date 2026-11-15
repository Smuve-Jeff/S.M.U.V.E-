import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SessionStore } from "../src/state-store.mjs";

async function tempFile() {
  const dir = await mkdtemp(join(tmpdir(), "relay-state-"));
  return join(dir, "sessions.json");
}

const sessions = [
  {
    id: "abc123",
    kind: "broadcast",
    destination: "rtmp://live.twitch.tv/app/live_secret_key",
    createdAt: 1_700_000_000_000,
  },
];

test("round-trips sessions and writes them owner-only", async () => {
  const path = await tempFile();
  const store = new SessionStore({ path, key: "state-key" });

  await store.save(sessions);

  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes("live_secret_key"), false);
  assert.deepEqual(await new SessionStore({ path, key: "state-key" }).load(), sessions);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("no file means no sessions to restore", async () => {
  const store = new SessionStore({ path: await tempFile(), key: "state-key" });

  assert.deepEqual(await store.load(), []);
});

test("another key cannot read the records", async () => {
  const path = await tempFile();
  await new SessionStore({ path, key: "state-key" }).save(sessions);

  await assert.rejects(
    new SessionStore({ path, key: "different-key" }).load(),
  );
});

test("a tampered record is refused", async () => {
  const path = await tempFile();
  const store = new SessionStore({ path, key: "state-key" });
  await store.save(sessions);

  const parsed = JSON.parse(await readFile(path, "utf8"));
  const record = parsed.sessions[0];
  parsed.sessions[0] = record.slice(0, -2) + (record.endsWith("A") ? "BB" : "AA");
  await writeFile(path, JSON.stringify(parsed));

  await assert.rejects(new SessionStore({ path, key: "state-key" }).load());
});

test("refuses an unexpected file shape", async () => {
  const path = await tempFile();
  await writeFile(path, JSON.stringify({ version: 99, sessions: [] }));

  await assert.rejects(new SessionStore({ path, key: "state-key" }).load());
});

test("persistence needs a file and a key", () => {
  assert.throws(() => new SessionStore({ path: "", key: "state-key" }));
  assert.throws(() => new SessionStore({ path: "/tmp/x.json", key: "" }));
});
