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
} from '../../hub/game';
import { APP_SECURITY_CONFIG } from '../../app.security';
import { UserProfileService } from '../../services/user-profile.service';
import { SecurityService } from '../../services/security.service';
import { UIService } from '../../services/ui.service';
import { SocialNetworkingService } from '../../services/social-networking.service';
import { PeerNetworkingService } from '../../services/peer-networking.service';

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
  private socialService = inject(SocialNetworkingService);
  private peerService = inject(PeerNetworkingService);
  private sanitizer = inject(DomSanitizer);
  private securityService = inject(SecurityService);
  public uiService = inject(UIService);

  readonly plutoTvUrl = signal<string>('https://pluto.tv/en/live-tv');
  readonly safePlutoUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.plutoTvUrl())
  );
  readonly displayMode = signal<'gaming' | 'cinema'>('gaming');
  readonly showFavoritesOnly = signal<boolean>(false);
  readonly showRivalHub = signal<boolean>(false);
  readonly onlineUsers = this.socialService.onlineUsers;
  readonly messages = this.socialService.messages;
  readonly challenges = this.socialService.challenges;
  readonly isCallActive = this.peerService.isCallActive;

  // Feed Signals
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
  isBrowseView = signal<boolean>(true);
  showIntelPanel = signal<boolean>(false);
  now = signal<number>(Date.now());
  isMatchmaking = signal<boolean>(false);
  matchmakingStatus = signal<string>('');
  matchmakingProgress = signal<number>(0);
  isWasmLoading = signal<boolean>(false);

  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;

  private feedSubscription?: Subscription;
  private clockId?: any;
  private feedRefreshId?: any;
  private readonly messageHandler = (event: MessageEvent) =>
    this.onMessage(event);

  // Computed signals
  filteredGames = computed(() => {
    if (this.displayMode() === 'cinema') return [];
    let games = this.games();
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

  allCategories = computed(() => {
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

  constructor() {
    const savedFavs = localStorage.getItem('tha_spot_favorites');
    if (savedFavs) this.favorites.set(JSON.parse(savedFavs));
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
  }

  setMode(mode: 'gaming' | 'cinema'): void {
    this.displayMode.set(mode);
    if (mode === 'cinema') this.closeGame();
  }

  setActiveRoom(id: string) {
    this.activeRoom.set(id);
  }
  onGameClick(game: Game) {
    this.selectedGame.set(game);
  }
  closePreview() {
    this.selectedGame.set(null);
  }
  closeGame() {
    this.currentGame.set(null);
  }
  toggleIntel() {
    this.showIntelPanel.update((v) => !v);
  }
  toggleBrowse() {
    this.isBrowseView.update((v) => !v);
  }

  async confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;
    if (game.launchConfig?.embedMode === 'external-only') {
      const url = game.launchConfig.approvedExternalUrl || game.url;
      window.open(url, '_blank');
      this.closePreview();
    } else {
      if (this.isMultiplayerGame(game)) {
        this.isMatchmaking.set(true);
        this.matchmakingStatus.set('SCANNING FOR RIVALS...');
        for (let i = 0; i <= 100; i += 20) {
          this.matchmakingProgress.set(i);
          await new Promise((r) => setTimeout(r, 400));
        }
        this.isMatchmaking.set(false);
      }

      if (this.isRetroOrArcade(game)) {
        this.isWasmLoading.set(true);
        await new Promise(r => setTimeout(r, 1200)); // Simulate WASM core initialization
        this.isWasmLoading.set(false);
      }
      this.profileService.recordGameLaunch(

        game.id,
        this.buildSessionContext(game)
      );
      this.currentGame.set(game);
      this.closePreview();
    }
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

  getSafeUrl(game: Game): SafeResourceUrl | null {
    let url = game.launchConfig?.approvedEmbedUrl || game.url;
    if (!url) return null;
    if (this.isRetroOrArcade(game)) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}smuve_auth_token=${APP_SECURITY_CONFIG.auth_salt}&secure_mode=wasm`;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private onMessage(event: MessageEvent): void {
    const active = this.currentGame();
    if (
      !active ||
      !this.gameIframe?.nativeElement?.contentWindow ||
      event.source !== this.gameIframe.nativeElement.contentWindow ||
      !this.isTrustedGameMessageOrigin(event, active)
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

  isTrustedGameMessageOrigin(event: MessageEvent, active: Game): boolean {
    const candidates = [
      active.launchConfig?.approvedEmbedUrl,
      active.launchConfig?.approvedExternalUrl,
      active.url,
    ].filter((c): c is string => !!c);
    const allowedOrigins = new Set(
      candidates
        .map((c) => {
          try {
            return new URL(c, window.location.origin).origin;
          } catch {
            return null;
          }
        })
        .filter((o): o is string => !!o)
    );
    allowedOrigins.add(window.location.origin);
    return allowedOrigins.has(event.origin);
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
      ? 'OPEN EXTERNALLY'
      : 'INITIALIZE';
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    const allGames = this.games();
    if (rail.gameIds?.length) {
      return allGames.filter((g) => rail.gameIds!.includes(g.id));
    }
    if (rail.audience?.primaryGenres?.length) {
      return allGames.filter((g) =>
        rail.audience!.primaryGenres!.includes(g.genre || '')
      );
    }
    if (rail.badgeId) {
      return allGames.filter((g) => g.badgeIds?.includes(rail.badgeId!));
    }
    return allGames.slice(0, rail.maxItems || 4);
  }

  private matchesRecommendationAudience(
    rail: RecommendationRail,
    profile: any
  ): boolean {
    return true;
  }


// RIVAL HUB METHODS
  toggleRivalHub() {
    this.showRivalHub.update(v => !v);
  }

  sendChallenge(userId: string, gameId: string) {
    this.socialService.challengePlayer(userId, gameId);
  }

  startVoiceChat(userId: string) {
    this.peerService.startCall(userId);
  }

  endVoiceChat() {
    this.peerService.endCall();
  }

}