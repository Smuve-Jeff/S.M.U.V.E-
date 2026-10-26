import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { UserProfileService } from '../user-profile.service';
import { ProfileStoreService } from '../profile-store.service';
import { DatabaseService } from '../database.service';
import { LoggingService } from '../logging.service';
import { TokenService } from '../token.service';
import { AuthService } from '../auth.service';
import { initialProfile } from '../../types/profile.types';

/**
 * The ownership rules were each tested on their own; this is the loop an artist
 * actually takes. A cloud row written before the stamp was checked carries a
 * foreign `id`. If that stamp survived the load, the write guard would refuse
 * every later edit — the profile would look editable and never save. Loading,
 * editing and saving through the real services proves the loop stays open and
 * that what reaches the server is stamped as the signed-in account.
 */
describe('profile ownership loop', () => {
  let profiles: UserProfileService;
  let database: DatabaseService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        ProfileStoreService,
        DatabaseService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1' }) } },
        { provide: TokenService, useValue: { jwtToken: () => 'test-token' } },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), system: jest.fn() },
        },
      ],
    });
    profiles = TestBed.inject(UserProfileService);
    database = TestBed.inject(DatabaseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const legacyRow = () => ({
    ...JSON.parse(JSON.stringify(initialProfile)),
    id: 'someone-else',
    artistName: 'Legacy Artist',
  });

  it('loads a legacy-stamped row, edits it, and saves it as the signed-in account', async () => {
    const loading = profiles.loadProfile('u1');
    http
      .expectOne(`${database.apiUrl}/profile/u1`)
      .flush(legacyRow(), { status: 200, statusText: 'OK' });
    await loading;

    // The client already treats the row it asked for as the owner.
    expect(profiles.profile().artistName).toBe('Legacy Artist');
    expect(profiles.profile().id).toBe('u1');
    expect(profiles.hydrated()).toBe(true);

    const saving = profiles.updateProfile({ artistName: 'Edited Artist' });
    const request = http.expectOne(`${database.apiUrl}/profile`);
    expect(request.request.method).toBe('POST');

    // What leaves the client is stamped as the account that owns the row, so
    // the server's own ownership check accepts it.
    const body = request.request.body as {
      userId: string;
      profileData: { id: string; artistName: string };
    };
    expect(body.userId).toBe('u1');
    expect(body.profileData.id).toBe('u1');
    expect(body.profileData.artistName).toBe('Edited Artist');

    request.flush({ success: true }, { status: 200, statusText: 'OK' });
    await saving;

    // The local backup matches what was sent, so an offline reload agrees.
    const backup = JSON.parse(
      localStorage.getItem('smuve_user_profile_backup_u1') || 'null'
    );
    expect(backup?.id).toBe('u1');
    expect(backup?.artistName).toBe('Edited Artist');
  });

  it('keeps a later edit working without another repair', async () => {
    const loading = profiles.loadProfile('u1');
    http
      .expectOne(`${database.apiUrl}/profile/u1`)
      .flush(legacyRow(), { status: 200, statusText: 'OK' });
    await loading;

    const first = profiles.updateProfile({ artistName: 'First Edit' });
    http
      .expectOne(`${database.apiUrl}/profile`)
      .flush({ success: true }, { status: 200, statusText: 'OK' });
    await first;

    const second = profiles.updateProfile({ artistName: 'Second Edit' });
    const request = http.expectOne(`${database.apiUrl}/profile`);
    const body = request.request.body as {
      profileData: { id: string; artistName: string };
    };
    expect(body.profileData.id).toBe('u1');
    expect(body.profileData.artistName).toBe('Second Edit');
    request.flush({ success: true }, { status: 200, statusText: 'OK' });
    await second;
  });
});
