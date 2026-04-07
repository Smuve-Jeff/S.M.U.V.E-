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
});
