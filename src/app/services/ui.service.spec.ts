import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UIService } from './ui.service';
import { UserProfileService } from './user-profile.service';

describe('UIService responsive breakpoints', () => {
  let service: UIService;

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: height,
      configurable: true,
      writable: true,
    });
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl: jest.fn() } },
        {
          provide: UserProfileService,
          useValue: { profile: () => null, updateProfile: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(UIService);
  });

  it('enables the compact mobile shell on phones (≤768px)', () => {
    setViewport(400, 800);

    expect(service.isCompactMobile()).toBe(true);
    expect(service.isPortraitTablet()).toBe(false);
    expect(service.showMobileNav()).toBe(true);
  });

  it('enables the mobile nav for portrait tablets (769–1024px, taller than wide)', () => {
    setViewport(900, 1200);

    expect(service.isCompactMobile()).toBe(false);
    expect(service.isPortraitTablet()).toBe(true);
    expect(service.showMobileNav()).toBe(true);
  });

  it('keeps the desktop shell for landscape tablets (wider than tall)', () => {
    setViewport(900, 600);

    expect(service.isCompactMobile()).toBe(false);
    expect(service.isPortraitTablet()).toBe(false);
    expect(service.showMobileNav()).toBe(false);
  });

  it('keeps the desktop shell above 1024px', () => {
    setViewport(1440, 900);

    expect(service.isCompactMobile()).toBe(false);
    expect(service.isPortraitTablet()).toBe(false);
    expect(service.showMobileNav()).toBe(false);
  });
});
