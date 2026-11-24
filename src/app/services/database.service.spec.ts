import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import {
  DatabaseService,
  PROFILE_SYNC_ENDPOINT,
} from './database.service';
import { OfflineSyncService } from './offline-sync.service';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import { initialProfile } from '../types/profile.types';
import type { UserProfile } from '../types/profile.types';

/**
 * `UserProfileService` already refuses to persist a record under another
 * account, but that only protects callers that go through it. The persistence
 * boundary itself is the last place the rule can be enforced for everyone.
 */
describe('DatabaseService profile ownership', () => {
  let service: DatabaseService;
  let http: HttpTestingController;
  let warn: jest.Mock;
  let apiToken: boolean;

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const offlineSync = {
    hasPending: jest.fn(async () => false),
    queueOperation: jest.fn(async () => 'sync-profile'),
    registerEndpointHandler: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.fn();
    apiToken = true;
    TestBed.configureTestingModule({
      providers: [
        DatabaseService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn, error: jest.fn(), system: jest.fn() },
        },
        {
          provide: TokenService,
          useValue: {
            jwtToken: () => 'test-token',
            isApiToken: () => apiToken,
          },
        },
        { provide: OfflineSyncService, useValue: offlineSync },
      ],
    });
    service = TestBed.inject(DatabaseService);
    http = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    http.verify();
  });

  it('refuses to write one account\u2019s record into another account\u2019s slot', async () => {
    const saved = await service.saveUserProfile(
      profile({ id: 'user-a', artistName: 'A' }),
      'user-b'
    );

    expect(saved).toBe(false);
    // Neither the local backup nor the cloud write may happen.
    http.expectNone(service.apiUrl + '/profile');
    expect(localStorage.getItem('smuve_user_profile_backup_user-b')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('different account')
    );
  });

  it('writes a record to its own account', async () => {
    const pending = service.saveUserProfile(
      profile({ id: 'user-a', artistName: 'A' }),
      'user-a'
    );

    http
      .expectOne(service.apiUrl + '/profile')
      .flush({ ok: true }, { status: 200, statusText: 'OK' });
    await expect(pending).resolves.toBe(true);

    expect(JSON.parse(localStorage.getItem('smuve_user_profile_backup_user-a')!).artistName).toBe('A');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports failure when the cloud write fails but the local backup succeeds', async () => {
    const pending = service.saveUserProfile(
      profile({ id: 'user-a', artistName: 'A' }),
      'user-a'
    );

    http
      .expectOne(service.apiUrl + '/profile')
      .flush({}, { status: 500, statusText: 'Server Error' });

    await expect(pending).resolves.toBe(false);
    expect(
      localStorage.getItem('smuve_user_profile_backup_user-a')
    ).toContain('A');
    // A background save must not look synced: the status says so and a retry
    // is queued instead of swallowing the failure.
    expect(service.cloudSyncPending()).toBe(true);
    expect(service.cloudSyncError()).toContain('queued for retry');
    expect(offlineSync.queueOperation).toHaveBeenCalledWith(
      'UPDATE',
      PROFILE_SYNC_ENDPOINT,
      expect.objectContaining({ userId: 'user-a' })
    );
  });

  it('clears the pending cloud state after a confirmed write', async () => {
    const failed = service.saveUserProfile(profile({ id: 'user-a' }), 'user-a');
    http
      .expectOne(service.apiUrl + '/profile')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await failed;
    expect(service.cloudSyncPending()).toBe(true);

    const retried = service.saveUserProfile(profile({ id: 'user-a' }), 'user-a');
    http
      .expectOne(service.apiUrl + '/profile')
      .flush({ ok: true }, { status: 200, statusText: 'OK' });
    await expect(retried).resolves.toBe(true);

    expect(service.cloudSyncPending()).toBe(false);
    expect(service.cloudSyncError()).toBeNull();
  });

  it('lets an unstamped record be saved, since it has no owner to compare', async () => {
    const unstamped = profile({ artistName: 'New' });
    delete (unstamped as Partial<UserProfile>).id;

    const pending = service.saveUserProfile(unstamped, 'user-a');

    http
      .expectOne(service.apiUrl + '/profile')
      .flush({ ok: true }, { status: 200, statusText: 'OK' });
    await pending;

    expect(warn).not.toHaveBeenCalled();
  });

  it('sends only an API-signed token on an upload', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });

    const signed = service.uploadAsset(file);
    const signedRequest = http.expectOne(service.apiUrl + '/upload');
    expect(signedRequest.request.headers.get('Authorization')).toBe(
      'Bearer test-token'
    );
    signedRequest.flush({ url: 'https://cdn.example/cover.png' });
    await expect(signed).resolves.toBe('https://cdn.example/cover.png');

    // A legacy local/demo token is not an API credential. Sending it would
    // replace a clear signed-out state with a 401 that tears the session down.
    apiToken = false;
    const unsigned = service.uploadAsset(file);
    const unsignedRequest = http.expectOne(service.apiUrl + '/upload');
    expect(unsignedRequest.request.headers.has('Authorization')).toBe(false);
    unsignedRequest.flush({ url: 'https://cdn.example/cover-2.png' });
    await expect(unsigned).resolves.toBe('https://cdn.example/cover-2.png');
  });

  it('treats the guest fallback key as its own destination', async () => {
    const pending = service.saveUserProfile(
      profile({ id: 'current', artistName: 'Guest' }),
      'current'
    );

    http
      .expectOne(service.apiUrl + '/profile')
      .flush({ ok: true }, { status: 200, statusText: 'OK' });
    await pending;

    expect(localStorage.getItem('smuve_user_profile_backup_current')).toContain(
      'Guest'
    );
  });

  it('removes only the requested account\u2019s local copy', () => {
    localStorage.setItem(
      'smuve_user_profile_backup_user-a',
      JSON.stringify({ id: 'user-a' })
    );
    localStorage.setItem(
      'smuve_user_profile_backup_user-b',
      JSON.stringify({ id: 'user-b' })
    );

    service.removeLocalProfileBackup('user-a');

    expect(
      localStorage.getItem('smuve_user_profile_backup_user-a')
    ).toBeNull();
    expect(
      localStorage.getItem('smuve_user_profile_backup_user-b')
    ).not.toBeNull();
  });
});
