import { Injectable, signal } from '@angular/core';

export interface Message {
  userId: string;
  handle: string;
  avatarUrl: string;
  timestamp: Date;
  message: string;
}

export interface Conversation {
  userId: string;
  messages: Message[];
}

@Injectable({
  providedIn: 'root',
})
export class DmService {
  conversations = signal<Conversation[]>([]);

  constructor() {
    // Mock data for now
    this.conversations.set([
      {
        userId: '2',
        messages: [
          {
            userId: '1',
            handle: 'Me',
            avatarUrl: 'https://picsum.photos/seed/me/100/100',
            timestamp: new Date(),
            message: 'Hey there!',
          },
          {
            userId: '2',
            handle: 'PlayerOne',
            avatarUrl: 'https://picsum.photos/seed/playerone/100/100',
            timestamp: new Date(),
            message: 'Hi! How are you?',
          },
        ],
      },
    ]);
  }

  getConversation(userId: string) {
    return this.conversations().find((c) => c.userId === userId);
  }

  sendMessage(userId: string, message: Message) {
    this.conversations.update((convos) => {
      const convo = convos.find((c) => c.userId === userId);
      if (convo) {
        convo.messages.push(message);
      }
      return convos;
    });
  }
}
