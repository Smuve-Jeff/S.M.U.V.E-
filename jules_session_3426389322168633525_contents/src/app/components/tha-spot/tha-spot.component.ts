import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Game, GameLibraryService } from '../../services/game-library.service';

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css']
})
export class ThaSpotComponent implements OnInit {
  games: Game[] = [];
  featuredGame: Game | undefined;
  selectedGame: Game | undefined;

  constructor(
    private gameLibraryService: GameLibraryService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.games = this.gameLibraryService.getGames();
    this.featuredGame = this.games[0];
  }

  selectGame(game: Game): void {
    this.selectedGame = game;
  }

  closeGame(): void {
    this.selectedGame = undefined;
  }

  getSafeGameUrl(): SafeResourceUrl | string {
    if (this.selectedGame && this.selectedGame.embedUrl) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(this.selectedGame.embedUrl);
    }
    return '';
  }
}
