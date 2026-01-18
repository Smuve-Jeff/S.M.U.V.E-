import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Game } from '../game';
import { GameService } from '../game.service';

@Component({
  selector: 'app-game-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-player.component.html',
  styleUrls: ['./game-player.component.css']
})
export class GamePlayerComponent implements OnInit {
  @Input() gameId!: string;
  @Output() close = new EventEmitter<void>();

  game: Game | undefined;
  safeUrl: SafeResourceUrl | undefined;

  private sanitizer = inject(DomSanitizer);
  private gameService = inject(GameService);

  ngOnInit(): void {
    this.gameService.getGame(this.gameId).subscribe(game => {
      this.game = game;
      if (game?.url) {
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(game.url);
      }
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
