import type {
  ProjectBundle,
  SerializedAudioAsset,
} from "./project-workspace.service";
import { buildZip, crc32, type ZipEntry } from "./zip.util";

/**
 * Portable project container.
 *
 * The old `.smuve` export was JSON with every audio sample written out as a
 * decimal number: a three-minute stereo take is ~63 MB of Float32 audio but
 * hundreds of megabytes of text, and mobile browsers would run out of memory
 * before the download even started. A `.smuve` file is now a ZIP containing
 * `project.json` plus one raw little-endian Float32 file per audio asset.
 * JSON bundles from older versions are still accepted on import.
 */
export const PROJECT_FORMAT_VERSION = 2;
export const PROJECT_MANIFEST_NAME = "project.json";

interface ArchiveAudioDescriptor extends Omit<SerializedAudioAsset, "channels"> {
  /** Path inside the ZIP, e.g. `audio/0000.f32`. */
  audioFile: string;
}

interface ArchiveManifest extends Omit<ProjectBundle, "audioAssets"> {
  formatVersion: number;
  audioAssets: ArchiveAudioDescriptor[];
}

/** Build the ZIP blob an artist downloads as `.smuve`. */
export function buildProjectArchive(bundle: ProjectBundle): Blob {
  const entries: ZipEntry[] = [];
  const audioAssets: ArchiveAudioDescriptor[] = [];

  (bundle.audioAssets ?? []).forEach((asset, index) => {
    const channels = Array.isArray(asset.channels) ? asset.channels : [];
    const channelCount = Math.max(1, Number(asset.channelCount) || channels.length || 1);
    const frameCount = Math.max(1, Number(asset.frameCount) || channels[0]?.length || 1);
    const audioFile = `audio/${String(index).padStart(4, "0")}.f32`;
    const bytes = new Uint8Array(frameCount * channelCount * 4);
    const view = new DataView(bytes.buffer);

    for (let channel = 0; channel < channelCount; channel++) {
      const source = channels[channel];
      for (let frame = 0; frame < frameCount; frame++) {
        const sample =
          source && frame < source.length && Number.isFinite(source[frame])
            ? source[frame]
            : 0;
        view.setFloat32((channel * frameCount + frame) * 4, sample, true);
      }
    }

    entries.push({ name: audioFile, data: bytes });
    audioAssets.push({
      id: asset.id,
      sampleRate: asset.sampleRate,
      channelCount,
      frameCount,
      duration: asset.duration,
      audioFile,
    });
  });

  const manifest: ArchiveManifest = {
    ...bundle,
    formatVersion: PROJECT_FORMAT_VERSION,
    audioAssets,
  };
  entries.unshift({
    name: PROJECT_MANIFEST_NAME,
    data: new TextEncoder().encode(JSON.stringify(manifest)),
  });

  return buildZip(entries);
}

/** True when the bytes start with a ZIP local-file header. */
export function isProjectArchive(bytes: ArrayBuffer | Uint8Array): boolean {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return (
    view.length >= 4 &&
    view[0] === 0x50 &&
    view[1] === 0x4b &&
    view[2] === 0x03 &&
    view[3] === 0x04
  );
}

/**
 * Read either container: a ZIP `.smuve` archive or a legacy JSON bundle.
 * Accepting both is what makes old exports still re-importable after the
 * format change.
 */
export async function readProjectFile(file: Blob): Promise<ProjectBundle> {
  const buffer = await file.arrayBuffer();
  if (isProjectArchive(buffer)) return readProjectArchive(buffer);
  const text = new TextDecoder()
    .decode(new Uint8Array(buffer))
    .replace(/^\uFEFF/, "");
  return JSON.parse(text) as ProjectBundle;
}

/** Parse a ZIP `.smuve` archive back into an in-memory project bundle. */
export function readProjectArchive(
  bytes: ArrayBuffer | Uint8Array,
): ProjectBundle {
  const entries = readZipEntries(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  );
  const manifestBytes = entries.get(PROJECT_MANIFEST_NAME);
  if (!manifestBytes) {
    throw new Error("Project archive is missing project.json.");
  }

  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(
      new TextDecoder().decode(manifestBytes),
    ) as ArchiveManifest;
  } catch {
    throw new Error("Project archive manifest is not valid JSON.");
  }
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Project archive manifest is invalid.");
  }

  const audioAssets: SerializedAudioAsset[] = (manifest.audioAssets ?? []).map(
    (descriptor) => {
      const channelCount = Math.max(
        1,
        Math.min(32, Number(descriptor.channelCount) || 1),
      );
      const frameCount = Math.max(1, Number(descriptor.frameCount) || 1);
      const path =
        typeof descriptor.audioFile === "string"
          ? descriptor.audioFile
          : "";
      const data = path ? entries.get(path) : undefined;
      if (!data) {
        throw new Error(`Project archive is missing audio asset ${descriptor.id}.`);
      }
      const expected = frameCount * channelCount * 4;
      if (data.byteLength !== expected) {
        throw new Error(
          `Project audio asset ${descriptor.id} has the wrong length.`,
        );
      }
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const channels = Array.from({ length: channelCount }, (_, channel) => {
        const out = new Float32Array(frameCount);
        const base = channel * frameCount;
        for (let frame = 0; frame < frameCount; frame++) {
          out[frame] = view.getFloat32((base + frame) * 4, true);
        }
        return out;
      });
      return {
        id: descriptor.id,
        sampleRate: descriptor.sampleRate,
        channelCount,
        frameCount,
        duration: descriptor.duration,
        channels,
      };
    },
  );

  return {
    ...manifest,
    audioAssets,
  } as ProjectBundle;
}

/** Minimal ZIP reader for archives this app writes (STORE entries). */
function readZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error("Project archive is not a valid ZIP.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (centralOffset >= bytes.length) {
    throw new Error("Project archive has an invalid central directory.");
  }

  const entries = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Project archive has a corrupt central directory.");
    }
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);

    if (localOffset + 30 > bytes.length) {
      throw new Error("Project archive has a corrupt file entry.");
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error("Project archive audio data is truncated.");
    }
    if (method !== 0) {
      throw new Error(
        "This ZIP is compressed. Export a .smuve archive from the Studio and import that.",
      );
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== expectedCrc) {
      throw new Error(
        `Project archive entry ${name} failed its checksum — the file is corrupt or truncated.`,
      );
    }
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}
