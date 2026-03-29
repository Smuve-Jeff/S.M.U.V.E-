import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PerformanceMonitorService } from '../performance-monitor.service';
import { LoggingService } from '../logging.service';

describe('PerformanceMonitorService', () => {
  let service: PerformanceMonitorService;
  let loggerMock: Partial<LoggingService>;

  beforeEach(() => {
    loggerMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PerformanceMonitorService,
        { provide: LoggingService, useValue: loggerMock },
      ],
    });
    service = TestBed.inject(PerformanceMonitorService);
  });

  afterEach(() => {
    service.stopMonitoring();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with default metrics', () => {
    const metrics = service.metrics();
    expect(metrics.fcp).toBeNull();
    expect(metrics.lcp).toBeNull();
    expect(metrics.fid).toBeNull();
    expect(metrics.cls).toBeNull();
    expect(metrics.ttfb).toBeNull();
    expect(metrics.frameRate).toBe(60);
    expect(metrics.longTasks).toBe(0);
  });

  it('should have a health score', () => {
    const health = service.healthScore();
    expect(['good', 'needs-improvement', 'poor']).toContain(health);
  });

  it('should measure async function execution time', async () => {
    const result = await service.measureAsync('test', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    });
    expect(result.result).toBe(42);
    expect(result.duration).toBeGreaterThan(0);
    expect(loggerMock.info).toHaveBeenCalled();
  });

  it('should mark performance', () => {
    expect(() => service.mark('test-mark')).not.toThrow();
  });

  it('should get summary with recommendations', () => {
    const summary = service.getSummary();
    expect(summary).toHaveProperty('metrics');
    expect(summary).toHaveProperty('health');
    expect(summary).toHaveProperty('recommendations');
    expect(Array.isArray(summary.recommendations)).toBe(true);
  });

  it('should stop monitoring', () => {
    service.stopMonitoring();
    expect(service.isMonitoring()).toBe(false);
  });

  it('should get memory usage (may be null in test env)', () => {
    const memory = service.getMemoryUsage();
    // Memory API may not be available in test environment
    expect(memory === null || typeof memory === 'number').toBe(true);
  });
});
