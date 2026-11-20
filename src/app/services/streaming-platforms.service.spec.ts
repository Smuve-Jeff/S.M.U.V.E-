import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { SnackbarService } from './snackbar.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { StreamingPlatformsService } from './streaming-platforms.service';

describe('StreamingPlatformsService', () => {
  let service: StreamingPlatformsService;
  let http: {
    post: jest.Mock;
    get: jest.Mock;
    put: jest.Mock;
    delete: jest.Mock;
  };
  let snackbar: {
    show: jest.Mock;
    info: jest.Mock;
    success: jest.Mock;
    warning: jest.Mock;
    error: jest.Mock;
  };
  let openedPopups: Array<{ url: string; target: string; features: string }>;
  let messageListeners: Array<(event: MessageEvent) => void>;
  let popup: { closed: boolean; close: jest.Mock; focus: jest.Mock };
  let originalOpen: typeof window.open;
  let originalAdd: typeof window.addEventListener;
  let originalRemove: typeof window.removeEventListener;

  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    openedPopups = [];
    messageListeners = [];
    popup = { closed: false, close: jest.fn(), focus: jest.fn() };
    http = {
      post: jest.fn(() =>
        of({ authorizeUrl: 'https://auth.example/twitch' })
      ),
      get: jest.fn(() => of({ connections: [] })),
      put: jest.fn(() => of({})),
      delete: jest.fn(() => of({})),
    };
    snackbar = {
      show: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    };

    originalOpen = window.open;
    window.open = jest.fn(
      (url: string, target?: string, features?: string) => {
        openedPopups.push({
          url,
          target: target ?? '',
          features: features ?? '',
        });
        return popup as unknown as Window;
      }
    ) as unknown as typeof window.open;

    originalAdd = window.addEventListener.bind(window);
    originalRemove = window.removeEventListener.bind(window);
    window.addEventListener = ((name: string, fn: any) => {
      if (name === 'message') {
        messageListeners.push(fn);
        return;
      }
      return originalAdd(name, fn);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((name: string, fn: any) => {
      if (name === 'message') {
        const index = messageListeners.indexOf(fn);
        if (index >= 0) messageListeners.splice(index, 1);
        return;
      }
      return originalRemove(name, fn);
    }) as typeof window.removeEventListener;

    TestBed.configureTestingModule({
      providers: [
        StreamingPlatformsService,
        { provide: HttpClient, useValue: http },
        { provide: SnackbarService, useValue: snackbar },
        { provide: TokenService, useValue: { jwtToken: () => 'TKN' } },
        {
          provide: UserProfileService,
          useValue: { profile: signal({ id: '' }) },
        },
      ],
    });
    service = TestBed.inject(StreamingPlatformsService);
  });

  afterEach(() => {
    window.open = originalOpen;
    window.addEventListener = originalAdd;
    window.removeEventListener = originalRemove;
    jest.useRealTimers();
  });

  const dispatch = (
    data: unknown,
    origin = window.location.origin
  ): void => {
    messageListeners.forEach((listener) =>
      listener(new MessageEvent('message', { data, origin }))
    );
  };

  it('posts the authorize route with the session token and opens the popup', async () => {
    const pending = service.connectAndWait('twitch');
    await flush();

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/stream-accounts/twitch/authorize'),
      {},
      expect.objectContaining({
        headers: { Authorization: 'Bearer TKN' },
      })
    );
    expect(openedPopups).toEqual([
      expect.objectContaining({
        url: 'https://auth.example/twitch',
        target: 'twitch Auth',
      }),
    ]);
    expect(messageListeners).toHaveLength(1);

    dispatch({ type: 'TWITCH_AUTH_SUCCESS' });

    await expect(pending).resolves.toBe(true);
    // The listener must not outlive the round it belongs to.
    expect(messageListeners).toHaveLength(0);
  });

  it('ignores a provider callback from a foreign origin', async () => {
    let settled = false;
    const pending = service.connectAndWait('twitch').then((value) => {
      settled = true;
      return value;
    });
    await flush();

    dispatch({ type: 'TWITCH_AUTH_SUCCESS' }, 'https://evil.example');
    await flush();
    expect(settled).toBe(false);
    expect(messageListeners).toHaveLength(1);

    dispatch({ type: 'TWITCH_AUTH_SUCCESS' });
    await expect(pending).resolves.toBe(true);
  });

  it('returns false and surfaces the provider refusal message', async () => {
    const pending = service.connectAndWait('twitch');
    await flush();

    dispatch({ type: 'TWITCH_AUTH_FAILED', message: 'denied' });

    await expect(pending).resolves.toBe(false);
    expect(snackbar.warning).toHaveBeenCalledWith('DENIED');
  });

  it('returns false when the popup is blocked', async () => {
    (window.open as jest.Mock).mockReturnValueOnce(null);

    await expect(service.connectAndWait('twitch')).resolves.toBe(false);

    expect(snackbar.warning).toHaveBeenCalledWith(
      expect.stringContaining('POPUP BLOCKED')
    );
    expect(messageListeners).toHaveLength(0);
  });

  it('returns false without opening a window when the URL is missing', async () => {
    http.post.mockReturnValueOnce(of({}));

    await expect(service.connectAndWait('twitch')).resolves.toBe(false);

    expect(window.open).not.toHaveBeenCalled();
    expect(snackbar.warning).toHaveBeenCalledWith(
      expect.stringContaining('AUTH UNAVAILABLE')
    );
  });

  it('describes an authorize HTTP failure instead of opening a window', async () => {
    http.post.mockReturnValueOnce(
      throwError(() => ({ status: 401, error: { error: 'login expired' } }))
    );

    await expect(service.connectAndWait('twitch')).resolves.toBe(false);

    expect(window.open).not.toHaveBeenCalled();
    expect(snackbar.error).toHaveBeenCalledWith('LOGIN EXPIRED');
  });

  it('refuses platforms without an OAuth implementation', async () => {
    await expect(service.connectAndWait('tiktok')).resolves.toBe(false);

    expect(http.post).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('cancels a waiting popup, closes it and resolves false', async () => {
    jest.useFakeTimers();
    const pending = service.connectAndWait('twitch');
    await flush();
    expect(openedPopups).toHaveLength(1);

    service.cancelPendingAuthorization();
    jest.advanceTimersByTime(800);

    await expect(pending).resolves.toBe(false);
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(messageListeners).toHaveLength(0);
  });

  it('does not open a popup when cancelled during the authorize request', async () => {
    const authorize = new Subject<{ authorizeUrl: string }>();
    http.post.mockReturnValueOnce(authorize.asObservable());

    const pending = service.connectAndWait('twitch');
    await flush();
    service.cancelPendingAuthorization();

    authorize.next({ authorizeUrl: 'https://auth.example/twitch' });
    authorize.complete();

    await expect(pending).resolves.toBe(false);
    expect(window.open).not.toHaveBeenCalled();
    expect(snackbar.error).not.toHaveBeenCalled();
  });

  it('connect() reloads accounts and announces success', async () => {
    http.get.mockReturnValueOnce(
      of({
        connections: [
          {
            platform: 'twitch',
            displayName: 'SmuveJeff',
            connectedAt: new Date().toISOString(),
            lastSyncedAt: new Date().toISOString(),
          },
        ],
      })
    );

    const pending = service.connect('twitch');
    await flush();
    dispatch({ type: 'TWITCH_AUTH_SUCCESS' });
    await pending;

    expect(service.connecting()).toBeNull();
    expect(service.connections().twitch?.displayName).toBe('SmuveJeff');
    expect(snackbar.success).toHaveBeenCalledWith('TWITCH CONNECTED');
  });

  it('connect() clears its busy state after a refused popup', async () => {
    (window.open as jest.Mock).mockReturnValueOnce(null);

    await service.connect('twitch');

    expect(service.connecting()).toBeNull();
    expect(snackbar.success).not.toHaveBeenCalled();
  });

  it('connect() explains when a platform has no connect flow', async () => {
    await service.connect('tiktok');

    expect(snackbar.info).toHaveBeenCalledWith(
      'TIKTOK CONNECT IS NOT AVAILABLE YET'
    );
    expect(http.post).not.toHaveBeenCalled();
  });
});
