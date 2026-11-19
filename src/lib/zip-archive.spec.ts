import { Readable } from "node:stream";
import { createZipStream, openArchiveStream } from "./zip-archive";

/** Read a stored zip's central directory and pull each entry's bytes back out. */
function readZip(buffer: Buffer): { name: string; bytes: Buffer }[] {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  const count = buffer.readUInt16LE(end + 10);
  const directoryOffset = buffer.readUInt32LE(end + 16);

  const entries: { name: string; bytes: Buffer }[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");

    expect(buffer.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localName = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localName + localExtra;
    entries.push({
      name,
      bytes: buffer.subarray(dataStart, dataStart + compressed),
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const collect = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

describe("recording archive", () => {
  it("packs every segment, in order, with its bytes intact", async () => {
    const stream = createZipStream([
      {
        name: "show-2026-01-01_10-00-00-000000.mp4",
        modifiedAt: "2026-01-01T10:00:00.000Z",
        open: async () => Readable.from(Buffer.from("first hour")),
      },
      {
        name: "show-2026-01-01_11-00-00-000000.mp4",
        modifiedAt: "2026-01-01T11:00:00.000Z",
        open: async () => Readable.from([Buffer.from("second"), Buffer.from(" hour")]),
      },
    ]);

    const entries = readZip(await collect(stream));

    expect(entries.map((entry) => entry.name)).toEqual([
      "show-2026-01-01_10-00-00-000000.mp4",
      "show-2026-01-01_11-00-00-000000.mp4",
    ]);
    expect(entries.map((entry) => entry.bytes.toString("utf8"))).toEqual([
      "first hour",
      "second hour",
    ]);
  });

  it("opens the first segment before the archive starts, so a relay failure is an error", async () => {
    const later = jest.fn(async () => Readable.from(Buffer.from("second hour")));

    await expect(
      openArchiveStream([
        {
          name: "show-2026-01-01_10-00-00-000000.mp4",
          modifiedAt: "2026-01-01T10:00:00.000Z",
          open: async () => {
            throw new Error("relay unreachable");
          },
        },
        {
          name: "show-2026-01-01_11-00-00-000000.mp4",
          modifiedAt: "2026-01-01T11:00:00.000Z",
          open: later,
        },
      ]),
    ).rejects.toThrow(/relay unreachable/);
    expect(later).not.toHaveBeenCalled();
  });

  it("stops reading the relay when the download is cancelled", async () => {
    const controller = new AbortController();
    // A relay that keeps sending: only cancelling ends it.
    const source = new Readable({
      read() {
        this.push(Buffer.alloc(4096, 1));
      },
    });
    const stream = createZipStream(
      [
        {
          name: "show-2026-01-01_10-00-00-000000.mp4",
          modifiedAt: "2026-01-01T10:00:00.000Z",
          open: async () => source,
        },
      ],
      { signal: controller.signal },
    );
    const closed = new Promise<void>((resolve) => stream.once("close", resolve));

    stream.resume();
    await new Promise<void>((resolve) => stream.once("data", () => resolve()));
    controller.abort();
    await closed;

    expect(source.destroyed).toBe(true);
  });

  it("fails the archive when a segment cannot be read, rather than writing a partial one", async () => {
    const stream = createZipStream([
      {
        name: "show-2026-01-01_10-00-00-000000.mp4",
        modifiedAt: "2026-01-01T10:00:00.000Z",
        open: async () => {
          throw new Error("relay unreachable");
        },
      },
    ]);
    stream.resume();

    await expect(collect(stream)).rejects.toThrow(/relay unreachable/);
  });
});
