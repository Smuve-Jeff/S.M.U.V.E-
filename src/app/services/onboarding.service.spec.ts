import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { initialProfile } from '../types/profile.types';
import { OnboardingService } from './onboarding.service';
import { UIService } from './ui.service';
import { UserProfileService } from './user-profile.service';

describe('OnboardingService with blocked storage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = (): OnboardingService => {
    TestBed.configureTestingModule({
      providers: [
        OnboardingService,
        {
          provide: UserProfileService,
          useValue: { profile: signal(initialProfile) },
        },
        {
          provide: UIService,
          useValue: { recentViewModes: signal([]) },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });
    return TestBed.inject(OnboardingService);
  };

  it('boots with the tour visible when the dismissed flag cannot be read', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    let service!: OnboardingService;
    expect(() => {
      service = createService();
    }).not.toThrow();
    expect((service as any).dismissed()).toBe(false);
  });

  it('dismisses and resets in memory when writes are blocked', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const service = createService();

    expect(() => service.dismiss()).not.toThrow();
    expect((service as any).dismissed()).toBe(true);

    expect(() => service.reset()).not.toThrow();
    expect((service as any).dismissed()).toBe(false);
  });

  it('starts and ends the first beat tour in memory when writes are blocked', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const service = createService();

    expect(() => service.startTour()).not.toThrow();
    expect(service.currentTour()?.id).toBe('first-beat');

    expect(() => service.exitTour()).not.toThrow();
    expect(service.currentTour()).toBeNull();

    expect(() => service.completeTour()).not.toThrow();
    expect(service.currentTour()).toBeNull();
  });
});
