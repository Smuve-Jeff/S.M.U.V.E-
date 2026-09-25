import { LoggingService } from './logging.service';
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';

/** How long one identical anomaly stays suppressed before it may toast again. */
const ANOMALY_REPEAT_WINDOW_MS = 10_000;

/**
 * Failures that are a media or third-party element being torn down, not a
 * fault in the app.
 *
 * Every one of these is a browser rejecting an operation on a resource that
 * was already gone: a video whose source was swapped mid-play, a fetch aborted
 * by navigation, an observer resized during teardown. They are always logged,
 * never toasted — otherwise a route change can stack a dozen identical
 * "System Anomaly Detected" cards over the UI and bury the real fault.
 */
const TEARDOWN_NOISE = [
  'AbortError',
  'NotAllowedError',
  'NotSupportedError',
  'The element has no supported sources',
  'The play() request was interrupted',
  'play() failed because the user',
  'The MediaSource is not open',
  'ResizeObserver loop',
  'ResizeObserver loop completed with undelivered notifications',
  'NG0913',
  'Script error.',
  'removeChild',
  'Failed to execute .removeChild. on Node',
  'net::ERR_ABORTED',
  'NetworkError when attempting to fetch resource',
  'The operation was aborted',
  'Unable to preventDefault inside passive event listener',
];

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorHandler implements ErrorHandler {
  private logger = inject(LoggingService);
  private notificationService = inject(NotificationService);

  /**
   * Last toasted anomaly and when, so a fault that repeats every frame toasts
   * once instead of once per frame.
   */
  private lastAnomaly = '';
  private lastAnomalyAt = 0;

  handleError(error: any): void {
    this.logger.error('S.M.U.V.E 2.0 Critical System Error:', error);

    /*
     * Angular hands this handler whatever was thrown, which includes
     * null/undefined (a rejected promise with no reason) and bare objects.
     * Reading `.message` off those threw a TypeError *inside the error
     * handler*, masking the original failure behind a reporting bug.
     */
    const message =
      error && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : String(error);

    // User-facing notification for critical errors
    if (message.includes('AudioContext') || message.includes('MediaDevices')) {
      this.notificationService.show(
        'Hardware Access Error: Check your mic/speaker permissions.',
        'error'
      );
    } else if (
      !message.includes('ExpressionChangedAfterItHasBeenCheckedError') &&
      !this.isTeardownNoise(message)
    ) {
      // Suppress noisy Angular development warnings but show real logical errors
      this.toastAnomaly(message);
    }

    this.logger.warn(
      'Attempting executive system recovery for error:',
      message
    );
  }

  /**
   * Teardown noise is always logged and never shown: it is the sound of a
   * discarded media element, not of a broken app.
   */
  private isTeardownNoise(message: string): boolean {
    return TEARDOWN_NOISE.some((pattern) => message.includes(pattern));
  }

  /**
   * Toasts a real anomaly once per repeat window.
   *
   * The same fault arriving many times a second is one problem, not many, and
   * the toast queue has no dedupe of its own — so without this a single
   * runaway loop buries the interface under identical cards. A *different*
   * anomaly always gets through immediately; only a repeat of the one already
   * on screen is held back.
   */
  private toastAnomaly(message: string): void {
    const now = Date.now();
    const isRepeat =
      message === this.lastAnomaly &&
      now - this.lastAnomalyAt < ANOMALY_REPEAT_WINDOW_MS;

    if (isRepeat) {
      this.logger.warn('Anomaly already on screen, not repeating toast:', message);
      return;
    }

    this.lastAnomaly = message;
    this.lastAnomalyAt = now;
    this.notificationService.show(
      'System Anomaly Detected: ' + message.substring(0, 50) + '...',
      'warning'
    );
  }
}
