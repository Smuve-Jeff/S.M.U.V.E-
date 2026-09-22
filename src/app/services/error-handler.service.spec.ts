import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { appConfig } from '../app.config';
import { GlobalErrorHandler } from './error-handler.service';
import { LoggingService } from './logging.service';
import { NotificationService } from './notification.service';

describe('GlobalErrorHandler', () => {
  let service: GlobalErrorHandler;
  let notifications: NotificationService;
  let logger: LoggingService;
  let show: jest.SpyInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GlobalErrorHandler);
    notifications = TestBed.inject(NotificationService);
    logger = TestBed.inject(LoggingService);

    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    show = jest.spyOn(notifications, 'show').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /*
   * The whole service was dead code: implemented ErrorHandler but was never
   * provided, so Angular fell back to its built-in console-only handler.
   */
  it('is registered as the application ErrorHandler', () => {
    const provider = appConfig.providers.find(
      (entry: unknown) =>
        !!entry &&
        typeof entry === 'object' &&
        (entry as { provide?: unknown }).provide === ErrorHandler
    ) as { provide: unknown; useClass: unknown } | undefined;

    expect(provider).toBeDefined();
    expect(provider?.useClass).toBe(GlobalErrorHandler);
  });

  it('always logs the failure through LoggingService', () => {
    const error = new Error('database went sideways');

    service.handleError(error);

    expect(logger.error).toHaveBeenCalledWith(
      'S.M.U.V.E 2.0 Critical System Error:',
      error
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('calls out hardware access problems specifically', () => {
    service.handleError(new Error('AudioContext was not allowed to start'));

    expect(show).toHaveBeenCalledWith(
      'Hardware Access Error: Check your mic/speaker permissions.',
      'error'
    );
  });

  it('treats MediaDevices failures as hardware problems too', () => {
    service.handleError(new Error('MediaDevices.getUserMedia denied'));

    expect(show).toHaveBeenCalledWith(
      'Hardware Access Error: Check your mic/speaker permissions.',
      'error'
    );
  });

  it('surfaces other logical errors as warnings', () => {
    service.handleError(new Error('unexpected null project'));

    expect(show).toHaveBeenCalledWith(
      'System Anomaly Detected: unexpected null project...',
      'warning'
    );
  });

  /* Noise suppression is deliberate, not an oversight. */
  it('stays quiet for ExpressionChangedAfterItHasBeenCheckedError', () => {
    service.handleError(
      new Error('ExpressionChangedAfterItHasBeenCheckedError: previous value')
    );

    expect(show).not.toHaveBeenCalled();
  });

  /* Thrown non-Error values still have to reach the user. */
  it('handles a thrown string', () => {
    service.handleError('boom');

    expect(logger.error).toHaveBeenCalledWith(
      'S.M.U.V.E 2.0 Critical System Error:',
      'boom'
    );
    expect(show).toHaveBeenCalledWith(
      'System Anomaly Detected: boom...',
      'warning'
    );
  });

  it('truncates a long message so the toast stays readable', () => {
    service.handleError(new Error('x'.repeat(200)));

    const [message] = show.mock.calls[0];
    expect(message).toBe(`System Anomaly Detected: ${'x'.repeat(50)}...`);
  });

  /*
   * Angular can hand the handler a rejection with no reason at all; reading
   * `.message` off undefined used to throw from inside the handler itself,
   * hiding the original failure behind a reporting bug.
   */
  it.each([undefined, null, 42, { notAMessage: true }])(
    'survives a thrown non-Error value (%p)',
    (thrown) => {
      expect(() => service.handleError(thrown)).not.toThrow();
      expect(show).toHaveBeenCalled();
    }
  );
});
