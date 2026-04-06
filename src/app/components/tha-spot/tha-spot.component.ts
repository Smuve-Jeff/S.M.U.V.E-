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
  LeaderboardEntry,
  LiveEvent,
  PromotionCard,
  SocialPresence,
  ThaSpotFeed,
} from '../../hub/game';
import { THA_SPOT_FALLBACK_FEED } from '../../hub/tha-spot-feed.fallback';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';

const TRUSTED_GAME_HOSTS = new Set([
  'hextris.github.io',
  'play2048.co',
  'htmlgames.com',
  'html5.gamedistribution.com',
  'pacman.live',
  'www.retrogames.cc',
  'retrogames.cc',
  'poki.com',
  'supermarioplay.com',
]);

const PROFILE_AFFINITIES: Record<string, string[]> = {
  'hip hop': ['music battle', 'rhythm', 'arcade', 'original'],
  'r&b': ['rhythm', 'logic', 'puzzle'],
  pop: ['rhythm', 'arcade', 'sports'],
  electronic: ['rhythm', 'reflex', 'arcade'],
  rock: ['combat', 'versus', 'arcade'],
  jazz: ['strategy', 'puzzle', 'logic'],
  classical: ['strategy', 'classic', 'logic'],
};

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
  private matchmakingTimerId: ReturnType<typeof setInterval> | null = null;

  feed = signal<ThaSpotFeed>(THA_SPOT_FALLBACK_FEED);
  gamingRooms = signal<GameRoom[]>(THA_SPOT_FALLBACK_FEED.rooms);
  badges = signal<GameBadge[]>(THA_SPOT_FALLBACK_FEED.badges);
  liveEvents = signal<LiveEvent[]>(THA_SPOT_FALLBACK_FEED.liveEvents);
  socialPresence = signal<SocialPresence[]>(THA_SPOT_FALLBACK_FEED.socialPresence);
  promotions = signal<PromotionCard[]>(THA_SPOT_FALLBACK_FEED.promotions);
  leaderboards = signal<LeaderboardEntry[]>(THA_SPOT_FALLBACK_FEED.leaderboards);
  games = signal<Game[]>(THA_SPOT_FALLBACK_FEED.games);

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

  badgeMap = computed(() =>
    new Map(this.badges().map((badge) => [badge.id, badge]))
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

    return this.games().filter((game) => this.gameService.matchesRoom(game, room));
  });

  activeEvents = computed(() => {
    const roomId = this.activeRoom();
    return this.liveEvents().filter(
      (event) => roomId === 'all' || event.roomId === roomId
    );
  });

  roomPresence = computed(() => {
    const roomId = this.activeRoom();
    return this.socialPresence().filter(
      (entry) => roomId === 'all' || entry.roomId === roomId
    );
  });

  activeLeaderboards = computed(() => {
    const roomId = this.activeRoom();
    return this.leaderboards().filter(
      (entry) => roomId === 'all' || entry.roomId === roomId
    );
  });

  recommendedGames = computed(() => {
    const profile = this.profileService.profile();
    const stats = profile.gameStats || {};
    const affinity =
      PROFILE_AFFINITIES[(profile.primaryGenre || '').toLowerCase()] || [];

    return [...this.games()]
      .map((game) => {
        const gameStats = stats[game.id];
        const haystack = `${game.genre || ''} ${(game.tags || []).join(' ')}`.toLowerCase();
        const affinityScore = affinity.some((token) => haystack.includes(token))
          ? 18
          : 0;
        const historyScore = Math.min((gameStats?.plays || 0) * 6, 24);
        const badgeScore =
          (game.badgeIds?.includes('featured') ? 8 : 0) +
          (game.badgeIds?.includes('staff-pick') ? 6 : 0) +
          (game.badgeIds?.includes('trending') ? 4 : 0);
        const crowdScore = Math.min((game.playersOnline || 0) / 2500, 16);
        return { game, score: affinityScore + historyScore + badgeScore + crowdScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.game);
  });

  recentlyPlayed = computed(() => {
    const stats = this.profileService.profile().gameStats || {};
    return Object.entries(stats)
      .sort(
        (a, b) =>
          (b[1]?.lastPlayedAt || 0) - (a[1]?.lastPlayedAt || 0)
      )
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
    const eventBonus = this.activeEvents().some((event) => event.status === 'live')
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

    const topRecommendation = this.recommendedGames()[0];
    if (topRecommendation) {
      directives.push(
        `Recommended next cabinet: ${topRecommendation.name} based on ${profile.primaryGenre} affinity.`
      );
    }

    if (this.recentlyPlayed().length) {
      directives.push(
        `Momentum check: ${this.recentlyPlayed()[0].name} is still warm from your last run.`
      );
    }

    return directives.slice(0, 4);
  });

  progressionSummary = computed(() => {
    const profile = this.profileService.profile();
    const stats = profile.gameStats || {};
    const totalPlays = this.getTotalPlays();
    const masteredRoom = this.findMasteredRoom(stats);
    return {
      level: profile.level || 1,
      xp: profile.xp || 0,
      achievements: (profile.achievements || []).length,
      totalPlays,
      masteryLabel: masteredRoom?.name || 'Choose a room',
      streakLabel: totalPlays > 0 ? `${Math.min(totalPlays, 7)} session streak` : 'No streak yet',
    };
  });

  ngOnInit() {
    this.feedSubscription = this.gameService.getThaSpotFeed().subscribe((feed) => {
      this.feed.set(feed);
      this.gamingRooms.set(feed.rooms);
      this.badges.set(feed.badges);
      this.liveEvents.set(feed.liveEvents);
      this.socialPresence.set(feed.socialPresence);
      this.promotions.set(feed.promotions);
      this.leaderboards.set(feed.leaderboards);
      this.games.set(feed.games);

      if (!feed.rooms.some((room) => room.id === this.activeRoom())) {
        this.activeRoom.set(feed.rooms[0]?.id || 'all');
      }
    });

    this.clockId = setInterval(() => this.now.set(Date.now()), 30000);
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) {
      clearInterval(this.clockId);
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
      this.isTrustedGameUrl(game.url)
        ? game.launchConfig?.trustNote || 'Trusted source verified for launch.'
        : 'Inline launch blocked because the source is not on the trusted embed allowlist.'
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

    if (!this.isTrustedGameUrl(game.url) || game.launchConfig?.inlinePolicy === 'external-only') {
      this.openGameInNewTab(game);
      return;
    }

    if (game.multiplayerType === 'Server' || game.tags?.includes('Multiplayer')) {
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

    this.matchmakingTimerId = setInterval(() => {
      const progress = this.matchmakingProgress();
      if (progress < 35) {
        this.matchmakingStatus.set('LOCATING COMPETITIVE SIGNALS');
      } else if (progress < 70) {
        this.matchmakingStatus.set('MATCHING ROOM PRESENCE');
      } else {
        this.matchmakingStatus.set('LOCKING OPPONENT PROFILE');
      }

      this.matchmakingProgress.update((value) => Math.min(100, value + 10));

      if (this.matchmakingProgress() >= 100) {
        if (this.matchmakingTimerId) {
          clearInterval(this.matchmakingTimerId);
        }
        this.matchedOpponent.set(
          this.roomPresence()[0]?.name || `GRID_${Math.floor(Math.random() * 900 + 100)}`
        );
        setTimeout(() => {
          this.isMatchmaking.set(false);
          void this.launchGame(game);
        }, 600);
      }
    }, Math.max(120, (game.queueEstimateMinutes || 1) * 120));
  }

  async launchGame(game: Game) {
    this.currentGame.set(game);
    this.sessionStartedAt.set(Date.now());
    this.frameError.set(null);
    await this.profileService.recordGameSession(game.id);
    await this.unlockProgressionMilestones(game, 0);
  }

  closeGame() {
    this.currentGame.set(null);
    this.sessionStartedAt.set(null);
    this.frameError.set(null);
  }

  openGameInNewTab(game: Game) {
    if (typeof window !== 'undefined') {
      window.open(game.url, '_blank', 'noopener,noreferrer');
    }
  }

  getSafeUrl(url: string): SafeResourceUrl | null {
    if (!this.isTrustedGameUrl(url)) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
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
    return this.games().find((game) => game.id === event.featuredGameId) || null;
  }

  getPresenceGame(entry: SocialPresence) {
    return this.games().find((game) => game.id === entry.gameId) || null;
  }

  getPromotionRoute(promotion: PromotionCard) {
    return promotion.route.startsWith('/') ? promotion.route : `/${promotion.route}`;
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
      const rawScore =
        typeof data.payload?.score === 'number'
          ? data.payload.score
          : Number(data.payload?.score || 0);
      const score = Number.isFinite(rawScore) ? Math.max(0, Math.floor(rawScore)) : 0;

      void this.profileService.awardXp(Math.max(25, Math.floor(score / 100)), 'gaming_session');
      void this.profileService.recordGameResult(currentGame.id, score);
      void this.unlockProgressionMilestones(currentGame, score);
    }
  }

  private isTrustedGameUrl(url: string): boolean {
    if (!url) {
      return false;
    }

    if (url.startsWith('/assets/games/')) {
      return true;
    }

    try {
      const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://smuve.local');
      return parsed.protocol === 'https:' && TRUSTED_GAME_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  private isTrustedTelemetryEvent(event: MessageEvent, game: Game): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    if (game.url.startsWith('/assets/games/')) {
      return event.origin === window.location.origin;
    }

    try {
      const parsed = new URL(game.url);
      return event.origin === parsed.origin && TRUSTED_GAME_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  private async unlockProgressionMilestones(game: Game, score: number) {
    const profile = this.profileService.profile();
    const totalPlays = this.getTotalPlays();
    const distinctGames = Object.keys(profile.gameStats || {}).length;

    if (totalPlays >= 1) {
      await this.profileService.unlockAchievement('tha-spot-first-run', 'Tha Spot First Run');
    }
    if (totalPlays >= 10) {
      await this.profileService.unlockAchievement('tha-spot-regular', 'Tha Spot Regular');
    }
    if (distinctGames >= 5) {
      await this.profileService.unlockAchievement('tha-spot-explorer', 'Tha Spot Explorer');
    }
    if (score >= 1000) {
      await this.profileService.unlockAchievement('tha-spot-high-score', 'Tha Spot High Score');
    }
    if (game.badgeIds?.includes('tournament-live')) {
      await this.profileService.unlockAchievement('tha-spot-bracket', 'Bracket Ready');
    }
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
          roomScores.set(room.id, (roomScores.get(room.id) || 0) + (stat.plays || 0));
        }
      }
    }

    const topRoomId = [...roomScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return this.gamingRooms().find((room) => room.id === topRoomId);
  }

  private formatDuration(durationMs: number) {
    const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
