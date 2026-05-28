import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SecurityService } from '../security.service';
import { LoggingService } from '../logging.service';
import { UserProfileService } from '../user-profile.service';
import { signal } from '@angular/core';

describe('SecurityService', () => {
  let service: SecurityService;

  beforeEach(() => {
    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const profileMock = { profile: signal({}) };

    TestBed.configureTestingModule({
      providers: [
        SecurityService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LoggingService, useValue: loggerMock },
        { provide: UserProfileService, useValue: profileMock },
      ],
    });
    service = TestBed.inject(SecurityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
