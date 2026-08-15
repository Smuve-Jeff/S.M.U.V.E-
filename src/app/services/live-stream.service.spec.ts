import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { LiveStreamService } from './live-stream.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';
import { SocialNetworkingService } from './social-networking.service';

/**
 * Capture-input mocks — one set per test to keep state boundary clean.
 * We deliberately stub window globals through providers (clipboard +
 * popup) so this spec stays jsdom-safe.
 */
const httpCalls: Array<{
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}> = [];
const httpResponses: any[] = [];
let tokenRef: { value: string | null } = { value: null };
let profileRef: {
  value: { id: string; artistName: string };
} = { value: { id: '', artistName: 'Anonymous' } };
const updateStatusCalls: any[] = [];
const openedPopups: Array<{ url: string; target: string; features: string }> =
  [];
const messageListeners: Array<(event: any) => void> = [];
let clipboardWrite: jest.Mock;
let clipboardAvailable = true;
let originalOpen: any;

const httpStub = {
  post: jest.fn((url: string, body?: unknown, options?: any) => {
    httpCalls.push({ method: 'POST', url, body, headers: options?.headers });
    if (httpResponses.length === 0) return of(null);
    const next = httpResponses.shift();
    return next === undefined ? of(null) : of(next);
  }),
  get: jest.fn((url: string, options?: any) => {
    httpCalls.push({ method: 'GET', url, headers: options?.headers });
    if (httpResponses.length === 0) return of(null);
    const next = httpResponses.shift();
    return next === undefined ? of(null) : of(next);
  }),
};

beforeEach(() => {
  TestBed.resetTestingModule();
  clipboardWrite = jest.fn(async (_t: string) => undefined);
  clipboardAvailable = true;
  httpCalls.length = 0;
  httpResponses.length = 0;
  updateStatusCalls.length = 0;
  openedPopups.length = 0;
  messageListeners.length = 0;
  tokenRef = { value: null };
  profileRef = { value: { id: '', artistName: 'Anonymous' } };

  // Patch `navigator.clipboard` + `setTimeout` semantics via a small
  // per-test overlay. We use a Spy through the global window object —
  // this works in jsdom because navigator is a settable property.
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: clipboardAvailable
      ? { writeText: clipboardWrite }
      : undefined,
  });
  originalOpen = window.open;
  window.open = jest.fn((url: string, target?: string, features?: string) => {
    openedPopups.push({ url, target: target ?? '', features: features ?? '' });
    return { closed: false, focus: jest.fn() };
  }) as any;

  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  window.addEventListener = (name: string, fn: any) => {
    if (name === 'message') {
      messageListeners.push(fn);
      return;
    }
    return originalAdd(name, fn);
  };
  window.removeEventListener = (name: string, fn: any) => {
    if (name === 'message') {
      const idx = messageListeners.indexOf(fn);
      if (idx >= 0) messageListeners.splice(idx, 1);
      return;
    }
    return originalRemove(name, fn);
  };

  TestBed.configureTestingModule({
    providers: [
      LiveStreamService,
      { provide: HttpClient, useValue: httpStub },
      {
        provide: TokenService,
        useValue: { jwtToken: () => tokenRef.value },
      },
      {
        provide: UserProfileService,
        useValue: { profile: () => profileRef.value },
      },
      { provide: NotificationService, useValue: { show: jest.fn() } },
      { provide: HapticService, useValue: { light: jest.fn(), medium: jest.fn() } },
      {
        provide: SocialNetworkingService,
        useValue: {
          updateStatus: (meta: unknown) => updateStatusCalls.push(meta),
        },
      },
    ],
  });
});

afterEach(() => {
  // Restore the popup opener so other specs aren't affected.
  if (originalOpen) window.open = originalOpen;
});

