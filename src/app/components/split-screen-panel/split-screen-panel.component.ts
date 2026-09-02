import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Game } from '../../hub/game';
import {
  GameService,
  canEmbedGameInline,
} from '../../hub/game.service';
import { MatchmakingService } from '../../hub/matchmaking.service';
import { ShareableInviteService, InviteMode } from '../../services/shareable-invite.service';
import { GamepadService } from '../../services/gamepad.service';
import { HapticService } from '../../services/haptic.service';
import { NotificationService } from '../../services/notification.service';

/**
 * Online-synced split-screen panel.
 *
 * Each player runs the game on their own device. State snapshots
 * (score, progress, level, current turn) are sent over socket.io so
 * each HUD mirrors the peer in real time. WebRTC voice uses the same
 * `voice_signal` relay that's already wired in `social-networking.service.ts`.
 *
 * The panel reuses the existing iframe launch flow (sanitize URL, set
 * permissions policy) and overlays a peer-HUD on top so both players
 * see one another's progress.
 */
@Component({
  selector: 'app-split-screen-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './split-screen-panel.component.html',
  styleUrls: ['./split-screen-panel.component.css'],
})
export class SplitScreenPanelComponent {
  game = input<Game | null>(null);
  mode = input<InviteMode>('split-screen');

  matchmaking = inject(MatchmakingService);
  shares = inject(ShareableInviteService);
  gamepad = inject(GamepadService);
  haptic = inject(HapticService);
  notify = inject(NotificationService);
  private gameSvc = inject(GameService);
  private sanitizer = inject(DomSanitizer);

