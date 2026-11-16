jest.mock("@/entities/BroadcastSession", () => ({
  BroadcastSession: class BroadcastSession {},
}));

/**
 * Recording files live on the relay, named after the relay session. These tests
 * pin the join between those files and the host who made them: a host sees
 * their own shows, and nobody can open a file by guessing a name.
 */
const mockRows: any[] = [];

const mockRepo = {
  find: jest.fn(async ({ where }: { where: { userId?: number } }) =>
    mockRows.filter((row) => row.userId === where?.userId),
  ),
  findOne: jest.fn(
    async ({ where }: { where: { relayId?: string } }) =>
      mockRows.find((row) => row.relayId === where?.relayId) ?? null,
  ),
  save: jest.fn(async (row: any) => {
    mockRows.push(row);
    return row;
  }),
  create: jest.fn((row: any) => ({
    id: mockRows.length + 1,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    endedAt: null,
    ...row,
  })),
  update: jest.fn(async (criteria: { relayId?: string }, patch: any) => {
    for (const row of mockRows) {
      if (row.relayId === criteria?.relayId) Object.assign(row, patch);
    }
    return { affected: 1 };
  }),
};

jest.mock("@/database/data-source", () => ({
  AppDataSource: { getRepository: jest.fn(() => mockRepo) },
}));

jest.mock("@/config/env", () => ({
  MEDIA_RELAY_URL: "http://relay.test",
  MEDIA_RELAY_TOKEN: "relay-token",
}));

import {
  deleteBroadcastRecording,
  issuePlaybackTicket,
  listBroadcastRecordings,
  markBroadcastSessionEnded,
  setBroadcastRetention,
  openBroadcastRecording,
  rememberBroadcastSession,
} from "./broadcast-recordings.service";

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  mockRows.length = 0;
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

const relayListed = (recordings: { name: string; bytes: number; modifiedAt: string }[]) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ recordings }),
  }) as unknown as Response;

const seed = (relayId: string, userId: number, platform = "twitch") =>
  mockRows.push({
    id: mockRows.length + 1,
    relayId,
    userId,
    platform,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    endedAt: null,
  });

