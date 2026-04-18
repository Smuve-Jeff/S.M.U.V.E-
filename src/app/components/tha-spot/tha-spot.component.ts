import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
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
  ThaSpotFeed,
} from '../../hub/game';
import { THA_SPOT_FALLBACK_FEED } from '../../hub/tha-spot-feed.fallback';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';

const DEFAULT_RECOMMENDATION_ITEMS = 8;
const FEED_REFRESH_INTERVAL_MS = 300000;
type LibraryViewMode = 'grid' | 'compact';
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
  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;
  readonly quickFilterOptions = QUICK_FILTERS;

  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);
  public uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private feedSubscription?: Subscription;
  private clockId: any = null;
  private feedRefreshId: any = null;
  private matchmakingTimerId: any = null;

  feed = signal<ThaSpotFeed>(THA_SPOT_FALLBACK_FEED);
  gamingRooms = signal<GameRoom[]>(THA_SPOT_FALLBACK_FEED.rooms);
  badges = signal<GameBadge[]>(THA_SPOT_FALLBACK_FEED.badges);
  liveEvents = signal<LiveEvent[]>(THA_SPOT_FALLBACK_FEED.liveEvents);
  socialPresence = signal<SocialPresence[]>(
    THA_SPOT_FALLBACK_FEED.socialPresence
  );
  promotions = signal<PromotionCard[]>(THA_SPOT_FALLBACK_FEED.promotions);
  games = signal<Game[]>(THA_SPOT_FALLBACK_FEED.games);
  recommendationRails = signal<RecommendationRail[]>(
    THA_SPOT_FALLBACK_FEED.recommendationRails
  );

  activeRoom = signal<string>('all');
  activeGenre = signal<string>('all');
  searchQuery = signal<string>('');
  sortMode = signal<GameSortMode>('Popular');
  libraryView = signal<LibraryViewMode>('compact');
  quickFilters = signal<QuickFilter[]>([]);
  isTransitioning = signal<boolean>(false);
  now = signal<number>(Date.now());

  isBrowseView = signal<boolean>(false);
  showIntelPanel = signal<boolean>(false);
  isMatchmaking = signal<boolean>(false);
  matchmakingStatus = signal<string>('UPLINKING...');
  matchmakingProgress = signal<number>(0);

  selectedGame = signal<Game | null>(null);
  currentGame = signal<Game | null>(null);

  allCategories = computed(() => {
    const genres = Array.from(
      new Set(this.games().map((game) => game.genre))
    ).filter(Boolean) as string[];
    return genres.sort();
  });

  filteredGames = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const roomId = this.activeRoom();
    const room = this.gamingRooms().find((entry) => entry.id === roomId);
    const genre = this.activeGenre();
    const quickFilters = this.quickFilters();

    let filtered = [...this.games()];

    if (genre !== 'all') {
      filtered = filtered.filter((game) => game.genre === genre);
    }
    if (room && roomId !== 'all') {
      filtered = filtered.filter((game) =>
        this.gameService.matchesRoom(game, room)
      );
    }

    if (query) {
      filtered = filtered.filter(
        (game) =>
          game.name.toLowerCase().includes(query) ||
          game.genre?.toLowerCase().includes(query)
      );
    }

    if (quickFilters.length) {
      filtered = filtered.filter((game) =>
        this.matchesQuickFilters(game, quickFilters)
      );
    }

    return this.gameService.filterAndSortGames(filtered, {}, this.sortMode());
  });

  matchingRecommendationRails = computed(() => {
    const roomId = this.activeRoom();
    if (roomId === 'all') {
      return this.recommendationRails();
    }
    return this.recommendationRails().filter(
      (rail) => !rail.roomIds?.length || rail.roomIds.includes(roomId)
    );
  });

  activeEvents = computed(() => {
    const roomId = this.activeRoom();
    const now = this.now();
    const resolved = this.liveEvents().map((event) =>
      this.resolveEventStatus(event, now)
    );
    if (roomId === 'all') {
      return resolved;
    }
    return resolved.filter((event) => event.roomId === roomId);
  });

  neuralSyncScore = computed(() => {
    return this.profileService.profile()?.strategicHealthScore || 0;
  });

  gamingDirectives = computed(() => {
    return [
      'ESTABLISH ROOM DOMINANCE',
      'EXECUTE DAILY TOURNAMENT RUN',
      'SYNC KNOWLEDGE BASE WITH NEW DROPS',
    ];
  });

  launchWarning = signal<string>('');

  activeRecommendationRail = computed(() => {
    const rails = this.recommendationRails();
    if (!rails.length) {
      return null;
    }
    const profile = this.profileService.profile();
    return (
      rails.find((rail) => this.matchesRecommendationAudience(rail, profile)) ||
      rails[0]
    );
  });

  recommendedGames = computed(() => {
    const rail = this.activeRecommendationRail();
    if (!rail) {
      return [];
    }
    return this.getGamesForRail(rail);
  });

  recentlyPlayed = computed(() => {
    const profile = this.profileService.profile();
    const stats = profile?.gameStats || {};
    const gameLookup = new Map(this.games().map((game) => [game.id, game]));

    return Object.entries(stats)
      .map(([gameId, stat]) => ({
        game: gameLookup.get(gameId),
        lastPlayedAt: stat.lastPlayedAt || 0,
      }))
      .filter((entry) => !!entry.game)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .map((entry) => entry.game!) as Game[];
  });

  liveMetrics = computed(() => {
    const roomPlayers = this.games().reduce(
      (sum, game) => sum + (game.playersOnline || 0),
      0
    );

    return {
      roomPlayers,
      activeRooms: this.gamingRooms().length,
      liveEvents: this.activeEvents().length,
    };
  });

  activitySummary = computed(() => {
    const profile = this.profileService.profile();
    const progression = (profile?.thaSpotProgression || {}) as {
      favoriteRoomId?: string;
      currentStreak?: number;
      earnedCosmetics?: string[];
    };
    const favoriteRoom = this.gamingRooms().find(
      (room) => room.id === progression.favoriteRoomId
    );

    return {
      favoriteRoomLabel: favoriteRoom?.name || 'All Games',
      currentStreak: progression.currentStreak || 0,
      cosmetics: progression.earnedCosmetics || [],
    };
  });

  constructor() {
    effect(() => {
      const current = this.currentGame();
      if (current) {
        // this.uiService.setSubtleGlow(current.art?.accentStart || '#ec5b13');
      } else {
        // this.uiService.setSubtleGlow(null);
      }
    });
    // constructor body
  }

  ngOnInit() {
    this.loadFeed();
  }

  ngOnDestroy() {
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    if (this.matchmakingTimerId) clearTimeout(this.matchmakingTimerId);
    this.feedSubscription?.unsubscribe();
  }

  setActiveRoom(roomId: string) {
    this.activeRoom.set(roomId);
  }

  onGameClick(game: Game) {
    this.previewGame(game);
  }

  openPreview(game: Game) {
    this.previewGame(game);
  }

  closePreview() {
    this.selectedGame.set(null);
    this.launchWarning.set('');
  }

  previewGame(game: Game) {
    this.selectedGame.set(game);
    this.launchWarning.set(this.resolveLaunchWarning(game));
  }

  confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;
    if (this.isMatchmaking()) return;

    if (game.launchConfig?.embedMode === 'external-only') {
      const launchUrl = game.launchConfig.approvedExternalUrl || game.url || '';
      if (launchUrl) {
        window.open(launchUrl, '_blank', 'noopener');
      }
      this.closePreview();
      return;
    }

    const sessionContext = this.buildSessionContext(game);
    this.closePreview();

    if (this.isMultiplayerGame(game)) {
      this.isMatchmaking.set(true);
      this.matchmakingStatus.set('UPLINKING...');
      this.matchmakingProgress.set(0);
      if (this.matchmakingTimerId) clearTimeout(this.matchmakingTimerId);
      this.matchmakingTimerId = setTimeout(() => {
        this.isMatchmaking.set(false);
        this.matchmakingProgress.set(100);
        this.currentGame.set(game);
        void this.profileService.recordGameLaunch(game.id, sessionContext);
      }, 4000);
      return;
    }

    this.currentGame.set(game);
    void this.profileService.recordGameLaunch(game.id, sessionContext);
  }

  closeGame() {
    this.currentGame.set(null);
  }

  reloadGame() {
    const iframe = this.gameIframe?.nativeElement;
    if (!iframe) return;
    try {
      iframe.contentWindow?.location.reload();
    } catch {
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
    this.activeGenre.set('all');
    this.searchQuery.set('');
    this.sortMode.set('Popular');
    this.quickFilters.set([]);
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    let games = [...this.games()];

    if (rail.gameIds?.length) {
      const lookup = new Map(games.map((game) => [game.id, game]));
      games = rail.gameIds
        .map((id) => lookup.get(id))
        .filter(Boolean) as Game[];
    } else if (rail.roomIds?.length) {
      const rooms = this.gamingRooms().filter((room) =>
        rail.roomIds?.includes(room.id)
      );
      games = games.filter((game) =>
        rooms.some((room) => this.gameService.matchesRoom(game, room))
      );
    }

    const sorted = this.gameService.filterAndSortGames(games, {}, 'Popular');
    return rail.maxItems ? sorted.slice(0, rail.maxItems) : sorted;
  }

  getSafeUrl(game: Game): SafeResourceUrl | null {
    if (game.launchConfig?.embedMode === 'external-only') {
      return null;
    }
    const url = game.launchConfig?.approvedEmbedUrl || game.url;
    if (!url) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  onMessage(event: MessageEvent): void {
    const active = this.currentGame();
    const frameWindow = this.gameIframe?.nativeElement?.contentWindow;
    if (!active || !frameWindow || event.source !== frameWindow) {
      return;
    }

    if (event.data?.type === 'GAME_OVER') {
      this.closeGame();
    }
  }

  private loadFeed() {
    this.feedSubscription?.unsubscribe();
    this.feedSubscription = this.gameService
      .getThaSpotFeed()
      .subscribe((feed) => {
        this.feed.set(feed);
        this.games.set(feed.games);
        this.gamingRooms.set(feed.rooms);
        this.badges.set(feed.badges);
        this.liveEvents.set(feed.liveEvents);
        this.socialPresence.set(feed.socialPresence);
        this.promotions.set(feed.promotions);
        this.recommendationRails.set(feed.recommendationRails);
      });
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  setSortMode(mode: GameSortMode): void {
    this.sortMode.set(mode);
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

  private matchesQuickFilters(game: Game, filters: QuickFilter[]): boolean {
    const tags = (game.tags || []).map((tag) => tag.toLowerCase());

    return filters.every((filter) => {
      switch (filter) {
        case 'featured':
          return game.badgeIds?.includes('featured') ?? false;
        case 'multiplayer':
          return (
            (!!game.multiplayerType && game.multiplayerType !== 'None') ||
            tags.includes('multiplayer')
          );
        case 'instant':
          return (game.queueEstimateMinutes || 0) === 0;
        case 'online':
          return (
            game.availability === 'Online' || game.availability === 'Hybrid'
          );
        default:
          return true;
      }
    });
  }

  private resolveEventStatus(event: LiveEvent, now: number): LiveEvent {
    if (!event.schedule?.startAt) {
      return event;
    }
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

  private matchesRecommendationAudience(
    rail: RecommendationRail,
    profile: { primaryGenre?: string; gameStats?: Record<string, any> } | null
  ): boolean {
    const audience = rail.audience;
    if (!audience) {
      return true;
    }

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

  private resolveLaunchWarning(game: Game): string {
    if (game.launchConfig?.embedMode === 'external-only') {
      return 'External governance required for this cabinet.';
    }
    if (game.launchConfig?.approvedEmbedUrl || game.url) {
      return 'Exact embed target verified.';
    }
    return 'Embed target pending verification.';
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
}
