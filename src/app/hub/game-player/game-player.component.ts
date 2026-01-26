import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  trigger,
  state,
  style,
  transition,
  animate,
} from '@angular/animations';
import { Game } from '../game';
import { GameService } from '../game.service';
// Chatbot is optional; comment out import to avoid missing module errors
// import { ChatbotComponent } from '../../chatbot/chatbot.component';

@Component({
  selector: 'app-game-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-player.component.html',
  styleUrls: ['./game-player.component.css'],
  animations: [
    trigger('slideIn', [
      state('void', style({ transform: 'translateX(100%)' })),
      state('*', style({ transform: 'translateX(0)' })),
      transition(
        'void <=> *',
        animate('0.5s cubic-bezier(0.25, 0.8, 0.25, 1)')
      ),
    ]),
  ],
})
export class GamePlayerComponent implements OnInit {
  @Input() gameId!: string;
  @Input() theme: string = 'dark';
  @Input() mainViewMode: 'hub' | 'chat' | 'game' = 'game';
  @Output() close = new EventEmitter<void>();
  @Output() appCommand = new EventEmitter<any>();

  game: Game | undefined;
  safeUrl: SafeResourceUrl | undefined;
  isChatbotVisible = false;

  private sanitizer = inject(DomSanitizer);
  private gameService = inject(GameService);

  ngOnInit(): void {
    this.gameService.getGame(this.gameId).subscribe((game) => {
      this.game = game;
      if (game?.url) {
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(game.url);
      }
    });
  }

  onClose(): void {
    this.close.emit();
  }

  toggleChatbot(): void {
    this.isChatbotVisible = !this.isChatbotVisible;
  }

  handleAppCommand(command: any): void {
    if (command.action === 'closeGame') {
      this.onClose();
    } else {
      this.appCommand.emit(command);
    }
  }
}
