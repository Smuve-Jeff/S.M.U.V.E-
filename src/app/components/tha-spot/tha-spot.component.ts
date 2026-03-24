import {
  Component,
  signal,
  inject,
  OnInit,
  OnDestroy,
  HostListener,
  computed,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { GameService } from '../../hub/game.service';
import { Game } from '../../hub/game';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { MainViewMode } from '../../services/user-context.service';

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
  imports: [CommonModule, FormsModule, DecimalPipe],
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

  activeTab = signal<string>('Arcade');
  games = signal<Game[]>([]);
  searchQuery = '';
  isSearching = signal(false);
  matchFound = signal(false);
  searchProgress = signal(0);
  opponentName = signal('');
  matchmakingStep = signal<string>('Initializing');

  currentGame = signal<Game | null>(null);

  leaderboard = signal<{ player: string; score: number }[]>([
    { player: 'SmuveKing', score: 125000 },
    { player: 'RhythmQueen', score: 98000 },
    { player: 'BassLord', score: 85400 },
  ]);

  chatMessages = signal<ChatMessage[]>([]);
  newChatMessage = signal('');
  isChatOpen = signal(false);

  // Isometric View State
  floorPan = signal({ x: 0, y: 0 });
  floorTilt = signal(60);
  floorRotate = signal(-45);

  constructor() {}

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
    ]);
  }

  ngOnDestroy() {}

  fetchGames() {
    this.gameService
      .listGames({ query: this.searchQuery })
      .subscribe((g) => this.games.set(g));
  }

  navigateToView(mode: string) {
    this.uiService.navigateToView(mode as MainViewMode);
  }

  navigateTo(mode: string) {
    this.uiService.navigateToView(mode as MainViewMode);
  }

  playGame(game: any) {
    if (game.tags?.includes('Multiplayer') || Math.random() > 0.7) {
      this.startMatchmaking(game);
    } else {
      this.currentGame.set(game);
    }
  }

  startMatchmaking(game: any) {
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
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  toggleChat() {
    this.isChatOpen.update((v) => !v);
  }

  chatActive() {
    return this.isChatOpen();
  }

  sendChatMessage() {
    const text = this.newChatMessage();
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
    this.newChatMessage.set('');
  }

  getFloorTransform() {
    return `rotateX(${this.floorTilt()}deg) rotateZ(${this.floorRotate()}deg) translate(${this.floorPan().x}px, ${this.floorPan().y}px)`;
  }

  onFloorMouseDown(event?: any) {}
  onFloorMouseMove(event?: any) {}
  onFloorMouseUp(event?: any) {}

  setActiveTab(tab: string) {
    this.activeTab.set(tab);
  }

  getStationPos(index: number) {
    return 'station-' + index;
  }

  @HostListener('window:message', [''])
  onMessage(event: MessageEvent) {}
}
