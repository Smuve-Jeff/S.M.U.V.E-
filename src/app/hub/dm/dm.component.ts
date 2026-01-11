import { Component, OnInit, signal, Input } from '@angular/core';
import { DmService, Conversation, Message } from './dm.service';

@Component({
  selector: 'app-dm',
  templateUrl: './dm.component.html',
  styleUrls: ['./dm.component.css'],
})
export class DmComponent implements OnInit {
  @Input() userId: string = '';
  conversation = signal<Conversation | undefined>(undefined);
  newMessage = signal('');

  constructor(private dmService: DmService) {}

  ngOnInit(): void {
    if (this.userId) {
      this.conversation.set(this.dmService.getConversation(this.userId));
    }
  }

  sendMessage() {
    if (this.newMessage().trim() && this.userId) {
      const message: Message = {
        userId: '1', // Assuming '1' is the current user's ID
        handle: 'Me',
        avatarUrl: 'https://picsum.photos/seed/me/100/100',
        timestamp: new Date(),
        message: this.newMessage().trim(),
      };
      this.dmService.sendMessage(this.userId, message);
      this.newMessage.set('');
    }
  }
}
