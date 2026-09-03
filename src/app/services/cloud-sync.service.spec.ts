import { TestBed } from '@angular/core/testing';
import { CloudSyncService } from './cloud-sync.service';
import { MockCloudServer } from './mock-cloud-server';
import { OfflineSyncService } from './offline-sync.service';
import { LocalStorageService } from './local-storage.service';

class StubOfflineSync {
  queueOperation = jest.fn().mockResolvedValue('qid');
  networkStatus = jest.fn(() => 'online' as 'online' | 'offline');
  pendingCount = jest.fn(() => 0);
  deadLetterCount = jest.fn(() => 0);
  lastSyncAttempt = jest.fn(() => null);
  localSaveEnabled = jest.fn(() => true);
  lastLocalSaveAt = jest.fn(() => null);
  isSyncing = jest.fn(() => false);
}

class StubStorage {
  private store = new Map<string, unknown>();
  async getItem(_namespace: string, key: string) {
    return this.store.get(`${_namespace}:${key}`) ?? null;
  }
  async saveItem(namespace: string, key: string, value: unknown) {
    this.store.set(`${namespace}:${key}`, value);
  }
  async deleteItem(_namespace: string, _key: string) {
    return;
  }
  async getAllItems(_namespace: string) {
    const out: unknown[] = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${_namespace}:`)) out.push(v);
    }
    return out;
  }
}

describe('CloudSyncService (D1)', () => {
  let sut: CloudSyncService;
  let cloud: MockCloudServer;
  let offline: StubOfflineSync;

  beforeEach(() => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => true,
      });
    }
    TestBed.configureTestingModule({
      providers: [
        CloudSyncService,
        MockCloudServer,
        { provide: OfflineSyncService, useClass: StubOfflineSync },
        { provide: LocalStorageService, useClass: StubStorage },
      ],
    });
    sut = TestBed.inject(CloudSyncService);
    cloud = TestBed.inject(MockCloudServer);
    offline = TestBed.inject(OfflineSyncService) as unknown as StubOfflineSync;
    cloud.__seed([]);
  });

  it('mints a stable device id and defaults the device name', () => {
    expect(sut.deviceId()).toMatch(/^dev_/);
    expect(sut.deviceName().length).toBeGreaterThan(0);
    expect(sut.isCloudReachable()).toBe(true);
  });

  it('pushes a manifest on first write and bumps version', async () => {
    const s1 = await sut.push('p1', 'Demo Project', { bar: 1 });
    expect(s1).toBe('success');
    expect(sut.localManifests()['p1'].version).toBe(1);
    expect(sut.lastSyncedAt()).not.toBeNull();

    const s2 = await sut.push('p1', 'Demo Project', { bar: 2 });
    expect(s2).toBe('success');
    expect(sut.localManifests()['p1'].version).toBe(2);
  });

  it('detects a competing edit and surfaces a conflict, not a silent overwrite', async () => {
    await sut.push('p2', 'Race', { a: 1 });

    // Simulate a competing edit from another device by injecting a
    // newer remote snapshot directly into the mock cloud.
    (cloud as any).latestByProject.set('p2', {
      projectId: 'p2',
      deviceId: 'dev_other',
      version: 5,
      data: { a: 99 },
      timestamp: Date.now(),
      title: 'Race',
      byteSize: 6,
    });

    const status = await sut.push('p2', 'Race', { a: 2 });
    expect(status).toBe('conflict');
    expect(sut.conflictCount()).toBe(1);
    const rec = sut.conflictMap()['p2'];
    expect(rec.remoteVersion).toBe(5);
    // The conflicting push bumped the local manifest from 1 to the
    // attempted-version (2) before sending; the conflict record
    // captures that attempted-version, not the previous baseline.
    expect(rec.localVersion).toBe(2);
    expect(rec.remoteDeviceId).toBe('dev_other');
  });

  it('queues through offline-sync when cloud is unreachable', async () => {
    sut.simulatedNetworkOnline.set(false);
    expect(sut.isCloudReachable()).toBe(false);
    const status = await sut.push('p3', 'Offline', { ok: true });
    expect(status).toBe('queued');
    expect(offline.queueOperation).toHaveBeenCalled();
    expect(sut.localManifests()['p3']).toBeUndefined();
  });

  it('resolveConflict (mine) re-pushes a version higher than the remote', async () => {
    await sut.push('p4', 'Title', { base: 'mine' });
    (cloud as any).latestByProject.set('p4', {
      projectId: 'p4',
      deviceId: 'dev_other',
      version: 7,
      data: { base: 'theirs' },
      timestamp: Date.now(),
      title: 'Title',
      byteSize: 14,
    });
    await sut.push('p4', 'Title', { base: 'mine' });
    expect(sut.conflictCount()).toBe(1);

    await sut.resolveConflict('p4', 'mine', { base: 'mine-final' });
    expect(sut.conflictCount()).toBe(0);
    expect(sut.localManifests()['p4'].version).toBe(8); // 7 + 1
  });

  it('resolveConflict (theirs) accepts the remote payload and version', async () => {
    await sut.push('p5', 'T', { base: 'mine' });
    (cloud as any).latestByProject.set('p5', {
      projectId: 'p5',
      deviceId: 'dev_other',
      version: 9,
      data: { base: 'theirs', extra: true },
      timestamp: Date.now(),
      title: 'T',
      byteSize: 14,
    });
    await sut.push('p5', 'T', { base: 'mine' });

    await sut.resolveConflict('p5', 'theirs');
    expect(sut.conflictCount()).toBe(0);
    expect(sut.localManifests()['p5'].version).toBe(9);
  });

  it('resolveConflict (merge) deep-merges payloads and bumps to max+1', async () => {
    await sut.push('p6', 'T', { a: 1, shared: 'mine' });
    (cloud as any).latestByProject.set('p6', {
      projectId: 'p6',
      deviceId: 'dev_other',
      version: 4,
      data: { b: 2, shared: 'theirs' },
      timestamp: Date.now(),
      title: 'T',
      byteSize: 14,
    });
    await sut.push('p6', 'T', { a: 1, shared: 'mine' });

    await sut.resolveConflict('p6', 'merge', { a: 1, shared: 'mine', c: 3 });
    expect(sut.conflictCount()).toBe(0);
    expect(sut.localManifests()['p6'].version).toBe(5); // max(1, 4) + 1
  });

  it('pulls an existing snapshot and updates the local manifest mirror', async () => {
    cloud.__seed([
      {
        projectId: 'p7',
        deviceId: 'dev_other',
        version: 3,
        data: { rolled: true },
        timestamp: Date.now(),
        title: 'Pulled',
        byteSize: 14,
      },
    ]);
    sut.refresh();
    const snapshot = await sut.pull('p7');
    expect(snapshot?.data).toEqual({ rolled: true });
    expect(sut.localManifests()['p7'].authorDeviceId).toBe('dev_other');
    expect(sut.localManifests()['p7'].version).toBe(3);
  });

  it('records every sync into the timeline with a status code', async () => {
    await sut.push('p8', 'TL', { x: 1 });
    await sut.push('p8', 'TL', { x: 2 });
    expect(sut.timeline().length).toBe(2);
    expect(sut.timeline()[0].status).toBe('success');
    expect(sut.timeline()[0].direction).toBe('push');
  });

  it('toggleSimulatedOffline flips reachability', () => {
    expect(sut.isCloudReachable()).toBe(true);
    sut.toggleSimulatedOffline();
    expect(sut.isCloudReachable()).toBe(false);
    sut.toggleSimulatedOffline();
    expect(sut.isCloudReachable()).toBe(true);
  });

  it('restoreFromBackup restores the snapshot payload, not the local editor payload', async () => {
    const snapshot = {
      projectId: 'p9',
      deviceId: 'dev_other',
      version: 4,
      data: { restored: true, takes: ['vocal-take-2'] },
      timestamp: Date.now(),
      title: 'Restored',
      byteSize: 40,
    };

    await sut.restoreFromBackup('p9', snapshot, { demo: true });

    // Restore stages version remote+1 (5), then push deterministically bumps
    // to 6 — both above the remote 4, so the re-push is accepted without a
    // conflict (the old fire-and-forget path raced between the two).
    expect(sut.localManifests()['p9'].version).toBe(6);
    const latest = cloud.latestByProject.get('p9');
    expect(latest.data).toEqual({ restored: true, takes: ['vocal-take-2'] });
    // The local editor payload must NOT have been pushed in its place.
    expect(latest.data).not.toEqual({ demo: true });
  });
});
