import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Game } from '../game';

@Component({
  selector: 'app-game-card',
  templateUrl: './game-card.component.html',
  styleUrls: ['./game-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class GameCardComponent {
  @Input() game: Game | undefined;
  @Output() gameSelected = new EventEmitter<string>();

  selectGame(gameId: string) {
    this.gameSelected.emit(gameId);
  }

  playPreview(event: MouseEvent, play: boolean) {
    const card = event.currentTarget as HTMLElement;
    const video = card.querySelector('.preview-video') as HTMLVideoElement;
    if (video) {
      if (play) {
        video.play().catch((e) => console.error('Video autoplay failed', e));
      } else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }
}
