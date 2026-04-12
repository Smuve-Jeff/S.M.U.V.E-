import { Injectable, inject, signal, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';

export interface PerformanceMetrics {
  fcp: number | null; // First Contentful Paint
  lcp: number | null; // Largest Contentful Paint
  fid: number | null; // First Input Delay
  cls: number | null; // Cumulative Layout Shift
  ttfb: number | null; // Time to First Byte
  inp: number | null; // Interaction to Next Paint
  memoryUsage: number | null;
  frameRate: number;
  longTasks: number;
}

export interface PerformanceThresholds {
  fcp: { good: number; needsImprovement: number };
  lcp: { good: number; needsImprovement: number };
  fid: { good: number; needsImprovement: number };
  cls: { good: number; needsImprovement: number };
  ttfb: { good: number; needsImprovement: number };
  inp: { good: number; needsImprovement: number };
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  fcp: { good: 1800, needsImprovement: 3000 },
  lcp: { good: 2500, needsImprovement: 4000 },
  fid: { good: 100, needsImprovement: 300 },
  cls: { good: 0.1, needsImprovement: 0.25 },
  ttfb: { good: 800, needsImprovement: 1800 },
  inp: { good: 200, needsImprovement: 500 },
};

@Injectable({
  providedIn: 'root',
})
export class PerformanceMonitorService {
  private logger = inject(LoggingService);
  private ngZone = inject(NgZone);

  private thresholds = DEFAULT_THRESHOLDS;
  private frameRateSamples: number[] = [];
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private longTaskCount = 0;

  metrics = signal<PerformanceMetrics>({
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null,
    inp: null,
    memoryUsage: null,
    frameRate: 60,
    longTasks: 0,
  });

  healthScore = signal<'good' | 'needs-improvement' | 'poor'>('good');
  isMonitoring = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      this.initWebVitalsObservers();
      this.startFrameRateMonitoring();
      this.initLongTaskObserver();
    }
  }

  private initWebVitalsObservers(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    // FCP Observer
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntriesByName('first-contentful-paint');
        if (entries.length > 0) {
          const fcp = entries[0].startTime;
          this.updateMetric('fcp', fcp);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch {
      // Observer not supported
    }

    // LCP Observer
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const lcp = entries[entries.length - 1].startTime;
          this.updateMetric('lcp', lcp);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // Observer not supported
    }

    // FID Observer
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[];
        if (entries.length > 0) {
          const fid = entries[0].processingStart - entries[0].startTime;
          this.updateMetric('fid', fid);
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch {
      // Observer not supported
    }

    // CLS Observer
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        for (const entry of entries) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        this.updateMetric('cls', clsValue);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Observer not supported
    }

    // TTFB from Navigation Timing
    try {
      const navObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceNavigationTiming[];
        if (entries.length > 0) {
          const ttfb = entries[0].responseStart - entries[0].requestStart;
          this.updateMetric('ttfb', Math.max(0, ttfb));
        }
      });
      navObserver.observe({ type: 'navigation', buffered: true });
    } catch {
      // Observer not supported
    }

    // INP Observer (Event timing)
    try {
      let maxDuration = 0;
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        for (const entry of entries) {
          const duration = entry.duration;
          if (duration > maxDuration) {
            maxDuration = duration;
            this.updateMetric('inp', duration);
          }
        }
      });
      inpObserver.observe({ type: 'event', buffered: true });
    } catch {
      // Observer not supported
    }
  }

  private initLongTaskObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        this.longTaskCount += list.getEntries().length;
        this.updateMetric('longTasks', this.longTaskCount);
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      // Long task observer not supported
    }
  }

  private startFrameRateMonitoring(): void {
    if (typeof requestAnimationFrame === 'undefined') return;

    this.isMonitoring.set(true);

    const measureFrame = (timestamp: number) => {
      if (this.lastFrameTime > 0) {
        const delta = timestamp - this.lastFrameTime;
        const fps = Math.round(1000 / delta);

        this.frameRateSamples.push(fps);
        if (this.frameRateSamples.length > 60) {
          this.frameRateSamples.shift();
        }

        const avgFps = Math.round(
          this.frameRateSamples.reduce((a, b) => a + b, 0) /
            this.frameRateSamples.length
        );
        this.updateMetric('frameRate', Math.min(avgFps, 144));
      }

      this.lastFrameTime = timestamp;

      // Run outside Angular zone to avoid change detection
      this.ngZone.runOutsideAngular(() => {
        this.rafId = requestAnimationFrame(measureFrame);
      });
    };

    this.ngZone.runOutsideAngular(() => {
      this.rafId = requestAnimationFrame(measureFrame);
    });
  }

  private updateMetric(
    key: keyof PerformanceMetrics,
    value: number | null
  ): void {
    this.ngZone.run(() => {
      this.metrics.update((current) => ({
        ...current,
        [key]: value,
      }));
      this.recalculateHealthScore();
    });
  }

  private recalculateHealthScore(): void {
    const m = this.metrics();
    let goodCount = 0;
    let poorCount = 0;
    let total = 0;

    const checkMetric = (
      value: number | null,
      threshold: { good: number; needsImprovement: number }
    ) => {
      if (value === null) return;
      total++;
      if (value <= threshold.good) goodCount++;
      else if (value > threshold.needsImprovement) poorCount++;
    };

    checkMetric(m.fcp, this.thresholds.fcp);
    checkMetric(m.lcp, this.thresholds.lcp);
    checkMetric(m.fid, this.thresholds.fid);
    checkMetric(m.cls, this.thresholds.cls);
    checkMetric(m.ttfb, this.thresholds.ttfb);
    checkMetric(m.inp, this.thresholds.inp);

    if (total === 0) {
      this.healthScore.set('good');
      return;
    }

    const goodRatio = goodCount / total;
    const poorRatio = poorCount / total;

    if (goodRatio >= 0.75) {
      this.healthScore.set('good');
    } else if (poorRatio >= 0.25) {
      this.healthScore.set('poor');
    } else {
      this.healthScore.set('needs-improvement');
    }
  }

  /**
   * Gets current memory usage if available.
   */
  getMemoryUsage(): number | null {
    if (typeof performance === 'undefined') return null;

    const memory = (performance as any).memory;
    if (!memory) return null;

    const usedMB = Math.round(memory.usedJSHeapSize / (1024 * 1024));
    this.updateMetric('memoryUsage', usedMB);
    return usedMB;
  }

  /**
   * Measures the execution time of a function.
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    this.logger.info(`Performance [${name}]: ${duration.toFixed(2)}ms`);
    return { result, duration };
  }

  /**
   * Creates a performance mark.
   */
  mark(name: string): void {
    if (typeof performance?.mark === 'function') {
      performance.mark(name);
    }
  }

  /**
   * Measures between two marks.
   */
  measure(name: string, startMark: string, endMark?: string): number | null {
    if (typeof performance?.measure !== 'function') return null;

    try {
      const measure = performance.measure(name, startMark, endMark);
      return measure.duration;
    } catch {
      return null;
    }
  }

  /**
   * Gets a summary of current performance metrics.
   */
  getSummary(): {
    metrics: PerformanceMetrics;
    health: string;
    recommendations: string[];
  } {
    const m = this.metrics();
    const recommendations: string[] = [];

    if (m.lcp && m.lcp > this.thresholds.lcp.needsImprovement) {
      recommendations.push(
        'LCP is slow. Consider optimizing large images and blocking resources.'
      );
    }
    if (m.fid && m.fid > this.thresholds.fid.needsImprovement) {
      recommendations.push(
        'FID is high. Break up long tasks and optimize JavaScript execution.'
      );
    }
    if (m.cls && m.cls > this.thresholds.cls.needsImprovement) {
      recommendations.push(
        'CLS is high. Set explicit dimensions for images and dynamic content.'
      );
    }
    if (m.frameRate < 30) {
      recommendations.push(
        'Frame rate is low. Reduce DOM complexity or enable Performance Mode.'
      );
    }
    if (m.longTasks > 10) {
      recommendations.push(
        'Many long tasks detected. Consider code splitting and lazy loading.'
      );
    }

    return {
      metrics: m,
      health: this.healthScore(),
      recommendations,
    };
  }

  /**
   * Stops frame rate monitoring.
   */
  stopMonitoring(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isMonitoring.set(false);
  }
}
