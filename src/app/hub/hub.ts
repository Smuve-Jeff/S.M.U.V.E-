import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Game } from './game';
import { GameListComponent } from './game-list/game-list.component';
import { GameSearchComponent } from './game-search/game-search.component';
import { GameService } from './game.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, GameListComponent, GameSearchComponent],
  templateUrl: './hub.html',
  styleUrls: ['./hub.css']
})
export class HubComponent {
  viewMode = signal<'list' | 'game' | 'search'>('list');
  selectedGame = signal<Game | null>(null);

  constructor(private sanitizer: DomSanitizer, private gameService: GameService) {}

  get safeGameUrl(): SafeResourceUrl | null {
    const game = this.selectedGame();
    return game ? this.sanitizer.bypassSecurityTrustResourceUrl(game.url) : null;
  }

  onGameSelected(game: Game) {
    this.selectedGame.set(game);
    this.viewMode.set('game');
  }

  onFindMoreGames() {
    this.viewMode.set('search');
  }

  onGameInstalled() {
    this.viewMode.set('list');
  }

  onBackToList() {
    this.viewMode.set('list');
  }
}
