import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = `negative-path-${Date.now()}@local.test`;
const PASSWORD = randomBytes(18).toString("base64url");

let child;
let baseUrl;

async function waitForServer(processHandle) {
  let output = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`live-sync API did not start. Output:\n${output}`));
    }, 10_000);

    processHandle.stdout.on("data", (chunk) => {
      output += String(chunk);
      const match = /ready at (http:\/\/[^\s]+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    processHandle.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    processHandle.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `live-sync API exited before becoming ready (code ${code}).\n${output}`,
        ),
      );
    });
  });
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    // A non-JSON failure is still a valid test result.
  }
  return { response, json };
}

async function signIn(password = PASSWORD) {
  const { response, json } = await api("/auth/login", {
    method: "POST",
    body: { email: EMAIL, password },
  });
  assert.equal(response.status, 200);
  assert.equal(typeof json?.token, "string");
  return json.token;
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, "scripts", "live-sync-api.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      LIVE_SYNC_API_PORT: "0",
      LIVE_SYNC_ARTIST_EMAIL: EMAIL,
      LIVE_SYNC_ARTIST_PASSWORD: PASSWORD,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  baseUrl = await waitForServer(child);
});

after(async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
});

test("accepts the seeded artist and returns no unusable mail promise", async () => {
  const { response, json } = await api("/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });

  assert.equal(response.status, 200);
  assert.equal(json.user.email, EMAIL);
  assert.equal(json.user.emailVerified, true);
  assert.equal(json.emailVerificationAvailable, false);
  assert.equal(typeof json.token, "string");
});

test("rejects a wrong password and an unknown email without distinguishing them", async () => {
  const wrongPassword = await api("/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: `${PASSWORD}-wrong` },
  });
  const unknownEmail = await api("/auth/login", {
    method: "POST",
    body: { email: "nobody@local.test", password: PASSWORD },
  });

  assert.equal(wrongPassword.response.status, 401);
  assert.equal(unknownEmail.response.status, 401);
  assert.deepEqual(wrongPassword.json, unknownEmail.json);
});

test("refuses profile access without a valid bearer token", async () => {
  const missing = await api("/profile/9001");
  const invalid = await api("/profile/9001", { token: "not-a-real-token" });
  const writeWithoutAuth = await api("/profile", {
    method: "POST",
    body: { userId: "9001", profileData: {} },
  });

  assert.equal(missing.response.status, 401);
  assert.equal(invalid.response.status, 401);
  assert.equal(writeWithoutAuth.response.status, 401);
});

test("refuses profile reads and writes for another account", async () => {
  const token = await signIn();

  const readOther = await api("/profile/9002", { token });
  const writeOther = await api("/profile", {
    method: "POST",
    token,
    body: { userId: "9002", profileData: { id: "9002" } },
  });

  assert.equal(readOther.response.status, 403);
  assert.equal(writeOther.response.status, 403);
});

test("stores and returns only the signed-in artist's profile", async () => {
  const token = await signIn();
  const profileData = {
    id: "9001",
    settings: {
      studio: { guideCompletedLessonIds: ["loop-groove"] },
    },
  };

  const beforeSave = await api("/profile/9001", { token });
  const saved = await api("/profile", {
    method: "POST",
    token,
    body: { userId: "9001", profileData },
  });
  const loaded = await api("/profile/9001", { token });
  const missingData = await api("/profile", {
    method: "POST",
    token,
    body: { userId: "9001" },
  });

  assert.equal(beforeSave.response.status, 404);
  assert.equal(saved.response.status, 200);
  assert.equal(loaded.response.status, 200);
  assert.deepEqual(loaded.json, profileData);
  assert.equal(missingData.response.status, 400);
});
