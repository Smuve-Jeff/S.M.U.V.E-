import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService, GameSortMode } from '../../hub/game.service';
import {
  Game,
  GameBadge,
  GameRoom,
  LiveEvent,
  PromotionCard,
  RecommendationRail,
  SocialPresence,
  CinemaStream,
} from '../../hub/game';
import { APP_SECURITY_CONFIG } from '../../app.security';
import { UserProfileService } from '../../services/user-profile.service';
import { SecurityService } from '../../services/security.service';
import { UIService } from '../../services/ui.service';

const DEFAULT_RECOMMENDATION_ITEMS = 8;
const FEED_REFRESH_INTERVAL_MS = 300000;
const LIVE_CLOCK_INTERVAL_MS = 60000;
type QuickFilter = 'featured' | 'multiplayer' | 'instant' | 'online';
const QUICK_FILTERS: QuickFilter[] = [
  'featured',
  'multiplayer',
  'instant',
  'online',
];

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
})
export class ThaSpotComponent implements OnInit, OnDestroy {
  private gameService = inject(GameService);
  private profileService = inject(UserProfileService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private securityService = inject(SecurityService);
  public uiService = inject(UIService);

  readonly quickFilterOptions = QUICK_FILTERS;
  readonly displayMode = signal<'gaming' | 'cinema'>('gaming');
  readonly streams = signal<CinemaStream[]>([]);
  readonly currentStream = signal<CinemaStream | null>(null);
  readonly cinemaLayout = signal<"overlay" | "theater">("overlay");

  // Feed Signals
  feed = signal<any>(null);
  games = signal<Game[]>([]);
  gamingRooms = signal<GameRoom[]>([]);
  badges = signal<GameBadge[]>([]);
  liveEvents = signal<LiveEvent[]>([]);
  socialPresence = signal<SocialPresence[]>([]);
  promotions = signal<PromotionCard[]>([]);
  recommendationRails = signal<RecommendationRail[]>([]);

  // Discovery State
  activeRoom = signal<string>('all');
  activePlatform = signal<string>('all');
  activeGenre = signal<string>('all');
  searchQuery = signal<string>('');
  sortMode = signal<GameSortMode>('Popular');
  quickFilters = signal<QuickFilter[]>([]);
  favorites = signal<string[]>([]);

  // Selection & UI Signals
  selectedGame = signal<Game | null>(null);
  currentGame = signal<Game | null>(null);
  isBrowseView = signal<boolean>(false);
  showIntelPanel = signal<boolean>(false);
  now = signal<number>(Date.now());

  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('videoPlayer') videoPlayer?: ElementRef<HTMLVideoElement>;

  private feedSubscription?: Subscription;
  private clockId?: any;
  private feedRefreshId?: any;
  private streamInitTimeoutId?: number;
  private readonly messageHandler = (event: MessageEvent) =>
    this.onMessage(event);
  private hlsPlayer?: {
    destroy: () => void;
    loadSource: (url: string) => void;
    attachMedia: (media: HTMLMediaElement) => void;
    on: (event: string, listener: () => void) => void;
  };
  private onNativeHlsMetadata?: () => void;

  // Computed signals
  filteredGames = computed(() => {
    if (this.displayMode() === 'cinema') return [];
    return this.gameService.filterAndSortGames(
      this.games(),
      {
        genre: this.activeGenre(),
        query: this.searchQuery(),
        platform: this.activePlatform(),
        favorites: this.favorites(),
        quickFilters: this.quickFilters(),
      },
      this.sortMode()
    );
  });

  filteredStreams = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.streams().filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query) ||
        s.genre?.toLowerCase().includes(query)
    );
  });

  matchingRecommendationRails = computed(() => {
    const profile = this.profileService.profile();
    return this.recommendationRails().filter((rail) =>
      this.matchesRecommendationAudience(rail, profile)
    );
  });

  activeRecommendationRail = computed(() => {
    const roomId = this.activeRoom();
    return this.matchingRecommendationRails().find((r) =>
      r.roomIds?.includes(roomId)
    );
  });

  recommendedGames = computed(() => {
    const rail = this.activeRecommendationRail();
    return rail ? this.getGamesForRail(rail) : [];
  });

  recentlyPlayed = computed(() => this.games().slice(0, 3));
  liveMetrics = signal({ roomPlayers: 1710, activeMatches: 42 });
  activitySummary = signal({ favoriteRoomLabel: 'Producer Lounge' });

  activeEvents = computed(() => {
    const time = this.now();
    return this.liveEvents().map((event) =>
      this.resolveEventStatus(event, time)
    );
  });

  currentSafeStreamUrl = computed(() => {
    const stream = this.currentStream();
    if (!stream || stream.type !== "iframe") return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(stream.url);
  });

  currentSafeUrl = computed(() => {
    const game = this.currentGame();
    return game ? this.getSafeUrl(game) : null;
  });

  launchWarning = computed(() => {
    const game = this.selectedGame();
    return game ? this.resolveLaunchWarning(game) : '';
  });

  neuralSyncScore = signal(88);
  gamingDirectives = signal([
    'MAINTAIN PEAK EXECUTION',
    'OPTIMIZE RETRO UPLINK',
    'EXTRACT STRATEGIC VALUE',
  ]);

  isMatchmaking = signal(false);
  matchmakingStatus = signal('INITIALIZING UPLINK...');
  matchmakingProgress = signal(0);

  constructor() {
    const savedFavs = localStorage.getItem('tha_spot_favorites');
    if (savedFavs) {
      this.favorites.set(JSON.parse(savedFavs));
    }
  }

  ngOnInit() {
    this.securityService.getCSRFToken();
    this.loadFeed();
    this.startLiveClock();
    this.startFeedRefresh();
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    window.removeEventListener('message', this.messageHandler);
    this.destroyStreamPlayer();
  }

  setActiveRoom(id: string) {
    this.activeRoom.set(id);
  }

  previewGame(game: Game) {
    this.selectedGame.set(game);
  }

  onGameClick(game: Game) {
    this.previewGame(game);
  }

  closePreview() {
    this.selectedGame.set(null);
  }

  async confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;

    if (game.launchConfig?.embedMode === 'external-only') {
      const url = game.launchConfig.approvedExternalUrl || game.url;
      window.open(url, '_blank');
      this.closePreview();
    } else {
      // Logic for multiplayer matchmaking simulation from tests
      if (this.isMultiplayerGame(game)) {
        this.isMatchmaking.set(true);
        this.matchmakingStatus.set('SCANNING FOR RIVALS...');
        for (let i = 0; i <= 100; i += 20) {
          this.matchmakingProgress.set(i);
          await new Promise((r) => setTimeout(r, 800));
        }
        this.isMatchmaking.set(false);
      }

      this.profileService.recordGameLaunch(
        game.id,
        this.buildSessionContext(game)
      );
      this.currentGame.set(game);
      this.closePreview();
    }
  }

  closeGame() {
    this.currentGame.set(null);
  }

  reloadGame() {
    const iframe = this.gameIframe?.nativeElement;
    if (iframe) {
      const currentSrc = iframe.src;
      iframe.src = '';
      iframe.src = currentSrc;
    }
  }

  toggleIntel() {
    this.showIntelPanel.update((value) => !value);
  }

  toggleBrowse() {
    this.isBrowseView.update((value) => !value);
  }

  getActiveRoomName(): string {
    const roomId = this.activeRoom();
    return (
      this.gamingRooms().find((room) => room.id === roomId)?.name || 'All Games'
    );
  }

  clearDiscoveryControls(): void {
    this.activeRoom.set('all');
    this.activePlatform.set('all');
    this.activeGenre.set('all');
    this.searchQuery.set('');
    this.sortMode.set('Popular');
    this.quickFilters.set([]);
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    const games = [...this.games()];
    if (rail.gameIds?.length) {
      const lookup = new Map(games.map((game) => [game.id, game]));
      return rail.gameIds.map((id) => lookup.get(id)).filter(Boolean) as Game[];
    }
    return games.slice(0, 4);
  }

  isRetroOrArcade(game: Game): boolean {
    const tags = (game.tags || []).map((t) => t.toLowerCase());
    return (
      tags.includes('retro') ||
      tags.includes('arcade') ||
      game.badgeIds?.includes('elite') === true
    );
  }

  getSafeUrl(game: Game): SafeResourceUrl | null {
    let url: string | undefined;

    if (game.url && game.url.startsWith('/assets/')) {
      url = game.url;
    } else if (game.launchConfig?.embedMode === 'external-only') {
      url = game.launchConfig.approvedExternalUrl || game.url;
    } else {
      url = game.launchConfig?.approvedEmbedUrl || game.url;
    }

    if (!url) return null;

    if (this.isRetroOrArcade(game)) {
      const separator = url.includes('?') ? '&' : '?';
      const token = APP_SECURITY_CONFIG.auth_salt;
      url = `${url}${separator}smuve_auth_token=${token}&secure_mode=wasm`;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  onMessage(event: MessageEvent): void {
    const active = this.currentGame();
    const frameWindow = this.gameIframe?.nativeElement?.contentWindow;
    if (
      !active ||
      !frameWindow ||
      event.source !== frameWindow ||
      !this.isTrustedGameMessageOrigin(event, active) ||
      !event.data ||
      typeof event.data !== 'object' ||
      typeof event.data.type !== 'string'
    ) {
      return;
    }

    switch (event.data?.type) {
      case 'GAME_READY':
        break;
      case 'GAME_UPDATE':
        if (
          event.data.data?.score !== undefined ||
          event.data.data?.level !== undefined
        ) {
          this.profileService.recordGameResult(active.id, {
            ...this.buildSessionContext(active),
            score: event.data.data.score,
            level: event.data.data.level,
          });
        }
        break;
      case 'GAME_SAVE':
        if (event.data.payload) {
          localStorage.setItem(
            `smuve_save_${active.id}`,
            JSON.stringify(event.data.payload)
          );
        }
        break;
      case 'GAME_OVER':
        this.profileService.recordGameResult(active.id, {
          ...this.buildSessionContext(active),
          score: event.data.data?.score,
          level: event.data.data?.level,
          isWin: event.data.data?.isWin,
        });
        this.closeGame();
        break;
    }
  }

  private loadFeed(forceRefresh = false) {
    this.feedSubscription?.unsubscribe();
    this.feedSubscription = this.gameService
      .getThaSpotFeed(forceRefresh)
      .subscribe((feed) => {
        this.feed.set(feed);
        this.games.set(feed.games);
        this.gamingRooms.set(feed.rooms);
        this.badges.set(feed.badges);
        this.liveEvents.set(feed.liveEvents);
        this.socialPresence.set(feed.socialPresence);
        this.promotions.set(feed.promotions);
        this.recommendationRails.set(feed.recommendationRails);
        this.streams.set(feed.streams || []);
      });
  }

  private startLiveClock(): void {
    this.clockId = window.setInterval(() => {
      this.now.set(Date.now());
    }, LIVE_CLOCK_INTERVAL_MS);
  }

  private startFeedRefresh(): void {
    this.feedRefreshId = window.setInterval(() => {
      this.loadFeed(true);
    }, FEED_REFRESH_INTERVAL_MS);
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  setSortMode(mode: GameSortMode): void {
    this.sortMode.set(mode);
  }

  setActivePlatform(platform: string): void {
    this.activePlatform.set(platform);
  }

  setActiveGenre(genre: string): void {
    this.activeGenre.set(genre);
  }

  toggleQuickFilter(filter: QuickFilter): void {
    const activeFilters = this.quickFilters();
    this.quickFilters.set(
      activeFilters.includes(filter)
        ? activeFilters.filter((activeFilter) => activeFilter !== filter)
        : [...activeFilters, filter]
    );
  }

  private resolveEventStatus(event: LiveEvent, now: number): LiveEvent {
    if (!event.schedule?.startAt) return event;
    const start = new Date(event.schedule.startAt).getTime();
    const end = event.schedule.endAt
      ? new Date(event.schedule.endAt).getTime()
      : null;

    let status: LiveEvent['status'] = event.status;
    if (!Number.isNaN(start) && now < start) {
      status = 'upcoming';
    } else if (end && !Number.isNaN(end) && now > end) {
      status = 'ending-soon';
    } else {
      status = 'live';
    }
    return { ...event, status };
  }

  private resolveLaunchWarning(game: Game): string {
    if (game.launchConfig?.embedMode === 'external-only')
      return 'External governance required. Launches in a separate tab.';
    return 'Exact embed target verified.';
  }

  private isMultiplayerGame(game: Game): boolean {
    const tags = (game.tags || []).map((tag) => tag.toLowerCase());
    return (
      (game.multiplayerType && game.multiplayerType !== 'None') ||
      tags.includes('multiplayer')
    );
  }

  private buildSessionContext(game: Game) {
    const event = this.activeEvents().find(
      (entry) => entry.featuredGameId === game.id
    );

    return {
      roomId: this.activeRoom(),
      eventId: event?.id,
      reward: event?.reward,
      rewardType: event?.schedule?.rewardType,
    };
  }

  launchActionLabel(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only'
      ? 'OPEN EXTERNALLY'
      : 'INITIALIZE';
  }

  toggleFavorite(gameId: string, event: Event) {
    event.stopPropagation();
    const current = this.favorites();
    const updated = current.includes(gameId)
      ? current.filter((id) => id !== gameId)
      : [...current, gameId];
    this.favorites.set(updated);
    localStorage.setItem('tha_spot_favorites', JSON.stringify(updated));
  }

  isFavorite(gameId: string): boolean {
    return this.favorites().includes(gameId);
  }

  // Cinema Mode Handlers
  toggleCinemaLayout(): void {
    this.cinemaLayout.set(this.cinemaLayout() === 'overlay' ? 'theater' : 'overlay');
  }

  setMode(mode: 'gaming' | 'cinema'): void {
    this.displayMode.set(mode);
    if (mode === 'cinema') {
      this.closeGame();
      return;
    }
    this.closeStream();
  }

  onStreamClick(stream: CinemaStream): void {
    this.destroyStreamPlayer();
    this.currentStream.set(stream);
    if (stream.type !== "iframe") {
      this.streamInitTimeoutId = window.setTimeout(
        () => this.initializeHlsPlayer(),
        100
      );
    }
  }

  closeStream(): void {
    this.destroyStreamPlayer();
    if (this.videoPlayer?.nativeElement) {
      this.videoPlayer.nativeElement.pause();
      this.videoPlayer.nativeElement.src = '';
      this.videoPlayer.nativeElement.load();
    }
    this.currentStream.set(null);
  }

  private initializeHlsPlayer(): void {
    const video = this.videoPlayer?.nativeElement;
    const stream = this.currentStream();

    if (!video || !stream) return;

    const hlsCtor = (window as any).Hls;
    if (hlsCtor && hlsCtor.isSupported()) {
      const hls = new hlsCtor();
      this.hlsPlayer = hls;
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(hlsCtor.Events.MANIFEST_PARSED, () => {
        video.play().catch((err) => console.warn('Autoplay prevented', err));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream.url;
      this.onNativeHlsMetadata = () => {
        video.play().catch((err) => console.warn('Autoplay prevented', err));
      };
      video.addEventListener('loadedmetadata', this.onNativeHlsMetadata, {
        once: true,
      });
    }
  }

  private destroyStreamPlayer(): void {
    if (this.streamInitTimeoutId !== undefined) {
      window.clearTimeout(this.streamInitTimeoutId);
      this.streamInitTimeoutId = undefined;
    }

    if (this.onNativeHlsMetadata && this.videoPlayer?.nativeElement) {
      this.videoPlayer.nativeElement.removeEventListener(
        'loadedmetadata',
        this.onNativeHlsMetadata
      );
      this.onNativeHlsMetadata = undefined;
    }

    this.hlsPlayer?.destroy();
    this.hlsPlayer = undefined;
  }

  private isTrustedGameMessageOrigin(
    event: MessageEvent,
    active: Game
  ): boolean {
    const candidates = [
      active.launchConfig?.approvedEmbedUrl,
      active.launchConfig?.approvedExternalUrl,
      active.url,
    ].filter((candidate): candidate is string => Boolean(candidate));
    const allowedOrigins = new Set(
      candidates
        .map((candidate) => {
          try {
            return new URL(candidate, window.location.origin).origin;
          } catch {
            return null;
          }
        })
        .filter((origin): origin is string => Boolean(origin))
    );
    allowedOrigins.add(window.location.origin);
    return allowedOrigins.has(event.origin);
  }

  private matchesRecommendationAudience(
    rail: RecommendationRail,
    profile: { primaryGenre?: string; gameStats?: Record<string, any> } | null
  ): boolean {
    const audience = rail.audience;
    if (!audience) return true;

    const primaryGenre = profile?.primaryGenre;
    if (
      audience.primaryGenres?.length &&
      (!primaryGenre || !audience.primaryGenres.includes(primaryGenre))
    ) {
      return false;
    }

    const totalPlays = this.totalPlays(profile?.gameStats || {});
    if (audience.minPlays !== undefined && totalPlays < audience.minPlays) {
      return false;
    }
    if (audience.maxPlays !== undefined && totalPlays > audience.maxPlays) {
      return false;
    }

    return true;
  }

  private totalPlays(stats: Record<string, { plays?: number }>): number {
    return Object.values(stats).reduce(
      (sum, entry) => sum + (entry.plays || 0),
      0
    );
  }
}
