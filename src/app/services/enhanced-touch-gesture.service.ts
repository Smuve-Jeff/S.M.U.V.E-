import { Injectable, signal } from '@angular/core';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeEvent {
  direction: SwipeDirection;
  distance: number;
  velocity: number;
  duration: number;
}

@Injectable({
  providedIn: 'root',
})
export class EnhancedTouchGestureService {
  readonly minZoom = 0.75;
  readonly maxZoom = 2.5;
  readonly swipeThreshold = 50;
  readonly swipeVelocityThreshold = 0.3;
  
  zoomLevel = signal(1.0);
  isSwipeActive = signal(false);
  lastSwipe = signal<SwipeEvent | null>(null);
  
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private lastPinchDistance = 0;

  handlePinch(event: TouchEvent): number | null {
    if (event.touches.length !== 2) {
      this.lastPinchDistance = 0;
      return null;
    }

    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    const distance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
    
    if (this.lastPinchDistance > 0) {
      const scale = distance / this.lastPinchDistance;
      this.adjustZoom((scale - 1) * 0.5);
    }
    
    this.lastPinchDistance = distance;
    return distance;
  }

  handleSwipeStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.touchStartTime = Date.now();
      this.isSwipeActive.set(true);
    }
  }

  handleSwipeEnd(event: TouchEvent): SwipeEvent | null {
    if (event.changedTouches.length !== 1) {
      this.isSwipeActive.set(false);
      return null;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    const duration = Date.now() - this.touchStartTime;
    
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const distance = Math.max(absX, absY);
    const velocity = distance / duration;

    this.isSwipeActive.set(false);

    if (distance < this.swipeThreshold || velocity < this.swipeVelocityThreshold) {
      return null;
    }

    let direction: SwipeDirection;
    if (absX > absY) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    const swipeEvent: SwipeEvent = {
      direction,
      distance,
      velocity,
      duration
    };

    this.lastSwipe.set(swipeEvent);
    return swipeEvent;
  }

  setZoom(level: number) {
    this.zoomLevel.set(this.clamp(level));
  }

  adjustZoom(delta: number) {
    this.setZoom(this.zoomLevel() + delta);
  }

  resetZoom() {
    this.zoomLevel.set(1);
  }

  private clamp(value: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, value));
  }
}
