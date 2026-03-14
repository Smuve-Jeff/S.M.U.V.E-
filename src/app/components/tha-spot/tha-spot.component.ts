import { Component, signal, inject, OnInit, OnDestroy, HostListener, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { GameService } from '../../hub/game.service';
import { Game } from '../../hub/game';
import { ReputationService } from '../../services/reputation.service';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

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
  styleUrls: ['./tha-spot.component.css']
})
export class ThaSpotComponent implements OnInit, OnDestroy {
  private gameService = inject(GameService);
  private reputationService = inject(ReputationService);
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  activeTab = signal<any>('arcade');
  games = signal<Game[]>([]);
  searchQuery = '';
  multiplayerOnly = signal(false);
  isSearching = signal(false);
  matchFound = signal(false);
  searchProgress = signal(0);
  opponentName = signal('');
  private searchSubject = new Subject<string>();

  currentGame = signal<Game | null>(null);
  gameData = signal<{score: number, health: number, commentary: string}>({ score: 0, health: 100, commentary: '' });
  leaderboard = signal<{player: string, score: number}[]>([
    { player: 'SmuveKing', score: 125000 },
    { player: 'RhythmQueen', score: 98000 },
    { player: 'BassLord', score: 85400 }
  ]);

  chatMessages = signal<ChatMessage[]>([]);
  newChatMessage = signal('');

  constructor() {
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
      this.fetchGames();
    });
  }

  ngOnInit() {
    this.fetchGames();
  }

  ngOnDestroy() {}

  fetchGames() {
    this.gameService.listGames({ query: this.searchQuery }).subscribe(g => this.games.set(g));
  }

  filteredGames = computed(() => {
    const q = this.searchQuery.toLowerCase();
    const multi = this.multiplayerOnly();
    return this.games().filter(g => {
      const matchesQuery = g.name.toLowerCase().includes(q) || (g.genre?.toLowerCase().includes(q) ?? false);
      const matchesMulti = !multi || (g.tags?.includes('Multiplayer') ?? false);
      return matchesQuery && matchesMulti;
    });
  });

  playGame(game: Game) {
    if (game.tags?.includes('Multiplayer')) {
      this.startMatchmaking(game);
    } else {
      this.currentGame.set(game);
      this.gameData.set({ score: 0, health: 100, commentary: 'System link established.' });
    }
  }

  startMatchmaking(game: Game) {
    this.isSearching.set(true);
    this.matchFound.set(false);
    this.searchProgress.set(0);

    const interval = setInterval(() => {
      this.searchProgress.update(p => p + 5);
      if (this.searchProgress() >= 100) {
        clearInterval(interval);
        this.matchFound.set(true);
        this.opponentName.set(this.leaderboard()[Math.floor(Math.random() * this.leaderboard().length)].player);

        setTimeout(() => {
          this.isSearching.set(false);
          this.currentGame.set(game);
          this.gameData.set({ score: 0, health: 100, commentary: 'Combat link synchronized.' });
        }, 2000);
      }
    }, 100);
  }

  toggleMultiplayer() {
    this.multiplayerOnly.update(m => !m);
  }

  closeGame() {
    this.currentGame.set(null);
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  setActiveTab(tab: any) {
    this.activeTab.set(tab);
  }

  sendChatMessage() {
    if (!this.newChatMessage()) return;
    this.chatMessages.update(msgs => [...msgs, {
      id: Date.now().toString(),
      user: 'Test User',
      text: this.newChatMessage(),
      timestamp: new Date()
    }]);
    this.newChatMessage.set('');
  }

  @HostListener('window:message', [''])
  onMessage(event: MessageEvent) {
    if (event.data.type === 'GAME_UPDATE') {
      this.gameData.update(d => ({ ...d, ...event.data.payload }));
    }
  }
}
