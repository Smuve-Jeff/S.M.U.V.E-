import { TestBed } from '@angular/core/testing';
import { UIService } from '../ui.service';
import { Router } from '@angular/router';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { signal } from '@angular/core';

describe('UIService Performance Mode', () => {
  let service: UIService;
  let profileServiceMock: any;

  beforeEach(() => {
    const routerMock = { navigate: jest.fn() };
    profileServiceMock = {
      profile: signal(JSON.parse(JSON.stringify(initialProfile))),
      updateProfile: jest.fn().mockImplementation((p) => {
        profileServiceMock.profile.set(p);
        return Promise.resolve();
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        UIService,
        { provide: Router, useValue: routerMock },
        { provide: UserProfileService, useValue: profileServiceMock },
      ],
    });
    service = TestBed.inject(UIService);
    document.body.classList.remove('perf-mode-active');
  });

  it('should toggle performance mode via UserProfileService', async () => {
    service.togglePerformanceMode();
    // After calling toggle, the profileService.updateProfile should have been called
    expect(profileServiceMock.updateProfile).toHaveBeenCalled();
    expect(profileServiceMock.profile().settings.ui.performanceMode).toBe(true);

    // UIService performanceMode signal should update via the effect
    // We trigger the effect manually if needed, but here we can just check if togglePerformanceMode
    // actually updated the signal (it might not have immediately if it relies solely on the effect)

    // Since UIService constructor has an effect that sets performanceMode signal from profile settings:
    TestBed.flushEffects();
    expect(service.performanceMode()).toBe(true);
  });

  it('defaults to dark theme from profile settings', () => {
    TestBed.flushEffects();
    expect(service.activeTheme().name).toBe('Dark');
  });

  it('cleans up online status listeners when destroyed', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        UIService,
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: UserProfileService, useValue: profileServiceMock },
      ],
    });

    TestBed.inject(UIService);

    const onlineHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'online'
    )?.[1];
    const offlineHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'offline'
    )?.[1];

    expect(onlineHandler).toEqual(expect.any(Function));
    expect(offlineHandler).toEqual(expect.any(Function));

    TestBed.resetTestingModule();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'online',
      onlineHandler
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'offline',
      offlineHandler
    );
  });
});
