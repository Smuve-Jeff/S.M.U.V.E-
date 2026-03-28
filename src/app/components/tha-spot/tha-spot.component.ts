import {
  Component,
  computed,
  signal,
  inject,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { GameService } from '../../hub/game.service';
import { Game } from '../../hub/game';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { MainViewMode } from '../../services/user-context.service';
import {
  GameTelemetryEnvelope,
  GameOverPayload,
  GameUpdatePayload,
  AchievementUnlockedPayload,
} from '../../types/game-telemetry.types';

const MAX_TAGS_WITH_AVAILABILITY = 1;
const MAX_TAGS_WITHOUT_AVAILABILITY = 2;
const AVAILABILITY_FILTERS = ['All', 'Offline', 'Online', 'Hybrid'] as const;

type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: Date;
  isSystem?: boolean;
}

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
})
export class ThaSpotComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;

  private gameService = inject(GameService);
  private profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  public uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  activeTab = signal<string>('Discover');
  games = signal<Game[]>([]);
  searchQuery = signal('');
  sortMode = signal<'Popular' | 'Rating'>('Popular');
  capabilityFilter = signal<'All' | 'Multiplayer' | 'AI'>('All');
  availabilityFilter = signal<AvailabilityFilter>('All');
  visualQuality = signal<'Performance' | 'Balanced' | 'Ultra'>('Balanced');
  isSearching = signal(false);
  matchFound = signal(false);
  searchProgress = signal(0);
  opponentName = signal('');
  matchmakingStep = signal<string>('Initializing');

  currentGame = signal<Game | null>(null);
  filteredGames = computed(() => {
    let filtered = [...this.games()];
    const query = this.searchQuery().trim().toLowerCase();

    if (query) {
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(query) ||
          g.description?.toLowerCase().includes(query) ||
          g.genre?.toLowerCase().includes(query) ||
          g.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    switch (this.activeTab()) {
      case 'Multiplayer':
        filtered = filtered.filter((g) => g.tags?.includes('Multiplayer'));
        break;
      case 'AI Arena':
        filtered = filtered.filter((g) => g.tags?.includes('AI'));
        break;
      case 'Classics':
        filtered = filtered.filter(
          (g) => g.genre === 'Classic' || g.tags?.includes('Classic')
        );
        break;
    }

    if (this.capabilityFilter() !== 'All') {
      filtered = filtered.filter((g) => g.tags?.includes(this.capabilityFilter()));
    }

    if (this.availabilityFilter() !== 'All') {
      filtered = filtered.filter((g) => g.availability === this.availabilityFilter());
    }

    filtered.sort((a, b) =>
      this.sortMode() === 'Popular'
        ? (b.playersOnline || 0) - (a.playersOnline || 0)
        : (b.rating || 0) - (a.rating || 0)
    );

    return filtered;
  });
  spotlightGame = computed(() => this.filteredGames()[0] ?? null);
  hubStats = computed(() => {
    const games = this.games();
    const playersOnline = games.reduce(
      (total, game) => total + (game.playersOnline || 0),
      0
    );
    return {
      gameCount: games.length,
      playersOnline,
    };
  });

  leaderboard = signal<{ player: string; score: number }[]>([
    { player: 'SmuveKing', score: 125000 },
    { player: 'RhythmQueen', score: 98000 },
    { player: 'BassLord', score: 85400 },
  ]);

  chatMessages = signal<ChatMessage[]>([]);
  newChatMessage = '';
  isChatOpen = signal(false);

  // Isometric floor state
  floorRotation = signal({ x: 60, z: -45 });
  floorScale = signal(1);
  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };

  // Game updates from iframe
  gameData = signal<any>({});

  private lastAwardedScore = 0;

  ngOnInit() {
    this.fetchGames();
    this.chatMessages.set([
      {
        id: '1',
        user: 'S.M.U.V.E.',
        text: 'NEURAL CHAT LINK ESTABLISHED. KEEP IT DISCIPLINED.',
        timestamp: new Date(),
        isSystem: true,
      },
      {
        id: '2',
        user: 'SYSTEM',
        text: 'NEURAL LINK ESTABLISHED. WELCOME TO THA SPOT.',
        timestamp: new Date(),
        isSystem: true,
      },
    ]);
  }

  ngOnDestroy() {}

  fetchGames() {
    this.gameService.listGames().subscribe((g) => this.games.set(g));
  }

  navigateToView(mode: string) {
    this.uiService.navigateToView(mode as MainViewMode);
  }

  navigateTo(mode: string) {
    this.uiService.navigateToView(mode as MainViewMode);
  }

  playGame(game: Game) {
    if (game.tags?.includes('Multiplayer')) {
      this.startMatchmaking(game);
    } else {
      this.currentGame.set(game);
    }
  }

  startMatchmaking(game: Game) {
    this.isSearching.set(true);
    this.matchFound.set(false);
    this.searchProgress.set(0);
    this.matchmakingStep.set('Scanning Matrix');

    const interval = setInterval(() => {
      this.searchProgress.update((p) => p + 5);
      if (this.searchProgress() >= 100) {
        clearInterval(interval);
        this.matchFound.set(true);
        setTimeout(() => {
          this.isSearching.set(false);
          this.currentGame.set(game);
        }, 1500);
      }
    }, 100);
  }

  closeGame() {
    this.currentGame.set(null);
  }

  getSafeUrl(url: string): SafeResourceUrl {
    const safeUrl = this.isAllowedGameUrl(url) ? url : 'about:blank';
    return this.sanitizer.bypassSecurityTrustResourceUrl(safeUrl);
  }

  toggleChat() {
    this.isChatOpen.update((v) => !v);
  }

  chatActive(): boolean {
    return this.isChatOpen();
  }

  sendChatMessage() {
    const text = this.newChatMessage.trim();
    if (!text) return;

    this.chatMessages.update((msgs) => [
      ...msgs,
      {
        id: Date.now().toString(),
        user: 'Artist',
        text,
        timestamp: new Date(),
      },
    ]);
    this.newChatMessage = '';
  }

  setActiveTab(tab: string) {
    this.activeTab.set(tab);
  }

  setSortMode(mode: string) {
    if (mode === 'Popular' || mode === 'Rating') {
      this.sortMode.set(mode);
    }
  }

  setCapabilityFilter(filter: string) {
    if (filter === 'All' || filter === 'Multiplayer' || filter === 'AI') {
      this.capabilityFilter.set(filter);
    }
  }

  setAvailabilityFilter(filter: string) {
    if ((AVAILABILITY_FILTERS as readonly string[]).includes(filter)) {
      this.availabilityFilter.set(filter as AvailabilityFilter);
    }
  }

  setVisualQuality(quality: string) {
    if (quality === 'Performance' || quality === 'Balanced' || quality === 'Ultra') {
      this.visualQuality.set(quality);
    }
  }

  qualityModeClass() {
    switch (this.visualQuality()) {
      case 'Performance':
        return 'quality-performance';
      case 'Ultra':
        return 'quality-ultra';
      default:
        return 'quality-balanced';
    }
  }

  getFloorTransform() {
    return `rotateX(${this.floorRotation().x}deg) rotateZ(${this.floorRotation().z}deg) scale(${this.floorScale()})`;
  }

  onFloorMouseDown(event: MouseEvent) {
    this.isDragging = true;
    this.lastMousePos = { x: event.clientX, y: event.clientY };
  }

  onFloorMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;
    const deltaX = event.clientX - this.lastMousePos.x;
    const deltaY = event.clientY - this.lastMousePos.y;
    this.floorRotation.update((r) => ({
      x: Math.max(30, Math.min(80, r.x - deltaY * 0.5)),
      z: r.z + deltaX * 0.5,
    }));
    this.lastMousePos = { x: event.clientX, y: event.clientY };
  }

  @HostListener('window:mouseup')
  onFloorMouseUp() {
    this.isDragging = false;
  }

  getStationPos(index: number) {
    const row = Math.floor(index / 4);
    const col = index % 4;
    return `pos-${row}-${col}`;
  }

  getVisibleTags(game: Game) {
    return (game.tags || []).slice(
      0,
      game.availability ? MAX_TAGS_WITH_AVAILABILITY : MAX_TAGS_WITHOUT_AVAILABILITY
    );
  }

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const data: any = (event as MessageEvent).data;
    if (!data) return;

    // Accept both legacy {type,payload} and new envelope.
    const envelope: GameTelemetryEnvelope = {
      type: data.type,
      payload: data.payload ?? data.data,
      gameId: data.gameId,
      timestamp: data.timestamp,
    };

    const gameId = envelope.gameId || this.currentGame()?.id || 'unknown';

    switch (envelope.type) {
      case 'GAME_READY':
        this.lastAwardedScore = 0;
        break;

      case 'GAME_UPDATE': {
        const payload = (envelope.payload || {}) as GameUpdatePayload;
        this.gameData.update((d: any) => ({ ...d, ...payload }));

        const score = payload.score || 0;
        if (score - this.lastAwardedScore >= 1000) {
          this.lastAwardedScore = score;
          void this.profileService.awardXp(5, `game:${gameId}:score`);
        }

        if (score > 1000 && score % 5000 < 500) {
          this.chatMessages.update((msgs) => [
            ...msgs,
            {
              id: Date.now().toString(),
              user: 'S.M.U.V.E',
              text: `EXECUTIVE PERFORMANCE DETECTED: ${score} POINTS. STATUS SYNCED.`,
              timestamp: new Date(),
              isSystem: true,
            },
          ]);
        }
        break;
      }

      case 'GAME_OVER': {
        const payload = envelope.payload as GameOverPayload;
        if (!payload || typeof payload.score !== 'number') return;

        void this.profileService.recordGameResult(gameId, payload.score);
        const xp = 25 + Math.floor(payload.score / 500);
        void this.profileService.awardXp(xp, `game:${gameId}:over`);

        if (payload.score >= 10000) {
          void this.profileService.unlockAchievement(`ach-${gameId}-10k`, '10K Score');
        }
        break;
      }

      case 'ACHIEVEMENT_UNLOCKED': {
        const payload = envelope.payload as AchievementUnlockedPayload;
        if (!payload?.achievementId || !payload?.title) return;
        void this.profileService.unlockAchievement(payload.achievementId, payload.title);
        break;
      }
    }
  }

  navigateToPath(path: string) {
    this.router.navigate([path]);
  }

  private isAllowedGameUrl(url: string): boolean {
    if (url.startsWith('/assets/games/')) return true;

    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
