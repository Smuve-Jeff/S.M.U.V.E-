/**
 * Community sample-pack format (`.smuvepack.json` + sibling audio files).
 *
 * A pack is installed from a manifest picked together with its audio in one
 * file dialog — no archive dependency, no server round-trip. The manifest is
 * small JSON (persisted with the installed-pack list); the audio bytes live
 * in the `audio_blobs` IndexedDB store next to recorded takes.
 */

/** Manifest version tag every pack file must carry. */
export const SAMPLE_PACK_FORMAT = "smuve-pack";

/** Install-time budget: packs are phone-sized by design. */
export const SAMPLE_PACK_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const SAMPLE_PACK_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const SAMPLE_PACK_MAX_SAMPLES = 128;

/** One audio file inside a pack. */
export interface SamplePackSample {
  /** Exact sibling filename, e.g. `kick.wav`. No paths. */
  file: string;
  /** Display name in the library grid. */
  name: string;
  /** Library category (`drum`, `bass`, `keys`, `lead`, `pad`, `vox`, `vfx`, `loop`, …). */
  category: string;
  tags?: string[];
}

/** The validated manifest as written to `pack.smuvepack.json`. */
export interface SamplePackManifest {
  format: typeof SAMPLE_PACK_FORMAT;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  genre?: string;
  samples: SamplePackSample[];
}

/** Manifest plus install bookkeeping, as persisted in localStorage. */
export interface InstalledSamplePack extends SamplePackManifest {
  installedAt: number;
  /** `audio_blobs` ids holding this pack's audio, for uninstall cleanup. */
  blobIds: string[];
  totalBytes: number;
}

const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-_]{1,63}$/;
const BASENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.\-()]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

/**
 * Validate a parsed manifest. Returns the manifest typed on success, or a
 * human-readable reason the install is refused. Never throws.
 */
export function validateSamplePackManifest(data: unknown):
  | { ok: true; manifest: SamplePackManifest }
  | { ok: false; error: string } {
  if (!isRecord(data)) return { ok: false, error: "The pack manifest is not a JSON object." };
  if (data["format"] !== SAMPLE_PACK_FORMAT) {
    return {
      ok: false,
      error: `Not a sample pack (expected format "${SAMPLE_PACK_FORMAT}").`,
    };
  }
  if (typeof data["id"] !== "string" || !PACK_ID_PATTERN.test(data["id"])) {
    return {
      ok: false,
      error:
        "The pack id must be 2–64 lowercase letters, digits, dashes or underscores.",
    };
  }
  if (!isNonEmptyString(data["name"], 80)) {
    return { ok: false, error: "The pack needs a name (up to 80 characters)." };
  }
  if (!isNonEmptyString(data["version"], 24)) {
    return { ok: false, error: "The pack needs a version string (up to 24 characters)." };
  }
  if (!isNonEmptyString(data["author"], 80)) {
    return { ok: false, error: "The pack needs an author (up to 80 characters)." };
  }
  if (typeof data["description"] !== "string" || data["description"].length > 500) {
    return {
      ok: false,
      error: "The pack needs a description (up to 500 characters).",
    };
  }
  if (data["genre"] !== undefined && !isNonEmptyString(data["genre"], 24)) {
    return { ok: false, error: "The pack genre must be a short string when present." };
  }
  if (!Array.isArray(data["samples"]) || data["samples"].length === 0) {
    return { ok: false, error: "The pack lists no samples." };
  }
  if (data["samples"].length > SAMPLE_PACK_MAX_SAMPLES) {
    return {
      ok: false,
      error: `The pack lists more than ${SAMPLE_PACK_MAX_SAMPLES} samples.`,
    };
  }
  const seenFiles = new Set<string>();
  const samples: SamplePackSample[] = [];
  for (let index = 0; index < data["samples"].length; index++) {
    const entry = data["samples"][index];
    if (!isRecord(entry)) {
      return { ok: false, error: `Sample ${index + 1} is not an object.` };
    }
    if (typeof entry["file"] !== "string" || !BASENAME_PATTERN.test(entry["file"])) {
      return {
        ok: false,
        error: `Sample ${index + 1} has no plain filename (no folders, no "..").`,
      };
    }
    if (seenFiles.has(entry["file"])) {
      return {
        ok: false,
        error: `The pack lists "${entry["file"]}" twice.`,
      };
    }
    seenFiles.add(entry["file"]);
    if (!isNonEmptyString(entry["name"], 80)) {
      return {
        ok: false,
        error: `Sample "${entry["file"]}" needs a display name.`,
      };
    }
    if (!isNonEmptyString(entry["category"], 24)) {
      return {
        ok: false,
        error: `Sample "${entry["file"]}" needs a category.`,
      };
    }
    if (
      entry["tags"] !== undefined &&
      (!Array.isArray(entry["tags"]) ||
        entry["tags"].some(
          (tag: unknown) => typeof tag !== "string" || tag.length > 32,
        ))
    ) {
      return {
        ok: false,
        error: `Sample "${entry["file"]}" has invalid tags.`,
      };
    }
    samples.push({
      file: entry["file"],
      name: (entry["name"] as string).trim(),
      category: (entry["category"] as string).trim(),
      tags: Array.isArray(entry["tags"])
        ? (entry["tags"] as string[]).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
        : [],
    });
  }
  return {
    ok: true,
    manifest: {
      format: SAMPLE_PACK_FORMAT,
      id: data["id"] as string,
      name: (data["name"] as string).trim(),
      version: (data["version"] as string).trim(),
      author: (data["author"] as string).trim(),
      description: (data["description"] as string).trim(),
      genre:
        typeof data["genre"] === "string" ? data["genre"].trim() : undefined,
      samples,
    },
  };
}

/** `audio_blobs` id for one pack sample. */
export function packBlobId(packId: string, file: string): string {
  return `pack:${packId}/${file}`;
}
