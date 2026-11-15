import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import { SessionManager } from "../src/session-manager.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = (signal) => {
    child.killed = true;
    child.emit("exit", null, signal);
  };
  return child;
}

function harness(overrides = {}) {
  const children = [];
  const calls = [];
  const added = [];
  const deleted = [];
  const manager = new SessionManager({
    spawn: (command, args) => {
      calls.push({ command, args });
      const child = fakeChild();
      children.push(child);
      return child;
    },
    mediamtx: {
      addPath: async (id) => added.push(id),
      deletePath: async (id) => deleted.push(id),
    },
    publicUrl: "https://relay.example.com/",
    rtspUrl: "rtsp://127.0.0.1:8554/",
    logger: { info() {}, warn() {}, error() {} },
    ...overrides,
  });
  return { manager, children, calls, added, deleted };
}

const destination = {
  rtmpUrl: "rtmp://live.twitch.tv/app",
  streamKey: "live_123456789_abcdef",
};

test("opens a path and pushes RTSP to the provider's RTMP ingest", async () => {
  const { manager, calls, added } = harness();

  const session = await manager.create(destination);

  assert.match(session.id, /^[a-f0-9]{32}$/);
  assert.equal(session.whipUrl, `https://relay.example.com/${session.id}/whip`);
  assert.deepEqual(added, [session.id]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    "-nostdin",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    `rtsp://127.0.0.1:8554/${session.id}`,
    "-c",
    "copy",
    "-f",
    "flv",
    "rtmp://live.twitch.tv/app/live_123456789_abcdef",
  ]);
  assert.equal(manager.list()[0].running, true);
});

test("deleting a session kills ffmpeg and its publish path", async () => {
  const { manager, children, deleted } = harness();
  const session = await manager.create(destination);

  assert.equal(await manager.delete(session.id), true);

  assert.equal(children[0].killed, true);
  assert.deepEqual(deleted, [session.id]);
  assert.equal(manager.has(session.id), false);
  assert.equal(await manager.delete(session.id), false);
});

test("retries an ffmpeg that exits before the publisher connects", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { manager, children, calls } = harness({ maxRestarts: 2 });
    const session = await manager.create(destination);

    children[0].emit("exit", 1, null);
    mock.timers.tick(1_100);

    assert.equal(calls.length, 2);
    assert.equal(manager.list()[0].restarts, 1);
    assert.equal(manager.has(session.id), true);
    await manager.delete(session.id);
  } finally {
    mock.timers.reset();
  }
});

test("gives up and closes the session once the retry budget is spent", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { manager, children } = harness({ maxRestarts: 0 });
    const session = await manager.create(destination);

    children[0].emit("exit", 1, null);
    await Promise.resolve();

    assert.equal(manager.has(session.id), false);
  } finally {
    mock.timers.reset();
  }
});

test("sweeps sessions that outlive their configured lifetime", async () => {
  const { manager, deleted } = harness();
  const session = await manager.create(destination);

  await manager.sweep(-1);

  assert.deepEqual(deleted, [session.id]);
  assert.equal(manager.has(session.id), false);
});

test("refuses a destination before touching the media server", async () => {
  const { manager, added } = harness();

  await assert.rejects(
    manager.create({ rtmpUrl: "https://twitch.tv/app", streamKey: "abcdefghij" }),
  );
  assert.deepEqual(added, []);
  assert.equal(manager.list().length, 0);
});
