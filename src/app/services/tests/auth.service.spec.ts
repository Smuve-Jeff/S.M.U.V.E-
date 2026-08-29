import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { AuthCredentials, AuthService } from '../auth.service';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { LoggingService } from '../logging.service';
import { TokenService } from '../token.service';
import { UserStoreService } from '../user-store.service';

describe('AuthService (Hardened)', () => {
  let service: AuthService;
  let userStore: UserStoreService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        TokenService,
        UserStoreService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
        {
          provide: UserProfileService,
          useValue: {
            loadProfile: jest.fn(),
            updateProfile: jest.fn(),
            profile: signal(initialProfile),
          },
        },
      ],
    });

    service = TestBed.inject(AuthService);
    userStore = TestBed.inject(UserStoreService);
  });

  it('should register a new user successfully', async () => {
    const creds: AuthCredentials = {
      email: 'test@example.com',
      password: 'Password123!@#',
    };
    const result = await service.register(creds, 'Test Artist');

    expect(result.success).toBe(true);
    expect(userStore.isAuthenticated()).toBe(true);
    expect(userStore.user()?.email).toBe('test@example.com');
    expect(localStorage.getItem('smuve_db_user_test@example.com')).toBeTruthy();
    expect(sessionStorage.getItem('smuve_auth_session')).toBeTruthy();
    const session = sessionStorage.getItem('smuve_auth_session');
    const decodedBytes = Uint8Array.from(atob(session!), (c) =>
      c.charCodeAt(0)
    );
    const decoded = new TextDecoder().decode(decodedBytes);
    const [data] = decoded.split('|');
    const parsedUser = JSON.parse(data);
    expect(parsedUser.email).toBe('test@example.com');
  });

  it('should fail registration with weak password', async () => {
    const creds: AuthCredentials = {
      email: 'test@example.com',
      password: 'weak',
    };
    const result = await service.register(creds, 'Test Artist');

    expect(result.success).toBe(false);
    expect(result.message).toContain('PASSWORD TOO SHORT');
  });

  it('should login successfully with correct credentials', async () => {
    const creds: AuthCredentials = {
      email: 'login@example.com',
      password: 'Password123!@#',
    };
    await service.register(creds, 'Login Artist');

    // Logout first
    service.logout();
    expect(userStore.isAuthenticated()).toBe(false);

    const result = await service.login(creds);
    expect(result.success).toBe(true);
    expect(userStore.isAuthenticated()).toBe(true);
    expect(userStore.user()?.artistName).toBe('Login Artist');
    expect(sessionStorage.getItem('smuve_auth_session')).toBeTruthy();
    const session = sessionStorage.getItem('smuve_auth_session');
    const decodedBytes = Uint8Array.from(atob(session!), (c) =>
      c.charCodeAt(0)
    );
    const decoded = new TextDecoder().decode(decodedBytes);
    const [data] = decoded.split('|');
    const parsedUser = JSON.parse(data);
    expect(parsedUser.email).toBe('login@example.com');
  });

  it('should fail login with incorrect password', async () => {
    const creds: AuthCredentials = {
      email: 'fail@example.com',
      password: 'Password123!@#',
    };
    await service.register(creds, 'Fail Artist');

    const result = await service.login({
      email: 'fail@example.com',
      password: 'WrongPassword123!',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('AUTHORIZATION DENIED');
  });

  it('should login successfully with correct credentials', async () => {
    const creds: AuthCredentials = {
      email: 'login@example.com',
      password: 'Password123!@#',
    };
    await service.register(creds, 'Login Artist');

    // Logout first
    service.logout();
    expect(userStore.isAuthenticated()).toBe(false);

    const result = await service.login(creds);
    expect(result.success).toBe(true);
    expect(userStore.isAuthenticated()).toBe(true);
    expect(userStore.user()?.artistName).toBe('Login Artist');
    expect(sessionStorage.getItem('smuve_auth_session')).toBeTruthy();
    const session = sessionStorage.getItem('smuve_auth_session');
    const decodedBytes = Uint8Array.from(atob(session!), (c) =>
      c.charCodeAt(0)
    );
    const decoded = new TextDecoder().decode(decodedBytes);
    const [data] = decoded.split('|');
    const parsedUser = JSON.parse(data);
    expect(parsedUser.email).toBe('login@example.com');
  });

  it('should fail login with incorrect password', async () => {
    const creds: AuthCredentials = {
      email: 'fail@example.com',
      password: 'Password123!@#',
    };
    await service.register(creds, 'Fail Artist');

    const result = await service.login({
      email: 'fail@example.com',
      password: 'WrongPassword123!',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('AUTHORIZATION DENIED');
  });

  it('treats corrupt local credentials as a controlled login failure', async () => {
    localStorage.setItem('smuve_db_user_corrupt@example.com', '{not-json');

    const result = await service.login({
      email: 'corrupt@example.com',
      password: 'Password123!@#',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('AUTHORIZATION DENIED');
    expect(userStore.isAuthenticated()).toBe(false);
  });

  it('clears the user and token when a persisted session is tampered with', async () => {
    userStore.setUser({
      id: 'u1',
      email: 'artist@example.com',
      artistName: 'Artist',
      role: 'Artist',
      permissions: ['STANDARD'],
      createdAt: new Date(),
      lastLogin: new Date(),
      profileCompleteness: 100,
      emailVerified: true,
    });
    const tokenService = TestBed.inject(TokenService);
    tokenService.setToken('stale-token', 'legacy');
    const tamperedUser = {
      id: 'u1',
      email: 'artist@example.com',
      artistName: 'Artist',
      role: 'Artist',
      permissions: ['STANDARD'],
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      profileCompleteness: 100,
      emailVerified: true,
    };
    const encodedSession = btoa(
      String.fromCharCode(
        ...new TextEncoder().encode(
          JSON.stringify(tamperedUser) + '|wrong-salt'
        )
      )
    );
    sessionStorage.setItem('smuve_auth_session', encodedSession);

    await service.loadSession();

    expect(userStore.isAuthenticated()).toBe(false);
    expect(tokenService.jwtToken()).toBeNull();
    expect(sessionStorage.getItem('smuve_auth_session')).toBeNull();
  });
});
