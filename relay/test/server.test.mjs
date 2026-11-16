import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

import { mp4Header } from "./helpers/mp4-fixture.mjs";

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

const recordingDirs = [];

async function makeRecordingDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "relay-server-recordings-"));
  recordingDirs.push(dir);
  for (const [name, contents, ageMs = 0] of files) {
    const file = join(dir, name);
    await writeFile(file, contents);
    if (ageMs > 0) {
      const when = new Date(Date.now() - ageMs);
      await utimes(file, when, when);
    }
  }
  return dir;
}

after(async () => {
  await Promise.all(
    recordingDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
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

test("counts stalled sessions without calling itself degraded", async () => {
  const { base } = await startServer({
    manager: {
      list: () => [
        { id: "a", stalled: true },
        { id: "b", stalled: false },
      ],
      health: async () => ({ mediamtx: "reachable", detail: null }),
    },
  });

  const response = await fetch(`${base}/health`);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions, 2);
  assert.equal(body.stalled, 1);
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

test("lists the recordings it holds, newest first", async () => {
  const dir = await makeRecordingDir([
    ["older.mp4", "first", 60_000],
    ["newer.mp4", "second-and-longer"],
  ]);
  const { base } = await startServer({ recordingDir: dir });

  const response = await fetch(`${base}/recordings`, { headers: bearer });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.recordings.map((row) => row.name),
    ["newer.mp4", "older.mp4"],
  );
  assert.equal(body.recordings[0].bytes, "second-and-longer".length);
  assert.match(body.recordings[0].modifiedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("only files are listed, and an empty volume is an empty list", async () => {
  const dir = await makeRecordingDir([["kept.mp4", "bytes"]]);
  await mkdir(join(dir, "a-directory"));
  await writeFile(join(dir, ".hidden"), "x");
  const { base } = await startServer({ recordingDir: dir });

  const body = await fetch(`${base}/recordings`, { headers: bearer }).then((r) =>
    r.json(),
  );

  assert.deepEqual(
    body.recordings.map((row) => row.name),
    ["kept.mp4"],
  );

  const empty = await makeRecordingDir([]);
  const other = await startServer({ recordingDir: empty });
  const emptyBody = await fetch(`${other.base}/recordings`, {
    headers: bearer,
  }).then((r) => r.json());
  assert.deepEqual(emptyBody.recordings, []);
});

test("serves a recording as an attachment, and nothing else", async () => {
  const dir = await makeRecordingDir([["show.mp4", "video-bytes"]]);
  const { base } = await startServer({ recordingDir: dir });

  const response = await fetch(`${base}/recordings/show.mp4`, { headers: bearer });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), String("video-bytes".length));
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="show.mp4"',
  );
  assert.equal(await response.text(), "video-bytes");
});

test("will not walk out of the recording volume", async () => {
  const dir = await makeRecordingDir([["show.mp4", "video-bytes"]]);
  const outside = join(dir, "..", "outside.mp4");
  await writeFile(outside, "secret");
  const { base } = await startServer({ recordingDir: dir });

  for (const name of ["..%2Foutside.mp4", "%2e%2e%2foutside.mp4", ".hidden", "sub%2Fshow.mp4"]) {
    const response = await fetch(`${base}/recordings/${name}`, { headers: bearer });
    assert.equal(response.status, 404, `${name} should not resolve`);
  }
  await rm(outside, { force: true });
});

test("recording endpoints need the token and an enabled volume", async () => {
  const dir = await makeRecordingDir([["show.mp4", "video-bytes"]]);
  const { base } = await startServer({ recordingDir: dir });

  assert.equal((await fetch(`${base}/recordings`)).status, 401);
  assert.equal((await fetch(`${base}/recordings/show.mp4`)).status, 401);

  const off = await startServer();
  assert.equal((await fetch(`${off.base}/recordings`, { headers: bearer })).status, 503);
  assert.equal(
    (await fetch(`${off.base}/recordings/show.mp4`, { headers: bearer })).status,
    503,
  );
});

test("serves byte ranges so a player can seek", async () => {
  const dir = await makeRecordingDir([["show.mp4", "video-bytes"]]);
  const { base } = await startServer({ recordingDir: dir });

  const partial = await fetch(`${base}/recordings/show.mp4`, {
    headers: { ...bearer, Range: "bytes=0-4" },
  });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("accept-ranges"), "bytes");
  assert.equal(partial.headers.get("content-range"), "bytes 0-4/11");
  assert.equal(partial.headers.get("content-length"), "5");
  assert.equal(await partial.text(), "video");

  const tail = await fetch(`${base}/recordings/show.mp4`, {
    headers: { ...bearer, Range: "bytes=-5" },
  });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get("content-range"), "bytes 6-10/11");
  assert.equal(await tail.text(), "bytes");

  const full = await fetch(`${base}/recordings/show.mp4`, { headers: bearer });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("accept-ranges"), "bytes");

  const beyond = await fetch(`${base}/recordings/show.mp4`, {
    headers: { ...bearer, Range: "bytes=99-120" },
  });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get("content-range"), "bytes */11");
});

test("lists each recording's duration from its own header", async () => {
  const dir = await makeRecordingDir([
    ["show.mp4", mp4Header(7)],
    ["unreadable.mp4", "not really a video"],
  ]);
  const { base } = await startServer({ recordingDir: dir });

  const body = await fetch(`${base}/recordings`, { headers: bearer }).then((r) =>
    r.json(),
  );

  const byName = new Map(body.recordings.map((row) => [row.name, row]));
  assert.equal(byName.get("show.mp4").durationSeconds, 7);
  assert.equal(byName.get("unreadable.mp4").durationSeconds, null);
});

