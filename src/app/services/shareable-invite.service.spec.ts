import { of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';

class FakeSignal<T> {
  private v: T;
  constructor(initial: T) {
    this.v = initial;
  }
  set(value: T) {
    this.v = value;
  }
  update(fn: (cur: T) => T) {
    this.v = fn(this.v);
  }
  /** Read snapshot. */
  snapshot(): T {
    return this.v;
  }
}

const lastIssuedRef: { value: any } = { value: null };
const inboundSignalRef: { value: any } = {
  value: {
    gameId: null,
    mode: null,
    inviteToken: null,
    fromUserId: null,
    toUserId: null,
    hasLink: false,
  },
};

const tokenSignalRef: { value: string | null } = { value: null };

// Capture-input mocks: provide minimal HttpClient + APP_SECURITY_CONFIG stubs.
const httpCalls: Array<{ method: string; url: string; body?: unknown; headers?: Record<string, string> }> = [];
const httpResponses: any[] = [];

const httpStub = {
  post: jest.fn((url: string, body?: unknown, options?: any) => {
    httpCalls.push({ method: 'POST', url, body, headers: options?.headers });
    if (httpResponses.length === 0) return of(null);
    const next = httpResponses.shift();
    return next === undefined ? of(null) : of(next);
  }),
  get: jest.fn((url: string, _options?: any) => {
    httpCalls.push({ method: 'GET', url });
    if (httpResponses.length === 0) return of(null);
    const next = httpResponses.shift();
    return next === undefined ? of(null) : of(next);
  }),
};

jest.mock('../app.security', () => ({
  APP_SECURITY_CONFIG: { api_url: 'http://localhost:3000/api', socket_url: 'http://localhost:3000' },
}));

import { TestBed } from '@angular/core/testing';
import { ShareableInviteService, InviteMode } from './shareable-invite.service';
import { TokenService } from './token.service';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';

const notifyMock = { show: jest.fn() };
const hapticMock = { light: jest.fn(), medium: jest.fn() };

describe('ShareableInviteService', () => {
  let service: ShareableInviteService;
  let originSpy: jest.SpyInstance;
  let clipboardWriteText: jest.Mock;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ShareableInviteService,
        { provide: HttpClient, useValue: httpStub },
        {
          provide: TokenService,
          useValue: {
            // jwtToken is a signal-like getter
            jwtToken: () => tokenSignalRef.value,
          },
        },
        { provide: NotificationService, useValue: notifyMock },
        { provide: HapticService, useValue: hapticMock },
      ],
    });
    httpCalls.length = 0;
    httpResponses.length = 0;
    notifyMock.show.mockReset();
    hapticMock.light.mockReset();
    clipboardWriteText = jest.fn(async (text: string) => undefined);
    // jsdom's window.location is non-configurable, so pin the share origin
    // through the service accessor instead of redefining window.location.
    originSpy = jest
      .spyOn(ShareableInviteService.prototype as any, 'shareOrigin', 'get')
      .mockReturnValue('https://smuvejeffpresents.com');
    Object.defineProperty(global, 'navigator', {
      value: {
        clipboard: { writeText: clipboardWriteText },
      },
      writable: true,
      configurable: true,
    });
    tokenSignalRef.value = null;
    service = TestBed.inject(ShareableInviteService);
    lastIssuedRef.value = null;
    inboundSignalRef.value = {
      gameId: null,
      mode: null,
      inviteToken: null,
      fromUserId: null,
      toUserId: null,
      hasLink: false,
    };
  });

  afterEach(() => {
    originSpy.mockRestore();
  });

  describe('parseFromCurrentUrl', () => {
    it('extracts game, mode, invite, from, to', () => {
      const result = service.parseFromCurrentUrl(
        'https://smuvejeffpresents.com/tha-spot?game=battlefield&mode=co-op&invite=tok&from=42&to=99'
      );
      expect(result.gameId).toBe('battlefield');
      expect(result.mode).toBe('co-op');
      expect(result.inviteToken).toBe('tok');
      expect(result.fromUserId).toBe('42');
      expect(result.toUserId).toBe('99');
      expect(result.hasLink).toBe(true);
    });

    it('ignores unsupported modes', () => {
      const result = service.parseFromCurrentUrl(
        'https://smuvejeffpresents.com/tha-spot?game=x&mode=moon-gravity'
      );
      expect(result.mode).toBeNull();
      // hasLink should still be true because gameId is present
      expect(result.hasLink).toBe(true);
    });

    it('flags hasLink=false when no relevant params are present', () => {
      const result = service.parseFromCurrentUrl(
        'https://smuvejeffpresents.com/tha-spot?other=12'
      );
      expect(result.hasLink).toBe(false);
    });
  });

  describe('buildPublicShareUrl / buildDeepLink', () => {
    it('round-trips public URL params', () => {
      const url = service.buildPublicShareUrl({
        gameId: 'halo',
        mode: 'split-screen' as InviteMode,
        inviteToken: 'tok_x',
        fromUserId: '42',
      });
      expect(url).toMatch(/^\https:\/\/smuvejeffpresents\.com\/tha-spot\?/);
      expect(url).toMatch(/game=halo/);
      expect(url).toMatch(/mode=split-screen/);
      expect(url).toMatch(/invite=tok_x/);
      expect(url).toMatch(/from=42/);
    });

    it('buildDeepLink returns the path-only form', () => {
      const path = service.buildDeepLink({
        gameId: 'g',
        mode: 'online',
      });
      expect(path.startsWith('/tha-spot?')).toBe(true);
    });

    it('buildShareIntent includes fromName in the text', () => {
      const intent = service.buildShareIntent({
        gameId: 'battlefield',
        gameName: 'Tha Battlefield',
        mode: 'co-op',
        fromName: 'JEFF',
      });
      expect(intent.title).toMatch(/Tha Battlefield/);
      expect(intent.text).toMatch(/JEFF/);
      expect(intent.url).toMatch(/mode=co-op/);
    });
  });

  describe('copy / share', () => {
    it('copies via navigator.clipboard and surfaces a success toast', async () => {
      const intent = service.buildShareIntent({
        gameId: 'g',
        mode: 'online',
      });
      const ok = await service.copy(intent);
      expect(ok).toBe(true);
      expect(clipboardWriteText).toHaveBeenCalledWith(intent.url);
      expect(notifyMock.show).toHaveBeenCalledWith(
        expect.stringContaining('COPIED'),
        'success'
      );
    });

    it('share() falls back to clipboard when navigator.share is unavailable', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { clipboard: { writeText: clipboardWriteText } },
        writable: true,
        configurable: true,
      });
      const intent = service.buildShareIntent({
        gameId: 'g',
        mode: 'online',
      });
      const result = await service.share(intent);
      expect(result.shared).toBe(false);
      expect(result.url).toBe(intent.url);
      expect(clipboardWriteText).toHaveBeenCalledWith(intent.url);
    });

    it('share() returns shared=true when native share succeeds', async () => {
      const shareFn = jest.fn(async () => undefined);
      Object.defineProperty(global, 'navigator', {
        value: {
          share: shareFn,
          clipboard: { writeText: clipboardWriteText },
        },
        writable: true,
        configurable: true,
      });
      const intent = service.buildShareIntent({
        gameId: 'g',
        mode: 'online',
      });
      const result = await service.share(intent);
      expect(result.shared).toBe(true);
      expect(shareFn).toHaveBeenCalledWith({
        title: intent.title,
        text: intent.text,
        url: intent.url,
      });
    });
  });

  describe('peekServerInvite', () => {
    it('returns the row on 200', async () => {
      const row = {
        id: 1,
        token: 'tok',
        gameId: 'g',
        mode: 'online',
        createdById: '42',
        targetUserId: null,
        payload: {},
        expiresAt: new Date().toISOString(),
        consumedAt: null,
        consumedById: null,
        revoked: false,
        shareUrl: 'https://x',
      };
      httpResponses.push(row);
      const result = await service.peekServerInvite('tok');
      expect(result).toEqual(row);
      expect(httpCalls[0]).toMatchObject({
        method: 'GET',
        url: expect.stringContaining('/api/games/invites/tok'),
      });
    });

    it('returns null on 404', async () => {
      httpStub.get.mockReturnValueOnce(throwError(() => ({ status: 404 })));
      const result = await service.peekServerInvite('tok');
      expect(result).toBeNull();
    });
  });

  describe('redeemServerInvite', () => {
    it('posts to /redeem with auth header when token present', async () => {
      tokenSignalRef.value = 'TKN';
      const row = {
        id: 1,
        token: 'tok',
        gameId: 'g',
        mode: 'online',
        createdById: '42',
        targetUserId: null,
        payload: {},
        expiresAt: new Date().toISOString(),
        consumedAt: new Date().toISOString(),
        consumedById: '99',
        revoked: false,
        shareUrl: 'https://x',
        wasRestricted: false,
        alreadyConsumed: false,
      };
      httpResponses.push(row);
      const result = await service.redeemServerInvite('tok');
      expect(result).toEqual(row);
      expect(httpCalls[0].headers?.Authorization).toBe('Bearer TKN');
      expect(httpCalls[0].url).toMatch(/\/api\/games\/invites\/tok\/redeem$/);
    });

    it('returns null and shows a warning on 410', async () => {
      httpStub.post.mockReturnValueOnce(throwError(() => ({ status: 410 })));
      const result = await service.redeemServerInvite('tok');
      expect(result).toBeNull();
      expect(notifyMock.show).toHaveBeenCalledWith(
        expect.stringContaining('EXPIRED'),
        'warning'
      );
    });
  });

  describe('issueServerInvite', () => {
    it('requires a token; returns null otherwise', async () => {
      tokenSignalRef.value = null;
      const result = await service.issueServerInvite({
        gameId: 'g',
        mode: 'online',
      });
      expect(result).toBeNull();
      expect(notifyMock.show).toHaveBeenCalledWith(
        expect.stringContaining('LOGIN'),
        'info'
      );
    });

    it('POSTs to /api/games/:gameId/invites with auth header', async () => {
      tokenSignalRef.value = 'TKN';
      const row = {
        id: 1,
        token: 'tok',
        gameId: 'g',
        mode: 'co-op',
        createdById: '42',
        targetUserId: null,
        payload: {},
        expiresAt: new Date().toISOString(),
        consumedAt: null,
        consumedById: null,
        revoked: false,
        shareUrl: 'https://x',
      };
      httpResponses.push(row);
      const result = await service.issueServerInvite({
        gameId: 'g',
        mode: 'co-op',
        targetUserId: '99',
        payload: { lobbyId: 'L' },
      });
      expect(result).toEqual(row);
      expect(httpCalls[0].url).toMatch(/\/api\/games\/g\/invites$/);
      expect(httpCalls[0].headers?.Authorization).toBe('Bearer TKN');
      expect(httpCalls[0].body).toEqual({
        mode: 'co-op',
        targetUserId: '99',
        payload: { lobbyId: 'L' },
        ttlSeconds: undefined,
      });
    });
  });
});
