import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class HapticService {
  private enabled = true;

  vibrate(pattern: number | number[]) {
    if (this.enabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignore errors
      }
    }
  }

  impact(style: 'light' | 'medium' | 'heavy') {
    switch (style) {
      case 'light':
        this.light();
        break;
      case 'medium':
        this.medium();
        break;
      case 'heavy':
        this.heavy();
        break;
    }
  }

  light() {
    this.vibrate(10);
  }

  medium() {
    this.vibrate(20);
  }

  heavy() {
    this.vibrate(40);
  }

  success() {
    this.vibrate([10, 30, 10]);
  }

  warning() {
    this.vibrate([20, 50, 20]);
  }

  error() {
    this.vibrate([50, 100, 50, 100, 50]);
  }

  beat() {
    this.vibrate(5);
  }
}
