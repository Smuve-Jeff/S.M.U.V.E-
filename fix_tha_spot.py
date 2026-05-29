import sys

header = """import {
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
  public uiService = inject(UIService);

  readonly quickFilterOptions = QUICK_FILTERS;
  readonly displayMode = signal<'gaming' | 'cinema'>('gaming');
  readonly streams = signal<CinemaStream[]>([]);
  readonly currentStream = signal<CinemaStream | null>(null);

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
    this.loadFeed();
    this.startLiveClock();
    this.startFeedRefresh();
    window.addEventListener('message', this.onMessage.bind(this));
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    window.removeEventListener('message', this.onMessage.bind(this));
  }

  onGameClick(game: Game) {
    this.selectedGame.set(game);
  }

  closePreview() {
    this.selectedGame.set(null);
  }

  confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;

    if (game.launchConfig?.embedMode === 'external-only') {
      const url = game.launchConfig.approvedExternalUrl || game.url;
      window.open(url, '_blank');
      this.closePreview();
    } else {
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
    if (!active || !frameWindow || event.source !== frameWindow) {
      return;
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
  setMode(mode: 'gaming' | 'cinema'): void {
    this.displayMode.set(mode);
    if (mode === 'cinema') {
      this.closeGame();
    }
  }

  onStreamClick(stream: CinemaStream): void {
    this.currentStream.set(stream);
    setTimeout(() => this.initializeHlsPlayer(), 100);
  }

  closeStream(): void {
    if (this.videoPlayer?.nativeElement) {
      this.videoPlayer.nativeElement.pause();
      this.videoPlayer.nativeElement.src = '';
    }
    this.currentStream.set(null);
  }

  private initializeHlsPlayer(): void {
    const video = this.videoPlayer?.nativeElement;
    const stream = this.currentStream();

    if (!video || !stream) return;

    if ((window as any).Hls && (window as any).Hls.isSupported()) {
      const hls = new (window as any).Hls();
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((err) => console.warn('Autoplay prevented', err));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream.url;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch((err) => console.warn('Autoplay prevented', err));
      });
    }
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
"""

with open("src/app/components/tha-spot/tha-spot.component.ts", "w") as f:
    f.write(header)
