import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule, DomSanitizer, SafeResourceUrl } from '@angular/common';
import { Game } from '../game';
import { GameService } from '../game.service';
import { ReputationService } from '../../services/reputation.service';

@Component({
  selector: 'app-game-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-player.component.html',
  styleUrls: ['./game-player.component.css']
})
export class GamePlayerComponent implements OnInit {
  @Input() gameId!: string;
  game: Game | undefined;
  safeUrl: SafeResourceUrl | undefined;

  private sanitizer = inject(DomSanitizer);
  private gameService = inject(GameService);
  private reputationService = inject(ReputationService);

  ngOnInit(): void {
    this.reputationService.addXp(50); // XP for starting a game
    this.gameService.getGame(this.gameId).subscribe(game => {
      this.game = game;
      if (game?.url) {
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(game.url);
      }
    });
  }
}
