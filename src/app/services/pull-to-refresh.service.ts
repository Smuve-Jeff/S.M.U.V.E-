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

  attach(element: HTMLElement, config: PullToRefreshConfig) {
    this.config = config;
    
    element.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
    element.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    element.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
    
    return () => {
      element.removeEventListener('touchstart', this.onTouchStart.bind(this));
      element.removeEventListener('touchmove', this.onTouchMove.bind(this));
      element.removeEventListener('touchend', this.onTouchEnd.bind(this));
    };
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
