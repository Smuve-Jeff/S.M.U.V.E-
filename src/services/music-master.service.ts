import type { Request } from "express";
import { AppError } from "@/lib";
import {
  readJsonObject,
  storageConfigured,
  uploadToStorage,
  writeJsonObject,
} from "./storage.service";

/**
 * Where the published list lives in the bucket: beside the audio it describes,
 * so the recordings and the index of them travel together and neither can be
 * restored without the other.
 */
export const MASTER_LIST_KEY = "music/smuve-jeff-masters.json";

/**
 * One recording the artist has put on the station at full length.
 *
 * This is the server's own record, not a copy of the catalogue: the catalogue is
 * Apple's and Deezer's metadata, this is the audio the artist owns the rights
 * to. The two meet by `trackId` when there is one, and by title otherwise.
 */
export interface PublishedMaster {
  /** Stable identity for this entry, so it can be replaced or removed by id. */
  id: string;
  /** Apple's track id, when the record has one. The strongest join key. */
  trackId: number | null;
  title: string;
  album: string | null;
  /** Public, CDN-backed URL of the full-length audio. */
  url: string;
  /** When it went on air. */
  publishedAt: string;
}

interface MasterList {
  masters?: PublishedMaster[];
  updatedAt?: string;
}

/**
 * Folds a title the way the radio's own matching does — case, punctuation, and
 * feature credits dropped — so the same record published from two devices is one
 * entry rather than two.
 */
const titleKey = (value: string | undefined | null): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/\((?:feat|ft|with)\.?[^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** How a master is identified: by track id when there is one, else by title. */
export const masterId = (entry: {
  trackId?: number | null;
  title?: string | null;
}): string =>
  entry.trackId != null && Number.isFinite(Number(entry.trackId))
    ? `id:${Number(entry.trackId)}`
    : `title:${titleKey(entry.title)}`;

/**
 * Validates a publish request into a list entry, or `null` when unusable.
 *
 * Pure, so the rules are directly testable: a master with no title or no audio
 * URL cannot go on air, and a track id that is not a positive number is dropped
 * rather than stored as `NaN` (which would match nothing on the client).
 */
export const normalizeMasterEntry = (
  input: { trackId?: unknown; title?: unknown; album?: unknown },
  url: string,
  publishedAt: string,
): PublishedMaster | null => {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || !url) return null;

  const trackId = Number(input.trackId);
  const album = typeof input.album === "string" ? input.album.trim() : "";

  const entry: Omit<PublishedMaster, "id"> = {
    trackId: Number.isFinite(trackId) && trackId > 0 ? trackId : null,
    title,
    album: album || null,
    url,
    publishedAt,
  };
  return { id: masterId(entry), ...entry };
};

/**
 * Replace-or-append, so re-publishing a record never lists it twice.
 *
 * A re-publish is a correction — a better master, a fixed upload — and the
 * newest upload is the one that should play. Original order is preserved, so the
 * list reads oldest-first like the catalogue does.
 */
export const mergeMasterEntry = (
  masters: readonly PublishedMaster[],
  entry: PublishedMaster,
): PublishedMaster[] => [
  ...masters.filter((existing) => existing.id !== entry.id),
  entry,
];

/** Drops one entry. Removing something absent is not an error. */
export const removeMasterEntry = (
  masters: readonly PublishedMaster[],
  id: string,
): PublishedMaster[] => masters.filter((existing) => existing.id !== id);

/**
 * Every master currently on the station.
 *
 * Never throws: an absent object, an unreadable one, or storage that is not
 * configured all mean the same thing to a listener — nothing is hosted — and the
 * station falls back to the committed manifest.
 */
export const listPublishedMasters = async (): Promise<PublishedMaster[]> => {
  const stored = await readJsonObject<MasterList>(MASTER_LIST_KEY);
  const masters = Array.isArray(stored?.masters) ? stored.masters : [];
  // Defensive: a hand-edited object must not put a row without audio on air.
  return masters.filter(
    (entry) => Boolean(entry?.id && entry?.title && entry?.url),
  );
};

/**
 * Uploads one master and puts it on air everywhere.
 *
 * The audio goes to R2 first: the list is only rewritten once the recording is
 * actually reachable, so the station can never advertise a URL that 404s.
 */
export const publishMaster = async (
  req: Request,
  file: Express.Multer.File,
  fields: { trackId?: unknown; title?: unknown; album?: unknown },
): Promise<PublishedMaster> => {
  if (!storageConfigured()) {
    throw new AppError(
      503,
      "Master hosting is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_DOMAIN to host the recordings.",
    );
  }

  const { url } = await uploadToStorage(req, file);
  const entry = normalizeMasterEntry(fields, url, new Date().toISOString());
  if (!entry) {
    throw new AppError(400, "A track title is required to publish a master.");
  }

  const masters = mergeMasterEntry(await listPublishedMasters(), entry);
  await writeJsonObject(MASTER_LIST_KEY, {
    masters,
    updatedAt: new Date().toISOString(),
  });
  return entry;
};

/** Takes one master back off the station. The uploaded audio is left in place. */
export const unpublishMaster = async (
  id: string,
): Promise<PublishedMaster[]> => {
  if (!storageConfigured()) {
    throw new AppError(503, "Master hosting is not configured.");
  }

  const masters = removeMasterEntry(await listPublishedMasters(), id);
  await writeJsonObject(MASTER_LIST_KEY, {
    masters,
    updatedAt: new Date().toISOString(),
  });
  return masters;
};
