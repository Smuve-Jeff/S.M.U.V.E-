import { Router } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppDataSource } from '@/database/data-source';
import { CloudProjectSnapshot } from '@/entities/CloudProjectSnapshot';
import { authenticate } from '@/middleware/auth';
import {
  abortCloudMultipartUpload,
  completeCloudMultipartUpload,
  createCloudMultipartUpload,
  readJsonObject,
  storageConfigured,
  uploadCloudPart,
  writeJsonObject,
} from '@/services/storage.service';
import type {
  ConflictRecord,
  ProjectManifest,
  RemoteSnapshot,
  SyncEnvelope,
} from '@/app/types/cloud-sync.types';

const router = Router();
router.use(authenticate);

const repo = () => AppDataSource.getRepository(CloudProjectSnapshot);

/** Bodies below this stay inline in Postgres; larger bodies go to R2. */
const INLINE_MAX_BYTES = 512 * 1024;
/** S3 multipart parts must be at least 5 MiB except the final part. */
const PART_SIZE = 5 * 1024 * 1024;

function safeSegment(value: unknown): string {
  const clean = String(value ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return clean || 'project';
}

function keyFor(userId: string, manifest: ProjectManifest): string {
  return [
    'cloud-projects',
    safeSegment(userId),
    safeSegment(manifest.projectId),
    safeSegment(manifest.authorDeviceId),
    `v${Math.max(1, Math.floor(manifest.version))}.json`,
  ].join('/');
}

function keyBelongsToUser(userId: string, key: string): boolean {
  return key.startsWith(`cloud-projects/${safeSegment(userId)}/`);
}

function validManifest(value: unknown): value is ProjectManifest {
  const manifest = value as Partial<ProjectManifest> | undefined;
  return (
    !!manifest &&
    typeof manifest.projectId === 'string' &&
    manifest.projectId.length > 0 &&
    manifest.projectId.length <= 200 &&
    typeof manifest.version === 'number' &&
    Number.isFinite(manifest.version) &&
    manifest.version >= 1 &&
    typeof manifest.authorDeviceId === 'string' &&
    manifest.authorDeviceId.length > 0 &&
    typeof manifest.title === 'string'
  );
}

function validEnvelope(body: Partial<SyncEnvelope> | undefined): body is SyncEnvelope {
  return !!body && typeof body.payload !== 'undefined' && validManifest(body.manifest);
}

async function toRemote(row: CloudProjectSnapshot): Promise<RemoteSnapshot> {
  const data = row.storageKey
    ? await readJsonObject<unknown>(row.storageKey)
    : row.data;
  return {
    projectId: row.projectId,
    deviceId: row.deviceId,
    deviceName: row.deviceName ?? undefined,
    version: row.version,
    data: data ?? null,
    timestamp: row.timestamp,
    title: row.title,
    byteSize: row.byteSize,
  };
}

async function latestFor(userId: string, projectId: string) {
  return repo().findOne({
    where: { userId, projectId },
    order: { version: 'DESC', timestamp: 'DESC' },
  });
}

async function conflictFrom(
  latest: CloudProjectSnapshot,
  localVersion: number,
): Promise<ConflictRecord> {
  return {
    projectId: latest.projectId,
    localVersion,
    remoteVersion: latest.version,
    remoteDeviceId: latest.deviceId,
    remoteDeviceName: latest.deviceName ?? latest.deviceId,
    remoteSnapshot: await toRemote(latest),
    detectedAt: Date.now(),
  };
}

async function saveSnapshot(
  userId: string,
  manifest: ProjectManifest,
  data: unknown | null,
  storageKey: string | null,
): Promise<CloudProjectSnapshot> {
  const row = repo().create({
    userId,
    projectId: manifest.projectId,
    deviceId: manifest.authorDeviceId,
    deviceName: manifest.deviceName ?? null,
    version: manifest.version,
    title: manifest.title || 'Untitled Project',
    data,
    storageKey,
    byteSize: Math.max(0, Math.floor(Number(manifest.byteSize) || 0)),
    timestamp: Date.now(),
  });

  try {
    await repo().save(row);
    return row;
  } catch (error) {
    // A retry of an already accepted device/version is idempotent.
    if (error instanceof QueryFailedError) {
      const existing = await repo().findOne({
        where: {
          userId,
          projectId: manifest.projectId,
          deviceId: manifest.authorDeviceId,
          version: manifest.version,
        },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

/** Persist a body inline or as a private object, keeping the DB row small. */
async function storePayload(
  userId: string,
  manifest: ProjectManifest,
  payload: unknown,
): Promise<{ data: unknown | null; storageKey: string | null }> {
  const encoded = JSON.stringify(payload ?? null);
  if (!storageConfigured() || encoded.length <= INLINE_MAX_BYTES) {
    return { data: payload, storageKey: null };
  }
  const key = keyFor(userId, manifest);
  await writeJsonObject(key, payload);
  return { data: null, storageKey: key };
}

// POST /api/cloud/push — store a version or return the winning remote version.
router.post('/push', async (req, res, next) => {
  try {
    if (!validEnvelope(req.body)) {
      res.status(422).json({ error: 'Invalid cloud sync envelope.' });
      return;
    }
    const userId = String(req.user!.userId);
    const envelope = req.body;
    const manifest = envelope.manifest;
    const latest = await latestFor(userId, manifest.projectId);

    if (latest && latest.version > manifest.version) {
      res.json({ success: false, conflict: await conflictFrom(latest, manifest.version) });
      return;
    }

    const stored = await storePayload(userId, manifest, envelope.payload);
    const row = await saveSnapshot(userId, manifest, stored.data, stored.storageKey);
    res.json({ success: true, snapshot: await toRemote(row) });
  } catch (error) {
    next(error);
  }
});

// POST /api/cloud/uploads — begin a resumable multipart snapshot upload.
router.post('/uploads', async (req, res, next) => {
  try {
    const manifest = req.body?.manifest;
    if (!validManifest(manifest)) {
      res.status(422).json({ error: 'Invalid project manifest.' });
      return;
    }
    if (!storageConfigured()) {
      res.status(503).json({ error: 'Project object storage is not configured.' });
      return;
    }
    const userId = String(req.user!.userId);
    const latest = await latestFor(userId, manifest.projectId);
    if (latest && latest.version > manifest.version) {
      res.json({ success: false, conflict: await conflictFrom(latest, manifest.version) });
      return;
    }
    const key = keyFor(userId, manifest);
    const uploadId = await createCloudMultipartUpload(key);
    res.json({ uploadId, key, partSize: PART_SIZE });
  } catch (error) {
    next(error);
  }
});

// PUT /api/cloud/uploads/:uploadId/parts/:partNumber?key=... — one chunk.
router.put('/uploads/:uploadId/parts/:partNumber', async (req, res, next) => {
  try {
    const userId = String(req.user!.userId);
    const key = String(req.query.key ?? '');
    const uploadId = String(req.params.uploadId ?? '');
    const partNumber = Number(req.params.partNumber);
    if (!keyBelongsToUser(userId, key) || !uploadId) {
      res.status(403).json({ error: 'Upload does not belong to this account.' });
      return;
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      res.status(400).json({ error: 'Invalid upload part number.' });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'Upload part body is empty.' });
      return;
    }
    const etag = await uploadCloudPart(key, uploadId, partNumber, req.body);
    res.json({ etag });
  } catch (error) {
    next(error);
  }
});

// POST /api/cloud/uploads/:uploadId/complete — finish and publish the snapshot.
router.post('/uploads/:uploadId/complete', async (req, res, next) => {
  try {
    const userId = String(req.user!.userId);
    const uploadId = String(req.params.uploadId ?? '');
    const key = String(req.body?.key ?? '');
    const manifest = req.body?.manifest;
    const parts = req.body?.parts;
    if (!keyBelongsToUser(userId, key) || !uploadId) {
      res.status(403).json({ error: 'Upload does not belong to this account.' });
      return;
    }
    if (!validManifest(manifest)) {
      res.status(422).json({ error: 'Invalid project manifest.' });
      return;
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      res.status(422).json({ error: 'Upload parts are required.' });
      return;
    }
    const normalizedParts = parts
      .map((part: any) => ({
        partNumber: Number(part?.partNumber),
        etag: String(part?.etag ?? ''),
      }))
      .filter(
        (part) =>
          Number.isInteger(part.partNumber) &&
          part.partNumber >= 1 &&
          part.partNumber <= 10000 &&
          part.etag.length > 0,
      );
    if (normalizedParts.length !== parts.length) {
      res.status(422).json({ error: 'One or more upload parts are invalid.' });
      return;
    }

    const latest = await latestFor(userId, manifest.projectId);
    if (latest && latest.version > manifest.version) {
      await abortCloudMultipartUpload(key, uploadId).catch(() => undefined);
      res.json({ success: false, conflict: await conflictFrom(latest, manifest.version) });
      return;
    }

    await completeCloudMultipartUpload(key, uploadId, normalizedParts);
    const row = await saveSnapshot(userId, manifest, null, key);
    res.json({ success: true, snapshot: await toRemote(row) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/cloud/uploads/:uploadId?key=... — abandon an interrupted upload.
router.delete('/uploads/:uploadId', async (req, res, next) => {
  try {
    const userId = String(req.user!.userId);
    const key = String(req.query.key ?? '');
    if (!keyBelongsToUser(userId, key)) {
      res.status(403).json({ error: 'Upload does not belong to this account.' });
      return;
    }
    await abortCloudMultipartUpload(key, String(req.params.uploadId ?? ''));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/cloud/projects — latest snapshot per project for this account.
router.get('/projects', async (req, res, next) => {
  try {
    const userId = String(req.user!.userId);
    const rows = await repo().find({
      where: { userId },
      order: { timestamp: 'DESC', version: 'DESC' },
    });
    const latest = new Map<string, CloudProjectSnapshot>();
    for (const row of rows) {
      if (!latest.has(row.projectId)) latest.set(row.projectId, row);
    }
    res.json(await Promise.all(Array.from(latest.values()).map(toRemote)));
  } catch (error) {
    next(error);
  }
});

// GET /api/cloud/projects/:projectId/latest
router.get('/projects/:projectId/latest', async (req, res, next) => {
  try {
    const row = await latestFor(
      String(req.user!.userId),
      String(req.params.projectId),
    );
    res.json(row ? await toRemote(row) : null);
  } catch (error) {
    next(error);
  }
});

// GET /api/cloud/projects/:projectId/snapshots — version history.
router.get('/projects/:projectId/snapshots', async (req, res, next) => {
  try {
    const rows = await repo().find({
      where: {
        userId: String(req.user!.userId),
        projectId: String(req.params.projectId),
      },
      order: { timestamp: 'DESC', version: 'DESC' },
      take: 100,
    });
    res.json(await Promise.all(rows.map(toRemote)));
  } catch (error) {
    next(error);
  }
});

export default router;
