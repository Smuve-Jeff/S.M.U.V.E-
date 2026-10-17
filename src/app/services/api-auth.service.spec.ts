import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { APP_SECURITY_CONFIG } from '../app.security';
import { ApiAuthService } from './api-auth.service';
import { TokenService } from './token.service';

describe('ApiAuthService', () => {
  let service: ApiAuthService;
  let httpMock: HttpTestingController;
  let tokenService: TokenService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiAuthService, TokenService],
    });
    service = TestBed.inject(ApiAuthService);
    httpMock = TestBed.inject(HttpTestingController);
    tokenService = TestBed.inject(TokenService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts credentials to the configured API login endpoint', async () => {
    const requestPromise = service.login({
      email: 'artist@example.com',
      password: 'Password1!',
    });
    const request = httpMock.expectOne(
      `${APP_SECURITY_CONFIG.auth_api_url}/auth/login`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'artist@example.com',
      password: 'Password1!',
    });
    request.flush({ token: 'api-jwt-token', user: { id: 7 } });

    await expect(requestPromise).resolves.toEqual({
      token: 'api-jwt-token',
      user: { id: 7 },
    });
  });

  it('sends the stored API token when refreshing the authenticated user', async () => {
    tokenService.setToken('api-jwt-token', 'api');
    const requestPromise = service.me();
    const request = httpMock.expectOne(
      `${APP_SECURITY_CONFIG.auth_api_url}/auth/me`,
    );

    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer api-jwt-token',
    );
    request.flush({
      id: 7,
      name: 'API Artist',
      email: 'artist@example.com',
      role: 'user',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    });

    await expect(requestPromise).resolves.toMatchObject({
      id: 7,
      email: 'artist@example.com',
    });
  });
});
