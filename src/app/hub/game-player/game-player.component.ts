import { Component, Input, OnInit, inject, OnChanges, SimpleChanges, output } from '@angular/core';
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
export class GamePlayerComponent implements OnInit, OnChanges {
  @Input() gameId!: string;
  close = output<void>();
  game: Game | undefined;
  safeUrl: SafeResourceUrl | undefined;

  private sanitizer = inject(DomSanitizer);
  private gameService = inject(GameService);
  private reputationService = inject(ReputationService);

  ngOnInit(): void {
    this.reputationService.addXp(50); // XP for starting a game
    this.loadGame();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['gameId'] && !changes['gameId'].firstChange) {
      this.loadGame();
    }
  }

  private loadGame() {
    this.gameService.getGame(this.gameId).subscribe(game => {
      this.game = game;
      if (game?.url) {
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(game.url);
      }
    });
  }

  onExit() {
    this.close.emit();
  }
}
