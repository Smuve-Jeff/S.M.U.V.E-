import { Component, signal, inject, OnInit, OnDestroy, HostListener, computed, ViewChild, ElementRef } from '@angular/core';
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
  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;

  private gameService = inject(GameService);
  private reputationService = inject(ReputationService);
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  activeTab = signal<any>('arcade');
  games = signal<Game[]>([]);
  searchQuery = '';
  selectedGenre = signal<string>('All');
  multiplayerOnly = signal(false);
  isSearching = signal(false);
  matchFound = signal(false);
  searchProgress = signal(0);
  opponentName = signal('');
  matchmakingStep = signal<string>('Initializing');
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
    const genre = this.selectedGenre();

    return this.games().filter(g => {
      const matchesQuery = g.name.toLowerCase().includes(q) || (g.genre?.toLowerCase().includes(q) ?? false);
      const matchesMulti = !multi || (g.tags?.includes('Multiplayer') ?? false);
      const matchesGenre = genre === 'All' || g.genre === genre;
      return matchesQuery && matchesMulti && matchesGenre;
    });
  });

  setGenre(genre: string) {
    this.selectedGenre.set(genre);
  }

  playGame(game: Game) {
    if (game.tags?.includes('Multiplayer')) {
      this.startMatchmaking(game);
    } else {
      this.currentGame.set(game);
      this.gameData.set({ score: 0, health: 100, commentary: 'System link established.' });
      setTimeout(() => this.refocusGame(), 500);
    }
  }

  startMatchmaking(game: Game) {
    this.isSearching.set(true);
    this.matchFound.set(false);
    this.searchProgress.set(0);
    this.matchmakingStep.set('Scanning Matrix');

    const steps = [
      { p: 20, s: 'Neural Link Negotiating' },
      { p: 40, s: 'Bypassing Local Firewalls' },
      { p: 60, s: 'Synchronizing Latency' },
      { p: 80, s: 'Opponent Verified' },
      { p: 100, s: 'Battle Ready' }
    ];

    const interval = setInterval(() => {
      this.searchProgress.update(p => p + 2);

      const currentStep = steps.find(s => this.searchProgress() >= s.p && this.searchProgress() < s.p + 2);
      if (currentStep) this.matchmakingStep.set(currentStep.s);

      if (this.searchProgress() >= 100) {
        clearInterval(interval);
        this.matchFound.set(true);
        this.opponentName.set(this.leaderboard()[Math.floor(Math.random() * this.leaderboard().length)].player);

        setTimeout(() => {
          this.isSearching.set(false);
          this.currentGame.set(game);
          this.gameData.set({
            score: 0,
            health: 100,
            commentary: `System: Connected to ${this.opponentName()}. Good luck, you'll need it.`
          });
          setTimeout(() => this.refocusGame(), 500);
        }, 2000);
      }
    }, 50);
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

  refocusGame() {
    if (this.gameIframe?.nativeElement) {
      this.gameIframe.nativeElement.focus();
    }
  }

  toggleFullscreen() {
    if (this.gameIframe?.nativeElement) {
      const iframe = this.gameIframe.nativeElement;
      if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
      } else if ((iframe as any).webkitRequestFullscreen) {
        (iframe as any).webkitRequestFullscreen();
      } else if ((iframe as any).msRequestFullscreen) {
        (iframe as any).msRequestFullscreen();
      }
    }
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

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const type = event.data?.type;
    const payload = event.data?.payload || event.data?.data;

    if (type === 'GAME_UPDATE' && payload) {
      this.gameData.update(d => ({ ...d, ...payload }));

      if (payload.score > 1000) {
        this.reputationService.addExperience(5);
        if (payload.score % 5000 < 500) {
           this.chatMessages.update(msgs => [...msgs, {
             id: Date.now().toString(),
             user: 'S.M.U.V.E',
             text: `EXECUTIVE PERFORMANCE DETECTED: ${payload.score} POINTS. REPUTATION SYNCED.`,
             timestamp: new Date(),
             isSystem: true
           }]);
        }
      }
    }
  }
}
