import { Readable } from "node:stream";
import { ZipFile } from "yazl";

/** One file inside a recording archive. */
export interface ArchiveEntry {
  /** The name the file appears under inside the zip. */
  name: string;
  /** When it was written, so the extracted files keep their times. */
  modifiedAt: string | Date;
  /** Opens the bytes when the archive reaches this entry. */
  open: () => Promise<Readable>;
}

export interface ZipOptions {
  /**
   * Aborted when the download goes away. Everything already opened is closed,
   * so a cancelled download stops reading from the relay instead of pulling a
   * show nobody is waiting for.
   */
  signal?: AbortSignal;
}

/**
 * A show recorded in hourly segments is several files, so downloading it as one
 * attachment means packing them. Entries are stored, not deflated: MP4 does not
 * compress, and a segment's size is only known after it has been streamed —
 * which is exactly what a zip data descriptor is for. Nothing is buffered: a
 * long show is streamed from the relay into the response as it is read.
 */
export function createZipStream(
  entries: readonly ArchiveEntry[],
  options: ZipOptions = {},
): Readable {
  return packArchive(entries, options);
}

/**
 * Open the first segment, then hand back the stream.
 *
 * The caller writes its response headers only after this resolves, so a relay
 * that cannot hand over the first hour is still a failed request with an error
 * body. Once the zip has started there are no headers left to change, so a
 * failure after this point can only break the connection.
 */
export async function openArchiveStream(
  entries: readonly ArchiveEntry[],
  options: ZipOptions = {},
): Promise<Readable> {
  const first = entries[0];
  if (!first) throw new Error("an archive needs at least one segment");
  const firstBody = await first.open();
  if (options.signal?.aborted) {
    firstBody.destroy();
    throw new Error("archive download cancelled");
  }
  return packArchive(
    [{ ...first, open: async () => firstBody }, ...entries.slice(1)],
    options,
  );
}

function packArchive(
  entries: readonly ArchiveEntry[],
  { signal }: ZipOptions,
): Readable {
  const zip = new ZipFile();
  // yazl hands back a Node stream at runtime; its types follow the Web one.
  const output = zip.outputStream as unknown as Readable;
  const bodies = new Set<Readable>();
  let cancelled = false;

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    // Each body is a relay response; destroying it cancels the read instead of
    // leaving yazl pulling the rest of the show.
    for (const body of bodies) body.destroy();
    bodies.clear();
    output.destroy();
  };
  if (signal) {
    if (signal.aborted) {
      stop();
      return output;
    }
    signal.addEventListener("abort", stop, { once: true });
    output.once("close", () => signal.removeEventListener("abort", stop));
  }

  void (async () => {
    try {
      for (const entry of entries) {
        if (cancelled) return;
        const body = await entry.open();
        if (cancelled) {
          body.destroy();
          return;
        }
        bodies.add(body);
        body.once("close", () => bodies.delete(body));
        zip.addReadStream(body, entry.name, {
          mtime: new Date(entry.modifiedAt),
          compress: false,
          mode: 0o644,
        });
      }
      if (!cancelled) zip.end();
    } catch (error) {
      if (!cancelled) output.destroy(error as Error);
    }
  })();
  return output;
}
