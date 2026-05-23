import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TouchGestureService {
  zoomLevel = signal(1.0);

  handlePinch(event: TouchEvent) {
    if (event.touches.length === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      // Implementation logic for zoom scaling
      return distance;
    }
    return null;
  }
}