describe("broadcast recordings", () => {
  it("lists only this host's files, newest first, with a download path", async () => {
    seed("aaaa", 7);
    seed("bbbb", 9);
    fetchMock.mockResolvedValueOnce(
      relayListed([
        { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
        { name: "aaaa-2026-01-01.mp4", bytes: 200, modifiedAt: "2026-01-01T11:00:00.000Z" },
        { name: "bbbb.mp4", bytes: 300, modifiedAt: "2026-01-01T12:00:00.000Z" },
        { name: "something-else.mp4", bytes: 400, modifiedAt: "2026-01-01T13:00:00.000Z" },
      ]),
    );

    const list = await listBroadcastRecordings(7);

    expect(list.map((row) => row.name)).toEqual([
      "aaaa-2026-01-01.mp4",
      "aaaa.mp4",
    ]);
    expect(list[0]).toMatchObject({
      relayId: "aaaa",
      platform: "twitch",
      bytes: 200,
    });
    expect(list[0].downloadPath).toBe(
      "/broadcast/recordings/aaaa/download?name=aaaa-2026-01-01.mp4",
    );
    // The relay is called with the token, never from the browser.
    expect(fetchMock).toHaveBeenCalledWith(
      "http://relay.test/recordings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer relay-token" }),
      }),
    );
  });

  it("is empty when the relay keeps no recordings", async () => {
    seed("aaaa", 7);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "recording is not configured on this relay" }),
    } as unknown as Response);

    await expect(listBroadcastRecordings(7)).resolves.toEqual([]);
  });

  it("is empty before this host has pushed anything", async () => {
    fetchMock.mockResolvedValueOnce(relayListed([]));

    await expect(listBroadcastRecordings(7)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses another host's recording", async () => {
    seed("aaaa", 7);
    fetchMock.mockResolvedValueOnce(
      relayListed([
        { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
      ]),
    );

    await expect(openBroadcastRecording(9, "aaaa", "aaaa.mp4")).rejects.toThrow(
      /does not exist/,
    );
  });

  it("refuses a file name that is not part of that session", async () => {
    seed("aaaa", 7);
    fetchMock.mockResolvedValue(
      relayListed([
        { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
        { name: "bbbb.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
      ]),
    );

    await expect(
      openBroadcastRecording(7, "aaaa", "bbbb.mp4"),
    ).rejects.toThrow(/does not exist/);
    await expect(
      openBroadcastRecording(7, "aaaa", "../aaaa.mp4"),
    ).rejects.toThrow(/does not exist/);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("download"),
      expect.anything(),
    );
  });

  it("hands over the host's own recording", async () => {
    seed("aaaa", 7);
    const body = { stream: true } as unknown as ReadableStream<Uint8Array>;
    fetchMock
      .mockResolvedValueOnce(
        relayListed([
          { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body,
        headers: new Headers({ "content-length": "12345" }),
      } as unknown as Response);

    const file = await openBroadcastRecording(7, "aaaa", "aaaa.mp4");

    expect(file.filename).toBe("aaaa.mp4");
    expect(file.bytes).toBe(12345);
    expect(file.body).toBe(body);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://relay.test/recordings/aaaa.mp4",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("remembers a session when it opens and closes it when it stops", async () => {
    await rememberBroadcastSession({ userId: 7, relayId: "aaaa", platform: "kick" });

    expect(mockRows).toHaveLength(1);
    expect(mockRows[0]).toMatchObject({ userId: 7, relayId: "aaaa", platform: "kick" });

    await markBroadcastSessionEnded("aaaa");
    expect(mockRows[0].endedAt).toBeInstanceOf(Date);
  });
});

  it("mints a playback URL only for a recording the host owns", async () => {
    seed("aaaa", 7);
    fetchMock.mockResolvedValue(
      relayListed([
        { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
      ]),
    );

    const playback = await issuePlaybackTicket(7, "aaaa", "aaaa.mp4");

    expect(playback.path.startsWith("/broadcast/recordings/aaaa/stream?")).toBe(
      true,
    );
    expect(playback.path).toContain("sig=");
    expect(new Date(playback.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await expect(
      issuePlaybackTicket(9, "aaaa", "aaaa.mp4"),
    ).rejects.toThrow(/does not exist/);
    await expect(
      issuePlaybackTicket(7, "aaaa", "bbbb.mp4"),
    ).rejects.toThrow(/does not exist/);
  });

  it("passes a byte range through so a player can seek", async () => {
    seed("aaaa", 7);
    const body = { stream: true } as unknown as ReadableStream<Uint8Array>;
    fetchMock
      .mockResolvedValueOnce(
        relayListed([
          { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        body,
        headers: new Headers({
          "content-length": "10",
          "content-range": "bytes 0-9/100",
        }),
      } as unknown as Response);

    const file = await openBroadcastRecording(7, "aaaa", "aaaa.mp4", {
      range: "bytes=0-9",
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://relay.test/recordings/aaaa.mp4",
      expect.objectContaining({ headers: expect.objectContaining({ Range: "bytes=0-9" }) }),
    );
    expect(file.status).toBe(206);
    expect(file.contentRange).toBe("bytes 0-9/100");
    expect(file.bytes).toBe(10);
  });

it("gives each recording its duration and a still frame", async () => {
  seed("aaaa", 7);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/thumbnail")) {
      return { ok: true, status: 200, arrayBuffer: async () => jpeg } as unknown as Response;
    }
    return relayListed([
      {
        name: "aaaa.mp4",
        bytes: 100,
        modifiedAt: "2026-01-01T10:00:00.000Z",
        durationSeconds: 420,
      },
    ]) as unknown as Response;
  });

  const [recording] = await listBroadcastRecordings(7);

  expect(recording.durationSeconds).toBe(420);
  expect(recording.thumbnail).toBe(
    `data:image/jpeg;base64,${jpeg.toString("base64")}`,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "http://relay.test/recordings/aaaa.mp4/thumbnail",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer relay-token" }),
    }),
  );
});

it("keeps the recording when there is no frame to show", async () => {
  seed("aaaa", 7);
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/thumbnail")) {
      return { ok: false, status: 404 } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  const [recording] = await listBroadcastRecordings(7);

  expect(recording.thumbnail).toBeNull();
  expect(recording.durationSeconds).toBeNull();
});

it("does not fetch frames just to prove ownership", async () => {
  seed("aaaa", 7);
  const body = { stream: true } as unknown as ReadableStream<Uint8Array>;
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/thumbnail")) {
      throw new Error("ownership checks must not ask for frames");
    }
    if (String(url).endsWith("aaaa.mp4")) {
      return {
        ok: true,
        status: 200,
        body,
        headers: new Headers({ "content-length": "100" }),
      } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  await openBroadcastRecording(7, "aaaa", "aaaa.mp4");
  await issuePlaybackTicket(7, "aaaa", "aaaa.mp4");

  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.stringContaining("/thumbnail"),
    expect.anything(),
  );
});

it("deletes a recording the host owns, and nothing else", async () => {
  seed("aaaa", 7);
  const calls: string[] = [];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const address = String(url);
    calls.push(`${init?.method ?? "GET"} ${address}`);
    if (init?.method === "DELETE") {
      return { ok: true, status: 204 } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  await deleteBroadcastRecording(7, "aaaa", "aaaa.mp4");

  expect(calls).toContain("GET http://relay.test/recordings");
  expect(calls).toContain("DELETE http://relay.test/recordings/aaaa.mp4");
  expect(fetchMock).toHaveBeenCalledWith(
    "http://relay.test/recordings/aaaa.mp4",
    expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ Authorization: "Bearer relay-token" }),
    }),
  );
});

