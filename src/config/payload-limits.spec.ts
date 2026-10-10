import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import {
  LOCAL_IMAGE_MAX_BYTES,
  PROFILE_JSON_LIMIT,
  PROFILE_JSON_LIMIT_BYTES,
  PROFILE_JSON_RESERVE_BYTES,
  PROFILE_PAYLOAD_WORST_CASE_BYTES,
} from "./payload-limits";

/**
 * The largest profile body the web client can produce: both device-local
 * images at their cap, plus the reserve for the rest of the profile.
 */
const worstCaseBody = (): string =>
  JSON.stringify({
    userId: "42",
    profileData: {
      avatarImage: "a".repeat(LOCAL_IMAGE_MAX_BYTES.avatarImage),
      headerImage: "b".repeat(LOCAL_IMAGE_MAX_BYTES.headerImage),
      notes: "c".repeat(PROFILE_JSON_RESERVE_BYTES),
    },
  });

const postJson = (url: string, body: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    request.end(body);
  });

describe("profile payload budget", () => {
  it("leaves generous headroom between the worst case and the parser limit", () => {
    expect(PROFILE_PAYLOAD_WORST_CASE_BYTES).toBeLessThan(PROFILE_JSON_LIMIT_BYTES);
    // More than 2x, so a growing profile is not one field away from a 413.
    expect(PROFILE_JSON_LIMIT_BYTES).toBeGreaterThan(
      PROFILE_PAYLOAD_WORST_CASE_BYTES * 2,
    );
  });

  it("mounts the profile route with its own parser budget, before the global one", () => {
    // Wiring guard: the budget above only holds if app.ts actually mounts the
    // profile parser with the shared limit, ahead of the 100 kb default.
    const source = readFileSync(
      path.resolve(process.cwd(), "src/app.ts"),
      "utf8",
    );
    expect(source).toContain(
      'app.use("/api/profile", express.json({ limit: PROFILE_JSON_LIMIT })',
    );
    expect(source.indexOf('app.use("/api/profile", express.json')).toBeLessThan(
      source.indexOf("app.use(express.json());"),
    );
  });

  it("accepts the worst-case profile body and rejects one over the limit", async () => {
    const app = express();
    app.use("/api/profile", express.json({ limit: PROFILE_JSON_LIMIT }));
    app.post("/api/profile", (_req, res) => {
      res.json({ ok: true });
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/api/profile`;

    try {
      const body = worstCaseBody();
      expect(body.length).toBeGreaterThanOrEqual(PROFILE_PAYLOAD_WORST_CASE_BYTES);

      // The real body-parser, configured exactly as the API configures it.
      await expect(postJson(url, body)).resolves.toBe(200);

      const oversizedProfile = "x".repeat(PROFILE_JSON_LIMIT_BYTES + 4096);
      await expect(postJson(url, oversizedProfile)).resolves.toBe(413);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
