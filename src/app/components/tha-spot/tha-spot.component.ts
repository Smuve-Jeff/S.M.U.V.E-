import { Component, OnInit, OnDestroy, signal, inject, computed, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../hub/game.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { PlayerService } from '../../services/player.service';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css']
})
export class ThaSpotComponent implements OnInit, OnDestroy {
  @ViewChild('gameIframe') gameIframe!: ElementRef<HTMLIFrameElement>;

  private gameService = inject(GameService);
  private playerService = inject(PlayerService);
  public profileService = inject(UserProfileService);
  public uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  games = signal<any[]>([]);
  gamingRooms = signal<any[]>([]);
  activeRoom = signal<string>('all');
  selectedGame = signal<any>(null);
  currentGame = signal<any>(null);
  feed = signal<any>(null);
  badges = signal<any[]>([]);
  liveEvents = signal<any[]>([]);
  socialPresence = signal<any>(null);
  promotions = signal<any[]>([]);
  recommendationRails = signal<any[]>([]);
  frameError = signal<string | null>(null);

  searchQuery = signal<string>('');
  showIntelPanel = signal<boolean>(false);
  isMatchmaking = signal<boolean>(false);
  neuralSyncScore = signal<number>(85);
  gamingDirectives = signal<any[]>([{ id: "1", label: "Master the crossfade", impact: "High" }, { id: "2", label: "Record a 2-minute set", impact: "Medium" }]);
  liveMetrics = signal<any>({ roomPlayers: 0, queueHealth: 'GOOD' });

  topRecommendation = computed(() => this.games()[0]);
  featuredGame = computed(() => this.games().find(g => g.featured) || this.games()[0]);
  trendingGames = computed(() => this.games().slice(0, 4));
  newGames = computed(() => this.games().slice(0, 4));
  genreRails = computed(() => []);
  isPlaying = computed(() => this.playerService.isPlaying());

  ngOnInit() { this.loadFeed(); }
  ngOnDestroy() { }

  loadFeed(force = false) {
    this.gameService.getThaSpotFeed(force).subscribe(feed => {
      this.feed.set(feed);
      this.games.set(feed.games);
      this.gamingRooms.set(feed.rooms);
    });
  }

  previewGame(game: any) { this.selectedGame.set(game); }
  async launchGame(game: any) { this.currentGame.set(game); }
  closeGame() { this.currentGame.set(null); }

  navigateToPath(path: string) { this.router.navigate([path]); }
  isDarkMode() { return this.uiService.activeTheme().name === 'Dark'; }
  onFrameError() { this.frameError.set('Error loading cabinet'); }

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) { }

  getGameRoomLabels(game: any) { return []; }
  getLaunchModeLabel(game: any) { return 'Online'; }
  getCardAnimationDelay(index: number) { return '0s'; }
  canEmbedInline(game: any) { return true; }
  onPromotionClick(p: any) { }
  getPromotionRoute(p: any) { return '/'; }
}
