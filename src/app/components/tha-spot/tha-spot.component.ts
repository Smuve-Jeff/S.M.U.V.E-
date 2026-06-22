import { Component, OnInit, OnDestroy, signal, computed, inject, effect, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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
import { SocialNetworkingService, RoomMessage, PrivateMessage } from '../../services/social-networking.service';
import { PeerNetworkingService } from '../../services/peer-networking.service';

const LIVE_CLOCK_INTERVAL_MS = 60000;
const FEED_REFRESH_INTERVAL_MS = 300000;

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css']
})
/* S.M.U.V.E. v4.2 Enhanced Catalog Access */
export class ThaSpotComponent implements OnInit, OnDestroy, AfterViewInit {
  private gameService = inject(GameService);
  private profileService = inject(UserProfileService);
  private uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private gamepadService = inject(GamepadService);
  private securityService = inject(SecurityService);
  public socialService = inject(SocialNetworkingService);
  public peerService = inject(PeerNetworkingService);

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
    const knownPlatforms = ['PS1', 'PS2', 'N64', 'Xbox', 'Dreamcast', 'SNES', 'NES', 'Arcade', 'DOS', 'Web', 'PC'];
    this.games().forEach((g) => {
      const tags = (g.tags || []).map(t => t.toUpperCase());
      knownPlatforms.forEach(p => {
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
  now = signal<number>(Date.now());
  isMatchmaking = signal<boolean>(false);
  matchmakingStatus = signal<string>('');
  matchmakingProgress = signal<number>(0);
  isWasmLoading = signal<boolean>(false);
  showBackToTop = signal<boolean>(false);

  // Social & Streaming Signals
  activeHubTab = signal<'room' | 'dm' | 'stream'>('room');
  dmTargetUserId = signal<string | null>(null);
  chatInput = signal<string>('');

  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('contentViewport') contentViewport?: ElementRef<HTMLDivElement>;

  private feedSubscription?: Subscription;
  private clockId?: any;
  private feedRefreshId?: any;
  private readonly messageHandler = (event: MessageEvent) => this.onMessage(event);

  // Computed signals
  filteredGames = computed(() => {
    if (this.displayMode() === 'pluto') return [];
    let games = this.games();

    const currentRoomId = this.activeRoom();
    if (currentRoomId !== 'all') {
      const room = this.gamingRooms().find(r => r.id === currentRoomId);
      if (room) {
        games = games.filter(g => this.gameService.matchesRoom(g, room));
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
  playerSearchQuery = signal('');
  filteredOnlineUsers = computed(() => {
    const query = this.playerSearchQuery().toLowerCase();
    return this.onlineUsers().filter(u =>
      u.artistName?.toLowerCase().includes(query) ||
      u.primaryGenre?.toLowerCase().includes(query)
    );
  });
  selectedDmUser = computed(() => this.onlineUsers().find(u => u.userId === this.dmTargetUserId()));
  canInteract = computed(() => this.profileService.profile().profileSetupCompleted);
  isKnocking = this.peerService.isKnocking;
  knockFromUserId = this.peerService.knockFromUserId;
  messages = this.socialService.messages;
  roomMessages = this.socialService.roomMessages;
  challenges = this.socialService.challenges;
  isCallActive = this.peerService.isCallActive;
  inGame = signal(false);
  gameIdToInvite = signal('all');

  statusEffect = effect(() => {
    const inGame = this.inGame();
    this.socialService.updateStatus({ inGame });
  });
  constructor() {
    const savedFavs = localStorage.getItem('tha_spot_favorites');
    if (savedFavs) this.favorites.set(JSON.parse(savedFavs));

    effect(() => {
      const gp = this.gamepadService.connectedGamepad();
      if (gp) {
        if (gp.buttons[0]) this.confirmLaunch();
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
  }

  ngOnInit() {
    this.securityService.getCSRFToken();
    this.loadFeed();
    this.startLiveClock();
    this.startFeedRefresh();
    window.addEventListener('message', this.messageHandler);
    this.socialService.joinRoom(this.activeRoom());
  }

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.feedSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
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
      this.socialService.sendTypingStatus(this.dmTargetUserId()!, val.length > 0);
    }
  }
  onSearchChange(val: string) {
    this.searchQuery.set(val);
  }

  onGameClick(game: Game) {
    this.selectedGame.set(game);
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
        await new Promise(r => setTimeout(r, 1200));
        this.isWasmLoading.set(false);
      }
      this.profileService.recordGameLaunch(game.id, this.buildSessionContext(game));
      this.inGame.set(true);
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
    return this.gamingRooms().find((r) => r.id === this.activeRoom())?.name || 'All Games';
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
    this.clockId = window.setInterval(() => this.now.set(Date.now()), LIVE_CLOCK_INTERVAL_MS);
  }

  private startFeedRefresh(): void {
    this.feedRefreshId = window.setInterval(() => this.loadFeed(true), FEED_REFRESH_INTERVAL_MS);
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
    if (event.origin !== window.location.origin || !active || !this.gameIframe?.nativeElement?.contentWindow || event.source !== this.gameIframe.nativeElement.contentWindow) return;
    if (event.data?.type === 'GAME_OVER') {
      this.profileService.recordGameResult(active.id, { ...this.buildSessionContext(active), score: event.data.data?.score });
      this.closeGame();
    }
  }

  private resolveEventStatus(event: LiveEvent, now: number): LiveEvent {
    if (!event.schedule?.startAt) return event;
    const start = new Date(event.schedule.startAt).getTime();
    const end = event.schedule.endAt ? new Date(event.schedule.endAt).getTime() : null;
    let status: LiveEvent['status'] = event.status;
    if (now < start) status = 'upcoming';
    else if (end && now > end) status = 'ending-soon';
    else status = 'live';
    return { ...event, status };
  }

  private resolveLaunchWarning(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only' ? 'External governance required.' : 'Verified.';
  }

  isRetroOrArcade(game: Game): boolean {
    const tags = (game.tags || []).map((t) => t.toLowerCase());
    return tags.includes('retro') || tags.includes('arcade') || game.badgeIds?.includes('elite') === true;
  }

  private isMultiplayerGame(game: Game): boolean {
    return !!game.multiplayerType && game.multiplayerType !== 'None';
  }

  private buildSessionContext(game: Game) {
    const event = this.activeEvents().find((e) => e.featuredGameId === game.id);
    return { roomId: this.activeRoom(), eventId: event?.id, reward: event?.reward };
  }

  launchActionLabel(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only' ? 'OPEN EXTERNALLY' : 'INITIALIZE';
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    const allGames = this.games();
    if (rail.gameIds?.length) return allGames.filter((g) => rail.gameIds!.includes(g.id));
    if (rail.audience?.primaryGenres?.length) return allGames.filter((g) => rail.audience!.primaryGenres!.includes(g.genre || ''));
    if (rail.badgeId) return allGames.filter((g) => g.badgeIds?.includes(rail.badgeId!));
    return allGames.slice(0, rail.maxItems || 4);
  }

  private matchesRecommendationAudience(rail: RecommendationRail, profile: any): boolean {
    return true;
  }

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

  // HUB TABS
  setHubTab(tab: 'room' | 'dm' | 'stream') {
    this.activeHubTab.set(tab);
    if (tab === 'dm' && !this.dmTargetUserId() && this.onlineUsers().length > 0) {
      this.dmTargetUserId.set(this.onlineUsers()[0].userId);
    }
    setTimeout(() => this.scrollToBottom(), 50);
  }

  setDmTarget(userId: string) {
    this.dmTargetUserId.set(userId);
    setTimeout(() => this.scrollToBottom(), 50);
  }

  handleChatSubmit() {
    const msg = this.chatInput().trim();
    if (!msg) return;

    if (this.activeHubTab() === 'room') {
      this.socialService.sendRoomMessage(this.activeRoom(), msg);
    } else if (this.activeHubTab() === 'dm' && this.dmTargetUserId()) {
      this.socialService.sendMessage(this.dmTargetUserId()!, msg);
    }

    this.chatInput.set('');
  }

  onContentScroll(event: Event) {
    const target = event.target as HTMLElement;
    this.showBackToTop.set(target.scrollTop > 400);
  }

  scrollToTop() {
    if (this.contentViewport?.nativeElement) {
      this.contentViewport.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }


  addEmoji(emoji: string) {
    this.chatInput.update(v => v + emoji);
  }

  scrollToBottom() {
    if (this.scrollContainer?.nativeElement) {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    }
  }

  // STREAMING
  goLive(platform: string) {
    this.socialService.startStream(platform);
    this.activeHubTab.set('stream');
  }

  endStream() {
    this.socialService.stopStream();
  }
}
