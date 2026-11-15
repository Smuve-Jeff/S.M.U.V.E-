import { deflateRawSync, inflateRawSync } from "zlib";
import { buildZip, crc32, type ZipEntry } from "./zip.util";
import { unzipArchive } from "./zip-read.util";

/** jsdom does not expose the platform inflate stream; Node's zlib stands in. */
const nodeInflate = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(inflateRawSync(data));

/**
 * Minimal test-side ZIP builder with a selectable method, mirroring
 * zip.util's writer so fixtures exercise the reader the way Bitwig-style
 * (deflated) and S.M.U.V.E.-style (stored) archives do in the wild.
 */
function buildTestZip(
  entries: Array<{ name: string; data: Uint8Array; method: 0 | 8 }>,
): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const stored =
      entry.method === 8 ? deflateRawSync(entry.data) : entry.data;
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.length + stored.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, entry.method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(stored, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, entry.method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const concat = (parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let pos = 0;
    for (const part of parts) {
      out.set(part, pos);
      pos += part.length;
    }
    return out;
  };
  const centralDir = concat(centralParts);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDir.length, true);
  ev.setUint32(16, offset, true);
  return concat([...localParts, centralDir, eocd]);
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("zip-read.util", () => {
  it("round-trips our own stored archives byte for byte", async () => {
    const entries: ZipEntry[] = [
      { name: "project.xml", data: text("<Project/>") },
      { name: "audio/kick.wav", data: new Uint8Array([82, 73, 70, 70]) },
    ];
    const blob = buildZip(entries);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const out = await unzipArchive(bytes);

    expect(out.map((entry) => entry.name)).toEqual([
      "project.xml",
      "audio/kick.wav",
    ]);
    expect(out[0].data).toEqual(entries[0].data);
    expect(out[1].data).toEqual(entries[1].data);
  });

  it("inflates DEFLATE entries the way Bitwig-style exporters write them", async () => {
    const xml = text("<Project version=\"1.0\">" + "x".repeat(2000) + "</Project>");
    const archive = buildTestZip([
      { name: "project.xml", data: xml, method: 8 },
      { name: "metadata.xml", data: text("<MetaData/>"), method: 8 },
      { name: "audio/break.wav", data: new Uint8Array([1, 2, 3, 4]), method: 8 },
    ]);

    const out = await unzipArchive(archive, nodeInflate);

    expect(out.map((entry) => entry.name)).toEqual([
      "project.xml",
      "metadata.xml",
      "audio/break.wav",
    ]);
    expect(out[0].data).toEqual(xml);
    expect(out[2].data).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("reads mixed-method archives and skips directory entries", async () => {
    const archive = buildTestZip([
      { name: "audio/", data: new Uint8Array(0), method: 0 },
      { name: "project.xml", data: text("<Project/>"), method: 8 },
      { name: "notes.txt", data: text("hi"), method: 0 },
    ]);

    const out = await unzipArchive(archive, nodeInflate);

    expect(out.map((entry) => entry.name)).toEqual(["project.xml", "notes.txt"]);
  });

  it("keeps UTF-8 filenames intact", async () => {
    const archive = buildTestZip([
      { name: "audio/bässe-kick.wav", data: new Uint8Array([9]), method: 8 },
    ]);

    const out = await unzipArchive(archive, nodeInflate);

    expect(out[0].name).toBe("audio/bässe-kick.wav");
  });

  it("refuses garbage, unknown methods, and truncated data", async () => {
    await expect(unzipArchive(new Uint8Array(10))).rejects.toThrow(
      /Not a ZIP archive/,
    );

    const badMethod = buildTestZip([
      { name: "x.bin", data: new Uint8Array([1]), method: 0 },
    ]);
    // Flip the central-directory method to something unsupported (12).
    new DataView(badMethod.buffer).setUint16(
      badMethod.length - 22 - (46 + 5) + 10,
      12,
      true,
    );
    await expect(unzipArchive(badMethod)).rejects.toThrow(/method 12/);

    const truncated = (await buildZip([{ name: "a", data: text("hello") }]).arrayBuffer());
    await expect(
      unzipArchive(new Uint8Array(truncated).slice(0, 20)),
    ).rejects.toThrow();
  });
});