describe('LiveStreamService', () => {
  let service: LiveStreamService;

  describe('golive', () => {
    it('requires a token + profile id; toasts LOGIN otherwise', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: null };
      profileRef = { value: { id: '', artistName: 'Anonymous' } };
      const result = await service.golive({ platform: 'twitch' });
      expect(result).toBeNull();
      expect(httpCalls).toEqual([]);
      expect(messageListeners).toEqual([]);
    });

    it('issues a server row, opens popup, sets currentStream', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      const row = {
        id: 1,
        shareToken: 'tok',
        hostId: '77',
        hostDisplayName: 'JEFF',
        platform: 'twitch',
        gameId: 'halo',
        lobbyId: 'split_xyz',
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: 'https://x',
      };
      httpResponses.push(row);
      const result = await service.golive({
        platform: 'twitch',
        gameId: 'halo',
        lobbyId: 'split_xyz',
        payload: { level: 3 },
      });
      expect(result).toEqual(row);
      expect(httpCalls).toHaveLength(1);
      expect(httpCalls[0]).toMatchObject({
        method: 'POST',
        url: expect.stringContaining('/api/users/77/live-streams'),
      });
      expect(httpCalls[0].headers?.Authorization).toBe('Bearer TKN');
      expect(openedPopups).toEqual([
        { url: expect.stringContaining('/auth/twitch'), target: expect.any(String), features: expect.any(String) },
      ]);
      expect(service.currentStream()).toEqual({ ...row, active: true });
      expect(updateStatusCalls).toEqual([
        expect.objectContaining({ live: true, livePlatform: 'twitch' }),
      ]);
    });

    it('returns null + toasts on POST error', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpStub.post.mockReturnValueOnce(
        throwError(() => ({ status: 500 }))
      );
      const result = await service.golive({ platform: 'kick' });
      expect(result).toBeNull();
      expect(service.currentStream()).toBeNull();
      expect(openedPopups).toEqual([]);
    });

    it('finalizes when the popup posts back success', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push({
        id: 1,
        shareToken: 'tok',
        hostId: '77',
        hostDisplayName: 'JEFF',
        platform: 'twitch',
        gameId: null,
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: 'https://x',
      });
      await service.golive({ platform: 'twitch' });
      expect(messageListeners.length).toBe(1);
      messageListeners[0](
        new MessageEvent('message', {
          data: { type: 'TWITCH_AUTH_SUCCESS', platform: 'twitch' },
        })
      );
      expect(service.currentStream()?.active).toBe(true);
      expect(messageListeners.length).toBe(0); // listener self-removed
    });
  });

  describe('endStream', () => {
    it('POSTs end, clears currentStream, updates status', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service.currentStream.set({
        id: 1,
        shareToken: 'tok',
        hostId: '77',
        hostDisplayName: null,
        platform: 'twitch',
        gameId: null,
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: 'https://x',
      });
      httpResponses.push({ success: true, streamId: 1 });
      const ok = await service.endStream();
      expect(ok).toBe(true);
      expect(httpCalls[0]).toMatchObject({
        method: 'POST',
        url: expect.stringContaining('/users/77/live-streams/end'),
      });
      expect(service.currentStream()).toBeNull();
      expect(updateStatusCalls.at(-1)).toEqual({ live: false });
    });

    it('returns false when no profile id', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '', artistName: 'Anonymous' } };
      const ok = await service.endStream();
      expect(ok).toBe(false);
      expect(httpCalls).toEqual([]);
    });
  });

  describe('peekViewerToken / redeemViewerToken', () => {
    it('peek sets inboundPreview on a 200, null on error', async () => {
      service = TestBed.inject(LiveStreamService);
      const row = {
        id: 1,
        shareToken: 'tok',
        hostId: 'h',
        hostDisplayName: null,
        platform: 'twitch',
        gameId: null,
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: 'https://x',
      };
      httpResponses.push(row);
      const peek = await service.peekViewerToken('tok');
      expect(peek).toEqual(row);
      expect(service.inboundPreview()).toEqual(row);

      httpStub.get.mockReturnValueOnce(throwError(() => ({ status: 404 })));
      const peekErr = await service.peekViewerToken('tok');
      expect(peekErr).toBeNull();
      expect(service.inboundPreview()).toBeNull();
    });

    it('redeem returns the row and increments the inbound preview', async () => {
      service = TestBed.inject(LiveStreamService);
      const row = {
        id: 1,
        shareToken: 'tok',
        hostId: 'h',
        hostDisplayName: null,
        platform: 'twitch',
        gameId: null,
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 1,
        shareUrl: 'https://x',
      };
      httpResponses.push(row);
      const result = await service.redeemViewerToken('tok');
      expect(result).toEqual(row);
      expect(httpCalls[0]).toMatchObject({
        method: 'POST',
        url: expect.stringContaining('/live-streams/join/tok/redeem'),
      });
      expect(service.inboundPreview()).toEqual(row);
    });
  });

  describe('copyShareUrl', () => {
    it('returns false when no currentStream', async () => {
      service = TestBed.inject(LiveStreamService);
      const ok = await service.copyShareUrl();
      expect(ok).toBe(false);
      expect(clipboardWrite).not.toHaveBeenCalled();
    });

    it('writes the shareUrl via clipboard when navigator.clipboard is available', async () => {
      service = TestBed.inject(LiveStreamService);
      service.currentStream.set({
        id: 1,
        shareToken: 'tok',
        hostId: 'h',
        hostDisplayName: null,
        platform: 'twitch',
        gameId: null,
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: 'https://smuvejeffpresents.com/tha-spot?live=tok',
      });
      const ok = await service.copyShareUrl(true);
      expect(ok).toBe(true);
      expect(clipboardWrite).toHaveBeenCalledWith(
        'https://smuvejeffpresents.com/tha-spot?live=tok'
      );
    });

    it('falls back to legacy textarea when navigator.clipboard is unavailable', async () => {
      clipboardAvailable = false;
      // jsdom does not implement the legacy copy command; stub it so the
      // textarea fallback path can be exercised end-to-end.
      (document as any).execCommand = jest.fn(() => true);
      TestBed.resetTestingModule();
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
      TestBed.configureTestingModule({
        providers: [
          LiveStreamService,
          { provide: HttpClient, useValue: httpStub },
          { provide: TokenService, useValue: { jwtToken: () => 'TKN' } },
          {
            provide: UserProfileService,
            useValue: { profile: () => ({ id: '77', artistName: 'JEFF' }) },
          },
          { provide: NotificationService, useValue: { show: jest.fn() } },
          { provide: HapticService, useValue: { light: jest.fn(), medium: jest.fn() } },
          {
            provide: SocialNetworkingService,
            useValue: { updateStatus: () => undefined },
          },
        ],
      });
      service = TestBed.inject(LiveStreamService);
      service.currentStream.set({
        id: 1,
        shareToken: 'tok',
        hostId: 'h',
        hostDisplayName: null,
        platform: 'twitch',
        gameId: null,
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: 'https://x',
      });
      const ok = await service.copyShareUrl(true);
      expect(ok).toBe(true);
    });
  });
});
