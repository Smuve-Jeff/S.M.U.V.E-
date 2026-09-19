import type { Request } from "express";
import type { S3Client } from "@aws-sdk/client-s3";
import { AppError } from "@/lib";

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN;

const r2Configured = (): boolean =>
  Boolean(
    R2_ENDPOINT &&
      R2_ACCESS_KEY_ID &&
      R2_SECRET_ACCESS_KEY &&
      R2_BUCKET_NAME &&
      R2_PUBLIC_DOMAIN,
  );

/** Whether object storage is usable, so callers can report it rather than throw. */
export const storageConfigured = (): boolean => r2Configured();

/**
 * The S3 client, built on demand.
 *
 * Built here rather than per call so the audio upload and the manifest beside it
 * share one connection pool, and the credential handling lives in a single
 * place.
 */
const s3Client = async (): Promise<S3Client> => {
  // Lazy require so the API boots without @aws-sdk/client-s3 installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { S3Client: Client } = await import("@aws-sdk/client-s3");
  return new Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
};

/**
 * Upload a buffer to Cloudflare R2 (S3-compatible) and return the public URL.
 * When R2 env vars are not configured this throws a 503 so callers can show
 * storage-unavailable messaging instead of crashing.
 */
export const uploadToStorage = async (
  req: Request,
  file: Express.Multer.File,
): Promise<{ url: string }> => {
  if (!r2Configured()) {
    throw new AppError(503, "Upload storage is not configured");
  }

  // Lazy require so the API boots without @aws-sdk/client-s3 installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");

  const userId = req.user?.userId ?? "anon";
  // Sanitize the client-supplied name: strip path separators and whitespace
  // so the value can only ever be a single flat object key in the bucket.
  const safeName = file.originalname.replace(/[\\/]/g, "_").replace(/\s+/g, "_");
  const fileName = `${userId}_${Date.now()}_${safeName}`;

  const client = await s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );

  return { url: `${R2_PUBLIC_DOMAIN}/${fileName}` };
};

/**
 * Read a JSON object from the bucket.
 *
 * `null` for every failure — absent, unreadable, or storage not configured — so
 * a caller that treats the object as optional state never has to branch on why.
 */
export const readJsonObject = async <T>(key: string): Promise<T | null> => {
  if (!r2Configured()) return null;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  try {
    const client = await s3Client();
    const result = await client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
    );
    const body = await result.Body?.transformToString();
    return body ? (JSON.parse(body) as T) : null;
  } catch {
    return null;
  }
};

/**
 * Write a JSON object to the bucket, replacing whatever was there.
 *
 * Throws 503 when storage is not configured: unlike a read, a write that
 * silently does nothing would report a publish that never happened.
 */
export const writeJsonObject = async (
  key: string,
  value: unknown,
): Promise<void> => {
  if (!r2Configured()) {
    throw new AppError(503, "Upload storage is not configured");
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = await s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
    }),
  );
};
