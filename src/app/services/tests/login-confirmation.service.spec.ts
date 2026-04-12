import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { LoginConfirmationService } from '../login-confirmation.service';
import { DatabaseService } from '../database.service';
import { LoggingService } from '../logging.service';

describe('LoginConfirmationService', () => {
  let service: LoginConfirmationService;
  let httpMock: HttpTestingController;
  const loggerMock = {
    warn: jest.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LoginConfirmationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DatabaseService,
          useValue: {
            apiUrl: 'https://smuve.example/api',
          },
        },
        {
          provide: LoggingService,
          useValue: loggerMock,
        },
      ],
    });

    service = TestBed.inject(LoginConfirmationService);
    httpMock = TestBed.inject(HttpTestingController);
    loggerMock.warn.mockReset();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts the login confirmation payload to the backend', async () => {
    const requestPromise = service.sendLoginConfirmation({
      id: 'user-123',
      email: 'artist@example.com',
      artistName: 'Nova Flux',
      role: 'Admin',
      permissions: ['ALL_ACCESS'],
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
      lastLogin: new Date('2026-04-12T01:00:00.000Z'),
      profileCompleteness: 100,
    });

    const request = httpMock.expectOne(
      'https://smuve.example/api/auth/login-email'
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        email: 'artist@example.com',
        artistName: 'Nova Flux',
        loginAt: '2026-04-12T01:00:00.000Z',
      })
    );

    request.flush({ success: true });
    await requestPromise;
  });

  it('swallows backend failures so login flow can continue', async () => {
    const requestPromise = service.sendLoginConfirmation({
      id: 'user-123',
      email: 'artist@example.com',
      artistName: 'Nova Flux',
      role: 'Admin',
      permissions: ['ALL_ACCESS'],
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
      lastLogin: new Date('2026-04-12T01:00:00.000Z'),
      profileCompleteness: 100,
    });

    const request = httpMock.expectOne(
      'https://smuve.example/api/auth/login-email'
    );
    request.flush(
      { success: false },
      {
        status: 500,
        statusText: 'Server Error',
      }
    );

    await requestPromise;

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'LoginConfirmationService: Failed to send login confirmation email',
      expect.anything()
    );
  });
});
