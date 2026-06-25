import { Injectable, signal, computed } from '@angular/core';

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
  readonly minZoom = 0.5;
  readonly maxZoom = 4.0;
  readonly swipeThreshold = 40;
  readonly swipeVelocityThreshold = 0.2;
  
  zoomLevel = signal(1.0);
  verticalZoomLevel = signal(1.0);
  isSwipeActive = signal(false);
  lastSwipe = signal<SwipeEvent | null>(null);
  
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private lastPinchDistance = 0;
  private lastPinchCenterY = 0;

  handlePinch(event: TouchEvent): number | null {
    if (event.touches.length !== 2) {
      this.lastPinchDistance = 0;
      return null;
    }

    const touch1 = event.touches[0];
    const touch2 = event.touches[1];

    // Distance for horizontal zoom
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const distance = Math.hypot(dx, dy);

    // Center point for vertical zoom reference
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    if (this.lastPinchDistance > 0) {
      const scale = distance / this.lastPinchDistance;

      // Horizontal zoom
      this.adjustZoom((scale - 1) * 0.8);

      // Vertical zoom if pinch is more vertical
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
         const vScale = Math.abs(dy) / (this.lastPinchDistance || 1);
         this.adjustVerticalZoom((vScale - 1) * 0.5);
      }
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

  adjustVerticalZoom(delta: number) {
    this.verticalZoomLevel.set(this.clamp(this.verticalZoomLevel() + delta));
  }

  resetZoom() {
    this.zoomLevel.set(1);
    this.verticalZoomLevel.set(1);
  }

  private clamp(value: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, value));
  }
}
