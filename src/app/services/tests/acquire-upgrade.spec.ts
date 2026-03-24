import { TestBed } from '@angular/core/testing';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { AuthService } from '../auth.service';
import { DatabaseService } from '../database.service';
import { signal } from '@angular/core';

describe('UserProfileService - Acquire Upgrade', () => {
  let service: UserProfileService;
  let mockAuthService: any;
  let mockDatabaseService: any;

  beforeEach(() => {
    mockAuthService = {
      isAuthenticated: signal(true),
    };
    mockDatabaseService = {
      loadUserProfile: jest.fn().mockResolvedValue({ ...initialProfile }),
      saveUserProfile: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    });
    service = TestBed.inject(UserProfileService);
  });

  it('should add "Gear" to equipment list', async () => {
    const upgrade = { title: 'New Mic', type: 'Gear' };
    await service.acquireUpgrade(upgrade);
    expect(service.profile().equipment).toContain('New Mic');
    expect(mockDatabaseService.saveUserProfile).toHaveBeenCalled();
  });

  it('should add "Software" to daw list', async () => {
    const upgrade = { title: 'New Synth', type: 'Software' };
    await service.acquireUpgrade(upgrade);
    expect(service.profile().daw).toContain('New Synth');
  });

  it('should add "Service" to daw list', async () => {
    const upgrade = { title: 'DistroKid', type: 'Service' };
    await service.acquireUpgrade(upgrade);
    expect(service.profile().daw).toContain('DistroKid');
  });

  it('should not add duplicate items', async () => {
    const upgrade = { title: 'Duplicate Item', type: 'Gear' };
    await service.acquireUpgrade(upgrade);
    await service.acquireUpgrade(upgrade);
    const count = service
      .profile()
      .equipment.filter((e) => e === 'Duplicate Item').length;
    expect(count).toBe(1);
  });
});
