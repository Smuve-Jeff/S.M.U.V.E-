import { TestBed } from '@angular/core/testing';

import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { OfflineSyncService } from './offline-sync.service';

describe('OfflineSyncService with blocked storage', () => {
  let service: OfflineSyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), system: jest.fn() },
        },
        { provide: LocalStorageService, useValue: {} },
      ],
    });
    service = TestBed.inject(OfflineSyncService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  const authHeader = (): Record<string, string> =>
    (service as unknown as { getAuthHeader(): Record<string, string> }).getAuthHeader();

  it('syncs unauthenticated rather than throwing when the token cannot be read', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(authHeader()).toEqual({});
  });

  it('still reads a token from a working store', () => {
    localStorage.setItem('smuve_jwt_token', 'test-token');
    expect(authHeader()).toEqual({ Authorization: 'Bearer test-token' });
  });
});
