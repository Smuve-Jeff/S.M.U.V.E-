import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { OfflineSyncService } from '../offline-sync.service';
import { LocalStorageService } from '../local-storage.service';
import { LoggingService } from '../logging.service';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const queuedItem = (id: string, endpoint = 'smuve://profile-sync') => ({
  id,
  action: 'UPDATE' as const,
  endpoint,
  payload: {},
  timestamp: 1,
  retryCount: 0,
  maxRetries: 3,
});

const logging = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  system: jest.fn(),
});

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let localStorageMock: Partial<LocalStorageService>;
  let loggerMock: Partial<LoggingService>;

  beforeEach(() => {
    localStorageMock = {
      saveItem: jest.fn().mockResolvedValue(undefined),
      getAllItems: jest.fn().mockResolvedValue([]),
      getItem: jest.fn().mockResolvedValue(null),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };

    loggerMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: LoggingService, useValue: loggerMock },
      ],
    });
    service = TestBed.inject(OfflineSyncService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should track network status', () => {
    expect(['online', 'offline']).toContain(service.networkStatus());
  });

  it('should have initial pending count of 0', () => {
    expect(service.pendingCount()).toBeGreaterThanOrEqual(0);
  });

  it('should have isSyncing signal', () => {
    expect(typeof service.isSyncing()).toBe('boolean');
  });

  it('should have lastSyncAttempt signal', () => {
    const lastSync = service.lastSyncAttempt();
    expect(lastSync === null || typeof lastSync === 'number').toBe(true);
  });

  it('queues connector sync operations with connector metadata', async () => {
    const id = await service.queueConnectorSync(
      'Spotify',
      'https://example.com/connectors/spotify',
      { artistName: 'Nova Flux' },
      'artist-1'
    );

    expect(id).toContain('sync_');
    expect(localStorageMock.saveItem).toHaveBeenCalledWith(
      'sync_queue',
      expect.objectContaining({
        channel: 'connector',
        connectorId: 'Spotify',
        userId: 'artist-1',
      })
    );
  });

  describe('dead-letter lifecycle', () => {
    function makeQueuedItem(
      overrides: Partial<import('../offline-sync.service').SyncQueueItem> = {}
    ): import('../offline-sync.service').SyncQueueItem {
      return {
        id: 'sync_test_1',
        action: 'CREATE',
        endpoint: 'https://api.example.com/projects',
        payload: { name: 'Beat Tape' },
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        ...overrides,
      };
    }

    it('sends 4xx failures straight to the dead-letter store without retrying', async () => {
      const item = makeQueuedItem();
      // 422 = validation error — retrying the identical payload cannot help.
      await (service as any).handleSyncError(item, {
        statusCode: 422,
        name: 'Error',
      });

      expect(localStorageMock.saveItem).toHaveBeenCalledWith(
        'sync_dead_letter',
        expect.objectContaining({ id: 'sync_test_1', failedAt: expect.any(Number) })
      );
      // No retry write-back — the item never re-enters the queue.
      expect(localStorageMock.saveItem).not.toHaveBeenCalledWith(
        'sync_queue',
        expect.objectContaining({ retryCount: 1 })
      );
    });

    it('still retries 5xx and network failures up to maxRetries', async () => {
      const item = makeQueuedItem();
      await (service as any).handleSyncError(item, { name: 'TypeError' });

      expect(localStorageMock.saveItem).toHaveBeenCalledWith(
        'sync_queue',
        expect.objectContaining({ id: 'sync_test_1', retryCount: 1 })
      );
      expect(localStorageMock.saveItem).not.toHaveBeenCalledWith(
        'sync_dead_letter',
        expect.anything()
      );
    });

    it('replays a dead-lettered item back into the queue with a clean retry count', async () => {
      localStorageMock.getItem = jest.fn().mockResolvedValue(
        makeQueuedItem({ retryCount: 3, failedAt: Date.now() } as any)
      );

      const ok = await service.replayDeadLetter('sync_test_1');

      expect(ok).toBe(true);
      expect(localStorageMock.deleteItem).toHaveBeenCalledWith(
        'sync_dead_letter',
        'sync_test_1'
      );
      expect(localStorageMock.saveItem).toHaveBeenCalledWith(
        'sync_queue',
        expect.objectContaining({ id: 'sync_test_1', retryCount: 0 })
      );
    });

    it('returns false when replaying or clearing a missing dead letter', async () => {
      expect(await service.replayDeadLetter('missing')).toBe(false);
      expect(await service.clearDeadLetter('missing')).toBe(false);
    });

    it('discards a dead-lettered item permanently on clear', async () => {
      localStorageMock.getItem = jest.fn().mockResolvedValue(
        makeQueuedItem({ retryCount: 3, failedAt: Date.now() } as any)
      );

      const ok = await service.clearDeadLetter('sync_test_1');

      expect(ok).toBe(true);
      expect(localStorageMock.deleteItem).toHaveBeenCalledWith(
        'sync_dead_letter',
        'sync_test_1'
      );
      // Never re-queued.
      expect(localStorageMock.saveItem).not.toHaveBeenCalledWith(
        'sync_queue',
        expect.anything()
      );
    });
  });
});

