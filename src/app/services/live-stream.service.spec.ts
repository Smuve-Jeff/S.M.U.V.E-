import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { GO_LIVE_PLATFORMS, LiveStreamService } from './live-stream.service';
import { BroadcastIngestService } from './broadcast-ingest.service';
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
const socketConnectedSignal = signal(false);
let presenceExtras: (() => Record<string, unknown>) | null = null;
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
  patch: jest.fn((url: string, body?: unknown, options?: any) => {
    httpCalls.push({ method: 'PATCH', url, body, headers: options?.headers });
    return of(null);
  }),
};

/** One canonical wire row so new lifecycle tests stay readable. */
const makeRow = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

beforeEach(() => {
  TestBed.resetTestingModule();
  try {
    sessionStorage.clear();
    localStorage.removeItem('smuve.live.viewerId');
  } catch {
    /* storage is not available in some runners */
  }
  clipboardWrite = jest.fn(async (_t: string) => undefined);
  clipboardAvailable = true;
  httpCalls.length = 0;
  httpResponses.length = 0;
  updateStatusCalls.length = 0;
  socketConnectedSignal.set(false);
  presenceExtras = null;
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
          startStream: jest.fn(async () => undefined),
          stopStream: jest.fn(),
          setPresenceExtrasProvider: (fn: any) => {
            presenceExtras = fn;
          },
          liveNow: jest.fn(() => []),
          blockedUsers: signal([]),
          socketConnected: socketConnectedSignal,
          getSocket: jest.fn(() => undefined),
        },
      },
      {
        provide: BroadcastIngestService,
        useValue: {
          load: jest.fn(async () => undefined),
          ready: jest.fn(() => true),
          start: jest.fn(async () => true),
          stop: jest.fn(async () => undefined),
          state: signal('idle'),
          activeRelayId: signal(null),
          primeAudioContext: jest.fn(),
          closePrimedAudioContext: jest.fn(),
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

    const flush = async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    const social = () => TestBed.inject(SocialNetworkingService);
    const ingest = () => TestBed.inject(BroadcastIngestService);

    it('offers only the platforms with a working broadcast path', () => {
      expect(GO_LIVE_PLATFORMS).toEqual([
        'smuve',
        'twitch',
        'kick',
        'facebook',
        'custom',
      ]);
      expect(GO_LIVE_PLATFORMS).not.toContain('youtube');
      expect(GO_LIVE_PLATFORMS).not.toContain('tiktok');
    });

    it('rejects a legacy platform before touching the API or a camera', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };

      expect(await service.golive({ platform: 'youtube' })).toBeNull();
      expect(await service.golive({ platform: 'tiktok' })).toBeNull();

      expect(httpCalls).toEqual([]);
      expect(social().startStream).not.toHaveBeenCalled();
      expect(service.pendingGolive()).toBeNull();
    });

    it('starts a native S.M.U.V.E broadcast without a popup and claims this tab', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'smuve', gameId: 'halo' }));

      const result = await service.golive({
        platform: 'smuve',
        gameId: 'halo',
      });

      expect(result).not.toBeNull();
      expect(openedPopups).toEqual([]);
      expect(messageListeners).toEqual([]);
      expect(service.pendingGolive()).toBeNull();
      expect(service.currentStream()?.active).toBe(true);
      expect(service.ownsBroadcast()).toBe(true);
      expect(social().startStream).toHaveBeenCalledWith('smuve');
      expect(ingest().start).not.toHaveBeenCalled();
      expect(updateStatusCalls.at(-1)).toEqual(
        expect.objectContaining({ live: true, livePlatform: 'smuve' }),
      );
    });

    it('authorizes Twitch first, then issues the row and starts the push', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push({ authorizeUrl: 'https://auth.example/twitch' });
      httpResponses.push(makeRow({ platform: 'twitch', gameId: 'halo' }));

      const pending = service.golive({ platform: 'twitch', gameId: 'halo' });
      await flush();

      expect(httpCalls).toHaveLength(1);
      expect(httpCalls[0]).toMatchObject({
        method: 'POST',
        url: expect.stringContaining('/stream-accounts/twitch/authorize'),
      });
      expect(httpCalls[0].headers?.Authorization).toBe('Bearer TKN');
      expect(openedPopups).toHaveLength(1);
      expect(openedPopups[0].url).toBe('https://auth.example/twitch');
      expect(service.pendingGolive()).toBe('twitch');
      expect(service.currentStream()).toBeNull();

      messageListeners[0](
        new MessageEvent('message', {
          data: { type: 'TWITCH_AUTH_SUCCESS' },
          origin: 'http://localhost',
        }),
      );
      const result = await pending;

      expect(result).not.toBeNull();
      expect(httpCalls[1].url).toContain('/users/77/live-streams');
      expect(httpCalls[1].url).not.toContain('/auth/twitch');
      expect(service.currentStream()?.active).toBe(true);
      expect(service.ownsBroadcast()).toBe(true);
      expect(social().startStream).toHaveBeenCalledWith('twitch');
      expect(ingest().start).toHaveBeenCalledWith(['twitch']);
    });

    it('does not issue a row when the Twitch popup is blocked', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push({ authorizeUrl: 'https://auth.example/twitch' });
      (window.open as jest.Mock).mockReturnValueOnce(null);

      const result = await service.golive({ platform: 'twitch' });

      expect(result).toBeNull();
      expect(httpCalls).toHaveLength(1);
      expect(httpCalls[0].url).toContain('/stream-accounts/twitch/authorize');
      expect(service.currentStream()).toBeNull();
      expect(service.pendingGolive()).toBeNull();
      expect(social().startStream).not.toHaveBeenCalled();
    });

    it('primes the mixer before the first GO LIVE auth request', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push({ authorizeUrl: 'https://auth.example/twitch' });
      (window.open as jest.Mock).mockReturnValueOnce(null);
      const ingest = TestBed.inject(BroadcastIngestService);
      const prime = ingest.primeAudioContext as jest.Mock;
      let primedBeforeAuth = false;
      const basePost = httpStub.post.getMockImplementation();
      httpStub.post.mockImplementationOnce((...args: any[]) => {
        primedBeforeAuth = prime.mock.calls.length > 0;
        return basePost!.apply(httpStub, args);
      });

      expect(await service.golive({ platform: 'twitch' })).toBeNull();

      expect(prime).toHaveBeenCalledTimes(1);
      expect(primedBeforeAuth).toBe(true);
      expect(ingest.closePrimedAudioContext).toHaveBeenCalledTimes(1);
    });

    it('does not issue a row when Twitch authorization fails', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push({ authorizeUrl: 'https://auth.example/twitch' });

      const pending = service.golive({ platform: 'twitch' });
      await flush();
      messageListeners[0](
        new MessageEvent('message', {
          data: { type: 'TWITCH_AUTH_FAILED', message: 'denied' },
          origin: 'http://localhost',
        }),
      );

      expect(await pending).toBeNull();
      expect(httpCalls).toHaveLength(1);
      expect(service.currentStream()).toBeNull();
      expect(service.pendingGolive()).toBeNull();
      expect(social().startStream).not.toHaveBeenCalled();
    });

    it('refuses Kick before issuing when no destination is saved', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      ingest().ready.mockReturnValueOnce(false);

      const result = await service.golive({ platform: 'kick' });

      expect(result).toBeNull();
      expect(httpCalls).toEqual([]);
      expect(service.currentStream()).toBeNull();
      expect(service.pendingGolive()).toBeNull();
      expect(social().startStream).not.toHaveBeenCalled();
      expect(ingest().closePrimedAudioContext).toHaveBeenCalledTimes(1);
    });

    it('stops a provider push that went live before a later GO LIVE step failed', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'kick' }));
      const ingest = TestBed.inject(BroadcastIngestService) as any;
      (ingest.start as jest.Mock).mockImplementationOnce(async () => {
        ingest.state.set('live');
        return true;
      });
      jest
        .spyOn(service, 'copyShareUrl')
        .mockRejectedValueOnce(new Error('clipboard failed'));

      expect(await service.golive({ platform: 'kick' })).toBeNull();

      expect(ingest.stop).toHaveBeenCalledTimes(1);
      expect(social().stopStream).toHaveBeenCalled();
      expect(service.currentStream()).toBeNull();
    });

    it('issues a Facebook row after the saved-destination preflight and starts the push', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'facebook' }));

      const result = await service.golive({ platform: 'facebook' });

      expect(result).not.toBeNull();
      expect(openedPopups).toEqual([]);
      expect(httpCalls).toHaveLength(1);
      expect(httpCalls[0].url).toContain('/users/77/live-streams');
      expect(ingest().load).toHaveBeenCalled();
      expect(ingest().start).toHaveBeenCalledWith(['facebook']);
    });

    it('issues a Kick row after the saved-destination preflight and starts the push', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'kick' }));

      const result = await service.golive({ platform: 'kick' });

      expect(result).not.toBeNull();
      expect(openedPopups).toEqual([]);
      expect(httpCalls).toHaveLength(1);
      expect(httpCalls[0].url).toContain('/users/77/live-streams');
      expect(ingest().load).toHaveBeenCalled();
      expect(ingest().start).toHaveBeenCalledWith(['kick']);
    });

    it('issues one session and one relay fan-out for multiple destinations', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(
        makeRow({
          platform: 'smuve',
          destinations: [
            { platform: 'smuve', status: 'live', relayId: null, error: null },
            { platform: 'kick', status: 'pending', relayId: null, error: null },
            { platform: 'facebook', status: 'pending', relayId: null, error: null },
          ],
        }),
      );

      const result = await service.golive({
        platform: 'smuve',
        destinations: ['smuve', 'kick', 'facebook'],
      });

      expect(result).not.toBeNull();
      expect(httpCalls[0].body).toMatchObject({
        platform: 'smuve',
        destinations: ['smuve', 'kick', 'facebook'],
      });
      expect(social().startStream).toHaveBeenCalledWith('smuve');
      expect(ingest().start).toHaveBeenCalledWith(['kick', 'facebook']);
    });

    it('returns null + rolls back a failed native row', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpStub.post.mockReturnValueOnce(throwError(() => ({ status: 500 })));

      const result = await service.golive({ platform: 'kick' });

      expect(result).toBeNull();
      expect(service.currentStream()).toBeNull();
      expect(service.ownsBroadcast()).toBe(false);
      expect(openedPopups).toEqual([]);
    });});

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
      // Ending the stream must release the local camera/mic capture.
      expect(TestBed.inject(SocialNetworkingService).stopStream).toHaveBeenCalled();
    });

    it('returns false when no profile id', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '', artistName: 'Anonymous' } };
      const ok = await service.endStream();
      expect(ok).toBe(false);
      expect(httpCalls).toEqual([]);
      // Local capture is still released even without a profile id, so a
      // stranded stream never leaves the camera on.
      expect(TestBed.inject(SocialNetworkingService).stopStream).toHaveBeenCalled();
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

    it('opens the viewer surface from the token when the peek fails', () => {
      service = TestBed.inject(LiveStreamService);
      service.inboundPreview.set(null);

      service.openInboundFallback('tok_fallback');

      const preview = service.inboundPreview();
      expect(preview?.shareToken).toBe('tok_fallback');
      expect(preview?.platform).toBe('smuve');
      expect(preview?.active).toBe(true);
    });

    it('does not overwrite a resolved preview for the same token', () => {
      service = TestBed.inject(LiveStreamService);
      service.inboundPreview.set({
        id: 9,
        shareToken: 'tok_known',
        hostId: 'h',
        hostDisplayName: 'NOVA',
        platform: 'twitch',
        gameId: 'tekken',
        lobbyId: null,
        payload: {},
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 3,
        shareUrl: 'https://x',
      });

      service.openInboundFallback('tok_known');

      expect(service.inboundPreview()?.hostDisplayName).toBe('NOVA');
      expect(service.inboundPreview()?.viewerJoins).toBe(3);
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


    it('sends the signed-in viewer id with the redeem', async () => {
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service = TestBed.inject(LiveStreamService);
      httpResponses.push(null);

      await service.redeemViewerToken('tok');

      expect(service.viewerIdentity()).toBe('user:77');
      expect(httpCalls[0].body).toEqual({ viewerId: 'user:77' });
    });

    it('uses one stable guest id, never an IP, for a share-link viewer', async () => {
      localStorage.setItem('smuve.live.viewerId', 'guest-uuid');
      service = TestBed.inject(LiveStreamService);
      httpResponses.push(null);

      await service.redeemViewerToken('tok');

      expect(service.viewerIdentity()).toBe('guest:guest-uuid');
      expect(httpCalls[0].body).toEqual({ viewerId: 'guest:guest-uuid' });
      // The socket redeem call must send this exact identity too.
      expect(service.viewerIdentity()).toBe('guest:guest-uuid');
    });});

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
            useValue: {
              updateStatus: () => undefined,
              setPresenceExtrasProvider: () => undefined,
            },
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

  describe('socket directory updates', () => {
    it('refetches immediately on live_stream_started and live_stream_ended', async () => {
      const handlers = new Map<string, () => void>();
      const socket = {
        connected: true,
        on: jest.fn((event: string, fn: () => void) => {
          handlers.set(event, fn);
        }),
        off: jest.fn(),
      };
      const social = TestBed.inject(SocialNetworkingService) as any;
      socketConnectedSignal.set(true);
      social.getSocket.mockReturnValue(socket);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };

      service = TestBed.inject(LiveStreamService);
      TestBed.flushEffects();

      expect(handlers.has('live_stream_started')).toBe(true);
      expect(handlers.has('live_stream_ended')).toBe(true);
      expect(handlers.has('live_directory_changed')).toBe(true);

      httpResponses.push([]);
      handlers.get('live_stream_started')!();
      await Promise.resolve();
      await Promise.resolve();

      expect(
        httpCalls.filter((call) =>
          call.url.includes('/live-streams/active')
        )
      ).toHaveLength(1);

      httpResponses.push([]);
      handlers.get('live_stream_ended')!();
      await Promise.resolve();
      await Promise.resolve();

      expect(
        httpCalls.filter((call) =>
          call.url.includes('/live-streams/active')
        )
      ).toHaveLength(2);
    });
  });

  describe('reconnect catch-up', () => {
    it('fetches the directory once when the socket reconnects after an outage', async () => {
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      const social = TestBed.inject(SocialNetworkingService) as any;
      socketConnectedSignal.set(false);
      social.getSocket.mockReturnValue(undefined);

      service = TestBed.inject(LiveStreamService);
      TestBed.flushEffects();

      social.getSocket.mockReturnValue({
        connected: true,
        on: jest.fn(),
        off: jest.fn(),
      });
      httpResponses.push([]);
      socketConnectedSignal.set(true);
      TestBed.flushEffects();
      await Promise.resolve();
      await Promise.resolve();

      expect(
        httpCalls.filter((call) =>
          call.url.includes('/live-streams/active')
        )
      ).toHaveLength(1);

      // Staying connected does not keep polling.
      TestBed.flushEffects();
      await Promise.resolve();
      expect(
        httpCalls.filter((call) =>
          call.url.includes('/live-streams/active')
        )
      ).toHaveLength(1);
    });
  });

  describe('active stream directory', () => {
    it('loads active streams and merges presence without duplicates', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      const social = TestBed.inject(SocialNetworkingService) as any;
      social.liveNow.mockReturnValue([
        { userId: '99', artistName: 'RIVAL', live: true, liveShareToken: 'tok-1' },
        {
          userId: '100',
          artistName: 'PEER',
          live: true,
          liveShareToken: 'tok-2',
          livePlatform: 'smuve',
          liveGameId: 'mk2',
        },
        {
          userId: '101',
          artistName: 'STALE',
          live: false,
          liveShareToken: 'tok-3',
        },
      ]);
      httpResponses.push([
        makeRow({
          shareToken: 'tok-1',
          hostId: '99',
          hostDisplayName: 'RIVAL',
          platform: 'smuve',
          gameId: 'halo',
          viewerJoins: 3,
        }),
      ]);

      await service.loadActiveStreams();

      expect(httpCalls.at(-1)).toMatchObject({
        method: 'GET',
        url: expect.stringContaining('/api/live-streams/active'),
      });
      const directory = service.liveDirectory();
      expect(directory).toHaveLength(2);
      expect(directory[0]).toMatchObject({
        shareToken: 'tok-1',
        hostName: 'RIVAL',
        viewerJoins: 3,
      });
      expect(directory[1]).toMatchObject({
        shareToken: 'tok-2',
        hostName: 'PEER',
        gameId: 'mk2',
      });
    });

    it("never lists this host's own stream", async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push([
        makeRow({ shareToken: 'mine', hostId: '77', active: true }),
      ]);

      await service.loadActiveStreams();

      expect(service.liveDirectory()).toEqual([]);
    });
  });

  describe('blocked hosts in the directory', () => {
    it('hides active streams from blocked users', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      const social = TestBed.inject(SocialNetworkingService) as any;
      social.blockedUsers.set([{ userId: '99', artistName: 'BLOCKED' }]);
      httpResponses.push([
        makeRow({ shareToken: 'blocked-tok', hostId: '99', active: true }),
        makeRow({ shareToken: 'visible-tok', hostId: '101', active: true }),
      ]);

      await service.loadActiveStreams();

      expect(service.liveDirectory().map((entry) => entry.shareToken)).toEqual([
        'visible-tok',
      ]);
    });
  });

  describe('presence identity', () => {
    it('publishes the live identity with presence registration', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(
        makeRow({ platform: 'smuve', shareToken: 'live-tok', gameId: 'halo' })
      );

      await service.golive({ platform: 'smuve', gameId: 'halo' });

      expect(presenceExtras?.()).toEqual({
        live: true,
        livePlatform: 'smuve',
        liveShareToken: 'live-tok',
        liveGameId: 'halo',
      });
    });

    it('drops the live fields once the stream ends', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'smuve' }));
      await service.golive({ platform: 'smuve' });
      httpResponses.push({ success: true, streamId: 1 });

      await service.endStream();

      expect(presenceExtras?.()).toEqual({});
    });
  });

  describe('smuve native broadcast', () => {
    it('rolls back the native row when capture is stopped mid-start', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      const social = TestBed.inject(SocialNetworkingService);
      httpResponses.push(makeRow({ platform: 'smuve' }));
      httpResponses.push({ success: true, streamId: 1 });
      social.startStream.mockResolvedValueOnce(false);

      const result = await service.golive({ platform: 'smuve' });

      expect(result).toBeNull();
      expect(service.currentStream()).toBeNull();
      expect(service.pendingGolive()).toBeNull();
      expect(social.stopStream).toHaveBeenCalled();
      expect(httpCalls.some((call) => call.url.endsWith('/live-streams/end'))).toBe(
        true,
      );
    });

    it('starts without an OAuth popup and stays live', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'smuve', gameId: 'halo' }));
      const social = TestBed.inject(SocialNetworkingService);

      const result = await service.golive({ platform: 'smuve', gameId: 'halo' });

      expect(result).not.toBeNull();
      expect(openedPopups).toEqual([]);
      expect(messageListeners).toEqual([]);
      expect(service.pendingGolive()).toBeNull();
      expect(service.currentStream()?.active).toBe(true);
      expect(social.startStream).toHaveBeenCalledWith('smuve');
      expect(updateStatusCalls.at(-1)).toEqual(
        expect.objectContaining({ live: true, livePlatform: 'smuve' })
      );
    });
  });

  describe('restoreActiveStream', () => {

    it('ignores a row the server has already ended', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ active: false }));

      await service.restoreActiveStream();

      expect(service.currentStream()).toBeNull();
      expect(
        TestBed.inject(SocialNetworkingService).startStream
      ).not.toHaveBeenCalled();
    });

    it('restarts capture in the owning tab after a reload', async () => {
      sessionStorage.setItem('smuve.live.hostToken', 'tok');
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'smuve' }));

      await service.restoreActiveStream();

      expect(service.currentStream()?.platform).toBe('smuve');
      expect(service.ownsBroadcast()).toBe(true);
      expect(
        TestBed.inject(SocialNetworkingService).startStream,
      ).toHaveBeenCalledWith('smuve');
    });

    it('restarts the provider push in the owning tab after a reload', async () => {
      sessionStorage.setItem('smuve.live.hostToken', 'tok');
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'kick' }));

      await service.restoreActiveStream();

      const ingest = TestBed.inject(BroadcastIngestService);
      expect(ingest.load).toHaveBeenCalled();
      expect(ingest.start).toHaveBeenCalledWith(['kick']);
    });

    it('does not start a competing capture in a tab that does not own the broadcast', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      httpResponses.push(makeRow({ platform: 'smuve' }));

      await service.restoreActiveStream();

      expect(service.currentStream()?.active).toBe(true);
      expect(service.ownsBroadcast()).toBe(false);
      expect(
        TestBed.inject(SocialNetworkingService).startStream,
      ).not.toHaveBeenCalled();

      await service.resumeBroadcastHere();

      expect(service.ownsBroadcast()).toBe(true);
      expect(
        TestBed.inject(SocialNetworkingService).startStream,
      ).toHaveBeenCalledWith('smuve');
    });

    it('primes the mixer before resuming a provider push', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service.currentStream.set(makeRow({ platform: 'kick' }));
      const ingest = TestBed.inject(BroadcastIngestService);
      const prime = ingest.primeAudioContext as jest.Mock;
      let primedBeforeStart = false;
      (TestBed.inject(SocialNetworkingService).startStream as jest.Mock)
        .mockImplementationOnce(async () => {
          primedBeforeStart = prime.mock.calls.length > 0;
        });

      expect(await service.resumeBroadcastHere()).toBe(true);

      expect(primedBeforeStart).toBe(true);
      expect(prime).toHaveBeenCalledTimes(1);
      expect(ingest.start).toHaveBeenCalledWith(['kick']);
    });

    it('returns false when the provider push fails to resume', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service.currentStream.set(makeRow({ platform: 'kick' }));
      const ingest = TestBed.inject(BroadcastIngestService);
      (ingest.start as jest.Mock).mockResolvedValueOnce(false);
      const notify = TestBed.inject(NotificationService) as any;
      const haptic = TestBed.inject(HapticService) as any;
      const social = TestBed.inject(SocialNetworkingService);

      expect(await service.resumeBroadcastHere()).toBe(false);

      expect(notify.show).not.toHaveBeenCalledWith(
        'BROADCAST RESUMED IN THIS TAB',
        'success',
      );
      expect(haptic.medium).not.toHaveBeenCalled();
      expect(service.ownsBroadcast()).toBe(false);
      expect(social.stopStream).toHaveBeenCalled();
      expect(updateStatusCalls.at(-1)).toEqual({ live: false });
    });

    it('does not start a Twitch push when re-authorization is refused', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service.currentStream.set(makeRow({ platform: 'twitch' }));
      httpResponses.push({ authorizeUrl: 'https://auth.example/twitch' });
      (window.open as jest.Mock).mockReturnValueOnce(null);
      const ingest = TestBed.inject(BroadcastIngestService);
      const social = TestBed.inject(SocialNetworkingService);
      (ingest.ready as jest.Mock).mockReturnValueOnce(false);

      expect(await service.resumeBroadcastHere()).toBe(false);

      expect(ingest.start).not.toHaveBeenCalled();
      expect(ingest.closePrimedAudioContext).toHaveBeenCalledTimes(1);
      expect(service.ownsBroadcast()).toBe(false);
      expect(social.stopStream).toHaveBeenCalled();
      expect(updateStatusCalls.at(-1)).toEqual({ live: false });
    });

    it('closes the primed mixer when the capture restart fails before WHIP', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service.currentStream.set(makeRow({ platform: 'kick' }));
      const ingest = TestBed.inject(BroadcastIngestService);
      (
        TestBed.inject(SocialNetworkingService).startStream as jest.Mock
      ).mockRejectedValueOnce(new Error('capture failed'));

      await expect(service.resumeBroadcastHere()).rejects.toThrow(
        'capture failed',
      );

      expect(ingest.primeAudioContext).toHaveBeenCalledTimes(1);
      expect(ingest.closePrimedAudioContext).toHaveBeenCalledTimes(1);
      expect(
        TestBed.inject(SocialNetworkingService).stopStream,
      ).toHaveBeenCalled();
      expect(updateStatusCalls.at(-1)).toEqual({ live: false });
    });});

  describe('endStream when the server row is already gone', () => {
    it('treats a 404 as already ended instead of a failure', async () => {
      service = TestBed.inject(LiveStreamService);
      tokenRef = { value: 'TKN' };
      profileRef = { value: { id: '77', artistName: 'JEFF' } };
      service.currentStream.set(makeRow());
      httpStub.post.mockReturnValueOnce(throwError(() => ({ status: 404 })));

      const ok = await service.endStream();

      expect(ok).toBe(true);
      expect(service.currentStream()).toBeNull();
    });
  });


  describe('cancelled auth', () => {
    it('never issues a row when the auth window closes', async () => {
      jest.useFakeTimers();
      try {
        service = TestBed.inject(LiveStreamService);
        tokenRef = { value: 'TKN' };
        profileRef = { value: { id: '77', artistName: 'JEFF' } };
        const popup: any = { closed: false, focus: jest.fn() };
        (window.open as jest.Mock).mockReturnValueOnce(popup);
        httpResponses.push({ authorizeUrl: 'https://auth.example/twitch' });

        const pending = service.golive({ platform: 'twitch' });
        for (let i = 0; i < 8; i++) await Promise.resolve();

        expect(service.pendingGolive()).toBe('twitch');
        expect(httpCalls).toHaveLength(1);

        popup.closed = true;
        jest.advanceTimersByTime(800);

        expect(await pending).toBeNull();
        expect(httpCalls).toHaveLength(1);
        expect(service.currentStream()).toBeNull();
        expect(service.pendingGolive()).toBeNull();
        expect(
          TestBed.inject(SocialNetworkingService).stopStream,
        ).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });});