it("will not delete another host's recording, or one it never listed", async () => {
  seed("aaaa", 7);
  const deletes: string[] = [];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      deletes.push(String(url));
      return { ok: true, status: 204 } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  await expect(deleteBroadcastRecording(9, "aaaa", "aaaa.mp4")).rejects.toThrow(
    /does not exist/,
  );
  await expect(
    deleteBroadcastRecording(7, "aaaa", "bbbb.mp4"),
  ).rejects.toThrow(/does not exist/);
  await expect(
    deleteBroadcastRecording(7, "aaaa", "../aaaa.mp4"),
  ).rejects.toThrow(/does not exist/);
  expect(deletes).toEqual([]);
});

it("treats a file retention already removed as deleted", async () => {
  seed("aaaa", 7);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return { ok: false, status: 404 } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  await expect(
    deleteBroadcastRecording(7, "aaaa", "aaaa.mp4"),
  ).resolves.toBeUndefined();
});

it("keeps a show for as long as the host asks", async () => {
  seed("aaaa", 7);
  const putBodies: string[] = [];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      putBodies.push(String(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          keepHours: 168,
          keepUntil: "2026-11-23T00:00:00.000Z",
        }),
      } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  const kept = await setBroadcastRetention(7, "aaaa", "aaaa.mp4", 168);

  expect(kept).toEqual({
    keepHours: 168,
    keepUntil: "2026-11-23T00:00:00.000Z",
  });
  expect(putBodies).toEqual([JSON.stringify({ hours: 168 })]);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://relay.test/recordings/aaaa.mp4/retention",
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ Authorization: "Bearer relay-token" }),
    }),
  );
});

it("will not change retention for another host's show, or for a bad duration", async () => {
  seed("aaaa", 7);
  const puts: string[] = [];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      puts.push(String(url));
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  await expect(
    setBroadcastRetention(9, "aaaa", "aaaa.mp4", 168),
  ).rejects.toThrow(/does not exist/);
  await expect(
    setBroadcastRetention(7, "aaaa", "bbbb.mp4", 168),
  ).rejects.toThrow(/does not exist/);
  await expect(
    setBroadcastRetention(7, "aaaa", "../aaaa.mp4", 168),
  ).rejects.toThrow(/does not exist/);
  await expect(setBroadcastRetention(7, "aaaa", "aaaa.mp4", -1)).rejects.toThrow(
    /whole hours/,
  );
  await expect(
    setBroadcastRetention(7, "aaaa", "aaaa.mp4", 90 * 24 + 1),
  ).rejects.toThrow(/whole hours/);
  await expect(
    setBroadcastRetention(7, "aaaa", "aaaa.mp4", 1.5),
  ).rejects.toThrow(/whole hours/);
  expect(puts).toEqual([]);
});

it("reports a pin the relay refused instead of pretending it stuck", async () => {
  seed("aaaa", 7);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return { ok: false, status: 502 } as unknown as Response;
    }
    return relayListed([
      { name: "aaaa.mp4", bytes: 100, modifiedAt: "2026-01-01T10:00:00.000Z" },
    ]) as unknown as Response;
  });

  await expect(
    setBroadcastRetention(7, "aaaa", "aaaa.mp4", 168),
  ).rejects.toThrow(/could not update/);
});

it("lists how long each show is kept for", async () => {
  seed("aaaa", 7);
  const keepUntil = "2026-11-23T00:00:00.000Z";
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/thumbnail")) {
      return { ok: false, status: 404 } as unknown as Response;
    }
    return relayListed([
      {
        name: "aaaa.mp4",
        bytes: 100,
        modifiedAt: "2026-01-01T10:00:00.000Z",
        keepHours: 168,
        keepUntil,
      },
    ]) as unknown as Response;
  });

  const [recording] = await listBroadcastRecordings(7);

  expect(recording.keepHours).toBe(168);
  expect(recording.keepUntil).toBe(keepUntil);
});
