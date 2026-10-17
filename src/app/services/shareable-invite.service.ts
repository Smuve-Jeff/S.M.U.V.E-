import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';

export type InviteMode =
  | 'online'
  | 'offline'
  | 'co-op'
  | 'split-screen'
  | 'challenge'
  | 'quick-match';

/** Resolved shape returned by the API after issuing or resolving. */
export interface GameInviteRecord {
  id: number;
  token: string;
  gameId: string;
  mode: InviteMode;
  createdById: string;
  targetUserId: string | null;
  payload: Record<string, unknown> | null;
  expiresAt: string;
  consumedAt: string | null;
  consumedById: string | null;
  revoked: boolean;
  shareUrl: string;
}

/** A share intent — what the URL builder emits to clipboard / native share. */
export interface ShareIntent {
  url: string;
  title: string;
  text: string;
  mode: InviteMode;
  gameId: string;
}

/** Inbound params parsed from a `/tha-spot?game=…&mode=…&invite=…&from=…` URL. */
export interface InboundShareLink {
  gameId: string | null;
  mode: InviteMode | null;
  inviteToken: string | null;
  fromUserId: string | null;
  toUserId: string | null;
  /** Split-screen lobby the inviter is hosting (link is a join-invite). */
  lobbyId: string | null;
  hasLink: boolean;
}

const ALLOWED_MODES: readonly InviteMode[] = [
  'online',
  'offline',
  'co-op',
  'split-screen',
  'challenge',
  'quick-match',
];

const isMode = (v: string | null): v is InviteMode =>
  !!v && (ALLOWED_MODES as readonly string[]).includes(v);

/**
 * Service behind the "send this to a friend" flow.
 *
 * The browser-side builder is the source of truth for the URL shape so
 * copy-link / native share work without a round-trip. The backend
 * resolvers in `/api/games/invites/:token` are the source of truth for
 * who-can-consume semantics (one-shot vs. public).
 */
