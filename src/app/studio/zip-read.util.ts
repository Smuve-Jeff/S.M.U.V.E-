/**
 * Minimal dependency-free ZIP reader (STORE + DEFLATE).
 *
 * Exchange formats (`.dawproject`, …) arrive as ZIPs written by other
 * people's compressors, so unlike our own `buildZip` writer this side has
 * to inflate. DEFLATE runs through the platform `DecompressionStream`
 * (`deflate-raw` — ZIP stores raw deflate streams), which every WebView we
 * ship on implements; STORE entries pass through untouched. Anything else
 * (encryption, exotic methods, Zip64) is refused with a message instead of
 * silent garbage.
 */

export interface UnzippedEntry {
  name: string;
  data: Uint8Array;
}

/** Raw-deflate inflater. The default is the platform, which every WebView
 * we ship on implements; tests inject Node's zlib because jsdom does not
 * expose the platform stream. */
export type InflateFn = (data: Uint8Array) => Promise<Uint8Array>;

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
/** 64 KiB EOCD search window: EOCD is 22 bytes + up to 64 KiB of comment. */
const EOCD_SEARCH_WINDOW = 22 + 65535;

async function platformInflate(data: Uint8Array): Promise<Uint8Array> {
  const Engine = (globalThis as Record<string, unknown>)[
    "DecompressionStream"
  ] as
    | (new (format: string) => TransformStream<Uint8Array, Uint8Array>)
    | undefined;
  if (!Engine) {
    throw new Error(
      "This file is compressed and this browser cannot inflate it.",
    );
  }
  const stream = new Blob([data.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new Engine("deflate-raw"));
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/**
 * Extract every file entry from a ZIP archive. Directory entries are
 * skipped. Throws a descriptive error for anything it cannot read.
 */
export async function unzipArchive(
  input: Uint8Array | ArrayBuffer,
  inflate: InflateFn = platformInflate,
): Promise<UnzippedEntry[]> {
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22) throw new Error("Not a ZIP archive.");

  // End-of-central-directory: scan backwards so a trailing comment is fine.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  let eocd = -1;
  const searchFrom = Math.max(0, bytes.length - EOCD_SEARCH_WINDOW);
  for (let i = bytes.length - 22; i >= searchFrom; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("Not a ZIP archive (end of directory not found).");
  }
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (centralOffset + centralSize > bytes.length) {
    throw new Error("ZIP directory runs past the end of the file.");
  }

  const decoder = new TextDecoder("utf-8");
  const entries: UnzippedEntry[] = [];
  let pos = centralOffset;
  for (let n = 0; n < entryCount; n++) {
    if (view.getUint32(pos, true) !== CENTRAL_SIG) {
      throw new Error(`ZIP directory entry ${n} is corrupt.`);
    }
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(
      bytes.subarray(pos + 46, pos + 46 + nameLength),
    );
    pos += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue; // directory
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
      throw new Error(
        `"${name}" uses ZIP method ${method}; only stored and deflated entries are supported.`,
      );
    }
    if (localOffset + 30 > bytes.length) {
      throw new Error(`"${name}" points outside the archive.`);
    }
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) {
      throw new Error(`"${name}" has a corrupt local header.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error(`"${name}" runs past the end of the archive.`);
    }
    const raw = bytes.slice(dataStart, dataEnd);
    const data = method === METHOD_STORE ? raw : await inflate(raw);
    if (data.length !== uncompressedSize && uncompressedSize !== 0) {
      throw new Error(`"${name}" failed its size check after inflation.`);
    }
    entries.push({ name, data });
  }
  return entries;
}
