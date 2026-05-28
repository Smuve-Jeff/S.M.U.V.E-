import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../auth.service';
import { SecurityService } from '../security.service';
import { LoggingService } from '../logging.service';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { signal } from '@angular/core';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    const securityServiceMock = {
      validateSession: jest.fn().mockReturnValue(true),
    };
    const profileServiceMock = {
      profile: signal(initialProfile),
      loadProfile: jest.fn(),
    };
    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SecurityService, useValue: securityServiceMock },
        { provide: LoggingService, useValue: loggerMock },
        { provide: UserProfileService, useValue: profileServiceMock },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
