import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TouchGestureService {
  readonly minZoom = 0.75;
  readonly maxZoom = 2.5;
  zoomLevel = signal(1.0);

  handlePinch(event: TouchEvent) {
    if (event.touches.length !== 2) {
      return null;
    }

    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    return Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
  }

  setZoom(level: number) {
    this.zoomLevel.set(this.clamp(level));
  }

  adjustZoom(delta: number) {
    this.setZoom(this.zoomLevel() + delta);
  }

  applyPinch(previousDistance: number, nextDistance: number) {
    if (!previousDistance || !nextDistance) {
      return;
    }

    this.setZoom(this.zoomLevel() * (nextDistance / previousDistance));
  }

  resetZoom() {
    this.zoomLevel.set(1);
  }

  private clamp(value: number) {
    return Math.min(this.maxZoom, Math.max(this.minZoom, value));
  }
}
