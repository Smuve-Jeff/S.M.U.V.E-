import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import { SessionManager } from "../src/session-manager.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
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
    "-nostats",
    "-progress",
    "pipe:1",
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

/** Feed ffmpeg's `-progress` output the way a real process would. */
function progress(child, totalSize) {
  child.stdout.emit("data", `frame=12\nfps=25\ntotal_size=${totalSize}\nout_time_ms=480000\n`);
}

test("alerts when a session that was pushing goes silent", async () => {
  const alerts = [];
  const { manager, children } = harness({ onAlert: (alert) => alerts.push(alert) });
  const session = await manager.create(destination);

  progress(children[0], 1024);
  assert.deepEqual(await manager.watchdog(15_000), []);
  const flagged = await manager.watchdog(15_000, Date.now() + 20_000);

  assert.deepEqual(flagged, [session.id]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].event, "session.stalled");
  assert.equal(alerts[0].sessionId, session.id);
  assert.equal(alerts[0].bytesOut, 1024);
  assert.match(alerts[0].at, /^\d{4}-/);

  // Once, not once per tick.
  assert.deepEqual(await manager.watchdog(15_000, Date.now() + 60_000), []);
  assert.equal(alerts.length, 1);

  const status = await manager.status(session.id);
  assert.equal(status.stalled, true);
  assert.equal(status.bytesOut, 1024);
  assert.ok(status.stalledForMs >= 20_000);
  assert.equal(manager.list()[0].stalled, true);
});

test("leaves a session alone until it has actually pushed something", async () => {
  const alerts = [];
  const { manager } = harness({ onAlert: (alert) => alerts.push(alert) });
  const session = await manager.create(destination);

  // No progress yet: ffmpeg is still connecting, and its retry loop owns that.
  assert.deepEqual(await manager.watchdog(15_000, Date.now() + 120_000), []);
  assert.equal(alerts.length, 0);
  assert.equal((await manager.status(session.id)).stalled, false);
});

test("clears the alert when bytes start moving again", async () => {
  const alerts = [];
  const { manager, children } = harness({ onAlert: (alert) => alerts.push(alert) });
  const session = await manager.create(destination);

  progress(children[0], 1024);
  await manager.watchdog(15_000, Date.now() + 20_000);
  progress(children[0], 4096);

  assert.equal((await manager.status(session.id)).stalled, false);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].event, "session.recovered");
  assert.equal(alerts[1].bytesOut, 4096);

  // Re-alerting requires a fresh silence window.
  assert.deepEqual(await manager.watchdog(15_000), []);
});

test("ignores a total_size that does not advance", async () => {
  const { manager, children } = harness();
  const session = await manager.create(destination);

  progress(children[0], 2048);
  progress(children[0], 2048);

  const status = await manager.status(session.id);
  assert.equal(status.bytesOut, 2048);
  assert.equal(status.stalled, false);
});

test("does nothing when the watchdog is switched off", async () => {
  const alerts = [];
  const { manager, children } = harness({ onAlert: (alert) => alerts.push(alert) });
  await manager.create(destination);

  progress(children[0], 1024);

  assert.deepEqual(await manager.watchdog(0, Date.now() + 600_000), []);
  assert.equal(alerts.length, 0);
});

test("survives an alert handler that throws", async () => {
  const { manager, children } = harness({
    onAlert: () => {
      throw new Error("webhook exploded");
    },
  });
  const session = await manager.create(destination);

  progress(children[0], 1024);

  assert.deepEqual(await manager.watchdog(15_000, Date.now() + 20_000), [session.id]);
});
