import { LoggingService } from './logging.service';
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorHandler implements ErrorHandler {
  private logger = inject(LoggingService);
  private notificationService = inject(NotificationService);

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
      !message.includes('ExpressionChangedAfterItHasBeenCheckedError')
    ) {
      // Suppress noisy Angular development warnings but show real logical errors
      this.notificationService.show(
        'System Anomaly Detected: ' + message.substring(0, 50) + '...',
        'warning'
      );
    }

    this.logger.warn(
      'Attempting executive system recovery for error:',
      message
    );
  }
}
