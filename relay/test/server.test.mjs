import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ValidationError } from "../src/destinations.mjs";
import { createRelayServer } from "../src/server.mjs";

const created = [];
const deleted = [];
const manager = {
  list: () => created.map((session) => ({ id: session.id })),
  create: async (body) => {
    if (!body.rtmpUrl) throw new ValidationError("rtmpUrl is required");
    const session = { id: "abc123", whipUrl: "https://relay.example.com/abc123/whip" };
    created.push(session);
    return session;
  },
  delete: async (id) => {
    deleted.push(id);
    return true;
  },
};

let server;
let base;

before(async () => {
  server = createRelayServer({
    manager,
    token: "relay-token",
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("health is open so a probe can see the relay", async () => {
  const response = await fetch(`${base}/health`);

  assert.equal(response.status, 200);
  await assert.doesNotReject(response.json());
});

test("refuses session creation without the bearer token", async () => {
  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rtmpUrl: "rtmp://live.twitch.tv/app", streamKey: "abcdefghij" }),
  });

  assert.equal(response.status, 401);
});

test("creates a session for the API that holds the token", async () => {
  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer relay-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rtmpUrl: "rtmp://live.twitch.tv/app", streamKey: "abcdefghij" }),
  });

  assert.equal(response.status, 201);
  await assert.doesNotReject(
    response.json().then((body) =>
      assert.equal(body.whipUrl, "https://relay.example.com/abc123/whip"),
    ),
  );
});

test("maps a bad destination to 400, not a relay failure", async () => {
  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer relay-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ streamKey: "abcdefghij" }),
  });

  assert.equal(response.status, 400);
});

test("closes a session on DELETE", async () => {
  const response = await fetch(`${base}/sessions/abc123`, {
    method: "DELETE",
    headers: { Authorization: "Bearer relay-token" },
  });

  assert.equal(response.status, 204);
  assert.deepEqual(deleted, ["abc123"]);
});

test("rejects a body that is not JSON", async () => {
  const response = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer relay-token",
      "Content-Type": "application/json",
    },
    body: "{not json",
  });

  assert.equal(response.status, 400);
});
