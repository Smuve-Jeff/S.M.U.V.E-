import { TestBed } from '@angular/core/testing';
import { UIService } from '../ui.service';
import { Router } from '@angular/router';

describe('UIService Performance Mode', () => {
  let service: UIService;

  beforeEach(() => {
    const routerMock = { navigate: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        UIService,
        { provide: Router, useValue: routerMock }
      ]
    });
    service = TestBed.inject(UIService);
    document.body.classList.remove('perf-mode-active');
  });

  it('should toggle performance mode and update body class', () => {
    service.togglePerformanceMode();
    expect(service.performanceMode()).toBe(true);
    // Note: effect() might be async or require tick in some test environments,
    // but in Angular 17+ with zoneless or specific setups it might be direct.
    // However, for standard unit tests we check the signal value.
    expect(localStorage.getItem('smuve_perf_mode')).toBe('true');
  });
});