describe('OfflineSyncService queue status', () => {
  let service: OfflineSyncService;
  let storage: LocalStorageService;

  const emptyStores = async () => {
    for (const store of ['sync_queue', 'sync_dead_letter']) {
      for (const item of await storage.getAllItems(store)) {
        await storage.deleteItem(store, item.id);
      }
    }
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        LocalStorageService,
        { provide: LoggingService, useValue: logging() },
      ],
    });
    service = TestBed.inject(OfflineSyncService);
    storage = TestBed.inject(LocalStorageService);
    await emptyStores();
    await service.refreshQueueStatus();
  });

  it('publishes counts and dead-letter endpoints from the real stores', async () => {
    await storage.saveItem('sync_queue', queuedItem('queued-1'));
    await storage.saveItem(
      'sync_queue',
      queuedItem('queued-2', 'smuve://other-sync')
    );
    await storage.saveItem('sync_dead_letter', queuedItem('dead-1'));
    await storage.saveItem(
      'sync_dead_letter',
      queuedItem('dead-2', 'smuve://other-sync')
    );

    // The cached values still show the clean state read earlier.
    expect(service.pendingCount()).toBe(0);
    expect(service.deadLetterCount()).toBe(0);
    expect(service.deadLetteredEndpoints()).toEqual([]);

    await service.refreshQueueStatus();

    expect(service.pendingCount()).toBe(2);
    expect(service.deadLetterCount()).toBe(2);
    expect(service.deadLetteredEndpoints()).toEqual([
      'smuve://profile-sync',
      'smuve://other-sync',
    ]);
  });

  it('reports the store snapshot through getQueueStatus and updates the signals', async () => {
    await storage.saveItem('sync_queue', queuedItem('queued-1'));
    await storage.saveItem('sync_queue', {
      ...queuedItem('queued-2'),
      channel: 'connector' as const,
    });
    await storage.saveItem('sync_dead_letter', queuedItem('dead-1'));

    const status = await service.getQueueStatus();

    expect(status.pending).toBe(2);
    expect(status.deadLetter).toBe(1);
    expect(status.connectorPending).toBe(1);
    // The status read is the guarded one, so asking leaves the signals current.
    expect(service.pendingCount()).toBe(2);
    expect(service.deadLetterCount()).toBe(1);
    expect(service.deadLetteredEndpoints()).toEqual(['smuve://profile-sync']);
  });

  it('requeues only the dead letters for the requested endpoint', async () => {
    // Offline so the requeued write waits in the queue instead of being sent.
    service.networkStatus.set('offline');
    await storage.saveItem('sync_dead_letter', queuedItem('dead-profile'));
    await storage.saveItem(
      'sync_dead_letter',
      queuedItem('dead-push', '/cloud/push')
    );

    const requeued = await service.retryDeadLetteredEndpoint('/cloud/push');

    expect(requeued).toBe(1);
    expect(service.deadLetteredEndpoints()).toEqual(['smuve://profile-sync']);
    expect((await storage.getAllItems('sync_queue')).map((item) => item.id)).toEqual([
      'dead-push',
    ]);
    expect(service.pendingCount()).toBe(1);
  });

  it('drops a dead letter removed outside this service on the next refresh', async () => {
    await storage.saveItem('sync_dead_letter', queuedItem('dead-1'));
    await service.refreshQueueStatus();
    expect(service.deadLetteredEndpoints()).toEqual(['smuve://profile-sync']);

    await storage.deleteItem('sync_dead_letter', 'dead-1');
    await service.refreshQueueStatus();

    expect(service.deadLetterCount()).toBe(0);
    expect(service.deadLetteredEndpoints()).toEqual([]);
  });
});

describe('OfflineSyncService queue status ordering', () => {
  type PendingRead = { store: string; resolve: (items: any[]) => void };

  let reads: PendingRead[];

  /** Resolve the most recently started read for a store, as a fast read would. */
  const resolveLast = async (store: string, items: any[]) => {
    const index = reads.map((read) => read.store).lastIndexOf(store);
    const [read] = reads.splice(index, 1);
    read!.resolve(items);
    await flush();
  };

  beforeEach(() => {
    reads = [];
    TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        {
          provide: LocalStorageService,
          useValue: {
            getAllItems: (store: string) =>
              new Promise<any[]>((resolve) => {
                reads.push({ store, resolve });
              }),
            saveItem: jest.fn(async () => undefined),
            getItem: jest.fn(async () => null),
            deleteItem: jest.fn(async () => undefined),
          },
        },
        { provide: LoggingService, useValue: logging() },
      ],
    });
  });

  it('does not let an older read republish its snapshot', async () => {
    const service = TestBed.inject(OfflineSyncService);
    // The constructor already started a read of its own.
    expect(reads).toHaveLength(1);

    const older = service.refreshQueueStatus();
    const newer = service.refreshQueueStatus();
    expect(reads).toHaveLength(3);

    // The newer read finishes first with a populated store.
    await resolveLast('sync_queue', [
      queuedItem('queued-1'),
      queuedItem('queued-2'),
      queuedItem('queued-3'),
    ]);
    await resolveLast('sync_dead_letter', [queuedItem('dead-1')]);

    expect(service.pendingCount()).toBe(3);
    expect(service.deadLetterCount()).toBe(1);
    expect(service.deadLetteredEndpoints()).toEqual(['smuve://profile-sync']);

    // The older read and the constructor read finish later with an empty store.
    // Neither may publish over the newer snapshot.
    await resolveLast('sync_queue', []);
    await resolveLast('sync_dead_letter', []);
    await resolveLast('sync_queue', []);
    await resolveLast('sync_dead_letter', []);
    await Promise.all([older, newer]);

    expect(service.pendingCount()).toBe(3);
    expect(service.deadLetterCount()).toBe(1);
    expect(service.deadLetteredEndpoints()).toEqual(['smuve://profile-sync']);
  });
});
