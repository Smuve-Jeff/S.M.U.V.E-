import express from "express";
import type { AddressInfo } from "node:net";
import profileRoutes from "./profile.routes";
import { errorHandler } from "@/lib";
import * as services from "@/services";

jest.mock("@/middleware/auth", () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = (globalThis as any).__profileRouteActor;
    next();
  },
}));

jest.mock("@/services", () => ({
  getProfile: jest.fn(),
  saveProfile: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/profile", profileRoutes);
app.use(errorHandler);

/**
 * The profile blob is the artist's private record, so the account boundary has
 * two halves: the row id must be the caller's, and the blob's own stamp must
 * agree with the row it is being written into.
 */
describe("profile HTTP routes", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__profileRouteActor = { userId: "u1", role: "artist" };
    (services.saveProfile as jest.Mock).mockResolvedValue({ success: true });
  });

  it("serves the caller their own profile", async () => {
    (services.getProfile as jest.Mock).mockResolvedValue({ id: "u1", artistName: "Nova" });

    const response = await fetch(`${baseUrl}/api/profile/u1`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ artistName: "Nova" });
    expect(services.getProfile).toHaveBeenCalledWith("u1");
  });

  it("refuses to read another account's profile", async () => {
    const response = await fetch(`${baseUrl}/api/profile/u2`);

    expect(response.status).toBe(403);
    expect(services.getProfile).not.toHaveBeenCalled();
  });

  it("lets an admin read another account's profile", async () => {
    (globalThis as any).__profileRouteActor = { userId: "admin-1", role: "admin" };
    (services.getProfile as jest.Mock).mockResolvedValue({ id: "u2" });

    const response = await fetch(`${baseUrl}/api/profile/u2`);

    expect(response.status).toBe(200);
    expect(services.getProfile).toHaveBeenCalledWith("u2");
  });

  it("saves a blob stamped as the caller", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u1", profileData: { id: "u1", artistName: "Nova" } }),
    });

    expect(response.status).toBe(200);
    expect(services.saveProfile).toHaveBeenCalledWith({
      userId: "u1",
      profileData: { id: "u1", artistName: "Nova" },
    });
  });

  it("rejects a blob stamped as a different account", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        profileData: { id: "u2", artistName: "Someone Else" },
      }),
    });

    expect(response.status).toBe(400);
    expect(services.saveProfile).not.toHaveBeenCalled();
  });

  it("accepts an unstamped blob, since the row names the owner", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u1", profileData: { artistName: "New" } }),
    });

    expect(response.status).toBe(200);
    expect(services.saveProfile).toHaveBeenCalledWith({
      userId: "u1",
      profileData: { artistName: "New" },
    });
  });

  it("still refuses to write into another account's row", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u2", profileData: { id: "u2" } }),
    });

    expect(response.status).toBe(403);
    expect(services.saveProfile).not.toHaveBeenCalled();
  });
});
