import { TestBed } from '@angular/core/testing';
import {
  MAX_VERSIONS_PER_DEVICE,
  MockCloudServer,
} from './mock-cloud-server';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import type { RemoteSnapshot, SyncEnvelope } from '../types/cloud-sync.types';

function envelope(
  version: number,
  overrides: Partial<SyncEnvelope['manifest']> = {},
): SyncEnvelope {
  return {
    manifest: {
      projectId: 'proj_1',
      version,
      lastModified: version,
      authorDeviceId: 'dev_a',
      deviceName: 'QA Phone',
      title: 'Version Test',
      byteSize: 12,
      ...overrides,
    },
    payload: { version },
  };
}

describe('MockCloudServer version history', () => {
  let server: MockCloudServer;
  const storageMock = {
    getItem: jest.fn().mockResolvedValue(null),
    saveItem: jest.fn().mockResolvedValue(undefined),
  };
  const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    storageMock.getItem.mockClear().mockResolvedValue(null);
    storageMock.saveItem.mockClear().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        MockCloudServer,
        { provide: LocalStorageService, useValue: storageMock },
        { provide: LoggingService, useValue: loggerMock },
      ],
    });
    server = TestBed.inject(MockCloudServer);
    // Latency is exercised in the app, not in unit assertions.
    jest
      .spyOn(server as unknown as { simulateLatency: () => Promise<void> }, 'simulateLatency')
      .mockResolvedValue(undefined);
  });

  it('stores device names and returns history newest-first', async () => {
    await server.push(envelope(1));
    await server.push(envelope(2));

    const snapshots = server.listSnapshots('proj_1');
    expect(snapshots.map((s) => s.version)).toEqual([2, 1]);
    expect(snapshots[0].deviceName).toBe('QA Phone');
    expect(server.listProjects()[0].version).toBe(2);
    // Latest snapshot is what pull returns.
    expect((await server.pull('proj_1'))?.version).toBe(2);
  });

  it('reports a conflict when an older version is pushed', async () => {
    await server.push(envelope(3));
    const result = await server.push(envelope(2, { authorDeviceId: 'dev_b' }));
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.conflict.remoteVersion).toBe(3);
      expect(result.conflict.remoteDeviceName).toBe('QA Phone');
    }
  });

  it(`caps each device at ${MAX_VERSIONS_PER_DEVICE} versions, keeping the newest`, async () => {
    for (let version = 1; version <= MAX_VERSIONS_PER_DEVICE + 5; version++) {
      await server.push(envelope(version));
    }
    const snapshots = server.listSnapshots('proj_1');
    expect(snapshots).toHaveLength(MAX_VERSIONS_PER_DEVICE);
    expect(snapshots[0].version).toBe(MAX_VERSIONS_PER_DEVICE + 5);
    expect(snapshots[snapshots.length - 1].version).toBe(6);
  });

  it('prunes the global cap while keeping the latest per project', async () => {
    for (let device = 0; device < 7; device++) {
      for (let version = 1; version <= MAX_VERSIONS_PER_DEVICE; version++) {
        await server.push(
          envelope(version, {
            projectId: `proj_${device}`,
            authorDeviceId: `dev_${device}`,
          }),
        );
      }
    }
    const total = Array.from({ length: 7 }).reduce(
      (sum, _v, index) => sum + server.listSnapshots(`proj_${index}`).length,
      0,
    );
    expect(total).toBeLessThanOrEqual(120);
    // Every project still has its newest version available for restore.
    for (let device = 0; device < 7; device++) {
      expect(server.listProjects().some((s) => s.projectId === `proj_${device}`)).toBe(
        true,
      );
    }
  });

  it('hydrates persisted history on the first network call', async () => {
    const persisted: RemoteSnapshot[] = [
      {
        projectId: 'proj_old',
        deviceId: 'dev_z',
        deviceName: 'Old Phone',
        version: 4,
        data: { hello: true },
        timestamp: 1000,
        title: 'Persisted',
        byteSize: 10,
      },
    ];
    // No call has happened yet, so the in-memory maps are still empty.
    expect(server.listSnapshots('proj_old')).toHaveLength(0);
    storageMock.getItem.mockResolvedValueOnce({ value: { snapshots: persisted } });

    await server.push(envelope(1, { projectId: 'proj_trigger' }));

    const restored = server.listSnapshots('proj_old');
    expect(restored).toHaveLength(1);
    expect(restored[0].deviceName).toBe('Old Phone');
    // Hydration ran once — later calls don't re-read storage.
    expect(storageMock.getItem).toHaveBeenCalledTimes(1);
  });
});
