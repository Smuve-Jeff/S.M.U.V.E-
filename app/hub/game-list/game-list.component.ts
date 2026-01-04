import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../game.service';
import { Game } from '../game';

@Component({
  selector: 'app-game-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-list.component.html',
  styleUrls: ['./game-list.component.css']
})
export class GameListComponent {
  @Output() gameSelected = new EventEmitter<Game>();
  @Output() findMoreGames = new EventEmitter<void>();

  games = this.gameService.games;

  constructor(private gameService: GameService) {}

  selectGame(game: Game) {
    this.gameSelected.emit(game);
  }

  onFindMoreGames() {
    this.findMoreGames.emit();
  }
}
