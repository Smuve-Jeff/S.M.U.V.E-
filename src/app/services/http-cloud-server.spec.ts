import { TestBed } from "@angular/core/testing";
import type {
  RemoteSnapshot,
  SyncEnvelope,
} from "../types/cloud-sync.types";
import { HttpCloudServer } from "./http-cloud-server";

const TOKEN_KEY = "smuve_jwt_token";

function envelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    manifest: {
      projectId: "p1",
      version: 3,
      lastModified: 1,
      authorDeviceId: "d1",
      title: "Test project",
      byteSize: 10,
    },
    payload: { tracks: [] },
    ...overrides,
  };
}

function snapshot(): RemoteSnapshot {
  return {
    projectId: "p1",
    deviceId: "d1",
    version: 3,
    data: { tracks: [] },
    timestamp: 1,
    title: "Test project",
    byteSize: 10,
  };
}

describe("HttpCloudServer", () => {
  let service: HttpCloudServer;
  let fetchMock: jest.Mock;
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HttpCloudServer);
    localStorage.setItem(TOKEN_KEY, "test-jwt");
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    localStorage.removeItem(TOKEN_KEY);
    if (originalFetch) global.fetch = originalFetch;
    else delete (global as { fetch?: unknown }).fetch;
  });

  const okJson = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it("pushes the envelope as JSON with the bearer token", async () => {
    fetchMock.mockResolvedValue(okJson({ success: true, snapshot: snapshot() }));

    const result = await service.push(envelope());

    expect(result).toEqual({ success: true, snapshot: snapshot() });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/cloud\/push$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-jwt");
    expect(JSON.parse(init.body).manifest.projectId).toBe("p1");
  });

  it("passes server conflicts through instead of throwing", async () => {
    const conflict = {
      success: false,
      conflict: {
        projectId: "p1",
        localVersion: 3,
        remoteVersion: 4,
        remoteDeviceId: "d2",
        remoteDeviceName: "Phone",
        remoteSnapshot: snapshot(),
        detectedAt: 2,
      },
    };
    fetchMock.mockResolvedValue(okJson(conflict));

    const result = await service.push(envelope());

    expect(result).toEqual(conflict);
  });

  it("refuses to sync without a sign-in token", async () => {
    localStorage.removeItem(TOKEN_KEY);

    await expect(service.push(envelope())).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws typed errors for HTTP failures and network loss", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Down for maintenance" }),
    });
    await expect(service.push(envelope())).rejects.toMatchObject({
      statusCode: 503,
      message: "Down for maintenance",
    });

    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(service.push(envelope())).rejects.toMatchObject({
      statusCode: 0,
    });
  });

  it("uploads large snapshots through the resumable path", async () => {
    // Just over the 2 MiB client threshold.
    const big = envelope({ payload: { blob: "x".repeat(2 * 1024 * 1024 + 8) } });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/uploads") && init.method === "POST") {
        return okJson({ uploadId: "u1", key: "k1", partSize: 5 * 1024 * 1024 });
      }
      if (url.includes("/parts/")) return okJson({ etag: "e1" });
      if (url.endsWith("/complete")) {
        return okJson({ success: true, snapshot: snapshot() });
      }
      throw new Error(`unexpected call ${url}`);
    });

    const result = await service.push(big);

    expect(result).toEqual({ success: true, snapshot: snapshot() });
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls[0]).toMatch(/\/cloud\/uploads$/);
    expect(urls[1]).toMatch(/\/uploads\/u1\/parts\/1\?key=k1$/);
    // The octet-stream part carries no JSON content type.
    expect(fetchMock.mock.calls[1][1].headers["Content-Type"]).toBe(
      "application/octet-stream",
    );
    expect(urls.at(-1)).toMatch(/\/uploads\/u1\/complete$/);
  });

  it("aborts the resumable upload when a part fails", async () => {
    const big = envelope({ payload: { blob: "x".repeat(2 * 1024 * 1024 + 8) } });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/uploads") && init.method === "POST") {
        return okJson({ uploadId: "u1", key: "k1", partSize: 64 * 1024 * 1024 });
      }
      if (url.includes("/parts/")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      if (init.method === "DELETE") return okJson({});
      throw new Error(`unexpected call ${url}`);
    });

    await expect(service.push(big)).rejects.toMatchObject({ statusCode: 500 });
    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => init.method === "DELETE",
    );
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0][0])).toMatch(/\/uploads\/u1\?key=k1$/);
  });

  it("reads pull, projects and snapshots from the matching routes", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/projects/p1/latest")) return okJson(snapshot());
      if (url.endsWith("/projects/p1/snapshots")) return okJson([snapshot()]);
      if (url.endsWith("/projects")) return okJson([snapshot()]);
      throw new Error(`unexpected call ${url}`);
    });

    await expect(service.pull("p1")).resolves.toEqual(snapshot());
    await expect(service.listSnapshots("p1")).resolves.toEqual([snapshot()]);
    await expect(service.listProjects()).resolves.toEqual([snapshot()]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe("Bearer test-jwt");
    }
  });
});
