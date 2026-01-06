import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../game.service';

@Component({
  selector: 'app-game-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-search.component.html',
  styleUrls: ['./game-search.component.css']
})
export class GameSearchComponent {
  @Output() gameInstalled = new EventEmitter<void>();
  @Output() backToList = new EventEmitter<void>();

  gameName = '';
  gameUrl = '';
  gameImage = '';

  constructor(private gameService: GameService) {}

  installGame() {
    if (this.gameName && this.gameUrl) {
      this.gameService.addGame({
        name: this.gameName,
        url: this.gameUrl,
        image: this.gameImage
      });
      this.gameInstalled.emit();
    }
  }

  onBackToList() {
    this.backToList.emit();
  }
}
