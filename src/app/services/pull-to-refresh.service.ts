import { Injectable, signal } from '@angular/core';

export interface PullToRefreshConfig {
  threshold?: number;
  maxPull?: number;
  onRefresh: () => Promise<void>;
}

@Injectable({
  providedIn: 'root',
})
export class PullToRefreshService {
  isRefreshing = signal(false);
  pullDistance = signal(0);

  private startY = 0;
  private currentY = 0;
  private isPulling = false;
  private config: PullToRefreshConfig | null = null;

  /*
   * Stable handler references. `addEventListener(type, this.onTouchStart.bind(this))`
   * allocates a brand-new function on every call, so the teardown closure was
   * removing a reference the browser had never seen — every attach/detach cycle
   * left its listeners live, and a detached element kept driving this service's
   * shared pull state. Bind once, then add and remove the exact same function.
   */
  private readonly handleTouchStart = (e: TouchEvent) => this.onTouchStart(e);
  private readonly handleTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private readonly handleTouchEnd = () => void this.onTouchEnd();
  private readonly handleTouchCancel = () => this.resetPull();

  attach(element: HTMLElement, config: PullToRefreshConfig) {
    this.config = config;

    element.addEventListener('touchstart', this.handleTouchStart, {
      passive: true,
    });
    element.addEventListener('touchmove', this.handleTouchMove, {
      passive: false,
    });
    element.addEventListener('touchend', this.handleTouchEnd, {
      passive: true,
    });
    // Android hands the gesture to the browser on an overscroll or a system
    // gesture takeover: without this the pull stayed half-applied forever.
    element.addEventListener('touchcancel', this.handleTouchCancel, {
      passive: true,
    });

    return () => {
      element.removeEventListener('touchstart', this.handleTouchStart);
      element.removeEventListener('touchmove', this.handleTouchMove);
      element.removeEventListener('touchend', this.handleTouchEnd);
      element.removeEventListener('touchcancel', this.handleTouchCancel);
      this.resetPull();
    };
  }

  private resetPull() {
    this.isPulling = false;
    this.pullDistance.set(0);
  }

  private onTouchStart(e: TouchEvent) {
    const scrollTop = (e.target as HTMLElement).scrollTop;
    if (scrollTop === 0) {
      this.startY = e.touches[0].clientY;
      this.isPulling = true;
    }
  }

  private onTouchMove(e: TouchEvent) {
    if (!this.isPulling || this.isRefreshing()) return;

    this.currentY = e.touches[0].clientY;
    const delta = this.currentY - this.startY;

    if (delta > 0) {
      e.preventDefault();
      const maxPull = this.config?.maxPull || 120;
      const resistance = 0.5;
      const pull = Math.min(delta * resistance, maxPull);
      this.pullDistance.set(pull);
    }
  }

  private async onTouchEnd() {
    if (!this.isPulling) return;

    this.isPulling = false;
    const threshold = this.config?.threshold || 60;

    if (this.pullDistance() >= threshold && !this.isRefreshing()) {
      this.isRefreshing.set(true);

      try {
        if (this.config?.onRefresh) {
          await this.config.onRefresh();
        }
      } finally {
        this.isRefreshing.set(false);
        this.pullDistance.set(0);
      }
    } else {
      this.pullDistance.set(0);
    }
  }
}
