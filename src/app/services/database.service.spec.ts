import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { DatabaseService } from './database.service';
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

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  beforeEach(() => {
    warn = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        DatabaseService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn, error: jest.fn(), system: jest.fn() },
        },
        { provide: TokenService, useValue: { jwtToken: () => 'test-token' } },
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
    await service.saveUserProfile(profile({ id: 'user-a', artistName: 'A' }), 'user-b');

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
    await pending;

    expect(JSON.parse(localStorage.getItem('smuve_user_profile_backup_user-a')!).artistName).toBe('A');
    expect(warn).not.toHaveBeenCalled();
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
});
