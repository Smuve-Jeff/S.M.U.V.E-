import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { LoggingService } from './logging.service';
import { LocalStorageService } from './local-storage.service';
import { OfflineSyncService } from './offline-sync.service';

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
