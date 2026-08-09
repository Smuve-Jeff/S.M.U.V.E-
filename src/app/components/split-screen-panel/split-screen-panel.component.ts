import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Game } from '../../hub/game';
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
  private sanitizer = inject(DomSanitizer);

  /** Trusted iframe src for the current game (external game cabinets require
   * explicit bypass because Angular drops unsafe URLs from the resource
   * sanitizer by default). */
  readonly trustedIframeUrl = computed<SafeResourceUrl | null>(() => {
    const g = this.game();
    if (!g?.url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(g.url);
  });

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

  /** Latest peer snapshot keyed by their socketId. */
  readonly peerSnapshot = computed(() => {
    const map = this.matchmaking.latestSplitScreenSnapshots();
    return Object.values(map).find((s) => !!s) ?? null;
  });

  /** Whether the iframe should follow the existing game launch pipeline. */
  readonly iframeSandbox = computed(() => {
    const g = this.game();
    if (!g) {
      return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock';
    }
    return this.buildSandbox(g);
  });

  readonly iframeAllow = computed(() => {
    const g = this.game();
    const base =
      'fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture';
    if (!g) return base;
    const tags = (g.tags || []).map((t) => t.toLowerCase());
    if (tags.includes('multiplayer') || tags.includes('versus')) {
      return base + '; microphone; camera; display-capture';
    }
    return base;
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

  private buildSandbox(g: Game): string {
    const tags = (g.tags || []).map((t) => t.toLowerCase());
    if (tags.includes('internal')) {
      return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-orientation-lock allow-downloads allow-same-origin';
    }
    return 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-modals allow-orientation-lock allow-downloads';
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
