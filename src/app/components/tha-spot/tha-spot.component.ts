import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  HostListener,
  effect,
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
import {
  UserProfileService,
  ThaSpotSessionContext,
  UserProfile,
} from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';

const DEFAULT_RECOMMENDATION_ITEMS = 8;
const MAX_HISTORY_SCORE = 24;
const HISTORY_SCORE_DIVISOR = 6;
const FEED_REFRESH_INTERVAL_MS = 300000;
const EVENT_ENDING_SOON_MS = 1000 * 60 * 60 * 6;
const CARD_ANIMATION_DELAY_INCREMENT = 0.03;
const FEATURED_BADGE_IDS = [
  'featured',
  'staff-pick',
  'trending',
  'tournament-live',
];
const FEATURED_BADGE_ID_SET = new Set(FEATURED_BADGE_IDS);
const MULTIPLAYER_TAG_KEYWORDS = ['multiplayer', 'co-op', 'versus', 'pvp'];
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
  readonly cardAnimationDelayIncrement = CARD_ANIMATION_DELAY_INCREMENT;
  readonly quickFilterOptions = QUICK_FILTERS;

  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);
  public uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private feedSubscription?: Subscription;
  private hubStartedAt = Date.now();
  private clockId: ReturnType<typeof setInterval> | null = null;
  private feedRefreshId: ReturnType<typeof setInterval> | null = null;
  private matchmakingTimerId: ReturnType<typeof setInterval> | null = null;

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

  activeRoom = signal<string>('all'); activeGenre = signal<string>('all');
  searchQuery = signal<string>('');
  sortMode = signal<GameSortMode>('Popular');
  libraryView = signal<LibraryViewMode>('compact');
  quickFilters = signal<QuickFilter[]>([]);
  isTransitioning = signal<boolean>(false);
  now = signal<number>(Date.now());

  // Navigation / View State
  isBrowseView = signal<boolean>(false);
  showIntelPanel = signal<boolean>(false);
  isMatchmaking = signal<boolean>(false);
  matchmakingStatus = signal<string>('UPLINKING...');
  matchmakingProgress = signal<number>(0);
  matchedOpponent = signal<string | null>(null);

  selectedGame = signal<Game | null>(null);
  currentGame = signal<Game | null>(null);

  // Computed signals
  allCategories = computed(() => {
    const genres = Array.from(new Set(this.games().map(g => g.genre))).filter(Boolean) as string[];
    return genres.sort();
  });

  filteredGames = computed(() => {
    let filtered = this.games();
    const query = this.searchQuery().toLowerCase();
    const activeFilters = this.quickFilters();
    const roomId = this.activeRoom();
    const room = this.gamingRooms().find(r => r.id === roomId); const genre = this.activeGenre();

    if (genre !== 'all') { filtered = filtered.filter(g => g.genre === genre); } if (room if (room && roomId !== 'all') {if (room && roomId !== 'all') { roomId !== 'all') {
      filtered = filtered.filter(g => this.gameService.matchesRoom(g, room));
    }

    if (query) {
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query) ||
        g.genre?.toLowerCase().includes(query)
      );
    }

    if (activeFilters.length) {
      filtered = filtered.filter(g => activeFilters.every(f => this.matchesQuickFilter(g, f)));
    }

    return this.gameService.filterAndSortGames(filtered, {}, this.sortMode());
  });

  matchingRecommendationRails = computed(() => {
    return this.recommendationRails().filter(rail => this.matchesRecommendationAudience(rail));
  });

  activeEvents = computed(() => {
    return this.liveEvents()
      .map(event => this.resolveLiveEvent(event))
      .filter((event): event is LiveEvent => event !== null);
  });

  neuralSyncScore = computed(() => {
    const profile = this.profileService.profile();
    return (profile.strategicHealthScore || 0);
  });

  liveMetrics = computed(() => {
    return {
      roomPlayers: Math.floor(Math.random() * 5000) + 12000,
      queueHealth: 'OPTIMAL',
    };
  });

  gamingDirectives = computed(() => {
    const profile = this.profileService.profile();
    const masteredRoom = this.findMasteredRoom(profile.gameStats);
    return [
      masteredRoom ? `MAINTAIN DOMINANCE IN ${masteredRoom.name}` : 'ESTABLISH ROOM DOMINANCE',
      'EXECUTE DAILY TOURNAMENT RUN',
      'SYNC KNOWLEDGE BASE WITH NEW DROPS',
    ];
  });

  constructor() {
    effect(() => {
      const current = this.currentGame();
      if (current) {
        this.uiService.setSubtleGlow(current.art?.accentStart || '#ec5b13');
      } else {
        this.uiService.setSubtleGlow(null);
      }
    });
  }

  ngOnInit() {
    this.loadFeed();
    this.route.params.subscribe(params => {
      if (params['id']) {
        const url = this.router.url;
        if (url.includes('/game/')) {
          this.gameService.getGame(params['id']).subscribe(game => {
            if (game) this.onGameClick(game);
          });
        } else if (url.includes('/room/')) {
          this.setActiveRoom(params['id']);
        }
      }
    });

    this.route.url.subscribe(url => {
      this.isBrowseView.set(url.some(segment => segment.path === 'browse'));
    });

    this.clockId = setInterval(() => this.now.set(Date.now()), 15000);
    this.feedRefreshId = setInterval(
      () => this.loadFeed(true),
      FEED_REFRESH_INTERVAL_MS
    );
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    if (this.matchmakingTimerId) clearInterval(this.matchmakingTimerId);
  }

  setActiveRoom(roomId: string) {
    if (this.activeRoom() === roomId) return;
    this.isTransitioning.set(true);
    setTimeout(() => {
      this.activeRoom.set(roomId);
      this.isTransitioning.set(false);
    }, 240);
  }

  onGameClick(game: Game) {
    this.selectedGame.set(game);
  }

  openPreview(game: Game) {
    this.selectedGame.set(game);
  }

  closePreview() {
    this.selectedGame.set(null);
  }

  confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;

    this.closePreview();
    this.isMatchmaking.set(true);
    this.matchmakingStatus.set('UPLINKING...');
    this.matchmakingProgress.set(0);

    let p = 0;
    this.matchmakingTimerId = setInterval(() => {
      p += Math.random() * 15;
      this.matchmakingProgress.set(p);
      if (p >= 100) {
        if (this.matchmakingTimerId) clearInterval(this.matchmakingTimerId);
        this.isMatchmaking.set(false);
        this.currentGame.set(game);
        // Tracking
        this.profileService.updateGameStats(game.id, { plays: 1 });
      }
    }, 150);
  }

  closeGame() {
    this.currentGame.set(null);
  }

  reloadGame() {
    const game = this.currentGame();
    this.currentGame.set(null);
    setTimeout(() => this.currentGame.set(game), 10);
  }

  getSafeUrl(game: Game): SafeResourceUrl | null {
    const url = game.launchConfig?.approvedEmbedUrl || game.url;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  toggleIntel() {
    this.showIntelPanel.update(v => !v);
  }

  toggleBrowse() {
    this.isBrowseView.update(v => !v);
  }

  private loadFeed(forceRefresh = false) {
    this.feedSubscription?.unsubscribe();
    this.feedSubscription = this.gameService
      .getThaSpotFeed(forceRefresh)
      .subscribe((feed) => {
        this.feed.set(feed);
        this.gamingRooms.set(feed.rooms);
        this.badges.set(feed.badges);
        this.liveEvents.set(feed.liveEvents);
        this.socialPresence.set(feed.socialPresence);
        this.promotions.set(feed.promotions);
        this.recommendationRails.set(feed.recommendationRails);
        this.games.set(feed.games);

        if (!feed.rooms.some((room) => room.id === this.activeRoom())) {
          this.activeRoom.set(feed.rooms[0]?.id || 'all');
        }
      });
  }

  private matchesQuickFilter(game: Game, filter: QuickFilter) {
    switch (filter) {
      case 'featured':
        return !!game.badgeIds?.some((badge) => FEATURED_BADGE_ID_SET.has(badge));
      case 'multiplayer':
        return game.multiplayerType === 'Server' || game.multiplayerType === 'P2P' ||
               !!game.tags?.some((tag) => MULTIPLAYER_TAG_KEYWORDS.includes(tag.toLowerCase()));
      case 'instant':
        return (game.queueEstimateMinutes || 0) <= 1;
      case 'online':
        return game.availability === 'Online' || game.availability === 'Hybrid';
    }
  }

  private findMasteredRoom(stats: Record<string, { plays?: number }> = {}) {
    const roomScores = new Map<string, number>();
    for (const [gameId, stat] of Object.entries(stats)) {
      const game = this.games().find((entry) => entry.id === gameId);
      if (!game) continue;
      for (const room of this.gamingRooms()) {
        if (this.gameService.matchesRoom(game, room)) {
          roomScores.set(room.id, (roomScores.get(room.id) || 0) + (stat.plays || 0));
        }
      }
    }
    const topRoomId = [...roomScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return this.gamingRooms().find((room) => room.id === topRoomId);
  }

  private matchesRecommendationAudience(rail: RecommendationRail) {
    const audience = rail.audience;
    if (!audience) return true;
    const profile = this.profileService.profile();
    const totalPlays = this.getTotalPlays();
    if (audience.primaryGenres?.length && !audience.primaryGenres.some(g => g.toLowerCase() === (profile.primaryGenre || '').toLowerCase())) return false;
    if (audience.rooms?.length && !audience.rooms.includes(this.activeRoom())) return false;
    if (typeof audience.minPlays === 'number' && totalPlays < audience.minPlays) return false;
    if (typeof audience.maxPlays === 'number' && totalPlays > audience.maxPlays) return false;
    return true;
  }

  private matchesRecommendationRail(game: Game, rail: RecommendationRail) {
    const gameMatches = !rail.gameIds?.length || rail.gameIds.includes(game.id);
    const roomMatches = !rail.roomIds?.length || rail.roomIds.some((roomId) => {
        const room = this.gamingRooms().find((entry) => entry.id === roomId);
        return room ? this.gameService.matchesRoom(game, room) : false;
      });
    return gameMatches && roomMatches;
  }

  private scoreRecommendation(game: Game, rail: RecommendationRail, stats: Record<string, { plays?: number }>, roomId: string) {
    const weights = rail.weights || {};
    const gameStats = stats[game.id];
    const activeRoom = this.gamingRooms().find((room) => room.id === roomId);
    const badgeScore = Math.min(game.badgeIds?.length || 0, 3) * (weights.badge || 0);
    const historyScore = Math.min(gameStats?.plays || 0, MAX_HISTORY_SCORE) * ((weights.history || 0) / HISTORY_SCORE_DIVISOR);
    const crowdScore = Math.min((game.playersOnline || 0) / 2500, 8) * (weights.crowd || 0);
    const roomScore = activeRoom && this.gameService.matchesRoom(game, activeRoom) ? weights.room || 0 : 0;
    const genreScore = rail.audience?.primaryGenres?.some(g => g.toLowerCase() === (this.profileService.profile().primaryGenre || '').toLowerCase()) &&
                       ['Rhythm', 'Music Battle', 'Strategy', 'Sports', 'Classic'].includes(game.genre || '') ? weights.genre || 0 : 0;
    const noveltyScore = gameStats?.plays ? 0 : weights.novelty || 0;
    return badgeScore + historyScore + crowdScore + roomScore + genreScore + noveltyScore + (rail.gameIds?.includes(game.id) ? 12 : 0);
  }

  private resolveLiveEvent(event: LiveEvent): LiveEvent | null {
    const schedule = event.schedule;
    if (!schedule?.startAt || !schedule?.endAt) return event;
    let start = new Date(schedule.startAt).getTime();
    let end = new Date(schedule.endAt).getTime();
    const now = this.now();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return event;
    const status = now < start ? 'upcoming' : now >= end - EVENT_ENDING_SOON_MS ? 'ending-soon' : 'live';
    return { ...event, status };
  }

  private getTotalPlays() {
    return Object.values(this.profileService.profile().gameStats || {}).reduce((total, stat) => total + (stat?.plays || 0), 0);
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    const allGames = this.games();
    const stats = this.profileService.profile().gameStats || {};
    return allGames.filter(g => this.matchesRecommendationRail(g, rail))
      .map(game => ({ game, score: this.scoreRecommendation(game, rail, stats, this.activeRoom()) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, rail.maxItems || DEFAULT_RECOMMENDATION_ITEMS)
      .map(entry => entry.game);
  }

  hasRail(railId: string): boolean {
    return this.recommendationRails().some(r => r.id === railId);
  }

  setSearchQuery(q: string) { this.searchQuery.set(q); }
  setSortMode(m: GameSortMode) { this.sortMode.set(m); }
  setActiveGenre(g: string) { this.activeGenre.set(g); } toggleQuickFilter(f: QuickFilter) { this.quickFilters.update(fs => fs.includes(f) ? fs.filter(e => e !== f) : [...fs, f]); }
}
