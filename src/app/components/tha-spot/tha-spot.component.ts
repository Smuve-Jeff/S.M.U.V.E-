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
  HostListener,
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
import {
  MatchmakingService,
  CoOpLobby,
  SpectatorReaction,
  LobbyChatMessage,
} from '../../hub/matchmaking.service';
import { ActivatedRoute } from '@angular/router';
import {
  DailyMissionsService,
  DailyMission,
} from '../../services/daily-missions.service';
import {
  GameRatingsService,
  Rating,
  PlayResult,
} from '../../services/game-ratings.service';

const LIVE_CLOCK_INTERVAL_MS = 60000;
const FEED_REFRESH_INTERVAL_MS = 300000;

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
  styles: [
    `
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
        background: linear-gradient(
          135deg,
          rgba(225, 29, 72, 0.2) 0%,
          rgba(139, 92, 246, 0.2) 100%
        );
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
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      .icon-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      /* ============================================================
         THA SPOT — Responsive / accessibility polish (D4 follow-up).
         Inline here so it travels with the component and complements
         the existing stylesheet. Purely additive; no above-the-fold
         rule changes.
         ============================================================ */
      .spot-main-content {
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      @media (max-width: 768px) {
        .spot-main-content {
          padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
        }
      }
      /* Catalog header / filters: wrap on tablet, horiz-scroll on mobile. */
      @media (max-width: 1024px) {
        .catalog-header,
        .spot-header {
          flex-wrap: wrap;
          row-gap: 0.5rem;
          column-gap: 0.5rem;
        }
        .catalog-filters,
        .filters-rail {
          overflow-x: auto;
          flex-wrap: nowrap;
          scrollbar-width: thin;
        }
        .catalog-filters::-webkit-scrollbar,
        .filters-rail::-webkit-scrollbar { height: 4px; }
        .catalog-filters::-webkit-scrollbar-thumb,
        .filters-rail::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
        }
      }
      @media (max-width: 768px) {
        .catalog-filters { scroll-snap-type: x proximity; }
        .catalog-filters .filter-chip { scroll-snap-align: start; }
        /* Recommendation rails: snap-scroll on mobile, hidden bars. */
        .recommendation-rail .rail-cards,
        .recommendation-rails .rail-cards {
          overflow-x: auto;
          flex-wrap: nowrap;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .recommendation-rail .rail-cards::-webkit-scrollbar,
        .recommendation-rails .rail-cards::-webkit-scrollbar { display: none; }
        .recommendation-rail .game-card,
        .recommendation-rails .game-card {
          scroll-snap-align: start;
          flex: 0 0 82%;
        }
        /* Sidebars: full-screen sheet on mobile. */
        .executive-sidebar,
        .rival-hub-sidebar {
          position: fixed;
          inset: 64px 0 0 0;
          width: 100%;
          height: calc(100dvh - 64px);
          max-height: none;
          z-index: 80;
          border-radius: 0;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
        }
        .executive-sidebar.is-open,
        .rival-hub-sidebar.is-open { transform: translateX(0); }
        .spot-main-content { margin-left: 0 !important; width: 100%; }
        /* Challenge banner: safe-area aware, never overlap header. */
        .challenge-banner {
          top: auto;
          bottom: calc(80px + env(safe-area-inset-bottom, 0px));
          left: 12px;
          right: 12px;
          transform: none;
          width: auto;
          flex-direction: column;
          align-items: stretch;
          text-align: center;
          gap: 0.5rem;
          padding: 0.75rem;
        }
        .challenge-banner .challenge-actions { justify-content: center; }
        /* Overlays: full-bleed sheet feel on mobile. */
        .immersive-overlay,
        .matchmaking-overlay,
        .launch-mission-page,
        .mission-overlay {
          width: 100% !important;
          max-width: none !important;
          height: 100dvh;
          border-radius: 0;
          padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
        }
        .matchmaking-overlay .overlay-card,
        .mission-overlay .overlay-card { padding: 1rem; }
        /* Game console: full-bleed with safe-area aware footer. */
        .game-console-window,
        .console-window {
          border-radius: 0;
          width: 100%;
          height: 100dvh;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .console-header { padding: 0.5rem 0.75rem; }
        .console-footer {
          padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
        }
        /* Touch targets: enforce 44px minimum on tappable elements. */
        button,
        .action-btn,
        .nav-pill,
        .tab,
        .filter-chip,
        .game-card,
        .tab-button {
          min-height: 44px;
        }
        .game-card { padding: 0.75rem; }
      }
      @media (max-width: 1024px) {
        .executive-sidebar,
        .rival-hub-sidebar {
          position: sticky;
          top: 64px;
          align-self: start;
          max-height: calc(100vh - 72px);
        }
      }
      /* Focus rings for keyboard users; respects reduced-motion. */
      :focus-visible {
        outline: 2px solid #6ee7b7;
        outline-offset: 2px;
        border-radius: 6px;
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
        .challenge-banner { animation: none !important; }
      }
    `,
  ],
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
  public matchmaking = inject(MatchmakingService);
  private snackbarService = inject(SnackbarService);
  public dailyMissions = inject(DailyMissionsService);
  public gameRatings = inject(GameRatingsService);

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
  isFullscreen = signal<boolean>(false);
  recentGames = signal<Game[]>([]);

  // ── Hub navigation (rival hub sidebar tabs) ──────────
  // 'rooms' | 'online' | 'rivals' | 'ops'
  hubTab = signal<'rooms' | 'online' | 'rivals' | 'ops'>('rooms');
  readonly rivalHubOpen = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  private currentMatchmakingId: number | null = null;
  private matchmakingTimerId: any = null;
  private latestSearchQuery: string = '';
  private pendingGameId: string | null = null;
  private pendingRoomId: string | null = null;
  private readonly RECENT_GAMES_KEY = 'tha_spot_recent_games';

  // Social & Streaming Signals
  activeHubTab = signal<'room' | 'dm' | 'stream' | 'friends' | 'party' | 'ai'>(
    'room'
  );
  dmTargetUserId = signal<string | null>(null);
  chatInput = signal<string>('');

  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('contentViewport') contentViewport?: ElementRef<HTMLDivElement>;
  @ViewChild('remoteAudio') remoteAudio?: ElementRef<HTMLAudioElement>;

  private feedSubscription?: Subscription;
  private routeParamSubscription?: Subscription;
  private queryParamSubscription?: Subscription;
  private clockId?: any;
  private feedRefreshId?: any;
  private readonly messageHandler = (event: MessageEvent) =>
    this.onMessage(event);
  private particleInterval?: any;
  private cardObserver?: IntersectionObserver;
  private heroBgInterval?: any;
  private heroBgIndex = 0;

  // ── Upgrade Signals ──────────────────────────────────
  aiRecommendations = signal<Game[]>([]);
  gameSessionElapsed = signal(0);
  gameSessionScore = signal(0);
  private sessionTimerId: any = null;
  private sessionStartTime = 0;

  // ── Achievement System ───────────────────────────────
  achievements = signal<Achievement[]>([
    {
      id: 'first-launch',
      title: 'FIRST UPLINK',
      description: 'Launch your first game',
      icon: 'rocket_launch',
      unlocked: false,
      progress: 0,
      maxProgress: 1,
    },
    {
      id: 'play-5',
      title: 'CABINET EXPLORER',
      description: 'Play 5 different games',
      icon: 'explore',
      unlocked: false,
      progress: 0,
      maxProgress: 5,
    },
    {
      id: 'play-25',
      title: 'ARCADE VETERAN',
      description: 'Play 25 games total',
      icon: 'military_tech',
      unlocked: false,
      progress: 0,
      maxProgress: 25,
    },
    {
      id: 'favorites-3',
      title: 'CURATED COLLECTION',
      description: 'Save 3 favorite games',
      icon: 'star',
      unlocked: false,
      progress: 0,
      maxProgress: 3,
    },
    {
      id: 'multiplayer-1',
      title: 'RIVAL ENCOUNTER',
      description: 'Complete a multiplayer match',
      icon: 'swords',
      unlocked: false,
      progress: 0,
      maxProgress: 1,
    },
    {
      id: 'challenge-5',
      title: 'CHALLENGE SEASON',
      description: 'Send 5 challenges',
      icon: 'sports_kabaddi',
      unlocked: false,
      progress: 0,
      maxProgress: 5,
    },
    {
      id: 'session-10min',
      title: 'ENDURANCE RUN',
      description: 'Play for 10 minutes straight',
      icon: 'timer',
      unlocked: false,
      progress: 0,
      maxProgress: 600,
    },
  ]);
  lastUnlockedAchievement = signal<Achievement | null>(null);
  showAchievementPopup = signal(false);
  private playedGameIds = signal<Set<string>>(new Set());
  private challengeCount = signal(0);
  private readonly ACHIEVEMENTS_KEY = 'tha_spot_achievements';

  // ── AI Companion ─────────────────────────────────────
  aiCompanionMessages = signal<{ role: 'ai' | 'user'; text: string }[]>([
    {
      role: 'ai',
      text: 'S.M.U.V.E Neural Uplink active. Awaiting your command.',
    },
  ]);
  aiCompanionInput = signal('');
  aiCompanionThinking = signal(false);

  // ── Sound Effects ────────────────────────────────────
  private audioCtx: AudioContext | null = null;

  // ── Spectate Mode ────────────────────────────────────
  spectateTarget = signal<OnlineUser | null>(null);
  showSpectateOverlay = signal(false);

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
    'Complete session objective',
    'Climb the leaderboard',
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
  incomingChallenge = signal<{
    fromUserId: string;
    fromUserName?: string;
    gameId: string;
    timestamp: number;
  } | null>(null);

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
    this.loadRecentGames();
    this.loadAchievements();

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
    this.initParticleSystem();
    this.initCardObserver();
    this.startHeroBgRotation();

    // Handle path deep links as well as the existing query-based share links.
    // Nested Tha Spot routes are intentionally flat in the router, so the
    // component always receives the params for the URL that was requested.
    this.routeParamSubscription = this.route.paramMap?.subscribe((params) => {
      const routePath = this.route.routeConfig?.path || '';
      const pathId = params.get('id');
      if (routePath === 'browse' || routePath.endsWith('/browse')) {
        this.isBrowseView.set(true);
      } else if (
        (routePath === 'room/:id' || routePath.endsWith('/room/:id')) &&
        pathId
      ) {
        this.isBrowseView.set(false);
        this.pendingRoomId = pathId;
      } else if (
        (routePath === 'game/:id' || routePath.endsWith('/game/:id')) &&
        pathId
      ) {
        this.isBrowseView.set(true);
        this.pendingGameId = pathId;
        this.applyPendingGameSelection();
      }
    });

    // Handle Deep Links
    this.queryParamSubscription = this.route.queryParamMap.subscribe((params) => {
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
        this.pendingGameId = gameId;
        this.applyPendingGameSelection();
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
          this.pendingGameId = challengeGameId;
          this.applyPendingGameSelection();
        }
      }
    });

    this.setActiveRoom(this.pendingRoomId || 'co-op-link');

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
    this.routeParamSubscription?.unsubscribe();
    this.queryParamSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    if (this.hubTimeoutId) clearTimeout(this.hubTimeoutId);
    if (this.particleInterval) clearInterval(this.particleInterval);
    if (this.heroBgInterval) clearInterval(this.heroBgInterval);
    this.cardObserver?.disconnect();
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
    this.playSoundEffect('select');
  }

  onGameCardKeydown(game: Game, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onGameClick(game);
    }
  }

  closePreview() {
    this.selectedGame.set(null);
  }

  closeGame() {
    // Check session duration achievement before resetting
    if (this.sessionStartTime > 0) {
      const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      this.achievements.update((a) =>
        a.map((ach) =>
          ach.id === 'session-10min'
            ? {
                ...ach,
                progress: Math.min(ach.maxProgress, ach.progress + elapsed),
              }
            : ach
        )
      );
      this.checkAchievements();
      this.playSoundEffect('close');
    }
    this.inGame.set(false);
    this.currentGame.set(null);
    this.isFullscreen.set(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (this.sessionTimerId) {
      clearInterval(this.sessionTimerId);
      this.sessionTimerId = null;
    }
    this.gameSessionElapsed.set(0);
  }

  toggleIntel() {
    this.showIntelPanel.update((v) => !v);
  }

  toggleBrowse() {
    this.isBrowseView.update((v) => !v);
  }

  cancelMatchmaking() {
    const game = this.selectedGame();
    if (game) this.matchmaking.cancelMatchQueue(game.id);
    this.isMatchmaking.set(false);
    this.currentMatchmakingId = null;
  }

  async; /**
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
      const url =
        game.launchConfig?.approvedExternalUrl ||
        game.launchConfig?.approvedEmbedUrl ||
        game.url;
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
      this.snackbarService.error(
        'SECURITY: This game source is not on the trusted allowlist.'
      );
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
      this.matchmaking.queueForMatch(game.id);

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
    this.addRecentGame(game);
    this.closePreview();

    // Start session timer
    this.gameSessionScore.set(0);
    this.gameSessionElapsed.set(0);
    this.sessionStartTime = Date.now();
    this.sessionTimerId = setInterval(() => {
      this.gameSessionElapsed.set(
        Math.floor((Date.now() - this.sessionStartTime) / 1000)
      );
    }, 1000);

    // Play launch sound
    this.playSoundEffect('launch');

    // Track achievement
    this.playedGameIds.update((s) => {
      s.add(game.id);
      return s;
    });
    this.checkAchievements();

    // Generate AI recommendation
    this.generateAiRecommendations();
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
    if (game) this.matchmaking.cancelMatchQueue(game.id);
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
        this.profileService.recordGameLaunch(
          game.id,
          this.buildSessionContext(game)
        );
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
    // After load, force-apply sandbox policy in case the upstream resource requested
    // a permissions upgrade via feature policy (defense-in-depth).
    const iframe = this.gameIframe?.nativeElement;
    if (iframe) {
      try {
        iframe.setAttribute('sandbox', this.getSandboxAttr(this.currentGame()));
      } catch {}
      try {
        iframe.setAttribute(
          'allow',
          this.getIframeAllowAttr(this.currentGame())
        );
      } catch {}
    }
  }

  /**
   * Iframe error handler — shows retry UI.
   */
  onGameIframeError() {
    this.gameLoadError.set(true);
    this.gameLoadStage.set('idle');
  }

  /**
   * Strong iframe sandbox policy driven by GameService.buildIframeSandbox.
   * 'internal' cabinets (our own WASM files) keep allow-same-origin for boot.
   * External trusted partners get a strict sandbox without same-origin so the
   * iframe cannot read our cookies/storage.
   */
  getSandboxAttr(game: Game | null): string {
    return this.gameService.buildIframeSandbox(game || undefined);
  }

  /**
   * Permissions Policy attribute aligned with the selected cabinet's tags.
   * Multiplayer cabinets unlock microphone/camera; everything else stays strict.
   */
  getIframeAllowAttr(game: Game | null): string {
    return this.gameService.buildIframeAllowAttr(game || undefined);
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
    this.isLoading.set(true);
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
        this.isLoading.set(false);
        this.applyPendingGameSelection();
        this.refreshCardObserver();
      });
  }

  private applyPendingGameSelection(): void {
    const gameId = this.pendingGameId;
    if (!gameId) return;

    const game = this.games().find((candidate) => candidate.id === gameId);
    if (game) {
      this.selectedGame.set(game);
      this.pendingGameId = null;
    }
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
   * Create floating particles in the cosmic background.
   */
  private initParticleSystem(): void {
    const container = document.querySelector('.cosmic-bg');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      const size = 1 + Math.random() * 2;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = 100 + Math.random() * 20 + '%';
      particle.style.animationDuration = 15 + Math.random() * 25 + 's';
      particle.style.animationDelay = Math.random() * 20 + 's';
      const colors = [
        'var(--neon-cyan)',
        'var(--neon-purple)',
        'var(--neon-pink)',
      ];
      particle.style.background =
        colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(particle);
    }
  }

  /**
   * Intersection Observer for staggered card reveal animations.
   */
  private initCardObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            this.cardObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    // Observe game cards after feed loads
    setTimeout(() => {
      document
        .querySelectorAll('.game-card:not(.skeleton-card)')
        .forEach((card) => {
          this.cardObserver?.observe(card);
        });
    }, 500);
  }

  /**
   * Rotate the hero background through featured games.
   */
  private startHeroBgRotation(): void {
    this.heroBgInterval = setInterval(() => {
      const games = this.games();
      if (games.length === 0) return;
      this.heroBgIndex = (this.heroBgIndex + 1) % Math.min(games.length, 5);
      const bgEl = document.querySelector('.hero-bg-image') as HTMLElement;
      if (bgEl && games[this.heroBgIndex]?.image) {
        bgEl.style.backgroundImage = `url(${games[this.heroBgIndex].image})`;
        bgEl.style.opacity = '0';
        setTimeout(() => {
          bgEl.style.opacity = '0.25';
        }, 50);
      }
    }, 8000);
  }

  /**
   * Re-initialize card observer when feed reloads.
   */
  private refreshCardObserver(): void {
    this.cardObserver?.disconnect();
    setTimeout(() => {
      document
        .querySelectorAll('.game-card:not(.skeleton-card)')
        .forEach((card) => {
          this.cardObserver?.observe(card);
        });
    }, 300);
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
    if (
      url.startsWith('/') ||
      url.startsWith('assets/') ||
      url.startsWith('./')
    ) {
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
    if (
      url.startsWith('/') ||
      url.startsWith('assets/') ||
      url.startsWith('./')
    ) {
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

    // ── Game State Sync: forward state from iframe to lobby ──
    if (event.data?.type === 'GAME_STATE_UPDATE') {
      this.matchmaking.broadcastGameState({
        score: event.data.data?.score,
        progress: event.data.data?.progress,
        level: event.data.data?.level,
        alive: event.data.data?.alive,
        position: event.data.data?.position,
        custom: event.data.data?.custom,
      });
      // Also record as replay snapshot
      this.matchmaking.recordGameSnapshot(
        event.data.data || {},
        event.data.data?.label
      );
      return;
    }

    // ── Legacy: GAME_OVER event ──
    if (event.data?.type === 'GAME_OVER') {
      this.profileService.recordGameResult(active.id, {
        ...this.buildSessionContext(active),
        score: event.data.data?.score,
      });
      // Final snapshot before closing
      this.matchmaking.recordGameSnapshot(
        { ...event.data.data, event: 'GAME_OVER' },
        'Game Over'
      );
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
      // Build a stable first-wins map to guard against duplicate game IDs
      const gameMap = new Map<string, Game>();
      for (const g of allGames) {
        if (!gameMap.has(g.id)) {
          gameMap.set(g.id, g);
        }
      }
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
    if (!this.showRivalHub()) {
      this.spectateTarget.set(null);
      this.showSpectateOverlay.set(false);
    }
  }

  sendChallenge(userId: string, gameId: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    this.inboxService.challengePlayer(userId, gameId);
    this.snackbarService.success('CHALLENGE DISPATCHED');
    this.challengeCount.update((c) => c + 1);
    this.checkAchievements();
    this.playSoundEffect('challenge');
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
    const game =
      this.games().find((g) => g.id === gameId) || this.selectedGame();
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
    const game =
      this.games().find((g) => g.id === gameId) || this.selectedGame();
    const gameName = game?.name || gameId;
    const link = this.buildChallengeLink(gameId, toUserId);
    const body = encodeURIComponent(
      `🎮 Challenge me to ${gameName} on S.M.U.V.E.! ${link}`
    );
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
    this.playSoundEffect('challenge');
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

  setHubTab(tab: 'room' | 'dm' | 'stream' | 'friends' | 'party' | 'ai') {
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

  /**
   * Launch selected game on Enter key press (when a game is selected and not already launching).
   */
  @HostListener('document:keydown.enter', ['$event'])
  onEnterKey(event: KeyboardEvent): void {
    if (this.selectedGame() && !this.currentGame() && !this.isMatchmaking()) {
      // Ensure we're not typing in an input
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        event.preventDefault();
        this.confirmLaunch();
      }
    }
  }

  /**
   * Escape key closes preview or game.
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.currentGame()) {
      event.preventDefault();
      this.closeGame();
    } else if (this.selectedGame()) {
      event.preventDefault();
      this.closePreview();
    }
  }

  /**
   * Toggle fullscreen mode for the game console.
   */
  toggleFullscreen(): void {
    this.isFullscreen.update((v) => !v);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  /**
   * Recent games tracking — persist last 8 played games in localStorage.
   */
  private loadRecentGames(): void {
    try {
      const raw = localStorage.getItem(this.RECENT_GAMES_KEY);
      if (raw) this.recentGames.set(JSON.parse(raw));
    } catch {
      /* ignore corrupt data */
    }
  }

  private addRecentGame(game: Game): void {
    const current = this.recentGames().filter((g) => g.id !== game.id);
    current.unshift(game);
    if (current.length > 8) current.length = 8;
    this.recentGames.set(current);
    try {
      localStorage.setItem(this.RECENT_GAMES_KEY, JSON.stringify(current));
    } catch {
      /* storage full — silently ignore */
    }
  }

  clearRecentGames(): void {
    this.recentGames.set([]);
    try {
      localStorage.removeItem(this.RECENT_GAMES_KEY);
    } catch {
      /* ignore */
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

  // ── Achievement System ──────────────────────────────
  private loadAchievements(): void {
    try {
      const saved = localStorage.getItem(this.ACHIEVEMENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Achievement[];
        const updated = this.achievements().map((a) => {
          const found = parsed.find((p) => p.id === a.id);
          return found
            ? { ...a, unlocked: found.unlocked, progress: found.progress }
            : a;
        });
        this.achievements.set(updated);
      }
    } catch {
      /* ignore */
    }
  }

  private saveAchievements(): void {
    try {
      localStorage.setItem(
        this.ACHIEVEMENTS_KEY,
        JSON.stringify(this.achievements())
      );
    } catch {
      /* ignore */
    }
  }

  private checkAchievements(): void {
    let newUnlock: Achievement | null = null;

    this.achievements.update((a) =>
      a.map((ach) => {
        if (ach.unlocked) return ach;

        let progress = ach.progress;
        switch (ach.id) {
          case 'first-launch':
            progress = Math.min(1, progress + 1);
            break;
          case 'play-5':
            progress = Math.min(5, this.playedGameIds().size);
            break;
          case 'play-25':
            progress = Math.min(
              25,
              this.recentGames().length + this.playedGameIds().size
            );
            break;
          case 'favorites-3':
            progress = Math.min(3, this.favorites().length);
            break;
          case 'multiplayer-1':
            progress = Math.min(1, progress + 1);
            break;
          case 'challenge-5':
            progress = Math.min(5, this.challengeCount());
            break;
          case 'session-10min':
            // Progress tracked in closeGame()
            break;
        }

        if (progress >= ach.maxProgress && !ach.unlocked) {
          newUnlock = { ...ach, unlocked: true, progress: ach.maxProgress };
          return { ...ach, unlocked: true, progress: ach.maxProgress };
        }
        return { ...ach, progress };
      })
    );

    this.saveAchievements();

    if (newUnlock) {
      this.lastUnlockedAchievement.set(newUnlock);
      this.showAchievementPopup.set(true);
      this.snackbarService.success(
        `🏆 ACHIEVEMENT UNLOCKED: ${newUnlock.title}`
      );
      this.playSoundEffect('achievement');
      setTimeout(() => this.showAchievementPopup.set(false), 4000);
    }
  }

  // ── AI Game Recommendations ─────────────────────────
  private generateAiRecommendations(): void {
    const profile = this.profileService.profile();
    const profileGenres = [profile.primaryGenre].filter(Boolean);
    const allGames = this.games();
    const played = this.playedGameIds();

    const matching = allGames
      .filter(
        (g) =>
          !played.has(g.id) &&
          g.genre &&
          profileGenres.some(
            (pg) =>
              g.genre!.toLowerCase().includes(pg.toLowerCase()) ||
              pg.toLowerCase().includes(g.genre!.toLowerCase())
          )
      )
      .slice(0, 4);

    if (matching.length === 0) {
      // Fallback: recommend top-rated unplayed games
      const fallback = allGames
        .filter((g) => !played.has(g.id))
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 4);
      this.aiRecommendations.set(fallback);
    } else {
      this.aiRecommendations.set(matching);
    }
  }

  // ── AI Companion Chat ───────────────────────────────
  async sendAiCompanionMessage(): Promise<void> {
    const text = this.aiCompanionInput().trim();
    if (!text) return;

    this.aiCompanionMessages.update((msgs) => [
      ...msgs,
      { role: 'user', text },
    ]);
    this.aiCompanionInput.set('');
    this.aiCompanionThinking.set(true);

    // Simulate AI thinking delay
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

    const aiResponses: Record<string, string[]> = {
      default: [
        'AFFIRMATIVE. Scanning game library for optimal missions.',
        'Your S.M.U.V.E neural sync is strong. Ready for deployment.',
        'I recommend calibrating your reflexes with a quick round.',
        'Enemy patterns detected. Adjust your strategy accordingly.',
        'Elite operators always maintain situational awareness.',
        'The Arcade floor awaits your command.',
        'Rival activity detected in your sector. Stay sharp.',
        'Your track record suggests high-performance potential.',
      ],
      recommend: [
        'Based on your profile, I recommend the Fighting Pit for competitive edge.',
        'Your genre affinity suggests RPG deep runs would yield high session value.',
        'Shooting Range cabinets show optimal match with your play style.',
      ],
      help: [
        'Available commands: recommend, status, squad, leaderboard',
        'I can assist with game recommendations, matchmaking status, and squad coordination.',
      ],
      status: [
        `Systems nominal. ${this.onlineUsers().length} operatives online. Neural sync at ${this.neuralSyncScore()}%.`,
      ],
    };

    const lower = text.toLowerCase();
    let pool = aiResponses.default;
    if (lower.includes('recommend') || lower.includes('suggest'))
      pool = aiResponses.recommend;
    else if (lower.includes('help') || lower.includes('what'))
      pool = aiResponses.help;
    else if (lower.includes('status') || lower.includes('systems'))
      pool = aiResponses.status;

    const response = pool[Math.floor(Math.random() * pool.length)];

    this.aiCompanionMessages.update((msgs) => [
      ...msgs,
      { role: 'ai', text: response },
    ]);
    this.aiCompanionThinking.set(false);
    setTimeout(() => this.scrollToBottom(), 100);
  }

  // ── Spectate Mode ───────────────────────────────────
  startSpectate(user: OnlineUser): void {
    this.spectateTarget.set(user);
    this.showSpectateOverlay.set(true);
    this.snackbarService.info(`SPECTATING: ${user.artistName || 'RIVAL'}`);
    this.playSoundEffect('select');
  }

  stopSpectate(): void {
    this.spectateTarget.set(null);
    this.showSpectateOverlay.set(false);
  }

  // ── Favorites ───────────────────────────────────────
  toggleFavorite(gameId: string): void {
    const current = this.favorites();
    const updated = current.includes(gameId)
      ? current.filter((id) => id !== gameId)
      : [...current, gameId];
    this.favorites.set(updated);
    this.checkAchievements();
    try {
      localStorage.setItem('tha_spot_favorites', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  }

  isFavorite(gameId: string): boolean {
    return this.favorites().includes(gameId);
  }

  // ── Quick-Lobby (one-click from game card) ───────────
  /** Creates a co-op lobby directly from a game card without opening preview. */
  quickCreateLobby(gameId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A MULTIPLAYER GAME FIRST');
      return;
    }
    const lobby = this.matchmaking.createLobby(gameId);
    this.snackbarService.success(
      `LOBBY CREATED: ${lobby.gameName.toUpperCase()}`
    );
    this.playSoundEffect('select');
    // Switch to party tab to show the lobby
    this.setHubTab('party');
    if (!this.showRivalHub()) this.toggleRivalHub();
  }

  // ── Is multiplayer helper for template ───────────────
  isMultiplayer(game: Game): boolean {
    return this.isMultiplayerGame(game);
  }

  // ── Ready-Up ──────────────────────────────────────────
  toggleReady(): void {
    this.matchmaking.toggleReady();
    this.playSoundEffect('select');
  }

  startLobbyCountdown(): void {
    this.matchmaking.startCountdown();
  }

  cancelLobbyCountdown(): void {
    this.matchmaking.cancelCountdown();
  }

  // ── Lobby Voice Chat ───────────────────────────────────
  toggleLobbyMute(): void {
    this.peerService.toggleMute();
  }

  startLobbyVoiceCall(playerId: string): void {
    this.peerService.startCall(playerId);
  }

  /** Whether the current user is actively speaking (for voice activity indicator) */
  get isVoiceActive(): boolean {
    return this.peerService.voiceActivityLevel() > 15;
  }

  /** Voice activity level 0-100 for CSS variable binding */
  get voiceActivityPct(): number {
    return this.peerService.voiceActivityLevel();
  }

  // ── Persistent Lobby Chat ──────────────────────────────

  sendLobbyChat(text: string): void {
    this.matchmaking.sendLobbyChatMessage(text);
  }

  // ── Spectator Mode ─────────────────────────────────────
  startSpectateLobby(lobbyId: string): void {
    this.matchmaking.startSpectateLobby(lobbyId);
  }

  stopSpectateLobby(): void {
    this.matchmaking.stopSpectateLobby();
  }

  // ── Replay Viewer ──────────────────────────────────────
  startReplayViewer(): void {
    const lobby = this.matchmaking.myLobby();
    if (lobby) {
      this.matchmaking.startReplay(lobby.id);
    }
  }

  stopReplayViewer(): void {
    this.matchmaking.stopReplay();
  }

  // ── Lobby Invite ──────────────────────────────────────
  copyLobbyInviteLink(): void {
    this.matchmaking.copyLobbyInviteLink();
    this.playSoundEffect('select');
  }

  async shareLobbyInvite(): Promise<void> {
    await this.matchmaking.shareLobbyInvite();
  }

  // ── Sound Effects ───────────────────────────────────
  private playSoundEffect(
    type: 'select' | 'launch' | 'close' | 'challenge' | 'achievement'
  ): void {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      switch (type) {
        case 'select':
          osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(
            1200,
            this.audioCtx.currentTime + 0.1
          );
          gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.15
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.15);
          break;
        case 'launch':
          osc.type = 'square';
          osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(
            800,
            this.audioCtx.currentTime + 0.3
          );
          gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.4
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.4);
          break;
        case 'close':
          osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(
            200,
            this.audioCtx.currentTime + 0.15
          );
          gain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.2
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.2);
          break;
        case 'challenge':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, this.audioCtx.currentTime);
          osc.frequency.setValueAtTime(500, this.audioCtx.currentTime + 0.1);
          osc.frequency.setValueAtTime(700, this.audioCtx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.35
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.35);
          break;
        case 'achievement':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, this.audioCtx.currentTime);
          osc.frequency.setValueAtTime(659, this.audioCtx.currentTime + 0.15);
          osc.frequency.setValueAtTime(784, this.audioCtx.currentTime + 0.3);
          osc.frequency.setValueAtTime(1047, this.audioCtx.currentTime + 0.45);
          gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.6
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.6);
          break;
      }
    } catch {
      /* Audio not available — silent */
    }
  }
}

// ── Achievement Interface ─────────────────────────────
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}
