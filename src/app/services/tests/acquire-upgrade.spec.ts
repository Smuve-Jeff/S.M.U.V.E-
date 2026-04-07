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

  it('should add "Service" to services list', async () => {
    const upgrade = {
      title: 'DistroKid',
      type: 'Service',
      recommendationId: 'upg-service',
    };
    await service.acquireUpgrade(upgrade);
    expect(service.profile().services).toContain('DistroKid');
    expect(
      service.profile().recommendationPreferences?.['upg-service']
    ).toEqual(
      expect.objectContaining({
        state: 'acquired',
      })
    );
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

  it('marks completed upgrades separately from acquired state', async () => {
    const upgrade = {
      title: 'Mix Translation Checklist',
      type: 'Service',
      recommendationId: 'upg-translation-checklist',
    };

    await service.completeUpgrade(upgrade);

    expect(service.profile().services).toContain('Mix Translation Checklist');
    expect(
      service.profile().recommendationPreferences?.['upg-translation-checklist']
    ).toEqual(
      expect.objectContaining({
        state: 'completed',
      })
    );
    expect(service.profile().recommendationHistory?.at(-1)).toEqual(
      expect.objectContaining({
        recommendationId: 'upg-translation-checklist',
        state: 'completed',
      })
    );
  });
});