test("serves a cached thumbnail as an image, and says so when there is none", async () => {
  const dir = await makeRecordingDir([
    ["show.mp4", mp4Header(7)],
    ["show.jpg", "jpeg-bytes"],
  ]);
  const { base } = await startServer({ recordingDir: dir });

  assert.equal(
    (await fetch(`${base}/recordings/show.mp4/thumbnail`)).status,
    401,
  );

  const response = await fetch(`${base}/recordings/show.mp4/thumbnail`, {
    headers: bearer,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("content-length"), String("jpeg-bytes".length));
  assert.equal(await response.text(), "jpeg-bytes");

  const missing = await fetch(`${base}/recordings/missing.mp4/thumbnail`, {
    headers: bearer,
  });
  assert.equal(missing.status, 404);

  const off = await startServer();
  assert.equal(
    (await fetch(`${off.base}/recordings/show.mp4/thumbnail`, { headers: bearer }))
      .status,
    503,
  );
});

test("the thumbnail sidecar is not listed as a show of its own", async () => {
  const dir = await makeRecordingDir([
    ["show.mp4", mp4Header(7)],
    ["show.jpg", "jpeg-bytes"],
  ]);
  const { base } = await startServer({ recordingDir: dir });

  const body = await fetch(`${base}/recordings`, { headers: bearer }).then((r) =>
    r.json(),
  );

  assert.deepEqual(
    body.recordings.map((row) => row.name),
    ["show.mp4"],
  );
});

test("deletes a recording and the frame cached beside it", async () => {
  const dir = await makeRecordingDir([
    ["show.mp4", mp4Header(7)],
    ["show.jpg", "jpeg-bytes"],
    ["kept.mp4", mp4Header(3)],
  ]);
  const { base } = await startServer({ recordingDir: dir });

  assert.equal(
    (await fetch(`${base}/recordings/show.mp4`, { method: "DELETE" })).status,
    401,
  );

  const deleted = await fetch(`${base}/recordings/show.mp4`, {
    method: "DELETE",
    headers: bearer,
  });
  assert.equal(deleted.status, 204);
  assert.deepEqual((await readdir(dir)).sort(), ["kept.mp4"]);

  // A host that presses delete twice, or after retention caught up, is not an
  // error: the file being gone is what was asked for.
  const again = await fetch(`${base}/recordings/show.mp4`, {
    method: "DELETE",
    headers: bearer,
  });
  assert.equal(again.status, 204);

  const listed = await fetch(`${base}/recordings`, { headers: bearer }).then((r) =>
    r.json(),
  );
  assert.deepEqual(
    listed.recordings.map((row) => row.name),
    ["kept.mp4"],
  );

  const off = await startServer();
  assert.equal(
    (await fetch(`${off.base}/recordings/show.mp4`, {
      method: "DELETE",
      headers: bearer,
    })).status,
    503,
  );
});

test("will not delete outside the recording volume", async () => {
  const dir = await makeRecordingDir([["show.mp4", mp4Header(7)]]);
  const outside = join(dir, "..", "outside.mp4");
  await writeFile(outside, "secret");
  const { base } = await startServer({ recordingDir: dir });

  for (const name of ["..%2Foutside.mp4", "%2e%2e%2foutside.mp4", ".hidden"]) {
    const response = await fetch(`${base}/recordings/${name}`, {
      method: "DELETE",
      headers: bearer,
    });
    assert.equal(response.status, 204, `${name} should not resolve`);
  }
  assert.equal(await readFile(outside, "utf8"), "secret");
  await rm(outside, { force: true });
});

test("keeps one recording past the window when a host asks", async () => {
  const dir = await makeRecordingDir([["show.mp4", mp4Header(7)]]);
  const { base } = await startServer({ recordingDir: dir });

  assert.equal(
    (await fetch(`${base}/recordings/show.mp4/retention`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: 168 }),
    })).status,
    401,
  );

  const kept = await fetch(`${base}/recordings/show.mp4/retention`, {
    method: "PUT",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ hours: 168 }),
  });
  assert.equal(kept.status, 200);
  const pin = await kept.json();
  assert.equal(pin.keepHours, 168);
  assert.ok(Date.parse(pin.keepUntil) > Date.now() + 167 * 3_600_000);

  const listed = await fetch(`${base}/recordings`, { headers: bearer }).then((r) =>
    r.json(),
  );
  assert.equal(listed.recordings[0].keepHours, 168);
  assert.equal(listed.recordings[0].keepUntil, pin.keepUntil);

  const cleared = await fetch(`${base}/recordings/show.mp4/retention`, {
    method: "PUT",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ hours: 0 }),
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), { keepHours: 0, keepUntil: null });
  assert.deepEqual((await readdir(dir)).sort(), ["show.mp4"]);
});

test("refuses a keep duration it cannot honour", async () => {
  const dir = await makeRecordingDir([["show.mp4", mp4Header(7)]]);
  const { base } = await startServer({ recordingDir: dir });
  const put = (hours) =>
    fetch(`${base}/recordings/show.mp4/retention`, {
      method: "PUT",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    });

  for (const hours of ["abc", -1, 1.5, 90 * 24 + 1, null]) {
    assert.equal((await put(hours)).status, 400, `${hours} should be refused`);
  }
  assert.deepEqual(await readdir(dir), ["show.mp4"]);

  const missing = await fetch(`${base}/recordings/missing.mp4/retention`, {
    method: "PUT",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ hours: 24 }),
  });
  assert.equal(missing.status, 404);

  const off = await startServer();
  assert.equal(
    (await fetch(`${off.base}/recordings/show.mp4/retention`, {
      method: "PUT",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ hours: 24 }),
    })).status,
    503,
  );
});
