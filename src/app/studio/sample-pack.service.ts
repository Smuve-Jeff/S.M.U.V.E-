import { Injectable, inject, signal } from "@angular/core";
import { LocalStorageService } from "../services/local-storage.service";
import { LoggingService } from "../services/logging.service";
import { writeJsonStore } from "../services/guarded-storage";
import { reportUnreadableStore } from "../services/storage-notice";
import {
  SAMPLE_PACK_MAX_FILE_BYTES,
  SAMPLE_PACK_MAX_TOTAL_BYTES,
  packBlobId,
  validateSamplePackManifest,
  type InstalledSamplePack,
  type SamplePackManifest,
} from "./sample-pack.types";

const PACKS_KEY = "smuve_sample_packs_v1";
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg"]);

export interface PackInstallResult {
  ok: boolean;
  packId?: string;
  error?: string;
}

export interface PackExportBundle {
  manifestName: string;
  manifestBlob: Blob;
  files: Array<{ name: string; blob: Blob }>;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Magic-byte sniff: the declared audio must actually be audio. */
async function sniffAudioKind(file: File): Promise<"wav" | "mp3" | "ogg" | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return null;
  }
  if (bytes.length < 4) return null;
  const ascii = (at: number, length: number): string =>
    String.fromCharCode(...bytes.slice(at, at + length));
  if (ascii(0, 4) === "RIFF" && bytes.length >= 12 && ascii(8, 4) === "WAVE") {
    return "wav";
  }
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 3) === "ID3") return "mp3";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

/**
 * Community sample packs: a `.smuvepack.json` manifest picked together with
 * its sibling audio files. Manifests are small JSON in localStorage (the
 * community-plugin pattern); the audio bytes live in `audio_blobs` next to
 * recorded takes so a pack survives reloads and uninstalls cleanly.
 */
@Injectable({ providedIn: "root" })
export class SamplePackService {
  private readonly storage = inject(LocalStorageService);
  private readonly logger = inject(LoggingService);

  private readonly storedPacks = this.readPacks();
  private readonly packsReadable = this.storedPacks !== null;
  readonly packs = signal<InstalledSamplePack[]>(this.storedPacks ?? []);

