#!/usr/bin/env node
/**
 * Local-only API for the Masterclass live-sync E2E suite.
 *
 * This is deliberately small: auth, the signed-in identity, and the profile
 * record that carries `settings.studio.guideCompletedLessonIds`. It binds to
 * loopback, keeps every profile in memory, and accepts only the artist seeded
 * by the runner. It is not a replacement for the real API and must never be
 * exposed beyond the local machine.
 *
 * Start it through `npm run test:e2e:live-sync`; that runner generates the
 * artist credentials, starts the app, and tears everything down afterward.
 */
import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.LIVE_SYNC_API_PORT || 4100);
const EMAIL = String(process.env.LIVE_SYNC_ARTIST_EMAIL || "")
  .trim()
  .toLowerCase();
const PASSWORD = String(process.env.LIVE_SYNC_ARTIST_PASSWORD || "");

if (!EMAIL || !PASSWORD) {
  console.error(
    "live-sync-api: LIVE_SYNC_ARTIST_EMAIL and LIVE_SYNC_ARTIST_PASSWORD are required.",
  );
  process.exit(1);
}

const now = new Date().toISOString();
const user = {
  id: 9001,
  name: "Masterclass Live Sync Artist",
  email: EMAIL,
  role: "Artist",
  emailVerified: true,
  createdAt: now,
  updatedAt: now,
};

/** Opaque bearer tokens issued for this process only. */
const sessions = new Map();
/** One profile per seeded artist, keyed by the user id. */
const profiles = new Map();

function samePassword(candidate) {
  const left = Buffer.from(String(candidate || ""));
  const right = Buffer.from(PASSWORD);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function authenticate(req, res, next) {
  const header = String(req.headers.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  if (!token || !sessions.has(token)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.artistId = sessions.get(token);
  next();
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "25mb" }));

// The browser normally reaches this through the runner's same-origin proxy.
// Keep direct loopback calls usable for health checks without opening CORS to
// the network.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "live-sync-api" });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");

  if (email !== user.email || !samePassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = randomUUID();
  sessions.set(token, user.id);
  res.json({
    token,
    user,
    // No mail pipeline in the harness, so the client never enters a
    // verification step it cannot finish.
    emailVerificationAvailable: false,
  });
});

app.get("/api/auth/me", authenticate, (_req, res) => {
  res.json(user);
});

app.post("/api/profile", authenticate, (req, res) => {
  const userId = String(req.body?.userId || "");
  if (userId !== String(user.id)) {
    res.status(403).json({ error: "Profile belongs to another account" });
    return;
  }
  if (!req.body?.profileData || typeof req.body.profileData !== "object") {
    res.status(400).json({ error: "profileData is required" });
    return;
  }

  profiles.set(userId, req.body.profileData);
  res.json({ ok: true, userId });
});

app.get("/api/profile/:userId", authenticate, (req, res) => {
  const userId = String(req.params.userId || "");
  if (userId !== String(user.id)) {
    res.status(403).json({ error: "Profile belongs to another account" });
    return;
  }

  const profile = profiles.get(userId);
  if (!profile) {
    res.status(404).json({ error: "No profile stored for this artist yet" });
    return;
  }

  res.json(profile);
});

app.use("/api", (_req, res) => {
  res
    .status(404)
    .json({ error: "This route is not part of the local live-sync harness" });
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `live-sync-api: local API ready at http://127.0.0.1:${PORT}/api for ${EMAIL}`,
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
