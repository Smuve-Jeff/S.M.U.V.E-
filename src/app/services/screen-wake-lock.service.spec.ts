import { TestBed } from '@angular/core/testing';
import { ScreenWakeLockService } from './screen-wake-lock.service';

type FakeSentinel = {
  release: jest.Mock;
  addEventListener: jest.Mock;
  listeners: Record<string, () => void>;
};

describe('ScreenWakeLockService', () => {
  let service: ScreenWakeLockService;

  const createSentinel = (): FakeSentinel => {
    const listeners: Record<string, () => void> = {};
    return {
      release: jest.fn(() => Promise.resolve()),
      addEventListener: jest.fn((type: string, cb: () => void) => {
        listeners[type] = cb;
      }),
      listeners,
    };
  };

  const setWakeLock = (
    request?: jest.Mock | ((type: string) => Promise<FakeSentinel>)
  ): jest.Mock => {
    const requestMock = jest.isMockFunction(request)
      ? request
      : jest.fn(request as (type: string) => Promise<FakeSentinel>);
    Object.defineProperty(navigator, 'wakeLock', {
      value: request ? { request: requestMock } : undefined,
      configurable: true,
    });
    return requestMock;
  };

  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScreenWakeLockService);
  });

  afterEach(() => {
    setWakeLock(undefined);
  });

  it('degrades to a no-op when the Screen Wake Lock API is absent', () => {
    setWakeLock(undefined);

    expect(service.supported).toBe(false);
    expect(() => service.request()).not.toThrow();
    expect(service.active()).toBe(false);
  });

  it('acquires a screen wake lock while wanted', async () => {
    const sentinel = createSentinel();
    const request = setWakeLock(() => Promise.resolve(sentinel));

    service.request();
    await flush();

    expect(request).toHaveBeenCalledWith('screen');
    expect(service.active()).toBe(true);
  });

  it('releases the held lock when the session ends', async () => {
    const sentinel = createSentinel();
    setWakeLock(() => Promise.resolve(sentinel));

    service.request();
    await flush();
    service.release();

    expect(sentinel.release).toHaveBeenCalled();
    expect(service.active()).toBe(false);
  });

  it('releases a lock that resolves after the session already ended', async () => {
    const sentinel = createSentinel();
    let resolveRequest!: (value: FakeSentinel) => void;
    setWakeLock(
      () =>
        new Promise<FakeSentinel>((resolve) => {
          resolveRequest = resolve;
        })
    );

    service.request();
    service.release();
    resolveRequest(sentinel);
    await flush();

    expect(sentinel.release).toHaveBeenCalled();
    expect(service.active()).toBe(false);
  });

  it('clears state when the OS releases the lock', async () => {
    const sentinel = createSentinel();
    setWakeLock(() => Promise.resolve(sentinel));

    service.request();
    await flush();
    sentinel.listeners['release']();

    expect(service.active()).toBe(false);
  });

  it('re-acquires the lock when the page becomes visible while wanted', async () => {
    const first = createSentinel();
    const second = createSentinel();
    const request = setWakeLock(
      jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    );

    service.request();
    await flush();
    // The browser auto-releases wake locks when the page hides.
    first.listeners['release']();

    setVisibility('visible');
    await flush();

    expect(request).toHaveBeenCalledTimes(2);
    expect(service.active()).toBe(true);
  });

  it('does not re-acquire once the session has ended', async () => {
    const sentinel = createSentinel();
    const request = setWakeLock(() => Promise.resolve(sentinel));

    service.request();
    await flush();
    service.release();

    setVisibility('visible');
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
    expect(service.active()).toBe(false);
  });
});
