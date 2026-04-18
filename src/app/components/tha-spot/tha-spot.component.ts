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
  ThaSpotFeed,
} from '../../hub/game';
import { THA_SPOT_FALLBACK_FEED } from '../../hub/tha-spot-feed.fallback';
import {
  UserProfileService,
} from '../../services/user-profile.service';
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
    const genres = Array.from(new Set(this.games().map(g => g.genre))).filter(Boolean) as string[];
    return genres.sort();
  });

  filteredGames = computed(() => {
    let filtered = this.games();
    const query = this.searchQuery().toLowerCase();
    const roomId = this.activeRoom();
    const room = this.gamingRooms().find(r => r.id === roomId);
    const genre = this.activeGenre();

    if (genre !== 'all') { filtered = filtered.filter(g => g.genre === genre); }
    if (room && roomId !== 'all') {
      filtered = filtered.filter(g => this.gameService.matchesRoom(g, room));
    }

    if (query) {
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(query) ||
        g.genre?.toLowerCase().includes(query)
      );
    }
    return filtered;
  });

  matchingRecommendationRails = computed(() => {
    return this.recommendationRails();
  });

  activeEvents = computed(() => {
    return this.liveEvents();
  });

  neuralSyncScore = computed(() => {
    return (this.profileService.profile()?.strategicHealthScore || 0);
  });

  gamingDirectives = computed(() => {
    return [
      'ESTABLISH ROOM DOMINANCE',
      'EXECUTE DAILY TOURNAMENT RUN',
      'SYNC KNOWLEDGE BASE WITH NEW DROPS',
    ];
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
    if (this.matchmakingTimerId) clearInterval(this.matchmakingTimerId);
  }

  setActiveRoom(roomId: string) {
    this.activeRoom.set(roomId);
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
        // this.profileService.updateGameStats(game.id, { plays: 1 });
      }
    }, 150);
    if (game) this.currentGame.set(game);
  }

  closeGame() {
    this.currentGame.set(null);
  }

  toggleIntel() {
    this.showIntelPanel.update(v => !v);
  }

  toggleBrowse() {
    this.isBrowseView.update(v => !v);
  }

  private loadFeed() {
    this.gameService.getThaSpotFeed().subscribe(feed => {
      this.feed.set(feed);
      this.games.set(feed.games);
      this.gamingRooms.set(feed.rooms);
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

  toggleQuickFilter(filter: string): void {
    const activeFilters = this.quickFilters();
    this.quickFilters.set(
      activeFilters.includes(filter)
        ? activeFilters.filter(activeFilter => activeFilter !== filter)
        : [...activeFilters, filter]
    );
  setSearchQuery(q: string) { this.searchQuery.set(q); }
  setSortMode(m: GameSortMode) { this.sortMode.set(m); }
  setActiveGenre(g: string) { this.activeGenre.set(g); }
  toggleQuickFilter(f: QuickFilter) {
    this.quickFilters.update(fs => fs.includes(f) ? fs.filter(e => e !== f) : [...fs, f]);
  }
}
