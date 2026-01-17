import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Game } from '../game';
import { GameService } from '../game.service';

@Component({
  selector: 'app-game-view',
  templateUrl: './game-view.component.html',
  styleUrls: ['./game-view.component.css'],
})
export class GameViewComponent implements OnChanges {
  @Input() gameId: string | undefined;
  game: Game | undefined;
  isPlaying = false;

  constructor(private gameService: GameService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['gameId'] && this.gameId) {
      this.gameService.getGame(this.gameId).subscribe((game) => {
        this.game = game;
      });
    }
  }
}