@Injectable({ providedIn: 'root' })
export class ShareableInviteService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private notify = inject(NotificationService);
  private haptic = inject(HapticService);

  /** Last share intent that successfully resolved. Used by UI overlays. */
  readonly lastIssued = signal<GameInviteRecord | null>(null);

  /** Cached inbound share-link parsed from the current URL. */
  readonly inbound = signal<InboundShareLink>({
    gameId: null,
    mode: null,
    inviteToken: null,
    fromUserId: null,
    toUserId: null,
    lobbyId: null,
    hasLink: false,
  });

  /** Read-only flags for templates. */
  readonly hasInbound = computed(() => this.inbound().hasLink);

  /** Origin used to build absolute share URLs. */
  private get shareOrigin(): string {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://smuvejeffpresents.com';
  }

  /** Parse inbound share-link params from the current URL. */
  parseFromCurrentUrl(url?: string): InboundShareLink {
    const source = url ?? (typeof window === 'undefined' ? '' : window.location.href);
    const parsed = new URL(source, 'https://smuvejeffpresents.com');
    const gameId = parsed.searchParams.get('game');
    const rawMode = parsed.searchParams.get('mode');
    const mode = isMode(rawMode) ? rawMode : null;
    const inviteToken = parsed.searchParams.get('invite');
    const fromUserId = parsed.searchParams.get('from');
    const toUserId = parsed.searchParams.get('to');
    const lobbyId = parsed.searchParams.get('lobby');
    const link: InboundShareLink = {
      gameId,
      mode,
      inviteToken,
      fromUserId,
      toUserId,
      lobbyId,
      hasLink: !!(gameId || mode || inviteToken || lobbyId),
    };
    this.inbound.set(link);
    return link;
  }

  /**
   * Build a public share URL **without** hitting the server. Good for quick
   * "send to a friend" links where the recipient is allowed to load the
   * game's landing page freely (any logged-in user can join online play).
   */
  buildPublicShareUrl(opts: {
    gameId: string;
    mode: InviteMode;
    fromUserId?: string;
    toUserId?: string;
    inviteToken?: string;
    lobbyId?: string;
  }): string {
    const params = new URLSearchParams();
    params.set('game', opts.gameId);
    params.set('mode', opts.mode);
    if (opts.inviteToken) params.set('invite', opts.inviteToken);
    if (opts.fromUserId) params.set('from', opts.fromUserId);
    // Split-screen invites must carry the host's lobby id or the recipient
    // cannot join the actual paired session.
    if (opts.lobbyId) params.set('lobby', opts.lobbyId);
    if (opts.toUserId) params.set('to', opts.toUserId);
    return `${this.shareOrigin}/tha-spot?${params.toString()}`;
  }

  /**
   * Build the deep-link path (relative to the current origin) used by the
   * in-app share buttons. Modals can render absolute URLs by prefixing
   * `shareOrigin`.
   */
  buildDeepLink(opts: {
    gameId: string;
    mode: InviteMode;
    inviteToken?: string;
    fromUserId?: string;
  }): string {
    return this.buildPublicShareUrl(opts).replace(this.shareOrigin, '');
  }

  /**
   * Build the user-facing share intent (title + body + URL) used by both
   * `clipboard` and `navigator.share`. No network required.
   */
  buildShareIntent(args: {
    gameId: string;
    gameName?: string;
    mode: InviteMode;
    fromName?: string;
    inviteToken?: string;
    lobbyId?: string;
  }): ShareIntent {
    const url = this.buildPublicShareUrl({
      gameId: args.gameId,
      mode: args.mode,
      // We pass the artistName through as a *display* field only — never as
      // a URL param — so the URL stays clean for clipboard readability.
      fromUserId: undefined,
      inviteToken: args.inviteToken,
      lobbyId: args.lobbyId,
    });
    const verboseMode: Record<InviteMode, string> = {
      online: 'Online',
      offline: 'Offline',
      'co-op': 'Co-Op',
      'split-screen': 'Split-Screen',
      challenge: 'Challenge',
      'quick-match': 'Quick-Match',
    };
    const title = `${args.gameName ?? args.gameId} on S.M.U.V.E.`;
    const text = args.fromName
      ? `${args.fromName} wants you to ${this.ctaForMode(args.mode)} ${args.gameName ?? args.gameId} on S.M.U.V.E. ${url}`
      : `Wanna ${this.ctaForMode(args.mode)} ${args.gameName ?? args.gameId} on S.M.U.V.E.? ${url}`;
    return { url, title, text, mode: args.mode, gameId: args.gameId };
  }

  private ctaForMode(mode: InviteMode): string {
    switch (mode) {
      case 'challenge':
        return 'battle me in';
      case 'co-op':
        return 'team up with me in';
      case 'split-screen':
        return 'split-screen';
      case 'quick-match':
        return 'quick-match in';
      case 'online':
        return 'play';
      default:
        return 'play';
    }
  }

  /**
   * Copy an intent to clipboard. Falls back to a transient textarea
   * for environments that deny clipboard access (e.g. insecure contexts).
   */
  async copy(intent: ShareIntent | string): Promise<boolean> {
    const text = typeof intent === 'string' ? intent : intent.url;
    const label = typeof intent === 'string' ? 'Link' : intent.title;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        this.notify.show(`${label} COPIED TO CLIPBOARD`, 'success');
        this.haptic.light();
        return true;
      }
    } catch {
      /* fall through */
    }
    // Legacy fallback: textarea + execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        this.notify.show(`${label} COPIED TO CLIPBOARD`, 'success');
        return true;
      }
    } catch {
      /* ignore */
    }
    this.notify.show('FAILED TO COPY LINK', 'warning');
    return false;
  }

  /**
   * Use the OS-native share sheet when available. Returns true if the
   * share was dispatched or queued; false when the API is unavailable
   * or the user cancelled.
   */
  async nativeShare(intent: ShareIntent): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.share) {
      return false;
    }
    try {
      await navigator.share({
        title: intent.title,
        text: intent.text,
        url: intent.url,
      });
      this.haptic.light();
      return true;
    } catch (err: any) {
      // User cancel or share aborted → silent
      if (err?.name !== 'AbortError') {
        this.notify.show('SHARE FAILED — TRY COPY LINK', 'warning');
      }
      return false;
    }
  }

  /**
   * Best-effort share: try native share sheet, then clipboard, then
   * return the resolved URL so the caller can fall back to UI display.
   */
  async share(intent: ShareIntent): Promise<{ shared: boolean; url: string }> {
    if (await this.nativeShare(intent)) {
      return { shared: true, url: intent.url };
    }
    await this.copy(intent);
    return { shared: false, url: intent.url };
  }

  // ── Server-backed issuance ────────────────────────────────────────────────

  /** Issue a one-shot server token, primarily for restricted invites. */
  async issueServerInvite(opts: {
    gameId: string;
    mode: InviteMode;
    targetUserId?: string;
    payload?: Record<string, unknown>;
    ttlSeconds?: number;
  }): Promise<GameInviteRecord | null> {
    const token = this.tokenService.jwtToken();
    if (!token) {
      this.notify.show('LOGIN TO ISSUE A SINGLE-USE INVITE', 'info');
      return null;
    }
    try {
      const row = await firstValueFrom(
        this.http.post<GameInviteRecord>(
          `${APP_SECURITY_CONFIG.api_url}/games/${opts.gameId}/invites`,
          {
            mode: opts.mode,
            targetUserId: opts.targetUserId,
            payload: opts.payload,
            ttlSeconds: opts.ttlSeconds,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
      this.lastIssued.set(row);
      return row;
    } catch (e) {
      console.error('[Share] issueServerInvite failed', e);
      this.notify.show('COULD NOT ISSUE INVITE — TRY COPY LINK', 'warning');
      return null;
    }
  }

  /** Server-side consume. Restricted invites become "already consumed" on second attempt. */
  async redeemServerInvite(
    token: string
  ): Promise<
    (GameInviteRecord & {
      wasRestricted: boolean;
      alreadyConsumed: boolean;
    }) | null
  > {
    const headers: Record<string, string> = {};
    const t = this.tokenService.jwtToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
    try {
      return await firstValueFrom(
        this.http.post<
          GameInviteRecord & {
            wasRestricted: boolean;
            alreadyConsumed: boolean;
          }
        >(`${APP_SECURITY_CONFIG.api_url}/games/invites/${token}/redeem`, {}, { headers })
      );
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode;
      if (status === 410) {
        this.notify.show('INVITE EXPIRED OR ALREADY USED', 'warning');
      } else if (status === 403) {
        this.notify.show('INVITE NOT FOR THIS PLAYER', 'warning');
      } else if (status === 404) {
        this.notify.show('INVITE NOT FOUND', 'warning');
      }
      return null;
    }
  }

  /** Public preview (no auth required). Returns null for missing/expired/revoked. */
  async peekServerInvite(token: string): Promise<GameInviteRecord | null> {
    try {
      return await firstValueFrom(
        this.http.get<GameInviteRecord>(
          `${APP_SECURITY_CONFIG.api_url}/games/invites/${token}`
        )
      );
    } catch {
      return null;
    }
  }
}
