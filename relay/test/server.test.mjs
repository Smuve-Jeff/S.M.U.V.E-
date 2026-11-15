import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ValidationError } from "../src/destinations.mjs";
import { createRelayServer } from "../src/server.mjs";

function makeManager() {
  const created = [];
  const deleted = [];
  return {
    created,
    deleted,
    list: () => created.map((session) => ({ id: session.id })),
    create: async (body, { kind } = {}) => {
      if (!body.rtmpUrl) throw new ValidationError("rtmpUrl is required");
      const session = {
        id: `id${created.length + 1}`,
        kind: kind ?? "broadcast",
        whipUrl: `https://relay.example.com/id${created.length + 1}/whip`,
      };
      created.push({ ...session, body });
      return session;
    },
    status: async (id) => {
      const session = created.find((entry) => entry.id === id);
      if (!session) return null;
      return {
        id,
        kind: session.kind,
        ready: true,
        bytesReceived: 2048,
        tracks: ["video/H264", "audio/opus"],
        running: true,
        error: null,
      };
    },
    delete: async (id, { reason } = {}) => {
      deleted.push({ id, reason });
      return true;
    },
  };
}

const servers = [];

async function startServer(options) {
  const manager = makeManager();
  const server = createRelayServer({
    manager,
    token: "relay-token",
    logger: { error() {} },
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { manager, base: `http://127.0.0.1:${server.address().port}` };
}

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

const bearer = { Authorization: "Bearer relay-token" };

test("health is open so a probe can see the relay", async () => {
  const { base } = await startServer();

  const response = await fetch(`${base}/health`);

  assert.equal(response.status, 200);
  await assert.doesNotReject(response.json());
});

test("refuses session creation without the bearer token", async () => {
  const { base } = await startServer();

  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rtmpUrl: "rtmp://live.twitch.tv/app", streamKey: "abcdefghij" }),
  });

  assert.equal(response.status, 401);
});

test("creates a session for the API that holds the token", async () => {
  const { base, manager } = await startServer();

  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ rtmpUrl: "rtmp://live.twitch.tv/app", streamKey: "abcdefghij" }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.whipUrl, "https://relay.example.com/id1/whip");
  assert.equal(manager.created[0].kind, "broadcast");
});

test("maps a bad destination to 400, not a relay failure", async () => {
  const { base } = await startServer();

  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ streamKey: "abcdefghij" }),
  });

  assert.equal(response.status, 400);
});

test("closes a session on DELETE", async () => {
  const { base, manager } = await startServer();

  const response = await fetch(`${base}/sessions/abc123`, {
    method: "DELETE",
    headers: bearer,
  });

  assert.equal(response.status, 204);
  assert.deepEqual(manager.deleted, [{ id: "abc123", reason: "requested" }]);
});

test("rejects a body that is not JSON", async () => {
  const { base } = await startServer();

  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: "{not json",
  });

  assert.equal(response.status, 400);
});

test("reports ok when MediaMTX answers", async () => {
  const { base } = await startServer();
  const server = servers.at(-1);

  const response = await fetch(`${base}/health`);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.ok(server);
});

test("reports degraded, as a 503, when MediaMTX is unreachable", async () => {
  const { base } = await startServer({
    manager: {
      list: () => [],
      health: async () => ({
        mediamtx: "unreachable",
        detail: "MediaMTX did not answer its control API",
      }),
    },
  });

  const response = await fetch(`${base}/health`);

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.mediamtx, "unreachable");
});

test("answers 503 for a self-test when no sink is configured", async () => {
  const { base } = await startServer();

  const response = await fetch(`${base}/selftest`, {
    method: "POST",
    headers: bearer,
  });

  assert.equal(response.status, 503);
});

test("opens a self-test session against the configured sink only", async () => {
  const { base, manager } = await startServer({
    selftestDestination: { rtmpUrl: "rtmp://mediamtx:1935/selftest", streamKey: "probe" },
  });

  const response = await fetch(`${base}/selftest`, {
    method: "POST",
    headers: bearer,
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.whipUrl, "https://relay.example.com/id1/whip");
  assert.equal(manager.created[0].kind, "selftest");
  assert.deepEqual(manager.created[0].body, {
    rtmpUrl: "rtmp://mediamtx:1935/selftest",
    streamKey: "probe",
  });
});

test("reports what a self-test session received", async () => {
  const { base } = await startServer({
    selftestDestination: { rtmpUrl: "rtmp://mediamtx:1935/selftest", streamKey: "probe" },
  });
  const created = await fetch(`${base}/selftest`, {
    method: "POST",
    headers: bearer,
  }).then((response) => response.json());

  const response = await fetch(`${base}/sessions/${created.id}`, {
    headers: bearer,
  });

  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.ready, true);
  assert.equal(status.bytesReceived, 2048);
  assert.deepEqual(status.tracks, ["video/H264", "audio/opus"]);
});

test("404s a session it has never seen", async () => {
  const { base } = await startServer();

  const response = await fetch(`${base}/sessions/missing`, { headers: bearer });

  assert.equal(response.status, 404);
});
