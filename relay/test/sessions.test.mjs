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

test("reports MediaMTX byte and track stats for a session", async () => {
  const { manager, children } = harness({
    mediamtx: {
      addPath: async () => {},
      deletePath: async () => {},
      getPath: async () => ({
        ready: true,
        bytesReceived: 4096,
        tracks: ["video/H264"],
      }),
    },
  });
  const session = await manager.create(destination);

  const status = await manager.status(session.id);

  assert.equal(status.ready, true);
  assert.equal(status.bytesReceived, 4096);
  assert.deepEqual(status.tracks, ["video/H264"]);
  assert.equal(status.kind, "broadcast");
  children[0].kill();
});

test("re-attaches stored sessions whose publisher is still connected", async () => {
  const stored = [
    {
      id: "alive1",
      kind: "broadcast",
      destination: "rtmp://live.twitch.tv/app/live_alive_key",
      createdAt: Date.now(),
    },
    {
      id: "gone1",
      kind: "broadcast",
      destination: "rtmp://live.twitch.tv/app/live_gone_key",
      createdAt: Date.now(),
    },
  ];
  const { manager, calls } = harness({
    store: { load: async () => stored, save: async () => {} },
    mediamtx: {
      addPath: async () => {},
      deletePath: async () => {},
      getPath: async (id) => (id === "alive1" ? { ready: true } : null),
    },
  });

  const restored = await manager.restore();

  assert.equal(restored, 1);
  assert.equal(manager.has("alive1"), true);
  assert.equal(manager.has("gone1"), false);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].args.at(-1),
    "rtmp://live.twitch.tv/app/live_alive_key",
  );
  assert.ok(calls[0].args.includes("rtsp://127.0.0.1:8554/alive1"));
});

test("persists every session change so a restart can find them", async () => {
  const saved = [];
  const { manager } = harness({
    store: { load: async () => [], save: async (records) => saved.push(records) },
  });

  const session = await manager.create(destination);
  assert.equal(saved.at(-1).length, 1);
  assert.equal(saved.at(-1)[0].id, session.id);

  await manager.delete(session.id);
  assert.deepEqual(saved.at(-1), []);
});

test("survives a store that cannot save", async () => {
  const { manager, children } = harness({
    store: {
      load: async () => [],
      save: async () => {
        throw new Error("disk full");
      },
    },
  });

  const session = await manager.create(destination);

  assert.equal(manager.has(session.id), true);
  children[0].kill();
});

test("reports the media server as reachable or not", async () => {
  const reachable = harness({
    mediamtx: {
      addPath: async () => {},
      deletePath: async () => {},
      ping: async () => true,
    },
  });
  assert.deepEqual(await reachable.manager.health(), {
    mediamtx: "reachable",
    detail: null,
  });

  const broken = harness({
    mediamtx: {
      addPath: async () => {},
      deletePath: async () => {},
      ping: async () => false,
    },
  });
  const health = await broken.manager.health();
  assert.equal(health.mediamtx, "unreachable");
  assert.match(health.detail, /control API/);
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
