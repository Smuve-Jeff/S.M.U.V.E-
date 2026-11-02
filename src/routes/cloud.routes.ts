import { Router } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppDataSource } from '@/database/data-source';
import { CloudProjectSnapshot } from '@/entities/CloudProjectSnapshot';
import { authenticate } from '@/middleware/auth';
import type {
  ConflictRecord,
  ProjectManifest,
  RemoteSnapshot,
  SyncEnvelope,
} from '@/app/types/cloud-sync.types';

const router = Router();
router.use(authenticate);

const repo = () => AppDataSource.getRepository(CloudProjectSnapshot);

function toRemote(row: CloudProjectSnapshot): RemoteSnapshot {
  return {
    projectId: row.projectId,
    deviceId: row.deviceId,
    deviceName: row.deviceName ?? undefined,
    version: row.version,
    data: row.data,
    timestamp: row.timestamp,
    title: row.title,
    byteSize: row.byteSize,
  };
}

function validEnvelope(body: Partial<SyncEnvelope> | undefined): body is SyncEnvelope {
  const manifest = body?.manifest as Partial<ProjectManifest> | undefined;
  return (
    !!body &&
    typeof body.payload !== 'undefined' &&
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

async function latestFor(userId: string, projectId: string) {
  return repo().findOne({
    where: { userId, projectId },
    order: { version: 'DESC', timestamp: 'DESC' },
  });
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
      const conflict: ConflictRecord = {
        projectId: manifest.projectId,
        localVersion: manifest.version,
        remoteVersion: latest.version,
        remoteDeviceId: latest.deviceId,
        remoteDeviceName: latest.deviceName ?? latest.deviceId,
        remoteSnapshot: toRemote(latest),
        detectedAt: Date.now(),
      };
      res.json({ success: false, conflict });
      return;
    }

    const row = repo().create({
      userId,
      projectId: manifest.projectId,
      deviceId: manifest.authorDeviceId,
      deviceName: manifest.deviceName ?? null,
      version: manifest.version,
      title: manifest.title || 'Untitled Project',
      data: envelope.payload,
      byteSize: Math.max(0, Math.floor(Number(manifest.byteSize) || 0)),
      timestamp: Date.now(),
    });

    try {
      await repo().save(row);
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
        if (existing) {
          res.json({ success: true, snapshot: toRemote(existing) });
          return;
        }
      }
      throw error;
    }

    res.json({ success: true, snapshot: toRemote(row) });
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
    res.json(Array.from(latest.values()).map(toRemote));
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
    res.json(row ? toRemote(row) : null);
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
    res.json(rows.map(toRemote));
  } catch (error) {
    next(error);
  }
});

export default router;
