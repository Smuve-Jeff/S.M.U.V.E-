import { TestBed } from '@angular/core/testing';
import { SocialNetworkingService } from './social-networking.service';
import { UserProfileService } from './user-profile.service';
import { signal } from '@angular/core';

describe('SocialNetworkingService', () => {
  let service: SocialNetworkingService;
  let mockProfileService: any;

  beforeEach(() => {
    mockProfileService = {
      profile: signal({
        id: 'test-id',
        id: '',
        artistName: 'Test Artist',
        primaryGenre: 'Test Genre',
        profileSetupCompleted: true,
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        SocialNetworkingService,
        { provide: UserProfileService, useValue: mockProfileService },
      ],
    });
    service = TestBed.inject(SocialNetworkingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
