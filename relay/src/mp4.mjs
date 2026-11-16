import { open } from "node:fs/promises";

/**
 * Duration without a media probe.
 *
 * MediaMTX finalises each recording with a `moov/mvhd` box carrying the real
 * duration (checked against ffmpeg on a real recording), and `moov` sits at the
 * front of the file. Reading a couple of kilobytes of the header is enough, so
 * listing a host's recordings never spawns ffmpeg.
 */

/** How much of the file is read to find `moov`. */
const MAX_HEAD_BYTES = 2 * 1024 * 1024;

/** `mvhd` duration inside a `moov` payload, or null when it is not usable. */
function mvhdDuration(buffer, start, length) {
  const end = Math.min(start + length, buffer.length);
  let offset = start;
  while (offset + 8 <= end) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (size < 8 || offset + size > end) return null;
    if (type === "mvhd") {
      const version = buffer.readUInt8(offset + 8);
      // Payload after version+flags: creation, modification, timescale, duration.
      const base = offset + 12;
      if (version === 1) {
        if (base + 28 > end) return null;
        const timescale = buffer.readUInt32BE(base + 16);
        const duration = Number(buffer.readBigUInt64BE(base + 20));
        return timescale > 0 && duration > 0 ? duration / timescale : null;
      }
      if (base + 16 > end) return null;
      const timescale = buffer.readUInt32BE(base + 8);
      const duration = buffer.readUInt32BE(base + 12);
      return timescale > 0 && duration > 0 ? duration / timescale : null;
    }
    offset += size;
  }
  return null;
}

/** Seconds of media in `file`, or null when the header cannot answer. */
export async function readMp4DurationSeconds(file) {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const { size: fileSize } = await handle.stat();
    const head = Math.min(fileSize, MAX_HEAD_BYTES);
    if (head < 16) return null;
    const buffer = Buffer.alloc(head);
    await handle.read(buffer, 0, head, 0);

    let offset = 0;
    while (offset + 8 <= head) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.toString("latin1", offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > head) return null;
        size = Number(buffer.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) {
        // A box with size 0 runs to the end of the file.
        size = fileSize - offset;
      }
      if (size < header) return null;
      if (type === "moov") {
        // The whole box has to be in the header we read.
        if (offset + size > head) return null;
        return mvhdDuration(buffer, offset + header, size - header);
      }
      offset += size;
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}
