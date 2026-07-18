import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  effect,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { GameService } from '../../hub/game.service';
import { Game } from '../../hub/game';
import { GameSortMode } from '../../hub/game.service';
import { RecommendationRail, LiveEvent } from '../../hub/game';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { GamepadService } from '../../services/gamepad.service';
import { SecurityService } from '../../services/security.service';
import { APP_SECURITY_CONFIG } from '../../app.security';
import {
  SocialNetworkingService,
  OnlineUser,
  RoomMessage,
  PrivateMessage,
} from '../../services/social-networking.service';
import { ChallengeInboxService } from '../../services/challenge-inbox.service';
import { PeerNetworkingService } from '../../services/peer-networking.service';
import { SnackbarService } from '../../services/snackbar.service';
import { ActivatedRoute } from '@angular/router';

const LIVE_CLOCK_INTERVAL_MS = 60000;
const FEED_REFRESH_INTERVAL_MS = 300000;

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
  styles: [`
    .challenge-banner {
      position: fixed;
      top: 72px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 110;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.25rem;
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(225, 29, 72, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
      border: 1px solid rgba(225, 29, 72, 0.4);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      animation: slideDown 0.4s ease-out;
    }
    .challenge-banner .challenge-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #fff;
    }
    .challenge-banner .challenge-actions {
      display: flex;
      gap: 0.5rem;
    }
    .challenge-banner .action-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      padding: 0.4rem 0.8rem;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .challenge-banner .action-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .challenge-banner .action-btn.danger {
      background: rgba(225, 29, 72, 0.3);
      border-color: rgba(225, 29, 72, 0.5);
    }
    .challenge-banner .action-btn.danger:hover {
      background: rgba(225, 29, 72, 0.5);
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .icon-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `],
})
/* S.M.U.V.E. v4.2 Enhanced Catalog Access */
export class ThaSpotComponent implements OnInit, OnDestroy, AfterViewInit {
  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);
  private uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  private gamepadService = inject(GamepadService);
  private securityService = inject(SecurityService);
  public socialService = inject(SocialNetworkingService);
  public inboxService = inject(ChallengeInboxService);
  public peerService = inject(PeerNetworkingService);
  private snackbarService = inject(SnackbarService);

  // Signals
  displayMode = signal<'gaming' | 'pluto'>('gaming');
  games = signal<Game[]>([]);
  gamingRooms = signal<any[]>([]);
  badges = signal<any[]>([]);
  liveEvents = signal<LiveEvent[]>([]);
  socialPresence = signal<any[]>([]);
  promotions = signal<any[]>([]);
  recommendationRails = signal<RecommendationRail[]>([]);
  activeGenre = signal<string>('all');
  activePlatform = signal<string>('all');

  allPlatforms = computed(() => {
    const platforms = new Set<string>();
    const knownPlatforms = [
      'PS1',
      'PS2',
      'N64',
      'Xbox',
      'Dreamcast',
      'SNES',
      'NES',
      'Arcade',
      'DOS',
      'Web',
      'PC',
      'Genesis',
      'GBA',
      'Game Boy',
      'Game Boy Color',
      'Neo Geo',
      'TurboGrafx',
      'Saturn',
      'Master System',
      'Neo-Geo',
    ];
    this.games().forEach((g) => {
      const tags = (g.tags || []).map((t) => t.toUpperCase());
      knownPlatforms.forEach((p) => {
        if (tags.includes(p.toUpperCase())) platforms.add(p);
      });
    });
    return Array.from(platforms).sort();
  });

  activeRoom = signal<string>('all');
  searchQuery = signal<string>('');
  showFavoritesOnly = signal<boolean>(false);
  sortMode = signal<GameSortMode>('Popular');
  quickFilters = signal<string[]>([]);
  favorites = signal<string[]>([]);

  // Selection & UI Signals
  selectedGame = signal<Game | null>(null);
  currentGame = signal<Game | null>(null);
  isBrowseView = signal<boolean>(true);
  showIntelPanel = signal<boolean>(false);
  readonly showRivalHub = signal<boolean>(false);
  hubTimeoutId?: ReturnType<typeof setTimeout>;
  readonly isIncognito = this.socialService.isIncognito;
  now = signal<number>(Date.now());
  isMatchmaking = signal<boolean>(false);
  matchmakingStatus = signal<string>('');
  matchmakingProgress = signal<number>(0);
  matchmakingElapsed = signal<number>(0);
  showBotOption = signal<boolean>(false);
  isWasmLoading = signal<boolean>(false);
  gameLoadStage = signal<string>('idle');
  gameLoadError = signal<boolean>(false);
  showBackToTop = signal<boolean>(false);
  showExternalConfirm = signal<boolean>(false);
  externalTargetUrl = signal<string>('');
  externalTargetDomain = signal<string>('');
  private currentMatchmakingId: number | null = null;
  private matchmakingTimerId: any = null;
  private latestSearchQuery: string = '';

  // Social & Streaming Signals
  activeHubTab = signal<'room' | 'dm' | 'stream' | 'friends' | 'party'>('room');
  dmTargetUserId = signal<string | null>(null);
  chatInput = signal<string>('');

  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('contentViewport') contentViewport?: ElementRef<HTMLDivElement>;
  @ViewChild('remoteAudio') remoteAudio?: ElementRef<HTMLAudioElement>;

  private feedSubscription?: Subscription;
  private clockId?: any;
  private feedRefreshId?: any;
  private readonly messageHandler = (event: MessageEvent) =>
    this.onMessage(event);

  // Computed signals
  filteredGames = computed(() => {
    if (this.displayMode() === 'pluto') return [];
    let games = this.games();

    const currentRoomId = this.activeRoom();
    if (currentRoomId !== 'all') {
      const room = this.gamingRooms().find((r) => r.id === currentRoomId);
      if (room) {
        games = games.filter((g) => this.gameService.matchesRoom(g, room));
      }
    }

    if (this.showFavoritesOnly()) {
      games = games.filter((g) => this.favorites().includes(g.id));
    }

    return this.gameService.filterAndSortGames(
      games,
      {
        genre: this.activeGenre(),
        query: this.searchQuery(),
        platform: this.activePlatform(),
        quickFilters: this.quickFilters(),
      },
      this.sortMode()
    );
  });

  availableGenres = computed(() => {
    const genres = new Set<string>();
    this.games().forEach((g) => {
      if (g.genre) genres.add(g.genre);
    });
    return Array.from(genres).sort();
  });

  matchingRecommendationRails = computed(() => {
    const profile = this.profileService.profile();
    return this.recommendationRails().filter((rail) =>
      this.matchesRecommendationAudience(rail, profile)
    );
  });

  activeEvents = computed(() => {
    const time = this.now();
    return this.liveEvents().map((event) =>
      this.resolveEventStatus(event, time)
    );
  });

  currentSafeUrl = computed(() => {
    const game = this.currentGame();
    return game ? this.getSafeUrl(game) : null;
  });

  launchWarning = computed(() => {
    const game = this.selectedGame();
    return game ? this.resolveLaunchWarning(game) : '';
  });

  neuralSyncScore = computed(() => 85);
  gamingDirectives = computed(() => [
    'Execute daily challenge',
    'Maintain rank',
  ]);

  onlineUsers = this.socialService.onlineUsers;
  featuredUsers = signal<OnlineUser[]>([]);
  globalSearchResults = signal<OnlineUser[]>([]);
  playerSearchQuery = signal('');
  filteredOnlineUsers = computed(() => {
    const query = this.playerSearchQuery().toLowerCase();
    const merged = [
      ...this.onlineUsers(),
      ...this.globalSearchResults(),
    ].filter(
      (u, i, self) => self.findIndex((t) => t.userId === u.userId) === i
    );
    return merged.filter((u) => {
      const status = u.inGame
        ? 'playing'
        : u.online !== false
          ? 'online'
          : 'offline';
      return (
        u.artistName?.toLowerCase().includes(query) ||
        u.primaryGenre?.toLowerCase().includes(query) ||
        status.includes(query)
      );
    });
  });
  selectedDmUser = computed(() =>
    [
      ...this.onlineUsers(),
      ...this.globalSearchResults(),
      ...this.featuredUsers(),
    ].find((u) => u.userId === this.dmTargetUserId())
  );
  canInteract = computed(() => true);
  isKnocking = this.peerService.isKnocking;
  knockFromUserId = this.peerService.knockFromUserId;
  messages = this.socialService.messages;
  roomMessages = this.socialService.roomMessages;
  challenges = this.inboxService.challenges;
  filteredMessages = computed(() => {
    const targetId = this.dmTargetUserId();
    const myId = this.profileService.profile().id;
    if (!targetId || !myId) return [];
    return this.messages().filter(
      (m) =>
        (m.fromUserId === targetId && m.toUserId === myId) ||
        (m.fromUserId === myId && m.toUserId === targetId)
    );
  });
  isCallActive = this.peerService.isCallActive;
  inGame = signal(false);
  gameIdToInvite = signal<string | null>(null);
  incomingChallenge = signal<{ fromUserId: string; fromUserName?: string; gameId: string; timestamp: number } | null>(null);

  statusEffect = effect(() => {
    const inGame = this.inGame();
    this.socialService.updateStatus({ inGame });
  });

  constructor() {
    effect(() => {
      this.activeHubTab.set(this.socialService.activeHubTab());
    });
    const savedFavs = localStorage.getItem('tha_spot_favorites');
    if (savedFavs) this.favorites.set(JSON.parse(savedFavs));

    effect(() => {
      const gp = this.gamepadService.connectedGamepad();
      if (gp) {
        if (this.isBrowseView()) {
          const dx = this.gamepadService.dpadX();
          const dy = this.gamepadService.dpadY();
          if (dx !== 0 || dy !== 0) {
            if (this.contentViewport?.nativeElement) {
              this.contentViewport.nativeElement.scrollBy({
                top: dy * 100,
                left: dx * 100,
                behavior: 'smooth',
              });
            }
          }
        }

        if (gp.buttons[0]) {
          if (this.selectedGame()) {
            this.confirmLaunch();
          }
        }
        if (gp.buttons[1]) {
          this.closePreview();
          this.closeGame();
        }
      }
    });

    effect(() => {
      this.roomMessages();
      this.messages();
      this.socialService.simulatedLiveChat();
      setTimeout(() => this.scrollToBottom(), 100);
    });

    // Wire up srcObject on the audio element when remote stream arrives
    // (Angular can't bind srcObject via template — it's a DOM property, not an HTML attribute)
    effect(() => {
      const stream = this.peerService.remoteStream();
      const audioEl = this.remoteAudio?.nativeElement;
      if (audioEl && stream) {
        (audioEl as any).srcObject = stream;
        audioEl.play().catch(() => {});
      }
    });
  }

  ngOnInit() {
    this.socialService.loadFriends();
    this.securityService.getCSRFToken();
    this.loadFeed();
    this.loadFeaturedUsers();
    this.startLiveClock();
    this.startFeedRefresh();
    window.addEventListener('message', this.messageHandler);

    // Handle Deep Links
    this.route.queryParamMap.subscribe((params) => {
      const gameId = params.get('gameId');
      const partyId = params.get('partyId');
      const mission = params.get('mission');
      if (mission) this.snackbarService.info(`MISSION ASSIGNMENT: ${mission}`);

      if (partyId) {
        this.socialService.joinParty(partyId);
        this.setHubTab('party');
        if (!this.showRivalHub()) this.toggleRivalHub();
      }

      if (gameId) {
        const game = this.games().find((g) => g.id === gameId);
        if (game) {
          this.selectedGame.set(game);
        } else {
          const sub = this.gameService.getThaSpotFeed().subscribe((feed) => {
            const found = feed.games.find((g) => g.id === gameId);
            if (found) this.selectedGame.set(found);
            sub.unsubscribe();
          });
        }
      }

      // Handle challenge deep links: ?challenge=true&gameId=...&from=...
      const challenge = params.get('challenge');
      if (challenge === 'true') {
        const fromUserId = params.get('from') || '';
        const fromUserName = params.get('fromName') || 'Unknown';
        const challengeGameId = params.get('gameId') || '';
        if (challengeGameId) {
          this.incomingChallenge.set({
            fromUserId,
            fromUserName,
            gameId: challengeGameId,
            timestamp: Date.now(),
          });
          // Optionally auto-select the game
          const game = this.games().find((g) => g.id === challengeGameId);
          if (game) this.selectedGame.set(game);
        }
      }
    });

    this.setActiveRoom('co-op-link');

    this.hubTimeoutId = setTimeout(() => {
      if (
        !this.showRivalHub() &&
        !this.route.snapshot.queryParamMap.has('partyId')
      )
        this.toggleRivalHub();
    }, 1000);
  }

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    if (this.hubTimeoutId) clearTimeout(this.hubTimeoutId);
    window.removeEventListener('message', this.messageHandler);
  }

  setMode(mode: 'gaming' | 'pluto'): void {
    this.displayMode.set(mode);
    if (mode === 'pluto') this.closeGame();
  }

  setActiveRoom(id: string) {
    this.activeRoom.set(id);
    this.socialService.joinRoom(id);
  }

  clearFilters() {
    this.activeGenre.set('all');
    this.activePlatform.set('all');
    this.searchQuery.set('');
    this.showFavoritesOnly.set(false);
    this.quickFilters.set([]);
  }

  onChatInput(val: string) {
    this.chatInput.set(val);
    if (this.activeHubTab() === 'dm' && this.dmTargetUserId()) {
      this.socialService.sendTypingStatus(
        this.dmTargetUserId()!,
        val.length > 0
      );
    }
  }

  onSearchChange(val: string) {
    this.searchQuery.set(val);
  }

  onGameClick(game: Game) {
    this.selectedGame.set(game);
    this.gameIdToInvite.set(game.id);
  }

  closePreview() {
    this.selectedGame.set(null);
  }

  closeGame() {
    this.inGame.set(false);
    this.currentGame.set(null);
  }

  toggleIntel() {
    this.showIntelPanel.update((v) => !v);
  }

  toggleBrowse() {
    this.isBrowseView.update((v) => !v);
  }

  cancelMatchmaking() {
    const game = this.selectedGame();
    if (game) this.socialService.cancelMatch(game.id);
    this.isMatchmaking.set(false);
    this.currentMatchmakingId = null;
  }

  async  /**
   * Main game launch entry point. Handles:
   *  - External-only games: shows domain confirmation before opening
   *  - Inline games: URL validation → multiplayer matchmaking → multi-stage loading → iframe
   */
  async confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;

    const launchMode = this.resolveLaunchMode(game);

    // --- External / blocked games: open in a new tab with confirmation ---
    if (launchMode === 'external') {
      const url = game.launchConfig?.approvedExternalUrl || game.launchConfig?.approvedEmbedUrl || game.url;
      try {
        const domain = new URL(url, window.location.origin).hostname;
        this.externalTargetDomain.set(domain);
      } catch {
        this.externalTargetDomain.set(url);
      }
      this.externalTargetUrl.set(url);
      this.showExternalConfirm.set(true);
      return;
    }

    // --- Inline games ---

    // Security: Pre-validate the embed URL before doing anything else
    const safeUrl = this.getSafeUrl(game);
    if (!safeUrl) {
      this.gameLoadError.set(true);
      this.snackbarService.error('SECURITY: This game source is not on the trusted allowlist.');
      return;
    }

    // Multiplayer matchmaking
    if (this.isMultiplayerGame(game)) {
      this.currentMatchmakingId = Date.now();
      const requestId = this.currentMatchmakingId;
      this.isMatchmaking.set(true);
      this.matchmakingStatus.set('SCANNING FOR RIVALS...');
      this.matchmakingProgress.set(0);
      this.matchmakingElapsed.set(0);
      this.showBotOption.set(false);
      this.socialService.queueForMatch(game.id);

      // Visual progress timer
      const startTime = Date.now();
      this.matchmakingTimerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        this.matchmakingElapsed.set(elapsed);
        this.matchmakingProgress.set(Math.min(95, elapsed * 6.3));
      }, 1000);

      const matchPromise = new Promise<boolean>((resolve) => {
        const checkMatch = setInterval(() => {
          if (this.socialService.matchmakingStatus() === 'matched') {
            clearInterval(checkMatch);
            resolve(true);
          }
        }, 500);
        setTimeout(() => {
          clearInterval(checkMatch);
          resolve(false);
        }, 15000);
      });

      const matched = await matchPromise;
      clearInterval(this.matchmakingTimerId);

      if (this.currentMatchmakingId !== requestId) return;

      if (!matched) {
        // Show visual bot option instead of browser confirm()
        this.matchmakingStatus.set('NO RIVALS FOUND');
        this.matchmakingProgress.set(100);
        this.showBotOption.set(true);
        this.isMatchmaking.set(false);
        this.currentMatchmakingId = null;
        return;
      }

      this.isMatchmaking.set(false);
      this.socialService.matchmakingStatus.set('idle');
      this.currentMatchmakingId = null;
    }

    // Multi-stage loading indicator
    this.gameLoadStage.set('initializing');
    this.gameLoadError.set(false);
    await new Promise((r) => setTimeout(r, 300));
    this.gameLoadStage.set('connecting');
    await new Promise((r) => setTimeout(r, 300));
    this.gameLoadStage.set('loading');
    await new Promise((r) => setTimeout(r, 400));
    this.gameLoadStage.set('ready');

    this.profileService.recordGameLaunch(
      game.id,
      this.buildSessionContext(game)
    );
    this.inGame.set(true);
    this.currentGame.set(game);
    this.closePreview();
  }

  /**
   * User confirms they want to visit the external game URL.
   */
  confirmExternalLaunch() {
    const url = this.externalTargetUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    this.showExternalConfirm.set(false);
    this.closePreview();
  }

  cancelExternalLaunch() {
    this.showExternalConfirm.set(false);
  }

  /**
   * After matchmaking fails, user can choose to engage an AI bot.
   */
  engageAiBot() {
    const game = this.selectedGame();
    if (game) this.socialService.cancelMatch(game.id);
    this.showBotOption.set(false);
    this.isMatchmaking.set(false);
    // Proceed to launch the game in solo mode
    this.gameLoadStage.set('initializing');
    this.gameLoadError.set(false);
    setTimeout(() => this.gameLoadStage.set('connecting'), 300);
    setTimeout(() => this.gameLoadStage.set('loading'), 600);
    setTimeout(() => {
      this.gameLoadStage.set('ready');
      if (game) {
        this.profileService.recordGameLaunch(game.id, this.buildSessionContext(game));
        this.inGame.set(true);
        this.currentGame.set(game);
        this.closePreview();
      }
    }, 1000);
  }

  /**
   * Iframe load success handler.
   */
  onGameIframeLoad() {
    this.gameLoadStage.set('ready');
    this.gameLoadError.set(false);
  }

  /**
   * Iframe error handler — shows retry UI.
   */
  onGameIframeError() {
    this.gameLoadError.set(true);
    this.gameLoadStage.set('idle');
  }

  reloadGame() {
    const iframe = this.gameIframe?.nativeElement;
    if (iframe) {
      const src = iframe.src;
      iframe.src = '';
      iframe.src = src;
    }
  }

  getActiveRoomName(): string {
    return (
      this.gamingRooms().find((r) => r.id === this.activeRoom())?.name ||
      'All Games'
    );
  }

  async loadFeaturedUsers() {
    const users = await this.socialService.getFeaturedUsers();
    this.featuredUsers.set(users);
  }

  async onPlayerSearchChange(query: string) {
    this.playerSearchQuery.set(query);
    this.latestSearchQuery = query;
    if (query.length > 2) {
      const results = await this.socialService.searchUsers(query);
      if (this.latestSearchQuery === query) {
        this.globalSearchResults.set(results);
      }
    } else {
      this.globalSearchResults.set([]);
    }
  }

  private loadFeed(forceRefresh = false) {
    this.feedSubscription?.unsubscribe();
    this.feedSubscription = this.gameService
      .getThaSpotFeed(forceRefresh)
      .subscribe((feed) => {
        this.games.set(feed.games);
        this.gamingRooms.set(feed.rooms);
        this.badges.set(feed.badges);
        this.liveEvents.set(feed.liveEvents);
        this.socialPresence.set(feed.socialPresence);
        this.promotions.set(feed.promotions);
        this.recommendationRails.set(feed.recommendationRails);
      });
  }

  private startLiveClock(): void {
    this.clockId = window.setInterval(
      () => this.now.set(Date.now()),
      LIVE_CLOCK_INTERVAL_MS
    );
  }

  private startFeedRefresh(): void {
    this.feedRefreshId = window.setInterval(
      () => this.loadFeed(true),
      FEED_REFRESH_INTERVAL_MS
    );
  }

  /**
   * Trusted embed domains — only these hosts are allowed in the game iframe.
   * Internal /assets/ paths are always allowed (same-origin).
   */
  /**
   * Trusted embed domains — only these hosts are allowed in the game iframe.
   * Internal /assets/ paths are always allowed (same-origin).
   * Subdomains are matched automatically.
   */
  private static readonly TRUSTED_EMBED_DOMAINS: string[] = [
    'retrogames.cc',
    'www.retrogames.cc',
    'gamepix.com',
    'embed.gamepix.com',
    'www.gamepix.com',
    '1v1.lol',
    'www.1v1.lol',
    'pluto.tv',
    'play2048.co',
    'hextris.github.io',
    'slither.io',
    'agar.io',
    'krunker.io',
    'venge.io',
    'slowroads.io',
    'www.roblox.com',
    'playvalorant.com',
    'www.crazygames.com',
    'games.crazygames.com',
    'crazygames.com',
    'poki.com',
    'www.poki.com',
    'html5.gamedistribution.com',
    'gamedistribution.com',
    'www.addictinggames.com',
    'addictinggames.com',
    'www.miniclip.com',
    'miniclip.com',
    'www.kongregate.com',
    'kongregate.com',
    'itch.io',
    'www.itch.io',
    'newgrounds.com',
    'www.newgrounds.com',
    'dos.zone',
    'www.dos.zone',
    'embed.gamedistribution.com',
    'html5.gamedistribution.com',
    'gamedistribution.com',
    'www.gamedistribution.com',
    'playclassic.games',
    'www.playclassic.games',
    'playretrogames.com',
    'www.playretrogames.com',
    'emulatorgames.net',
    'www.emulatorgames.net',
    'classicgame.com',
    'www.classicgame.com',
  ];

  /**
   * Domains known to block iframe embedding via X-Frame-Options / CSP.
   * These games are launched externally instead of in an iframe.
   */
  private static readonly EMBED_BLOCKED_DOMAINS: string[] = [
    'retrogames.cc',
    'www.retrogames.cc',
    'emulatorgames.net',
    'www.emulatorgames.net',
    'playretrogames.com',
    'www.playretrogames.com',
    'classicgame.com',
    'www.classicgame.com',
  ];

  /**
   * Validate that a game URL points to a trusted embed host.
   * Returns true for internal /assets/ paths (same-origin).
   * Returns true for relative paths.
   */
  private isTrustedEmbedUrl(url: string): boolean {
    if (!url) return false;
    // Internal asset paths are always safe (same origin)
    if (url.startsWith('/') || url.startsWith('assets/') || url.startsWith('./')) {
      return !url.startsWith('//'); // Block protocol-relative URLs
    }
    try {
      const parsed = new URL(url);
      // Only allow https and http
      if (!['https:', 'http:'].includes(parsed.protocol)) return false;
      const hostname = parsed.hostname.toLowerCase();
      return ThaSpotComponent.TRUSTED_EMBED_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith('.' + d)
      );
    } catch {
      return false;
    }
  }

  /**
   * Check whether a URL is known to block iframe embedding.
   * These hosts send X-Frame-Options / CSP headers that prevent inline play.
   */
  private isEmbedBlockedUrl(url: string): boolean {
    if (!url) return true;
    if (url.startsWith('/') || url.startsWith('assets/') || url.startsWith('./')) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      return ThaSpotComponent.EMBED_BLOCKED_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith('.' + d)
      );
    } catch {
      return true;
    }
  }

  /**
   * Determine the effective launch mode for a game.
   * - 'external-only' from config always opens in a new tab.
   * - Known X-Frame/CSP blocking domains fall back to external.
   * - Everything else attempts inline iframe launch.
   */
  resolveLaunchMode(game: Game): 'inline' | 'external' {
    if (game.launchConfig?.embedMode === 'external-only') return 'external';
    const url = game.launchConfig?.approvedEmbedUrl || game.url;
    if (this.isEmbedBlockedUrl(url)) return 'external';
    return 'inline';
  }

  getSafeUrl(game: Game): SafeResourceUrl | null {
    let url = game.launchConfig?.approvedEmbedUrl || game.url;
    if (!url || url === '/' || url === '/hub' || url === 'hub') return null;

    if (url.startsWith('assets/')) {
      url = '/' + url;
    }

    // Security: Validate URL against trusted domain allowlist
    if (!this.isTrustedEmbedUrl(url)) {
      return null;
    }

    // Security: auth_salt is NOT appended to iframe URLs — it was a security
    // exposure. Games don't need the server auth salt; the iframe sandbox
    // isolates them. If game authentication is needed in the future, use a
    // postMessage handshake after the iframe loads.

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  /**
   * Public helper used by the template to decide whether a selected game
   * will launch inline or externally.
   */
  getLaunchMode(game: Game): 'inline' | 'external' {
    return this.resolveLaunchMode(game);
  }

  private onMessage(event: MessageEvent): void {
    const active = this.currentGame();
    if (
      event.origin !== window.location.origin ||
      !active ||
      !this.gameIframe?.nativeElement?.contentWindow ||
      event.source !== this.gameIframe.nativeElement.contentWindow
    )
      return;
    if (event.data?.type === 'GAME_OVER') {
      this.profileService.recordGameResult(active.id, {
        ...this.buildSessionContext(active),
        score: event.data.data?.score,
      });
      this.closeGame();
    }
  }

  private resolveEventStatus(event: LiveEvent, now: number): LiveEvent {
    if (!event.schedule?.startAt) return event;
    const start = new Date(event.schedule.startAt).getTime();
    const end = event.schedule.endAt
      ? new Date(event.schedule.endAt).getTime()
      : null;
    let status: LiveEvent['status'] = event.status;
    if (now < start) status = 'upcoming';
    else if (end && now > end) status = 'ending-soon';
    else status = 'live';
    return { ...event, status };
  }

  private resolveLaunchWarning(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only'
      ? 'External governance required.'
      : 'Verified.';
  }

  isRetroOrArcade(game: Game): boolean {
    const tags = (game.tags || []).map((t) => t.toLowerCase());
    return (
      tags.includes('retro') ||
      tags.includes('arcade') ||
      game.badgeIds?.includes('elite') === true
    );
  }

  private isMultiplayerGame(game: Game): boolean {
    return !!game.multiplayerType && game.multiplayerType !== 'None';
  }

  private buildSessionContext(game: Game) {
    const event = this.activeEvents().find((e) => e.featuredGameId === game.id);
    return {
      roomId: this.activeRoom(),
      eventId: event?.id,
      reward: event?.reward,
    };
  }

  launchActionLabel(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only'
      ? 'LAUNCH MISSION'
      : 'PLAY NOW';
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    const allGames = this.games();
    if (rail.gameIds?.length) {
      const gameMap = new Map(allGames.map((g) => [g.id, g]));
      const ordered = rail.gameIds
        .map((id) => gameMap.get(id))
        .filter((g): g is Game => g !== undefined);
      return rail.maxItems != null ? ordered.slice(0, rail.maxItems) : ordered;
    }
    if (rail.audience?.primaryGenres?.length)
      return allGames.filter((g) =>
        rail.audience!.primaryGenres!.includes(g.genre || '')
      );
    if (rail.badgeId)
      return allGames.filter((g) => g.badgeIds?.includes(rail.badgeId!));
    return allGames.slice(0, rail.maxItems || 4);
  }

  private matchesRecommendationAudience(
    rail: RecommendationRail,
    profile: any
  ): boolean {
    return true;
  }

  toggleRivalHub() {
    this.showRivalHub.update((v) => !v);
  }

  sendChallenge(userId: string, gameId: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    this.inboxService.challengePlayer(userId, gameId);
    this.snackbarService.success('CHALLENGE DISPATCHED');
  }

  buildChallengeLink(gameId: string, toUserId?: string): string {
    const baseUrl = window.location.origin + '/tha-spot';
    const params = new URLSearchParams();
    params.set('challenge', 'true');
    params.set('gameId', gameId);
    params.set('from', this.profileService.profile().id);
    params.set('fromName', this.profileService.profile().artistName || 'Rival');
    if (toUserId) params.set('to', toUserId);
    return `${baseUrl}?${params.toString()}`;
  }

  async shareChallengeLink(gameId: string, toUserId?: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    const game = this.games().find((g) => g.id === gameId) || this.selectedGame();
    const gameName = game?.name || gameId;
    const link = this.buildChallengeLink(gameId, toUserId);
    const text = `🎮 Challenge me to ${gameName} on S.M.U.V.E.! ${link}`;

    // Use Web Share API when available (mobile native share sheet)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'S.M.U.V.E. Challenge',
          text,
          url: link,
        });
        return;
      } catch (_err) {
        // Fall through to clipboard / sms
      }
    }

    // Copy to clipboard as fallback
    try {
      await navigator.clipboard.writeText(text);
      this.snackbarService.success('CHALLENGE LINK COPIED');
    } catch (_err) {
      this.snackbarService.error('FAILED TO COPY LINK');
    }
  }

  shareChallengeViaSms(gameId: string, toUserId?: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    const game = this.games().find((g) => g.id === gameId) || this.selectedGame();
    const gameName = game?.name || gameId;
    const link = this.buildChallengeLink(gameId, toUserId);
    const body = encodeURIComponent(`🎮 Challenge me to ${gameName} on S.M.U.V.E.! ${link}`);
    window.location.href = `sms:?body=${body}`;
  }

  acceptIncomingChallenge() {
    const challenge = this.incomingChallenge();
    if (!challenge) return;
    const game = this.games().find((g) => g.id === challenge.gameId);
    if (game) {
      this.selectedGame.set(game);
    }
    this.incomingChallenge.set(null);
    this.snackbarService.success('CHALLENGE ACCEPTED — INITIALIZING');
  }

  declineIncomingChallenge() {
    this.incomingChallenge.set(null);
  }

  startVoiceChat(userId: string) {
    this.peerService.startCall(userId);
  }

  endVoiceChat() {
    this.peerService.endCall();
  }

  copyShareLink() {
    const game = this.currentGame() || this.selectedGame();
    const gameId = game?.id;
    const gameName = game?.name;
    const partyId = this.socialService.currentPartyId();
    const baseUrl = window.location.origin + '/tha-spot';

    const params = new URLSearchParams();
    if (gameId) params.set('gameId', gameId);
    if (gameName) params.set('mission', gameName);
    if (partyId) params.set('partyId', partyId);

    const queryString = params.toString();
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    navigator.clipboard.writeText(url).then(() => {
      this.snackbarService.success('MISSION LINK COPIED TO CLIPBOARD');
    });
  }

  setHubTab(tab: 'room' | 'dm' | 'stream' | 'friends' | 'party') {
    this.activeHubTab.set(tab);
    if (
      tab === 'dm' &&
      !this.dmTargetUserId() &&
      this.onlineUsers().length > 0
    ) {
      this.dmTargetUserId.set(this.onlineUsers()[0].userId);
    }
    setTimeout(() => this.scrollToBottom(), 50);
  }

  setDmTarget(userId: string) {
    this.dmTargetUserId.set(userId);
    this.socialService.loadMessageHistory(userId);
    setTimeout(() => this.scrollToBottom(), 50);
  }

  handleChatSubmit() {
    const msg = this.chatInput().trim();
    if (!msg) return;

    if (this.activeHubTab() === 'room') {
      this.socialService.sendRoomMessage(this.activeRoom(), msg);
    } else if (this.activeHubTab() === 'dm' && this.dmTargetUserId()) {
      this.socialService.sendMessage(this.dmTargetUserId()!, msg);
    } else if (this.activeHubTab() === 'party') {
      this.socialService.sendPartyMessage(msg);
    }

    this.chatInput.set('');
  }

  onContentScroll(event: Event) {
    const target = event.target as HTMLElement;
    this.showBackToTop.set(target.scrollTop > 400);
  }

  scrollToTop() {
    if (this.contentViewport?.nativeElement) {
      this.contentViewport.nativeElement.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }

  addEmoji(emoji: string) {
    this.chatInput.update((v) => v + emoji);
  }

  scrollToBottom() {
    if (this.scrollContainer?.nativeElement) {
      this.scrollContainer.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollHeight;
    }
  }

  goLive(platform: string) {
    this.socialService.startStream(platform);
    this.activeHubTab.set('stream');
  }

  endStream() {
    this.socialService.stopStream();
  }
}