  /** The installed packs, or null when the stored list cannot be read. */
  private readPacks(): InstalledSamplePack[] | null {
    try {
      const raw = localStorage.getItem(PACKS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        reportUnreadableStore("Your installed sample packs");
        return null;
      }
      return parsed.filter(
        (entry): entry is InstalledSamplePack =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as { id?: unknown }).id === "string" &&
          Array.isArray((entry as { samples?: unknown }).samples) &&
          Array.isArray((entry as { blobIds?: unknown }).blobIds),
              );
    } catch {
      reportUnreadableStore("Your installed sample packs");
      return null;
    }
  }

  private writePacks(packs: InstalledSamplePack[]): void {
    this.packs.set(packs);
    if (!this.packsReadable) {
      // The stored pack list could not be read; keep it for a later visit
      // instead of replacing it with this session's view.
      return;
    }
    if (!writeJsonStore("Your installed sample packs", PACKS_KEY, packs)) {
      this.logger.error("Failed to persist installed sample packs");
    }
  }

  /** Install from one manifest plus its sibling audio, picked in one dialog. */
  async installFromFiles(input: File[] | FileList): Promise<PackInstallResult> {
    const files = Array.from(input);
    if (files.length === 0) {
      return { ok: false, error: "Pick the pack manifest and its audio files." };
    }
    if ((await this.storage.persistenceStatus()) !== "ready") {
      return { ok: false, error: "Local storage is unavailable." };
    }

    const manifests = files.filter((file) =>
      file.name.toLowerCase().endsWith(".smuvepack.json"),
    );
    if (manifests.length === 0) {
      return {
        ok: false,
        error: "No pack manifest found (a .smuvepack.json file).",
      };
    }
    if (manifests.length > 1) {
      return { ok: false, error: "Pick one pack at a time." };
    }

    // arrayBuffer + TextDecoder rather than File.text(): the manifest is
    // small JSON and this path works on every WebView we ship to.
    if (manifests[0].size > 1024 * 1024) {
      return { ok: false, error: "The pack manifest is over the 1 MB limit." };
    }
    let parsed: unknown;
    try {
      const bytes = new Uint8Array(await manifests[0].arrayBuffer());
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { ok: false, error: "The pack manifest is not valid JSON." };
    }
    const validated = validateSamplePackManifest(parsed);
    if (validated.ok === false) {
      return { ok: false, error: validated.error };
    }
    const manifest: SamplePackManifest = validated.manifest;

    if (this.packs().some((pack) => pack.id === manifest.id)) {
      return {
        ok: false,
        error: `"${manifest.name}" is already installed — uninstall it first to reinstall.`,
      };
    }

    const byName = new Map(files.map((file) => [file.name, file]));
    const missing = manifest.samples.filter((s) => !byName.has(s.file));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Missing audio: ${missing.map((s) => s.file).join(", ")}.`,
      };
    }
    const extra = files.filter(
      (file) =>
        file !== manifests[0] &&
        AUDIO_EXTENSIONS.has(extensionOf(file.name)) &&
        !manifest.samples.some((s) => s.file === file.name),
    );
    if (extra.length > 0) {
      return {
        ok: false,
        error: `Not listed in the manifest: ${extra.map((f) => f.name).join(", ")}.`,
      };
    }

    let totalBytes = 0;
    for (const sample of manifest.samples) {
      const file = byName.get(sample.file)!;
      if (file.size > SAMPLE_PACK_MAX_FILE_BYTES) {
        return {
          ok: false,
          error: `"${sample.file}" is over the 16 MB per-file limit.`,
        };
      }
      totalBytes += file.size;
    }
    if (totalBytes > SAMPLE_PACK_MAX_TOTAL_BYTES) {
      return {
        ok: false,
        error: "The pack is over the 64 MB install limit.",
      };
    }
    for (const sample of manifest.samples) {
      const kind = await sniffAudioKind(byName.get(sample.file)!);
      if (!kind) {
        return {
          ok: false,
          error: `"${sample.file}" is not a WAV, MP3 or OGG file.`,
        };
      }
    }

    const written: string[] = [];
    try {
      for (const sample of manifest.samples) {
        const file = byName.get(sample.file)!;
        const id = packBlobId(manifest.id, sample.file);
        await this.storage.saveItem("audio_blobs", {
          id,
          blob: file,
          name: `${manifest.name} — ${sample.name}`,
          timestamp: Date.now(),
          settings: { gain: 1.0, trimmed: false, durationSec: 0 },
        });
        written.push(id);
      }
    } catch (error) {
      for (const id of written) {
        try {
          await this.storage.deleteItem("audio_blobs", id);
        } catch {
          /* rollback is best-effort */
        }
      }
      this.logger.error("Failed to install sample pack", error);
      return { ok: false, error: "Could not store the pack audio." };
    }

    const installed: InstalledSamplePack = {
      ...manifest,
      installedAt: Date.now(),
      blobIds: written,
      totalBytes,
    };
    this.writePacks([installed, ...this.packs()]);
    return { ok: true, packId: manifest.id };
  }

  /** Factory seed packs shipped in `assets/sample-packs` (no file dialog). */
  static readonly FACTORY_PACK_IDS = [
    "smuve-trap-kit",
    "smuve-house-kit",
    "smuve-lofi-kit",
  ] as const;

  /**
   * Install a factory pack straight from assets. The fetched files go
   * through the same validation + persist path as a manual install, so a
   * factory pack uninstalls and exports exactly like a community pack.
   */
  async installFactoryPack(packId: string): Promise<PackInstallResult> {
    if (
      !(SamplePackService.FACTORY_PACK_IDS as readonly string[]).includes(packId)
    ) {
      return { ok: false, error: "Unknown factory pack." };
    }
    if (this.packs().some((pack) => pack.id === packId)) {
      return {
        ok: false,
        error: "Already installed — uninstall it first to reinstall.",
      };
    }
    try {
      const base = `assets/sample-packs/${packId}`;
      const manifestRes = await fetch(`${base}/${packId}.smuvepack.json`);
      if (!manifestRes.ok) {
        return { ok: false, error: "The factory pack could not be downloaded." };
      }
      const manifestJson = (await manifestRes.json()) as {
        samples?: Array<{ file?: string }>;
      };
      const listed = Array.isArray(manifestJson.samples)
        ? manifestJson.samples
        : [];
      const files: File[] = [
        new File([JSON.stringify(manifestJson)], `${packId}.smuvepack.json`, {
          type: "application/json",
        }),
      ];
      for (const sample of listed) {
        if (typeof sample?.file !== "string") {
          return { ok: false, error: "The factory pack manifest is invalid." };
        }
        const audioRes = await fetch(`${base}/${sample.file}`);
        if (!audioRes.ok) {
          return { ok: false, error: `Could not download "${sample.file}".` };
        }
        files.push(new File([await audioRes.blob()], sample.file));
      }
      return this.installFromFiles(files);
    } catch (error) {
      this.logger.error("Failed to install factory sample pack", error);
      return { ok: false, error: "The factory pack could not be installed." };
    }
  }

  /** Remove the manifest and delete every stored blob of the pack. */
  async uninstall(packId: string): Promise<void> {
    const pack = this.packs().find((entry) => entry.id === packId);
    if (!pack) return;
    try {
      await this.storage.deleteItems("audio_blobs", pack.blobIds);
    } catch (error) {
      this.logger.error("Failed to delete sample pack audio", error);
    }
    this.writePacks(this.packs().filter((entry) => entry.id !== packId));
  }

  /** Raw audio for decode + preview. Null when the blob is gone. */
  async readSample(packId: string, file: string): Promise<Blob | null> {
    try {
      const record = (await this.storage.getItem(
        "audio_blobs",
        packBlobId(packId, file),
      )) as { blob?: Blob } | null;
      return record?.blob instanceof Blob ? record.blob : null;
    } catch {
      return null;
    }
  }

  /**
   * Pure export bundle: the manifest plus every stored WAV, for the caller
   * to download. Null when the pack or any of its audio is missing.
   */
  async buildExport(packId: string): Promise<PackExportBundle | null> {
    const pack = this.packs().find((entry) => entry.id === packId);
    if (!pack) return null;
    const files: Array<{ name: string; blob: Blob }> = [];
    for (const sample of pack.samples) {
      const blob = await this.readSample(packId, sample.file);
      if (!blob) return null;
      files.push({ name: sample.file, blob });
    }
    const { blobIds: _dropped, installedAt: _when, totalBytes: _bytes, ...manifest } = pack;
    return {
      manifestName: `${pack.id}.smuvepack.json`,
      manifestBlob: new Blob([JSON.stringify(manifest, null, 2)], {
        type: "application/json",
      }),
      files,
    };
  }
}
