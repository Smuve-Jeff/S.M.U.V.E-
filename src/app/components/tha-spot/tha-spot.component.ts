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
import { GameService } from '../../hub/game.service';
import { Game } from '../../hub/game';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { MainViewMode } from '../../services/user-context.service';

interface GamingRoom {
  id: string;
  name: string;
  icon: string;
  description: string;
}

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
  private profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  public uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  // Gaming Rooms Definition
  gamingRooms: GamingRoom[] = [
    { id: 'all', name: 'All Games', icon: 'grid_view', description: 'Complete tactical library of available titles.' },
    { id: 'classics', name: 'Classics', icon: 'history', description: 'Legendary titles that defined generations of gaming.' },
    { id: 'combat', name: 'Combat', icon: 'sports_kabaddi', description: 'High-intensity battle arenas and fighting tournaments.' },
    { id: 'sports', name: 'Sports', icon: 'sports_basketball', description: 'Elite athletic simulations and competitive league play.' },
    { id: 'arcade', name: 'Arcade', icon: 'joystick', description: 'Fast-paced reflex challenges and high-score chasers.' },
    { id: 'strategy', name: 'Strategy', icon: 'psychology', description: 'Deep tactical challenges and timeless tabletop classics.' }
  ];

  activeRoom = signal<string>('all');
  isTransitioning = signal(false);
  games = signal<Game[]>([]);
  currentGame = signal<Game | null>(null);

  filteredGames = computed(() => {
    const allGames = this.games();
    const roomId = this.activeRoom();

    if (roomId === 'all') return allGames;

    return allGames.filter(game => {
      const tags = game.tags?.map(t => t.toLowerCase()) || [];
      const genre = game.genre?.toLowerCase() || '';

      switch (roomId) {
        case 'classics':
          return genre === 'classic' || tags.includes('retro');
        case 'combat':
          return genre === 'fighting' || tags.includes('combat') || tags.includes('pvp');
        case 'sports':
          return genre === 'sports' || tags.includes('basketball') || tags.includes('football');
        case 'arcade':
          return genre === 'racing' || genre === 'rhythm' || tags.includes('arcade') || tags.includes('reflex');
        case 'strategy':
          return genre === 'strategy' || genre === 'casino' || tags.includes('logic');
        default:
          return true;
      }
    });
  });

  ngOnInit() {
    this.fetchGames();
  }

  ngOnDestroy() {}

  fetchGames() {
    this.gameService.listGames().subscribe((g) => this.games.set(g));
  }

  setActiveRoom(roomId: string) {
    if (this.activeRoom() === roomId) return;

    this.isTransitioning.set(true);
    setTimeout(() => {
      this.activeRoom.set(roomId);
      this.isTransitioning.set(false);
    }, 300);
  }

  getActiveRoomName(): string {
    return this.gamingRooms.find(r => r.id === this.activeRoom())?.name || 'Gaming Hub';
  }

  getActiveRoomDesc(): string {
    return this.gamingRooms.find(r => r.id === this.activeRoom())?.description || '';
  }

  playGame(game: Game) {
    this.currentGame.set(game);
  }

  closeGame() {
    this.currentGame.set(null);
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  getVisibleTags(game: Game) {
    return (game.tags || []).slice(0, 3);
  }

  navigateToPath(path: string) {
    this.router.navigate([path]);
  }

  isDarkMode(): boolean {
    return this.uiService.activeTheme().name === 'Dark';
  }

  @HostListener('window:message', [''])
  onMessage(event: MessageEvent) {
    const data = event.data;
    if (!data) return;

    // Handle basic telemetry if needed for internal games
    if (data.type === 'GAME_OVER' && data.payload?.score) {
      void this.profileService.awardXp(Math.floor(data.payload.score / 100), 'gaming_session');
    }
  }
}
