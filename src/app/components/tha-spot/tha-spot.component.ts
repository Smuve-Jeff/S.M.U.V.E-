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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from '../../hub/game.service';
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

const DEFAULT_RECOMMENDATION_ITEMS = 4;
const MAX_HISTORY_SCORE = 24;
const HISTORY_SCORE_DIVISOR = 6;
const FEED_REFRESH_INTERVAL_MS = 300000;
const EVENT_ENDING_SOON_MS = 1000 * 60 * 60 * 6;

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
})
export class ThaSpotComponent implements OnInit, OnDestroy {
  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;

  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);
  public uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

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

  activeRoom = signal<string>('all');
  isTransitioning = signal(false);
  showIntelPanel = signal(false);
  now = signal(Date.now());

  selectedGame = signal<Game | null>(null);
  currentGame = signal<Game | null>(null);
  isMatchmaking = signal(false);
  matchmakingProgress = signal(0);
  matchmakingStatus = signal('SYNCING LIVE FLOOR');
  matchedOpponent = signal<string | null>(null);
  launchWarning = signal<string | null>(null);
  frameError = signal<string | null>(null);
  sessionStartedAt = signal<number | null>(null);

  badgeMap = computed(
    () => new Map(this.badges().map((badge) => [badge.id, badge]))
  );

  activeRoomConfig = computed(
    () =>
      this.gamingRooms().find((room) => room.id === this.activeRoom()) ||
      this.gamingRooms()[0]
  );

  filteredGames = computed(() => {
    const room = this.activeRoomConfig();
    if (!room) {
      return this.games();
    }

    return this.games().filter((game) =>
      this.gameService.matchesRoom(game, room)
    );
  });

  activeEvents = computed(() => {
    const roomId = this.activeRoom();
    return this.liveEvents()
      .map((event) => this.resolveLiveEvent(event))
      .filter((event): event is LiveEvent => !!event)
      .filter((event) => roomId === 'all' || event.roomId === roomId);
  });

  roomPresence = computed(() => {
    const roomId = this.activeRoom();
    return this.socialPresence().filter(
      (entry) => roomId === 'all' || entry.roomId === roomId
    );
  });

  matchingRecommendationRails = computed(() =>
    this.recommendationRails()
      .filter((rail) => this.matchesRecommendationAudience(rail))
      .sort((a, b) => {
        const aRoom = a.roomIds?.includes(this.activeRoom()) ? 1 : 0;
        const bRoom = b.roomIds?.includes(this.activeRoom()) ? 1 : 0;
        return bRoom - aRoom;
      })
  );

  activeRecommendationRail = computed(
    () => this.matchingRecommendationRails()[0] || null
  );

  recommendedGames = computed(() => {
    const rail = this.activeRecommendationRail();
    if (!rail) {
      return [];
    }

    const stats = this.profileService.profile().gameStats || {};
    const roomId = this.activeRoom();

    return [...this.games()]
      .filter((game) => this.matchesRecommendationRail(game, rail))
      .map((game) => ({
        game,
        score: this.scoreRecommendation(game, rail, stats, roomId),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, rail.maxItems || DEFAULT_RECOMMENDATION_ITEMS)
      .map((entry) => entry.game);
  });

  socialModules = computed(() =>
    this.roomPresence().sort((a, b) => {
      const rank = (entry: SocialPresence) => {
        if (entry.pendingInvite) {
          return 4;
        }
        switch (entry.relationship) {
          case 'party':
            return 3;
          case 'rival':
            return 2;
          case 'friend':
            return 1;
          default:
            return 0;
        }
      };

      return rank(b) - rank(a);
    })
  );

  contextualPromotions = computed(() => {
    const profile = this.profileService.profile();
    const roomId = this.activeRoom();
    const audienceTags = this.getPromotionAudienceTags(profile);
    const activeGameIds = [
      this.selectedGame()?.id,
      this.currentGame()?.id,
      this.recentlyPlayed()[0]?.id,
    ].filter((id): id is string => !!id);

    return [...this.promotions()]
      .filter(
        (promotion) =>
          !promotion.roomIds?.length || promotion.roomIds.includes(roomId)
      )
      .filter(
        (promotion) =>
          !promotion.gameIds?.length ||
          !activeGameIds.length ||
          promotion.gameIds.some((gameId) => activeGameIds.includes(gameId))
      )
      .filter(
        (promotion) =>
          !promotion.audienceTags?.length ||
          promotion.audienceTags.some((tag) => audienceTags.includes(tag))
      )
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 3);
  });

  recentlyPlayed = computed(() => {
    const stats = this.profileService.profile().gameStats || {};
    return Object.entries(stats)
      .sort((a, b) => (b[1]?.lastPlayedAt || 0) - (a[1]?.lastPlayedAt || 0))
      .map(([gameId]) => this.games().find((game) => game.id === gameId))
      .filter((game): game is Game => !!game)
      .slice(0, 3);
  });

  liveMetrics = computed(() => {
    const visibleGames = this.filteredGames();
    const roomPlayers = visibleGames.reduce(
      (total, game) => total + (game.playersOnline || 0),
      0
    );
    const allPlayers = this.games().reduce(
      (total, game) => total + (game.playersOnline || 0),
      0
    );
    const queueGames = visibleGames.filter(
      (game) => (game.queueEstimateMinutes || 0) > 0
    );
    const averageQueue =
      queueGames.reduce(
        (total, game) => total + (game.queueEstimateMinutes || 0),
        0
      ) / (queueGames.length || 1);
    const liveTournaments = this.activeEvents().filter((event) =>
      ['live', 'ending-soon'].includes(event.status)
    ).length;
    const popularityShare = allPlayers
      ? Math.round((roomPlayers / allPlayers) * 100)
      : 0;

    return {
      roomPlayers,
      averageQueue: Number(averageQueue.toFixed(1)),
      liveTournaments,
      popularityShare,
      queueHealth:
        averageQueue <= 1
          ? 'Instant'
          : averageQueue <= 2.5
            ? 'Healthy'
            : 'Busy',
      uptimeLabel: this.formatDuration(
        this.now() - (this.sessionStartedAt() || this.hubStartedAt)
      ),
    };
  });

  neuralSyncScore = computed(() => {
    const plays = this.getTotalPlays();
    const roomWeight = Math.min(this.liveMetrics().popularityShare / 2, 20);
    return Math.min(99, 62 + roomWeight + Math.min(plays * 2, 17));
  });

  tacticalAdvantage = computed(() => {
    const recommendations = this.recommendedGames();
    const eventBonus = this.activeEvents().some(
      (event) => event.status === 'live'
    )
      ? 8
      : 4;
    return Math.min(25, eventBonus + recommendations.length * 3);
  });

  gamingDirectives = computed(() => {
    const room = this.activeRoomConfig();
    const profile = this.profileService.profile();
    const directives = [
      `${room?.name || 'Tha Spot'} controls ${this.liveMetrics().popularityShare}% of live floor traffic.`,
      `Queue health is ${this.liveMetrics().queueHealth.toUpperCase()} with ${this.liveMetrics().averageQueue} min average waits.`,
      `${this.activeEvents().length} event lanes are active for ${profile.artistName}.`,
    ];

    const recommendationRail = this.activeRecommendationRail();
    const topRecommendation = this.recommendedGames()[0];
    if (recommendationRail?.subtitle) {
      directives.push(recommendationRail.subtitle);
    }

    if (topRecommendation) {
      directives.push(
        `Recommended next cabinet: ${topRecommendation.name} from the ${recommendationRail?.title || 'live'} rail.`
      );
    }

    if (this.recentlyPlayed().length) {
      directives.push(
        `Momentum check: ${this.recentlyPlayed()[0].name} is still warm from your last run.`
      );
    }

    return directives.slice(0, 4);
  });

  activitySummary = computed(() => {
    const profile = this.profileService.profile();
    const stats = profile.gameStats || {};
    const progression = profile.thaSpotProgression || {};
    const totalPlays = this.getTotalPlays();
    const favoriteRoom =
      this.gamingRooms().find(
        (room) => room.id === progression.favoriteRoomId
      ) || this.findMasteredRoom(stats);
    const latestRoom =
      this.gamingRooms().find((room) => room.id === progression.lastRoomId) ||
      favoriteRoom;
    return {
      totalPlays,
      favoriteRoomLabel: favoriteRoom?.name || 'Choose a room',
      latestRoomLabel: latestRoom?.name || 'No sessions yet',
      sessionLabel:
        totalPlays > 0
          ? `${totalPlays} tracked sessions`
          : 'Start with any cabinet',
      cosmetics: (progression.earnedCosmetics || []).length,
    };
  });

  ngOnInit() {
    this.loadFeed();

    this.clockId = setInterval(() => this.now.set(Date.now()), 15000);
    this.feedRefreshId = setInterval(
      () => this.loadFeed(true),
      FEED_REFRESH_INTERVAL_MS
    );
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) {
      clearInterval(this.clockId);
    }
    if (this.feedRefreshId) {
      clearInterval(this.feedRefreshId);
    }
    if (this.matchmakingTimerId) {
      clearInterval(this.matchmakingTimerId);
    }
  }

  setActiveRoom(roomId: string) {
    if (this.activeRoom() === roomId) {
      return;
    }

    this.isTransitioning.set(true);
    setTimeout(() => {
      this.activeRoom.set(roomId);
      this.isTransitioning.set(false);
    }, 240);
  }

  getActiveRoomName(): string {
    return this.activeRoomConfig()?.name || 'Gaming Hub';
  }

  getActiveRoomDesc(): string {
    return this.activeRoomConfig()?.description || '';
  }

  toggleIntel() {
    this.showIntelPanel.update((value) => !value);
  }

  previewGame(game: Game) {
    this.selectedGame.set(game);
    this.launchWarning.set(
      this.canEmbedInline(game)
        ? game.launchConfig?.trustNote ||
            'Exact embed target verified from the live feed.'
        : 'Inline launch is unavailable for this cabinet, so it will open in a new tab.'
    );
    this.frameError.set(null);
  }

  closePreview() {
    this.selectedGame.set(null);
    this.launchWarning.set(null);
  }

  playGame(game: Game) {
    this.previewGame(game);
  }

  confirmLaunch() {
    const game = this.selectedGame();
    if (!game) {
      return;
    }

    this.selectedGame.set(null);

    if (!this.canEmbedInline(game)) {
      this.openGameInNewTab(game);
      return;
    }

    if (
      game.multiplayerType === 'Server' ||
      game.tags?.includes('Multiplayer')
    ) {
      this.startNeuralMatchmaking(game);
      return;
    }

    void this.launchGame(game);
  }

  startNeuralMatchmaking(game: Game) {
    this.isMatchmaking.set(true);
    this.matchmakingProgress.set(0);
    this.matchedOpponent.set(null);
    this.matchmakingStatus.set('SCANNING LIVE FLOOR');

    if (this.matchmakingTimerId) {
      clearInterval(this.matchmakingTimerId);
    }

    this.matchmakingTimerId = setInterval(
      () => {
        const progress = this.matchmakingProgress();
        if (progress < 35) {
          this.matchmakingStatus.set('LOCATING COMPETITIVE SIGNALS');
        } else if (progress < 70) {
          this.matchmakingStatus.set('MATCHING ROOM PRESENCE');
        } else {
          this.matchmakingStatus.set('CONFIRMING OPPONENT PROFILE');
        }

        this.matchmakingProgress.update((value) => Math.min(100, value + 10));

        if (this.matchmakingProgress() >= 100) {
          if (this.matchmakingTimerId) {
            clearInterval(this.matchmakingTimerId);
          }
          this.matchedOpponent.set(
            this.roomPresence()[0]?.name ||
              `GRID_${Math.floor(Math.random() * 900 + 100)}`
          );
          setTimeout(() => {
            this.isMatchmaking.set(false);
            void this.launchGame(game);
          }, 600);
        }
      },
      Math.max(120, (game.queueEstimateMinutes || 1) * 120)
    );
  }

  async launchGame(game: Game) {
    this.currentGame.set(game);
    this.sessionStartedAt.set(Date.now());
    this.frameError.set(null);
    await this.profileService.recordGameLaunch(
      game.id,
      this.getSessionContext(game)
    );
  }

  reloadGame() {
    const game = this.currentGame();
    if (game) {
      this.closeGame();
      setTimeout(() => this.launchGame(game), 100);
    }
  }

  closeGame() {
    this.currentGame.set(null);
    this.sessionStartedAt.set(null);
    this.frameError.set(null);
  }

  openGameInNewTab(game: Game) {
    if (typeof window !== 'undefined') {
      const externalUrl = game.launchConfig?.approvedExternalUrl || game.url;
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
    }
  }

  getSafeUrl(game: Game): SafeResourceUrl | null {
    if (!this.canEmbedInline(game)) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(
      game.launchConfig?.approvedEmbedUrl || game.url
    );
  }

  getVisibleTags(game: Game) {
    return (game.tags || []).slice(0, 3);
  }

  getGameBadges(game: Game): GameBadge[] {
    return (game.badgeIds || [])
      .map((badgeId) => this.badgeMap().get(badgeId))
      .filter((badge): badge is GameBadge => !!badge);
  }

  getEventGame(event: LiveEvent) {
    return (
      this.games().find((game) => game.id === event.featuredGameId) || null
    );
  }

  getPresenceGame(entry: SocialPresence) {
    return this.games().find((game) => game.id === entry.gameId) || null;
  }

  getPresenceActionLabel(entry: SocialPresence) {
    return (
      entry.cta ||
      (entry.pendingInvite
        ? 'Accept invite'
        : entry.relationship === 'party'
          ? 'Join party'
          : entry.relationship === 'rival'
            ? 'Track rival'
            : 'Join friend')
    );
  }

  handlePresenceAction(entry: SocialPresence) {
    this.setActiveRoom(entry.roomId);
    const game = this.getPresenceGame(entry);
    if (game) {
      this.previewGame(game);
      return;
    }

    if (entry.relationship === 'rival' && !this.showIntelPanel()) {
      this.toggleIntel();
    }
  }

  getPromotionRoute(promotion: PromotionCard) {
    return promotion.route.startsWith('/')
      ? promotion.route
      : `/${promotion.route}`;
  }

  navigateToPath(path: string) {
    this.router.navigate([path]);
  }

  isDarkMode(): boolean {
    return this.uiService.activeTheme().name === 'Dark';
  }

  onFrameError() {
    this.frameError.set(
      'The cabinet refused the embedded session. Open it in a new tab to continue.'
    );
  }

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const currentGame = this.currentGame();
    if (!currentGame || !this.isTrustedTelemetryEvent(event, currentGame)) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.type === 'GAME_OVER') {
      return;
    }
  }

  canEmbedInline(game: Game): boolean {
    if (game.launchConfig?.embedMode === 'external-only') {
      return false;
    }

    const approvedUrl = game.launchConfig?.approvedEmbedUrl || game.url;
    return this.isApprovedFeedUrl(approvedUrl);
  }

  private isTrustedTelemetryEvent(event: MessageEvent, game: Game): boolean {
    const telemetryMode = game.launchConfig?.telemetryMode || 'none';
    if (typeof window === 'undefined' || telemetryMode === 'none') {
      return false;
    }

    if (telemetryMode === 'frame-only') {
      return this.gameIframe?.nativeElement?.contentWindow === event.source;
    }

    return (
      this.gameIframe?.nativeElement?.contentWindow === event.source &&
      !!game.launchConfig?.telemetryOrigins?.includes(event.origin)
    );
  }

  private getTotalPlays() {
    return Object.values(this.profileService.profile().gameStats || {}).reduce(
      (total, stat) => total + (stat?.plays || 0),
      0
    );
  }

  private findMasteredRoom(stats: Record<string, { plays?: number }> = {}) {
    const roomScores = new Map<string, number>();

    for (const [gameId, stat] of Object.entries(stats)) {
      const game = this.games().find((entry) => entry.id === gameId);
      if (!game) {
        continue;
      }

      for (const room of this.gamingRooms()) {
        if (this.gameService.matchesRoom(game, room)) {
          roomScores.set(
            room.id,
            (roomScores.get(room.id) || 0) + (stat.plays || 0)
          );
        }
      }
    }

    const topRoomId = [...roomScores.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    return this.gamingRooms().find((room) => room.id === topRoomId);
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

  private isApprovedFeedUrl(url: string) {
    try {
      const normalizedUrl = this.normalizeGameUrl(url);
      return this.games().some((game) => {
        const approvedUrl = game.launchConfig?.approvedEmbedUrl || game.url;
        return this.normalizeGameUrl(approvedUrl) === normalizedUrl;
      });
    } catch {
      return false;
    }
  }

  private normalizeGameUrl(url: string) {
    return new URL(
      url,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://smuve.local'
    ).toString();
  }

  private matchesRecommendationAudience(rail: RecommendationRail) {
    const audience = rail.audience;
    if (!audience) {
      return true;
    }

    const profile = this.profileService.profile();
    const totalPlays = this.getTotalPlays();
    const activeRoom = this.activeRoom();

    if (
      audience.primaryGenres?.length &&
      !audience.primaryGenres.some(
        (genre) =>
          genre.toLowerCase() === (profile.primaryGenre || '').toLowerCase()
      )
    ) {
      return false;
    }

    if (audience.rooms?.length && !audience.rooms.includes(activeRoom)) {
      return false;
    }

    if (
      typeof audience.minPlays === 'number' &&
      totalPlays < audience.minPlays
    ) {
      return false;
    }

    if (
      typeof audience.maxPlays === 'number' &&
      totalPlays > audience.maxPlays
    ) {
      return false;
    }

    return true;
  }

  private matchesRecommendationRail(game: Game, rail: RecommendationRail) {
    const gameMatches = !rail.gameIds?.length || rail.gameIds.includes(game.id);
    const roomMatches =
      !rail.roomIds?.length ||
      rail.roomIds.some((roomId) => {
        const room = this.gamingRooms().find((entry) => entry.id === roomId);
        return room ? this.gameService.matchesRoom(game, room) : false;
      });

    return gameMatches && roomMatches;
  }

  private scoreRecommendation(
    game: Game,
    rail: RecommendationRail,
    stats: Record<string, { plays?: number }>,
    roomId: string
  ) {
    const weights = rail.weights || {};
    const gameStats = stats[game.id];
    const activeRoom = this.gamingRooms().find((room) => room.id === roomId);
    const badgeScore =
      Math.min(game.badgeIds?.length || 0, 3) * (weights.badge || 0);
    const historyScore =
      Math.min(gameStats?.plays || 0, MAX_HISTORY_SCORE) *
      ((weights.history || 0) / HISTORY_SCORE_DIVISOR);
    const crowdScore =
      Math.min((game.playersOnline || 0) / 2500, 8) * (weights.crowd || 0);
    const roomScore =
      activeRoom && this.gameService.matchesRoom(game, activeRoom)
        ? weights.room || 0
        : 0;
    const genreScore =
      rail.audience?.primaryGenres?.some(
        (genre) =>
          genre.toLowerCase() ===
          (this.profileService.profile().primaryGenre || '').toLowerCase()
      ) &&
      ['Rhythm', 'Music Battle', 'Strategy', 'Sports', 'Classic'].includes(
        game.genre || ''
      )
        ? weights.genre || 0
        : 0;
    const noveltyScore = gameStats?.plays ? 0 : weights.novelty || 0;
    const explicitGameBoost = rail.gameIds?.includes(game.id) ? 12 : 0;

    return (
      badgeScore +
      historyScore +
      crowdScore +
      roomScore +
      genreScore +
      noveltyScore +
      explicitGameBoost
    );
  }

  private resolveLiveEvent(event: LiveEvent): LiveEvent | null {
    const schedule = event.schedule;
    if (!schedule?.startAt || !schedule?.endAt) {
      return event;
    }

    let start = new Date(schedule.startAt).getTime();
    let end = new Date(schedule.endAt).getTime();
    const now = this.now();

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return event;
    }

    if (schedule.recurrence === 'daily') {
      const duration = Math.max(1, end - start);
      const anchor = new Date(schedule.startAt);
      const todayStart = new Date(anchor);
      const currentDate = new Date(now);
      todayStart.setUTCFullYear(
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth(),
        currentDate.getUTCDate()
      );
      start = todayStart.getTime();
      end = start + duration;
      if (now > end) {
        start += 24 * 60 * 60 * 1000;
        end += 24 * 60 * 60 * 1000;
      }
    }

    if (schedule.recurrence === 'weekend') {
      const duration = Math.max(1, end - start);
      while (now > end) {
        start += 7 * 24 * 60 * 60 * 1000;
        end = start + duration;
      }
    }

    const status =
      now < start
        ? 'upcoming'
        : now >= end - EVENT_ENDING_SOON_MS
          ? 'ending-soon'
          : 'live';

    if (status === 'upcoming' && schedule.recurrence === 'once' && now > end) {
      return null;
    }

    return {
      ...event,
      status,
      windowLabel:
        status === 'live'
          ? 'Live now'
          : status === 'ending-soon'
            ? 'Ending soon'
            : `Starts ${this.formatDuration(start - now)} from now`,
    };
  }

  private getPromotionAudienceTags(profile: UserProfile) {
    const tags = ['returning'];
    const genre = (profile.primaryGenre || '').toLowerCase();
    const currentStreak = (
      profile.thaSpotProgression as { currentStreak?: number } | undefined
    )?.currentStreak;

    if (['hip hop', 'r&b', 'pop', 'electronic'].includes(genre)) {
      tags.push('producer');
    }
    if ((currentStreak || 0) >= 3) {
      tags.push('competitive');
    }
    if (Object.keys(profile.gameStats || {}).length > 0) {
      tags.push('social');
    }

    return tags;
  }

  private getSessionContext(game: Game): ThaSpotSessionContext {
    const activeEvent = this.activeEvents().find(
      (event) => event.featuredGameId === game.id
    );
    const rawRewardType = activeEvent?.schedule?.rewardType;
    const rewardType: ThaSpotSessionContext['rewardType'] =
      rawRewardType === 'cosmetic' || rawRewardType === 'token'
        ? rawRewardType
        : undefined;

    return {
      roomId: this.activeRoom(),
      eventId: activeEvent?.id,
      reward: activeEvent?.reward,
      rewardType,
      cosmetics: [],
    };
  }

  private formatDuration(durationMs: number) {
    const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
    if (totalMinutes === 0) {
      return '<1m';
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
