import { TestBed } from '@angular/core/testing';
import { OfflineSyncService } from '../offline-sync.service';
import { LocalStorageService } from '../local-storage.service';
import { LoggingService } from '../logging.service';

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