  /**
   * Trusted iframe src for the current game. Uses the same policy as the
   * main launcher: external-only cabinets (and hosts that block framing) are
   * NOT iframed here — the template shows an external-launch fallback
   * instead of a dead blank frame. Local `/assets/` cabinets and verified
   * embed hosts render normally.
   */
  readonly trustedIframeUrl = computed<SafeResourceUrl | null>(() => {
    const g = this.game();
    if (!g || !canEmbedGameInline(g)) return null;
    let url = g.launchConfig?.approvedEmbedUrl || g.url;
    if (!url) return null;
    if (url.startsWith('assets/')) url = '/' + url;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  /** True when a game is selected but can't stream inside the panel. */
  readonly inlineUnavailable = computed(() => !!this.game() && !this.trustedIframeUrl());

  /** External launch target for cabinets that can't render inline. */
  readonly externalLaunchUrl = computed(() => {
    const g = this.game();
    if (!g) return '';
    return g.launchConfig?.approvedExternalUrl || g.url || '';
  });

  openExternally(): void {
    const url = this.externalLaunchUrl();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    this.notify.show('OPENED IN A NEW TAB', 'info');
  }

  // Local "I am playing" state — updated by the iframe postMessage events
  // the game launcher emits (and are also captured by the existing game
  // state sync service).
  readonly myScore = signal(0);
  readonly myProgress = signal(0);
  readonly myTurn = signal<'host' | 'guest'>('host');
  readonly myLevel = signal('LV_01');

  readonly isHost = computed(() =>
    this.matchmaking.activeSplitLobby()?.role === 'host'
  );

  readonly isGuest = computed(() =>
    this.matchmaking.activeSplitLobby()?.role === 'guest'
  );

  readonly activeLobby = this.matchmaking.activeSplitLobby;

  /**
   * Latest peer snapshot. Stored snapshots are keyed by the SENDER's userId,
   * so we look up the registered peer id first (host reads the guest's slot,
   * guest reads the host's) and only fall back to "any" before roles settle.
   */
  readonly peerSnapshot = computed(() => {
    const map = this.matchmaking.latestSplitScreenSnapshots();
    const lobby = this.matchmaking.activeSplitLobby();
    const peerId = lobby
      ? lobby.role === 'host'
        ? lobby.guestId
        : lobby.hostId
      : '';
    if (peerId && map[peerId]) return map[peerId];
    return Object.values(map)[0] ?? null;
  });

  /** Reuses the launcher's sandbox/permissions builders (single source). */
  readonly iframeSandbox = computed(() =>
    this.gameSvc.buildIframeSandbox(this.game() ?? undefined)
  );

  readonly iframeAllow = computed(() =>
    this.gameSvc.buildIframeAllowAttr(this.game() ?? undefined)
  );

  /**
   * The sandbox and allow attributes cannot be template-bound in Angular 21
   * (NG0910 security validation) — set them imperatively whenever the frame
   * (re)mounts or the game changes.
   */
  private splitFrameEl = viewChild<ElementRef<HTMLIFrameElement>>('splitFrame');

  private framePolicyEffect = effect(() => {
    const el = this.splitFrameEl()?.nativeElement;
    if (!el) return;
    el.setAttribute('sandbox', this.iframeSandbox());
    el.setAttribute('allow', this.iframeAllow());
  });

  constructor() {
    // The panel is a pure render surface: the parent component (ThaSpot)
    // owns split-screen lifecycle so this component never double-fires
    // `split_screen_register` on mount/remount.
    //
    // We DO clean up on unmount: if a session is still active when the
    // user closes the panel, drift-tear-down so we don't leak ghost
    // peers to the socket server.
    inject(DestroyRef).onDestroy(() => {
      if (this.activeLobby()) {
        this.matchmaking.exitSplitScreen();
      }
    });
  }

  get currentShareUrl(): string {
    const game = this.game();
    if (!game) return '';
    const lobby = this.activeLobby();
    if (lobby) {
      return this.shares.buildPublicShareUrl({
        gameId: game.id,
        mode: this.mode(),
        inviteToken: undefined,
        fromUserId: 'host-pending',
      });
    }
    return this.shares.buildPublicShareUrl({
      gameId: game.id,
      mode: this.mode(),
    });
  }

  async copyShareLink(): Promise<void> {
    const url = this.currentShareUrl;
    await this.shares.copy({
      url,
      title: `${this.game()?.name ?? 'Split-Screen'} on S.M.U.V.E.`,
      text: `Wanna split-screen ${this.game()?.name ?? 'this'} with me on S.M.U.V.E.? ${url}`,
      mode: this.mode(),
      gameId: this.game()?.id ?? '',
    });
  }

  async nativeShare(): Promise<void> {
    const url = this.currentShareUrl;
    if (!url) return;
    await this.shares.nativeShare({
      url,
      title: `${this.game()?.name ?? 'Split-Screen'} on S.M.U.V.E.`,
      text: `Wanna split-screen ${this.game()?.name ?? 'this'} with me on S.M.U.V.E.? ${url}`,
      mode: this.mode(),
      gameId: this.game()?.id ?? '',
    });
  }

  /** The iframe page host can postMessage their state back; we forward it. */
  receiveGameMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return;
    if (data['type'] !== 'smuve_game_state') return;
    this.myScore.set(Number(data['score'] ?? 0));
    this.myProgress.set(Number(data['progress'] ?? 0));
    this.myLevel.set(String(data['level'] ?? this.myLevel()));
    this.matchmaking.pushSplitScreenSnapshot({
      score: this.myScore(),
      progress: this.myProgress(),
      level: this.myLevel(),
      turn: this.isGuest() ? 'guest' : 'host',
    });
  };

  cycleTurn(): void {
    this.myTurn.update((t) => (t === 'host' ? 'guest' : 'host'));
    this.matchmaking.pushSplitScreenSnapshot({
      score: this.myScore(),
      progress: this.myProgress(),
      level: this.myLevel(),
      turn: this.myTurn(),
    });
    this.haptic.medium();
  }

  leave(): void {
    this.matchmaking.exitSplitScreen();
    this.notify.show('SPLIT-SCREEN SESSION ENDED', 'info');
  }

  hasGamepadConnection(): boolean {
    return !!this.gamepad.connectedGamepad();
  }
}
