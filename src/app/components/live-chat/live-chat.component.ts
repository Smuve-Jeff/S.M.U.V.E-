import {
  AfterViewChecked,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LiveVideoService } from '../../services/live-video.service';

/** Chat shared by the broadcaster and every viewer in the live room. */
@Component({
  selector: 'app-live-chat',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './live-chat.component.html',
  styleUrls: ['./live-chat.component.css'],
})
export class LiveChatComponent implements AfterViewChecked {
  readonly live = inject(LiveVideoService);
  readonly draft = signal('');
  private readonly list = viewChild<ElementRef<HTMLElement>>('chatList');
  private lastChatCount = 0;

  ngAfterViewChecked(): void {
    // New lines arrive below the fold. Only move the list when one actually
    // arrived so a reader can still scroll back through history.
    const count = this.live.chatMessages().length;
    if (count === this.lastChatCount) return;
    this.lastChatCount = count;
    const el = this.list()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  send(): void {
    const message = this.draft().trim();
    if (!message || !this.live.chatAvailable()) return;
    if (this.live.sendLiveChat(message)) this.draft.set('');
  }
}
