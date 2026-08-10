import type { Request } from "express";
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
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const userId = req.user?.userId ?? "anon";
  const fileName = `${userId}_${Date.now()}_${file.originalname}`;

  const s3Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);
  return { url: `${R2_PUBLIC_DOMAIN}/${fileName}` };
};
