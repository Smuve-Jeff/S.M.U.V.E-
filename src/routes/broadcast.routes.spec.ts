import express from "express";
import type { AddressInfo } from "node:net";

jest.mock("@/config/env", () => ({
  MEDIA_RELAY_URL: "http://relay.test",
  MEDIA_RELAY_TOKEN: "relay-token",
  JWT_SECRET: "test-secret",
}));

jest.mock("@/middleware/auth", () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = { userId: 7 };
    next();
  },
}));

jest.mock("@/services/broadcast-ingest.service", () => ({
  clearManualDestination: jest.fn(),
  destinationOverview: jest.fn(),
  ingestStatus: jest.fn(),
  saveManualDestination: jest.fn(),
  selfTestStatus: jest.fn(),
  startIngestSession: jest.fn(),
  startSelfTest: jest.fn(),
  stopIngestSession: jest.fn(),
}));

jest.mock("@/services/broadcast-recordings.service", () => ({
  deleteBroadcastRecording: jest.fn(),
  issueArchiveTicket: jest.fn(),
  issuePlaybackTicket: jest.fn(),
  listBroadcastRecordings: jest.fn(),
  openBroadcastRecording: jest.fn(),
  playbackTicketFromQuery: jest.fn(() => true),
  recordingArchive: jest.fn(),
  relayRecordingStatus: jest.fn(),
  setBroadcastRetention: jest.fn(),
}));

import broadcastRoutes from "./broadcast.routes";
import { recordingArchive } from "@/services/broadcast-recordings.service";

const archiveMock = recordingArchive as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/broadcast", broadcastRoutes);
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

describe("broadcast recordings archive route", () => {
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
  });

  const archiveUrl = (name = "@archive") =>
    `${baseUrl}/api/broadcast/recordings/aaaa/archive?name=${encodeURIComponent(
      name,
    )}&u=7&exp=1&sig=x`;

  it("answers with the relay error, not an empty zip, when the first segment cannot be opened", async () => {
    const failure = Object.assign(
      new Error("The relay could not hand over that recording."),
      { statusCode: 502 },
    );
    archiveMock.mockResolvedValue({
      filename: "aaaa.zip",
      entries: [
        {
          name: "aaaa-2026-01-01_10-00-00-000000.mp4",
          modifiedAt: "2026-01-01T10:00:00.000Z",
          open: async () => {
            throw failure;
          },
        },
      ],
    });

    const response = await fetch(archiveUrl());

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: failure.message });
  });

  it("stops reading the relay when the browser cancels the download", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // One chunk, then nothing: the download stays open until aborted.
        controller.enqueue(new Uint8Array(4096));
      },
      cancel() {
        cancelled = true;
      },
    });
    archiveMock.mockResolvedValue({
      filename: "aaaa.zip",
      entries: [
        {
          name: "aaaa-2026-01-01_10-00-00-000000.mp4",
          modifiedAt: "2026-01-01T10:00:00.000Z",
          open: async () => body,
        },
      ],
    });

    const client = new AbortController();
    const response = await fetch(archiveUrl(), { signal: client.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();
    client.abort();

    const deadline = Date.now() + 3000;
    while (!cancelled && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(cancelled).toBe(true);
  });

  it("aborts the relay listing when the browser gives up before the first segment", async () => {
    let seen: AbortSignal | undefined;
    let listingStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      listingStarted = resolve;
    });
    archiveMock.mockImplementation(
      (
        _userId: number,
        _relayId: string,
        options: { signal?: AbortSignal } = {},
      ) => {
        seen = options.signal;
        listingStarted();
        // A relay listing that only settles by being cancelled.
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })),
          );
        });
      },
    );

    const client = new AbortController();
    const request = fetch(archiveUrl(), { signal: client.signal });
    request.catch(() => {});
    await started;
    client.abort();

    await expect(request).rejects.toThrow(/abort/i);
    const deadline = Date.now() + 3000;
    while (!seen?.aborted && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(seen?.aborted).toBe(true);
  });

  it("refuses a ticket that is not for the whole show", async () => {
    const response = await fetch(archiveUrl("aaaa-2026-01-01_10-00-00.mp4"));

    expect(response.status).toBe(403);
    expect(archiveMock).not.toHaveBeenCalled();
  });
});
